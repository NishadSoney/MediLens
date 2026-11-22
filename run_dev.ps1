# MediLens Development Launcher (PowerShell)
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "       MEDILENS - CLINICAL AI ASSISTANT (V2.0)              " -ForegroundColor Cyan
Write-Host "  Hybrid Ensemble: Llama 3.1, Qwen 3.8, Gemini, Groq        " -ForegroundColor DarkCyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Start FastAPI backend
Write-Host "[1/2] Starting MediLens FastAPI Backend on http://localhost:8000..." -ForegroundColor Yellow
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "cd '$baseDir' ; .\venv\Scripts\python.exe -m uvicorn api_server:app --reload --port 8000"

Start-Sleep -Seconds 2

# Start Vite React frontend
Write-Host "[2/2] Starting MediLens React Frontend on http://localhost:3000..." -ForegroundColor Yellow
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "cd '$baseDir\frontend' ; npm run dev"

Write-Host ""
Write-Host "MediLens is launching!" -ForegroundColor Green
Write-Host "  - UI Dashboard : http://localhost:3000" -ForegroundColor White
Write-Host "  - Backend API  : http://localhost:8000" -ForegroundColor White
Write-Host "  - API Docs     : http://localhost:8000/docs" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Cyan
