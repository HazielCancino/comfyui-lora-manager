# ComfyUI Asset Manager

A local web app to browse, organize, and annotate your entire ComfyUI model library.

![LoRA Browser](docs/screenshots/lora_browser.png)

---

## What it does

- Browse **LoRAs, Checkpoints, VAEs, Upscalers, and Diffusion models** in a visual grid
- **Tag, rate, and annotate** models with trigger words, descriptions, and source URLs
- **Image carousel** per model — multiple previews, GIFs supported
- **Prompt Gallery** — drop ComfyUI output images to extract and save generation metadata
- **Rescan** to sync with disk automatically on launch or on demand

---

## Project Structure

```
comfyui-lora-manager/
├── backend/
│   ├── api.py
│   ├── lora_manager.py
│   ├── model_manager.py
│   ├── comfy_metadata.py
│   ├── .env
│   └── .env.example
├── frontend/
│   └── src/
│       ├── App.jsx
│       └── components/
│           ├── LoraBrowser.jsx
│           ├── ModelBrowser.jsx
│           └── PromptGallery.jsx
├── migrate.sql
├── migrate_models.sql
├── migrate_prompts.sql
├── start.bat
└── README.md
```

---

## Setup

### 1. Database

Run the three SQL files in DBeaver in order: `migrate.sql` → `migrate_models.sql` → `migrate_prompts.sql`

Then add rating support:
```sql
ALTER TABLE loras  ADD COLUMN rating TINYINT DEFAULT 0;
ALTER TABLE models ADD COLUMN rating TINYINT DEFAULT 0;
```

### 2. Environment

Copy `backend/.env.example` → `backend/.env` and fill in your paths:

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

### 3. Install & run

```bash
pip install flask flask-cors mysql-connector-python python-dotenv pillow
cd frontend && npm install
```

Then double-click `start.bat`.

---

## Preview image convention

```
MyModel.safetensors     ← model
MyModel.preview.png     ← main preview
MyModel_01.png          ← extra images
MyModel_02.gif          ← GIFs supported
images/MyModel_03.png   ← or inside an images/ subfolder
```