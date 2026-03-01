import os
import mysql.connector
import hashlib
from datetime import datetime
from dotenv import load_dotenv

# Load .env from the same folder as this script
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

LORA_FOLDER = os.getenv("LORA_FOLDER", r"C:\Users\Haziel\COMFY\ComfyUI\models\loras")

DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "user":     os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "comfyui_assets")
}

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}

# =========================
# DB CONNECTION
# =========================
def connect_db():
    return mysql.connector.connect(**DB_CONFIG)

# =========================
# FILE HASH
# =========================
def get_file_hash(path):
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            buf = f.read(65536)
            if not buf:
                break
            hasher.update(buf)
    return hasher.hexdigest()[:16]

# =========================
# FIND PRIMARY PREVIEW IMAGE
# The file named exactly like the .safetensors (or .preview.ext)
# =========================
def find_primary_preview(lora_path):
    base = os.path.splitext(lora_path)[0]
    for ext in [".png", ".jpg", ".jpeg", ".webp"]:
        for candidate in [base + ext, base + ".preview" + ext]:
            if os.path.exists(candidate):
                return os.path.normpath(candidate)
    return None

# =========================
# FIND ALL EXTRA IMAGES IN SAME FOLDER
# Returns every image in the folder that is NOT the primary preview
# and NOT a preview for another lora in the same folder.
# Convention: files named  <loraname>_01.png, <loraname>_02.gif, etc.
# We detect them by prefix — they must start with the lora base name.
# =========================
def find_extra_images(lora_path):
    base_name    = os.path.splitext(os.path.basename(lora_path))[0]
    folder       = os.path.dirname(lora_path)
    primary      = find_primary_preview(lora_path)
    primary_norm = os.path.normpath(primary) if primary else None

    extras = []

    # ── helper: check one file and append if it qualifies ──
    def check_file(fpath, fname):
        ext        = os.path.splitext(fname)[1].lower()
        fname_base = os.path.splitext(fname)[0]

        if ext not in IMAGE_EXTENSIONS:
            return
        if os.path.normpath(fpath) == primary_norm:
            return

        # Must start with the lora base name
        if not fname_base.startswith(base_name):
            return

        # Suffix must be a separator/index, not a different lora's name
        suffix = fname_base[len(base_name):]
        if suffix and suffix[0] not in ("_", "-", " ", "0","1","2","3","4","5","6","7","8","9"):
            return

        norm = os.path.normpath(fpath)
        if norm not in extras:
            extras.append(norm)

    # ── 1. scan the lora's own folder ──
    try:
        for fname in sorted(os.listdir(folder)):
            check_file(os.path.join(folder, fname), fname)
    except PermissionError:
        pass

    # ── 2. scan an "images" subfolder if it exists ──
    images_dir = os.path.join(folder, "images")
    if os.path.isdir(images_dir):
        try:
            for fname in sorted(os.listdir(images_dir)):
                check_file(os.path.join(images_dir, fname), fname)
        except PermissionError:
            pass

    return extras

# =========================
# SCAN LORAS
# =========================
def scan_loras():
    loras = []
    for root, dirs, files in os.walk(LORA_FOLDER):
        for file in files:
            if not file.lower().endswith(".safetensors"):
                continue
            full_path = os.path.normpath(os.path.join(root, file))
            size      = os.path.getsize(full_path)
            modified  = datetime.fromtimestamp(os.path.getmtime(full_path))
            hash_val  = get_file_hash(full_path)
            preview   = find_primary_preview(full_path)
            extras    = find_extra_images(full_path)

            loras.append({
                "name":         os.path.splitext(file)[0],
                "file_name":    file,
                "local_path":   full_path,
                "file_size_mb": round(size / (1024 * 1024), 2),
                "hash":         hash_val,
                "folder":       root,
                "modified":     modified,
                "preview_image": preview,
                "extra_images": extras      # list of paths
            })
    return loras

# =========================
# INSERT / UPDATE LORA
# =========================
def insert_lora(db, lora):
    cursor = db.cursor()
    cursor.execute("""
        INSERT INTO loras
            (name, file_name, local_path, file_size_mb, hash, preview_image)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            file_size_mb   = VALUES(file_size_mb),
            preview_image  = VALUES(preview_image),
            local_path     = VALUES(local_path)
    """, (
        lora["name"], lora["file_name"], lora["local_path"],
        lora["file_size_mb"], lora["hash"], lora["preview_image"]
    ))
    db.commit()
    cursor.close()

# =========================
# SYNC EXTRA IMAGES FOR ONE LORA
# Replaces the auto-detected rows; keeps any manually-added ones intact.
# "Auto-detected" rows are identified by having sort_order = 0 AND
# their path starting with the lora's folder.
# =========================
def sync_lora_images(db, lora_id, lora_path, extra_images):
    cursor = db.cursor(dictionary=True)

    cursor.execute(
        "SELECT id, image_path FROM lora_images WHERE lora_id = %s",
        (lora_id,)
    )
    existing = cursor.fetchall()
    existing_paths = {row["image_path"]: row["id"] for row in existing}
    new_paths = set(extra_images)

    # remove rows whose file no longer exists on disk
    for path, img_id in existing_paths.items():
        if path not in new_paths and not os.path.exists(path):
            cursor.execute("DELETE FROM lora_images WHERE id = %s", (img_id,))

    # add newly detected images
    for path in extra_images:
        if path not in existing_paths:
            cursor.execute(
                "INSERT INTO lora_images (lora_id, image_path) VALUES (%s, %s)",
                (lora_id, path)
            )

    db.commit()
    cursor.close()

# =========================
# SYNC DB WITH DISK (remove missing loras)
# =========================
def sync_database_with_disk(disk_loras):
    db = connect_db()
    cursor = db.cursor(dictionary=True)

    cursor.execute("SELECT id, local_path FROM loras")
    db_loras   = cursor.fetchall()
    disk_paths = {l["local_path"] for l in disk_loras}

    removed = 0
    for row in db_loras:
        if row["local_path"] not in disk_paths:
            lora_id = row["id"]
            cursor.execute("DELETE FROM lora_tags   WHERE lora_id = %s", (lora_id,))
            cursor.execute("DELETE FROM lora_images WHERE lora_id = %s", (lora_id,))
            cursor.execute("DELETE FROM loras        WHERE id      = %s", (lora_id,))
            removed += 1
            print(f"[REMOVED] {row['local_path']}")

    db.commit()
    cursor.close()
    db.close()
    print(f"Sync complete — {removed} lora(s) removed from DB.")

# =========================
# GET LORA ID BY PATH
# =========================
def get_lora_id(db, local_path):
    cursor = db.cursor()
    cursor.execute("SELECT id FROM loras WHERE local_path = %s", (local_path,))
    row = cursor.fetchone()
    cursor.close()
    return row[0] if row else None

# =========================
# MAIN
# =========================
def main():
    print("")
    print("ComfyUI LoRA Manager")
    print("====================")

    loras = scan_loras()
    print(f"Found {len(loras)} LoRAs on disk")
    print("")

    sync_database_with_disk(loras)

    db = connect_db()
    for lora in loras:
        insert_lora(db, lora)

        lora_id = get_lora_id(db, lora["local_path"])
        if lora_id:
            sync_lora_images(db, lora_id, lora["local_path"], lora["extra_images"])

        extra_count = len(lora["extra_images"])
        preview_tag = "✓ preview" if lora["preview_image"] else "no preview"
        extra_tag   = f"  +{extra_count} extra" if extra_count else ""
        print(f"[OK] {lora['file_name']}  → {preview_tag}{extra_tag}")
    db.close()

    print("")
    print("Scan complete.")

if __name__ == "__main__":
    main()