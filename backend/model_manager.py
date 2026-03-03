import os
import mysql.connector
import hashlib
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "user":     os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "comfyui_assets")
}

MODEL_FOLDERS = {
    "checkpoint": os.getenv("CHECKPOINT_FOLDER", r"C:\Users\Haziel\COMFY\ComfyUI\models\checkpoints"),
    "vae":        os.getenv("VAE_FOLDER",         r"C:\Users\Haziel\COMFY\ComfyUI\models\vae"),
    "upscaler":   os.getenv("UPSCALER_FOLDER",    r"C:\Users\Haziel\COMFY\ComfyUI\models\upscale_models"),
    "diffusion":  os.getenv("DIFFUSION_FOLDER",   r"C:\Users\Haziel\COMFY\ComfyUI\models\diffusion_models"),
}

MODEL_EXTENSIONS = {
    "checkpoint": {".safetensors", ".ckpt"},
    "vae":        {".safetensors", ".ckpt", ".pt"},
    "upscaler":   {".safetensors", ".pth", ".pt"},
    "diffusion":  {".safetensors", ".gguf"},
}

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def connect_db():
    return mysql.connector.connect(**DB_CONFIG)


def get_file_hash(path):
    hasher = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            while True:
                buf = f.read(65536)
                if not buf:
                    break
                hasher.update(buf)
    except Exception:
        return None
    return hasher.hexdigest()[:32]


def find_primary_preview(model_path):
    base = os.path.splitext(model_path)[0]
    for ext in [".png", ".jpg", ".jpeg", ".webp"]:
        for candidate in [base + ext, base + ".preview" + ext]:
            if os.path.exists(candidate):
                return os.path.normpath(candidate)
    return None


def find_extra_images(model_path):
    base_name    = os.path.splitext(os.path.basename(model_path))[0]
    folder       = os.path.dirname(model_path)
    primary      = find_primary_preview(model_path)
    primary_norm = os.path.normpath(primary) if primary else None
    extras       = []

    def check_file(fpath, fname):
        ext        = os.path.splitext(fname)[1].lower()
        fname_base = os.path.splitext(fname)[0]
        if ext not in IMAGE_EXTENSIONS:
            return
        if os.path.normpath(fpath) == primary_norm:
            return
        if not fname_base.startswith(base_name):
            return
        suffix = fname_base[len(base_name):]
        if suffix and suffix[0] not in ("_", "-", " ", "0","1","2","3","4","5","6","7","8","9"):
            return
        norm = os.path.normpath(fpath)
        if norm not in extras:
            extras.append(norm)

    try:
        for fname in sorted(os.listdir(folder)):
            check_file(os.path.join(folder, fname), fname)
    except PermissionError:
        pass

    images_dir = os.path.join(folder, "images")
    if os.path.isdir(images_dir):
        try:
            for fname in sorted(os.listdir(images_dir)):
                check_file(os.path.join(images_dir, fname), fname)
        except PermissionError:
            pass

    return extras


def guess_base_model(path):
    text = path.upper().replace("\\", "/")
    if "FLUX"        in text: return "FLUX"
    if "SDXL"        in text: return "SDXL"
    if "PONY"        in text: return "Pony"
    if "ILLUSTRIOUS" in text: return "Illustrious"
    if "SD15" in text or "SD1.5" in text or "SD-1.5" in text: return "SD1.5"
    if "SD3"         in text: return "SD3"
    if "QWEN"        in text: return "Qwen"
    if "WAN"         in text: return "Wan"
    return None


def scan_model_type(model_type):
    folder = MODEL_FOLDERS.get(model_type)
    if not folder or not os.path.isdir(folder):
        print(f"[SKIP] {model_type} folder not found: {folder}")
        return []

    valid_exts = MODEL_EXTENSIONS.get(model_type, {".safetensors"})
    models     = []

    for root, dirs, files in os.walk(folder):
        for file in files:
            if os.path.splitext(file)[1].lower() not in valid_exts:
                continue
            full_path = os.path.normpath(os.path.join(root, file))
            size      = os.path.getsize(full_path)
            hash_val  = get_file_hash(full_path)
            preview   = find_primary_preview(full_path)
            extras    = find_extra_images(full_path)
            base      = guess_base_model(full_path)

            models.append({
                "name":          os.path.splitext(file)[0],
                "file_name":     file,
                "local_path":    full_path,
                "file_size_mb":  round(size / (1024 * 1024), 2),
                "model_type":    model_type,
                "base_model":    base,
                "hash":          hash_val,
                "preview_image": preview,
                "extra_images":  extras,
            })

    return models


def scan_all_models():
    all_models = []
    for model_type in MODEL_FOLDERS:
        found = scan_model_type(model_type)
        print(f"  {model_type}: {len(found)} files")
        all_models.extend(found)
    return all_models


def insert_model(db, model):
    cursor = db.cursor()
    cursor.execute("""
        INSERT INTO models
            (name, file_name, local_path, file_size_mb, model_type, base_model, hash, preview_image)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            file_size_mb  = VALUES(file_size_mb),
            preview_image = VALUES(preview_image),
            local_path    = VALUES(local_path),
            base_model    = COALESCE(base_model, VALUES(base_model))
    """, (
        model["name"], model["file_name"], model["local_path"],
        model["file_size_mb"], model["model_type"], model["base_model"],
        model["hash"], model["preview_image"]
    ))
    db.commit()
    cursor.close()


def get_model_id(db, local_path):
    cursor = db.cursor()
    cursor.execute("SELECT id FROM models WHERE local_path = %s", (local_path,))
    row = cursor.fetchone()
    cursor.close()
    return row[0] if row else None


def sync_model_images(db, model_id, extra_images):
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT id, image_path FROM model_images WHERE model_id = %s", (model_id,))
    existing = {row["image_path"]: row["id"] for row in cursor.fetchall()}
    new_paths = set(extra_images)

    for path, img_id in existing.items():
        if path not in new_paths and not os.path.exists(path):
            cursor.execute("DELETE FROM model_images WHERE id = %s", (img_id,))

    for path in extra_images:
        if path not in existing:
            cursor.execute(
                "INSERT INTO model_images (model_id, image_path) VALUES (%s, %s)",
                (model_id, path)
            )

    db.commit()
    cursor.close()


def sync_database_with_disk(disk_models):
    db = connect_db()
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT id, local_path FROM models")
    db_models  = cursor.fetchall()
    disk_paths = {m["local_path"] for m in disk_models}

    removed = 0
    for row in db_models:
        if row["local_path"] not in disk_paths:
            mid = row["id"]
            cursor.execute("DELETE FROM model_tags   WHERE model_id = %s", (mid,))
            cursor.execute("DELETE FROM model_images WHERE model_id = %s", (mid,))
            cursor.execute("DELETE FROM models        WHERE id      = %s", (mid,))
            removed += 1
            print(f"[REMOVED] {row['local_path']}")

    db.commit()
    cursor.close()
    db.close()
    print(f"Sync complete — {removed} model(s) removed from DB.")


def main():
    print("")
    print("ComfyUI Model Manager")
    print("=====================")
    print("Scanning folders...")

    all_models = scan_all_models()
    print(f"Total: {len(all_models)} models found")
    print("")

    sync_database_with_disk(all_models)

    db = connect_db()
    for model in all_models:
        insert_model(db, model)
        model_id = get_model_id(db, model["local_path"])
        if model_id:
            sync_model_images(db, model_id, model["extra_images"])
        extra_tag   = f"  +{len(model['extra_images'])} extra" if model["extra_images"] else ""
        preview_tag = "preview" if model["preview_image"] else "no preview"
        base_tag    = f"  [{model['base_model']}]" if model["base_model"] else ""
        print(f"[{model['model_type'].upper()}] {model['file_name']}  → {preview_tag}{extra_tag}{base_tag}")
    db.close()

    print("")
    print("Scan complete.")


if __name__ == "__main__":
    main()