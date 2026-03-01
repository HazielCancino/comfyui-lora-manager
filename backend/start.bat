@echo off
title ComfyUI LoRA Manager
echo.
echo ==============================
echo   Starting ComfyUI LoRA Manager
echo ==============================
echo.

REM =========================
REM 1 - Scan LoRAs (Python)
REM    Runs and WAITS until done before continuing
REM =========================
echo [1/3] Scanning LoRAs...
cd /d C:\Users\Haziel\Documents\CODE\comfyui-lora-manager\backend
python lora_manager.py
echo Scan complete.
echo.

REM =========================
REM 2 - Start Flask API
REM    Launches in background window
REM =========================
echo [2/3] Starting Flask API...
start "Flask API" cmd /k "cd /d C:\Users\Haziel\Documents\CODE\comfyui-lora-manager\backend && python api.py"
timeout /t 3 >nul

REM =========================
REM 3 - Start React UI
REM =========================
echo [3/3] Starting React UI...
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
