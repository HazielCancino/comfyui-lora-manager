@echo off
title ComfyUI LoRA Manager
echo.
echo ==============================
echo   Starting ComfyUI LoRA Manager
echo ==============================
echo.

REM =========================
REM 1 - Scan LoRAs (Python)
REM =========================
echo Scanning LoRAs...
start cmd /k "cd /d C:\Users\Haziel\Documents\CODE\comfyui-lora-manager\backend && python lora_manager.py"
timeout /t 2 >nul

REM =========================
REM 2 - Start Flask API
REM =========================
echo Starting Flask API...
start cmd /k "cd /d C:\Users\Haziel\Documents\CODE\comfyui-lora-manager\backend && python api.py"
timeout /t 2 >nul

REM =========================
REM 3 - Start React UI
REM =========================
echo Starting React UI...
start cmd /k "cd /d C:\Users\Haziel\Documents\CODE\comfyui-lora-manager\frontend && npm run dev"

echo.
echo ==============================
echo   All services started!
echo ==============================
echo.
pause
