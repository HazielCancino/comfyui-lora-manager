from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import os
import subprocess
import mysql.connector
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

app = Flask(__name__)
CORS(app)

DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "user":     os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "comfyui_assets")
}

# =========================
# DB CONNECTION
# =========================
def get_db():
    return mysql.connector.connect(**DB_CONFIG)

# =========================
# GET ALL LORAS
# =========================
@app.route("/loras", methods=["GET"])
def get_loras():
    db = get_db()
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM loras ORDER BY name")
    result = cursor.fetchall()
    cursor.close()
    db.close()
    return jsonify(result)

# =========================
# GET SINGLE LORA
# =========================
@app.route("/loras/<int:lora_id>", methods=["GET"])
def get_lora(lora_id):
    db = get_db()
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM loras WHERE id=%s", (lora_id,))
    result = cursor.fetchone()
    cursor.close()
    db.close()
    return jsonify(result)

# =========================
# SEARCH
# =========================
@app.route("/search", methods=["GET"])
def search():
    query = request.args.get("q", "")
    db = get_db()
    cursor = db.cursor(dictionary=True)
    cursor.execute(
        "SELECT * FROM loras WHERE name LIKE %s",
        (f"%{query}%",)
    )
    result = cursor.fetchall()
    cursor.close()
    db.close()
    return jsonify(result)

# =========================
# RESYNC — scan disk, remove missing, return fresh list
# =========================
@app.route("/resync", methods=["POST"])
def resync():
    from lora_manager import scan_loras, sync_database_with_disk, insert_lora, sync_lora_images, get_lora_id

    # 1. scan disk (includes extra_images per lora)
    disk_loras = scan_loras()

    # 2. remove DB entries that no longer exist on disk
    sync_database_with_disk(disk_loras)

    # 3. insert/update loras + sync their extra images
    db = get_db()
    for lora in disk_loras:
        insert_lora(db, lora)
        lora_id = get_lora_id(db, lora["local_path"])
        if lora_id:
            sync_lora_images(db, lora_id, lora["local_path"], lora["extra_images"])
    db.close()

    # 4. return fresh list
    db = get_db()
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM loras ORDER BY name")
    updated = cursor.fetchall()
    cursor.close()
    db.close()

    return jsonify(updated)

# =========================
# SERVE PREVIEW IMAGE
# =========================
@app.route("/preview", methods=["GET"])
def get_preview():
    path = request.args.get("path")
    if not path:
        return "Missing path", 400
    if not os.path.exists(path):
        return "File not found", 404
    return send_file(path)

# =========================
# OPEN FOLDER
# =========================
@app.route("/open_folder", methods=["POST"])
def open_folder():
    data = request.json
    path = data.get("path")
    if not path:
        return "Missing path", 400
    folder = os.path.dirname(path)
    subprocess.Popen(f'explorer "{folder}"')
    return jsonify({"status": "opened"})

# =========================
# GET ALL TAGS
# =========================
@app.route("/tags", methods=["GET"])
def get_tags():
    db = get_db()
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM tags ORDER BY name")
    result = cursor.fetchall()
    cursor.close()
    db.close()
    return jsonify(result)

# =========================
# GET TAGS FOR LORA
# =========================
@app.route("/lora_tags/<int:lora_id>", methods=["GET"])
def get_lora_tags(lora_id):
    db = get_db()
    cursor = db.cursor(dictionary=True)
    cursor.execute("""
        SELECT tags.id, tags.name
        FROM tags
        JOIN lora_tags ON tags.id = lora_tags.tag_id
        WHERE lora_tags.lora_id = %s
    """, (lora_id,))
    result = cursor.fetchall()
    cursor.close()
    db.close()
    return jsonify(result)

# =========================
# ADD TAG
# =========================
@app.route("/add_tag", methods=["POST"])
def add_tag():
    name = request.json.get("name")
    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        "INSERT IGNORE INTO tags (name) VALUES (%s)",
        (name,)
    )
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"status": "ok"})

# =========================
# ASSIGN TAG
# =========================
@app.route("/assign_tag", methods=["POST"])
def assign_tag():
    lora_id = request.json.get("lora_id")
    tag_id = request.json.get("tag_id")
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        INSERT IGNORE INTO lora_tags (lora_id, tag_id)
        VALUES (%s, %s)
    """, (lora_id, tag_id))
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"status": "ok"})

# =========================
# REMOVE TAG
# =========================
@app.route("/remove_tag", methods=["POST"])
def remove_tag():
    lora_id = request.json.get("lora_id")
    tag_id = request.json.get("tag_id")
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        DELETE FROM lora_tags
        WHERE lora_id=%s AND tag_id=%s
    """, (lora_id, tag_id))
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"status": "ok"})

# =========================
# UPDATE TRIGGER WORDS
# =========================
@app.route("/update_trigger", methods=["POST"])
def update_trigger():
    data = request.json
    lora_id = data.get("id")
    trigger_words = data.get("trigger_words")
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        UPDATE loras
        SET trigger_words=%s
        WHERE id=%s
    """, (trigger_words, lora_id))
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"status": "ok"})

# =========================
# UPDATE SOURCE URL
# =========================
@app.route("/update_source_url", methods=["POST"])
def update_source_url():
    data = request.json
    lora_id = data.get("id")
    source_url = data.get("source_url")
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        UPDATE loras
        SET source_url=%s
        WHERE id=%s
    """, (source_url, lora_id))
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"status": "ok"})

# =========================
# UPDATE DESCRIPTION
# =========================
@app.route("/update_description", methods=["POST"])
def update_description():
    data = request.json
    lora_id = data.get("id")
    description = data.get("description")
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        UPDATE loras SET description=%s WHERE id=%s
    """, (description, lora_id))
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"status": "ok"})

# =========================
# GET EXTRA IMAGES FOR LORA
# =========================
@app.route("/lora_images/<int:lora_id>", methods=["GET"])
def get_lora_images(lora_id):
    db = get_db()
    cursor = db.cursor(dictionary=True)
    cursor.execute("""
        SELECT * FROM lora_images
        WHERE lora_id=%s ORDER BY id ASC
    """, (lora_id,))
    result = cursor.fetchall()
    cursor.close()
    db.close()
    return jsonify(result)

# =========================
# ADD IMAGE TO LORA
# =========================
@app.route("/lora_images/add", methods=["POST"])
def add_lora_image():
    lora_id = request.json.get("lora_id")
    image_path = request.json.get("image_path")
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        INSERT INTO lora_images (lora_id, image_path)
        VALUES (%s, %s)
    """, (lora_id, image_path))
    db.commit()
    new_id = cursor.lastrowid
    cursor.close()
    db.close()
    return jsonify({"status": "ok", "id": new_id})

# =========================
# REMOVE IMAGE FROM LORA
# =========================
@app.route("/lora_images/remove", methods=["POST"])
def remove_lora_image():
    image_id = request.json.get("image_id")
    db = get_db()
    cursor = db.cursor()
    cursor.execute("DELETE FROM lora_images WHERE id=%s", (image_id,))
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"status": "ok"})

# =========================
# DELETE TAG (removes from all loras too)
# =========================
@app.route("/delete_tag", methods=["POST"])
def delete_tag():
    tag_id = request.json.get("tag_id")
    db = get_db()
    cursor = db.cursor()
    # remove all assignments first
    cursor.execute(
        "DELETE FROM lora_tags WHERE tag_id=%s",
        (tag_id,)
    )
    # then delete the tag itself
    cursor.execute(
        "DELETE FROM tags WHERE id=%s",
        (tag_id,)
    )
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"status": "ok"})

# =========================
# GET MODELS (filter by type)
# =========================
@app.route("/models", methods=["GET"])
def get_models():
    model_type = request.args.get("type")  # optional filter
    db = get_db()
    cursor = db.cursor(dictionary=True)
    if model_type:
        cursor.execute("SELECT * FROM models WHERE model_type=%s ORDER BY name", (model_type,))
    else:
        cursor.execute("SELECT * FROM models ORDER BY name")
    result = cursor.fetchall()
    cursor.close()
    db.close()
    return jsonify(result)

# =========================
# GET TAGS FOR MODEL
# =========================
@app.route("/model_tags/<int:model_id>", methods=["GET"])
def get_model_tags(model_id):
    db = get_db()
    cursor = db.cursor(dictionary=True)
    cursor.execute("""
        SELECT tags.id, tags.name
        FROM tags
        JOIN model_tags ON tags.id = model_tags.tag_id
        WHERE model_tags.model_id = %s
    """, (model_id,))
    result = cursor.fetchall()
    cursor.close()
    db.close()
    return jsonify(result)

# =========================
# ASSIGN TAG TO MODEL
# =========================
@app.route("/model_assign_tag", methods=["POST"])
def model_assign_tag():
    model_id = request.json.get("model_id")
    tag_id   = request.json.get("tag_id")
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        INSERT IGNORE INTO model_tags (model_id, tag_id) VALUES (%s, %s)
    """, (model_id, tag_id))
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"status": "ok"})

# =========================
# REMOVE TAG FROM MODEL
# =========================
@app.route("/model_remove_tag", methods=["POST"])
def model_remove_tag():
    model_id = request.json.get("model_id")
    tag_id   = request.json.get("tag_id")
    db = get_db()
    cursor = db.cursor()
    cursor.execute("DELETE FROM model_tags WHERE model_id=%s AND tag_id=%s", (model_id, tag_id))
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"status": "ok"})

# =========================
# UPDATE MODEL FIELDS
# =========================
@app.route("/update_model", methods=["POST"])
def update_model():
    data     = request.json
    model_id = data.get("id")
    field    = data.get("field")   # trigger_words | source_url | description | base_model
    value    = data.get("value")
    allowed  = {"trigger_words", "source_url", "description", "base_model"}
    if field not in allowed:
        return jsonify({"error": "invalid field"}), 400
    db = get_db()
    cursor = db.cursor()
    cursor.execute(f"UPDATE models SET {field}=%s WHERE id=%s", (value, model_id))
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"status": "ok"})

# =========================
# GET IMAGES FOR MODEL
# =========================
@app.route("/model_images/<int:model_id>", methods=["GET"])
def get_model_images(model_id):
    db = get_db()
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM model_images WHERE model_id=%s ORDER BY id ASC", (model_id,))
    result = cursor.fetchall()
    cursor.close()
    db.close()
    return jsonify(result)

# =========================
# RESYNC MODELS
# =========================
@app.route("/resync_models", methods=["POST"])
def resync_models():
    from model_manager import scan_all_models, sync_database_with_disk, insert_model, get_model_id, sync_model_images

    all_models = scan_all_models()
    sync_database_with_disk(all_models)

    db = get_db()
    for model in all_models:
        insert_model(db, model)
        model_id = get_model_id(db, model["local_path"])
        if model_id:
            sync_model_images(db, model_id, model["extra_images"])
    db.close()

    # return all models grouped — frontend can filter by type
    db = get_db()
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM models ORDER BY name")
    result = cursor.fetchall()
    cursor.close()
    db.close()
    return jsonify(result)

# =========================
# START SERVER (ALWAYS AT THE END)
# =========================
if __name__ == "__main__":
    print("ComfyUI LoRA API running...")
    print("http://127.0.0.1:5000")
    app.run(port=5000, debug=True)