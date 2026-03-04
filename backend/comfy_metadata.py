"""
comfy_metadata.py
Extracts generation metadata from ComfyUI PNG files.

ComfyUI stores the full workflow JSON in the PNG 'prompt' chunk.
We parse it to find:
  - positive / negative prompts  (CLIPTextEncode nodes)
  - checkpoint name              (CheckpointLoaderSimple / UNETLoader / etc.)
  - LoRA names + strengths       (LoraLoader nodes)
  - seed                         (KSampler / RandomNoise nodes)
  - sampler / scheduler / steps / cfg / dimensions
"""

import json
import struct
import zlib
import os
import re


# =========================
# LOW-LEVEL PNG CHUNK READER
# =========================
def read_png_chunks(path):
    """Return dict of {chunk_type: bytes} for all tEXt/iTXt chunks."""
    chunks = {}
    try:
        with open(path, "rb") as f:
            sig = f.read(8)
            if sig != b'\x89PNG\r\n\x1a\n':
                return chunks
            while True:
                header = f.read(8)
                if len(header) < 8:
                    break
                length = struct.unpack(">I", header[:4])[0]
                chunk_type = header[4:8].decode("ascii", errors="ignore")
                data = f.read(length)
                f.read(4)  # CRC
                if chunk_type in ("tEXt", "iTXt", "zTXt"):
                    chunks[chunk_type] = chunks.get(chunk_type, [])
                    chunks[chunk_type].append(data)
    except Exception:
        pass
    return chunks


def get_png_text_fields(path):
    """Return dict of keyword→value from tEXt/iTXt chunks."""
    fields = {}
    chunks = read_png_chunks(path)

    for data in chunks.get("tEXt", []):
        try:
            sep = data.index(b'\x00')
            key   = data[:sep].decode("latin-1")
            value = data[sep+1:].decode("latin-1")
            fields[key] = value
        except Exception:
            pass

    for data in chunks.get("iTXt", []):
        try:
            sep = data.index(b'\x00')
            key = data[:sep].decode("latin-1")
            rest = data[sep+1:]
            # skip compression flag, method, lang, translated keyword
            parts = rest.split(b'\x00', 3)
            value = parts[-1].decode("utf-8", errors="replace")
            fields[key] = value
        except Exception:
            pass

    return fields


# =========================
# COMFYUI WORKFLOW PARSER
# =========================
# Node class names we care about
CHECKPOINT_CLASSES = {
    "CheckpointLoaderSimple", "CheckpointLoader",
    "UNETLoader", "DiffusionModelLoader",
    "ModelMergeSimple"
}
LORA_CLASSES = {
    "LoraLoader", "LoraLoaderModelOnly", "LoRALoader"
}
CLIP_CLASSES = {
    "CLIPTextEncode", "CLIPTextEncodeSDXL",
    "CLIPTextEncodeFlux", "CLIPTextEncodeHunyuan"
}
SAMPLER_CLASSES = {
    "KSampler", "KSamplerAdvanced", "SamplerCustom",
    "KSamplerSelect", "SamplerCustomAdvanced"
}
NOISE_CLASSES = {"RandomNoise", "KSamplerAdvanced"}
LATENT_CLASSES = {"EmptyLatentImage", "EmptySD3LatentImage", "EmptyHunyuanLatentVideo"}


def _str(val):
    return str(val).strip() if val is not None else ""


def parse_comfyui_workflow(workflow_json: str) -> dict:
    """
    Parse a ComfyUI workflow JSON string and return extracted metadata.
    Returns a dict with keys:
        positive, negative, base_model, loras_used,
        seed, sampler, scheduler, steps, cfg, width, height
    """
    result = {
        "positive": "",
        "negative": "",
        "base_model": "",
        "loras_used": [],   # [{"name": str, "strength": float}]
        "seed": "",
        "sampler": "",
        "scheduler": "",
        "steps": None,
        "cfg": None,
        "width": None,
        "height": None,
    }

    try:
        workflow = json.loads(workflow_json)
    except Exception:
        return result

    # ComfyUI stores workflow as {node_id: {class_type, inputs, ...}}
    nodes = workflow if isinstance(workflow, dict) else {}

    # Collect text prompts — heuristic: first CLIP node = positive, second = negative
    clip_texts = []
    for node in nodes.values():
        if not isinstance(node, dict):
            continue
        cls = node.get("class_type", "")
        if cls in CLIP_CLASSES:
            text = node.get("inputs", {}).get("text", "")
            if isinstance(text, str) and text.strip():
                clip_texts.append(text.strip())

    if clip_texts:
        result["positive"] = clip_texts[0]
    if len(clip_texts) >= 2:
        result["negative"] = clip_texts[1]

    # Checkpoint / base model
    for node in nodes.values():
        if not isinstance(node, dict):
            continue
        cls = node.get("class_type", "")
        if cls in CHECKPOINT_CLASSES:
            inputs = node.get("inputs", {})
            ckpt = inputs.get("ckpt_name") or inputs.get("unet_name") or inputs.get("model_name")
            if ckpt:
                result["base_model"] = os.path.splitext(os.path.basename(_str(ckpt)))[0]
                break

    # LoRAs
    seen_loras = []
    for node in nodes.values():
        if not isinstance(node, dict):
            continue
        cls = node.get("class_type", "")
        if cls in LORA_CLASSES:
            inputs = node.get("inputs", {})
            lora_name = inputs.get("lora_name", "")
            strength  = inputs.get("strength_model", inputs.get("strength", 1.0))
            if lora_name:
                clean = os.path.splitext(os.path.basename(_str(lora_name)))[0]
                seen_loras.append({
                    "name":     clean,
                    "strength": round(float(strength), 2) if strength is not None else 1.0
                })
    result["loras_used"] = seen_loras

    # Sampler settings
    for node in nodes.values():
        if not isinstance(node, dict):
            continue
        cls = node.get("class_type", "")
        if cls in SAMPLER_CLASSES:
            inputs = node.get("inputs", {})
            if not result["seed"] and "seed" in inputs:
                result["seed"] = _str(inputs["seed"])
            if not result["sampler"] and "sampler_name" in inputs:
                result["sampler"] = _str(inputs["sampler_name"])
            if not result["scheduler"] and "scheduler" in inputs:
                result["scheduler"] = _str(inputs["scheduler"])
            if result["steps"] is None and "steps" in inputs:
                result["steps"] = int(inputs["steps"])
            if result["cfg"] is None and "cfg" in inputs:
                result["cfg"] = float(inputs["cfg"])

    # RandomNoise node has seed separately (newer ComfyUI)
    if not result["seed"]:
        for node in nodes.values():
            if isinstance(node, dict) and node.get("class_type") in NOISE_CLASSES:
                seed = node.get("inputs", {}).get("noise_seed")
                if seed is not None:
                    result["seed"] = _str(seed)
                    break

    # Latent dimensions
    for node in nodes.values():
        if not isinstance(node, dict):
            continue
        if node.get("class_type") in LATENT_CLASSES:
            inputs = node.get("inputs", {})
            if "width" in inputs:
                result["width"]  = int(inputs["width"])
                result["height"] = int(inputs["height"])
            break

    return result


# =========================
# MAIN ENTRY POINT
# =========================
def extract_metadata(image_path: str) -> dict:
    """
    Given a path to a ComfyUI-generated PNG, return parsed metadata dict.
    Returns empty-ish dict if no metadata found.
    """
    fields = get_png_text_fields(image_path)

    # ComfyUI stores workflow in 'prompt' key
    workflow_json = fields.get("prompt", "")
    if not workflow_json:
        return {
            "positive": "", "negative": "", "base_model": "",
            "loras_used": [], "seed": "", "sampler": "",
            "scheduler": "", "steps": None, "cfg": None,
            "width": None, "height": None,
            "raw_found": False
        }

    result = parse_comfyui_workflow(workflow_json)
    result["raw_found"] = True
    return result


# =========================
# CLI TEST
# =========================
if __name__ == "__main__":
    import sys
    path = sys.argv[1] if len(sys.argv) > 1 else None
    if not path:
        print("Usage: python comfy_metadata.py path/to/image.png")
        exit(1)
    meta = extract_metadata(path)
    print(json.dumps(meta, indent=2, ensure_ascii=False))