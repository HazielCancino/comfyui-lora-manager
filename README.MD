# ComfyUI LoRA Manager

A local asset manager for ComfyUI LoRA models. Browse, tag, search, and organize your LoRA library with a React frontend and Flask backend.

## Features

- 📁 Browse LoRAs organized by folder (FLUX, SDXL, PONY, etc.)
- 🖼️ Image carousel with auto-detected previews and GIF support
- 🏷️ Tag system with global tag management
- 🔍 Search and filter by folder or tag
- ✏️ Edit trigger words, description, and source URL per LoRA
- 🔄 Rescan library to sync DB with disk automatically

## Stack

- **Frontend:** React (Vite)
- **Backend:** Python + Flask
- **Database:** MySQL

## Project Structure

```
comfyui-lora-manager/
├── backend/
│   ├── api.py            # Flask API server
│   └── lora_manager.py   # Disk scanner and DB sync
├── frontend/
│   └── src/
│       └── components/
│           └── LoraBrowser.jsx
├── migrate.sql           # DB schema / migrations
└── README.md
```

## Setup

### 1. Database

Run `migrate.sql` in your MySQL client (DBeaver, Workbench, etc.).

### 2. Backend

```bash
cd backend
pip install flask flask-cors mysql-connector-python
python api.py
```

Edit `lora_manager.py` and set your paths:
```python
LORA_FOLDER = r"C:\your\path\to\loras"

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "your_password",
    "database": "comfyui_assets"
}
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

### 4. Initial Scan

```bash
cd backend
python lora_manager.py
```

Then click **⟳ Rescan Library** in the UI anytime you add or remove LoRAs.

## Extra Image Convention

To add multiple previews to a LoRA, name them like this in the same folder:

```
MyLora.safetensors
MyLora.preview.png       ← primary preview
MyLora_01.png            ← extra image 1
MyLora_02.jpg            ← extra image 2
MyLora_03.gif            ← animated GIF
```

Or place them in an `images/` subfolder inside the LoRA's folder.

## Notes

- The database password and personal paths are in `lora_manager.py` — do not commit those to a public repo. Use the provided `.env.example` as reference.
- This is a local tool, not intended for production deployment.