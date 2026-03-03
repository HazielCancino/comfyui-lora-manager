# ComfyUI Asset Manager

A local asset manager for ComfyUI models. Browse, tag, search, and organize your entire model library — LoRAs, Checkpoints, VAEs, Upscalers, and Diffusion models — with a React frontend and Flask backend.

---

## Features

- 📁 **Multi-type support** — LoRAs, Checkpoints, VAEs, Upscalers, Diffusion models
- 🖼️ **Image carousel** — multiple previews per model, GIF support, auto-detected from folder
- 🧠 **Base model tagging** — FLUX, SDXL, Pony, Illustrious, SD1.5 + add any custom base
- 🏷️ **Tag system** — global tags shared across all model types
- 🔍 **Search + filter** — by type, folder, tag, or text search
- ✏️ **Inline editing** — trigger words, description, source URL per model
- 🎨 **Color-coded tabs** — each model type has its own accent color
- 🔄 **Rescan library** — sync DB with disk on startup or on demand
- 📂 **Open folder** — jump to any model's folder in Explorer

---

## Project Structure
```
comfyui-lora-manager/
├── backend/
│   ├── api.py               # Flask API server
│   ├── lora_manager.py      # LoRA scanner + DB sync
│   ├── model_manager.py     # Checkpoint/VAE/Upscaler/Diffusion scanner
│   ├── .env                 # Your local credentials (never committed)
│   └── .env.example         # Setup template
├── frontend/
│   └── src/
│       ├── App.jsx
│       └── components/
│           ├── LoraBrowser.jsx
│           └── ModelBrowser.jsx
├── migrate.sql
├── migrate_models.sql
├── start.bat
└── README.md
```

---

## Setup

### 1. Database
Run both SQL files in DBeaver in order: `migrate.sql` then `migrate_models.sql`

### 2. Environment
Copy `backend/.env.example` to `backend/.env` and fill in your values:
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=comfyui_assets

LORA_FOLDER=C:\path\to\ComfyUI\models\loras
CHECKPOINT_FOLDER=C:\path\to\ComfyUI\models\checkpoints
VAE_FOLDER=C:\path\to\ComfyUI\models\vae
UPSCALER_FOLDER=C:\path\to\ComfyUI\models\upscale_models
DIFFUSION_FOLDER=C:\path\to\ComfyUI\models\diffusion_models
```

### 3. Dependencies
```bash
pip install flask flask-cors mysql-connector-python python-dotenv
cd frontend && npm install
```

### 4. Launch
Double-click `start.bat` — scans all models, starts API + UI.

---

## Preview Image Convention
```
MyModel.safetensors       ← model
MyModel.preview.png       ← primary preview
MyModel_01.png            ← extra image 1
MyModel_02.gif            ← animated GIF
```

Extras can also go in an `images/` subfolder. Picked up automatically on Rescan.

---

## Notes
- `.env` is gitignored — your password never leaves your machine
- Base model is auto-detected from folder names, overridable manually
- Any custom base model you type is saved and reusable for future models