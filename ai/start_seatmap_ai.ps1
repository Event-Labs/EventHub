$ErrorActionPreference = "Stop"
$AI_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $AI_DIR

$PYTHON_EXE = "python"
if (Test-Path "$AI_DIR\.venv\Scripts\python.exe") {
    $PYTHON_EXE = "$AI_DIR\.venv\Scripts\python.exe"
} elseif (Test-Path "D:\seatmap_dataset\.venv\Scripts\python.exe") {
    $PYTHON_EXE = "D:\seatmap_dataset\.venv\Scripts\python.exe"
}

Write-Host "Starting EventHub Seatmap AI Service (FastAPI + YOLO11) from $AI_DIR on http://localhost:8001 ..." -ForegroundColor Cyan
& $PYTHON_EXE -m uvicorn main:app --host 0.0.0.0 --port 8001

