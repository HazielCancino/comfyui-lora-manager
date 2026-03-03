@echo off
title ComfyUI Asset Manager
echo.
echo ==============================
echo   Starting ComfyUI Asset Manager
echo ==============================
echo.

REM =========================
REM 1 - Scan LoRAs (waits until done)
REM =========================
echo [1/4] Scanning LoRAs...
cd /d C:\Users\Haziel\Documents\CODE\comfyui-lora-manager\backend
python lora_manager.py
echo LoRA scan complete.
echo.

REM =========================
REM 2 - Scan Models (waits until done)
REM =========================
echo [2/4] Scanning Models (checkpoints, VAEs, upscalers, diffusion)...
python model_manager.py
echo Model scan complete.
echo.

REM =========================
REM 3 - Start Flask API
REM =========================
echo [3/4] Starting Flask API...
start "Flask API" cmd /k "cd /d C:\Users\Haziel\Documents\CODE\comfyui-lora-manager\backend && python api.py"
timeout /t 3 >nul

REM =========================
REM 4 - Start React UI
REM =========================
echo [4/4] Starting React UI...
start "React UI" cmd /k "cd /d C:\Users\Haziel\Documents\CODE\comfyui-lora-manager\frontend && npm run dev"
timeout /t 3 >nul

echo.
echo ==============================
echo   All services started!
echo   API:  http://127.0.0.1:5000
echo   UI:   http://localhost:5173
echo ==============================
echo.
pause