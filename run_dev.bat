@echo off
title MediLens System Launcher
echo ============================================================
echo           MEDILENS - CLINICAL AI ASSISTANT (V2.0)
echo   Hybrid Ensemble: Llama 3.1, Qwen 3.8, Gemini, Groq
echo ============================================================
echo.

echo [1/2] Starting MediLens FastAPI Backend on port 8000...
start "MediLens Backend (Port 8000)" cmd /k ".\venv\Scripts\python.exe -m uvicorn api_server:app --reload --port 8000"

timeout /t 2 >nul

echo [2/2] Starting MediLens React Frontend on port 3000...
cd frontend
start "MediLens React UI (Port 3000)" cmd /k "npm run dev"

echo.
echo ============================================================
echo MediLens is running!
echo - Web Dashboard : http://localhost:3000
echo - API Backend   : http://localhost:8000
echo - Swagger Docs  : http://localhost:8000/docs
echo ============================================================
pause
