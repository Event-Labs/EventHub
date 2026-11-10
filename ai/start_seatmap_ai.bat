@echo off
chcp 65001 >nul
title EventHub Seatmap AI Service (FastAPI)
echo ========================================================
echo  Starting EventHub Seatmap AI Service on port 8001...
echo ========================================================

set PYTHON_EXE=python
if exist "%~dp0.venv\Scripts\python.exe" (
    set "PYTHON_EXE=%~dp0.venv\Scripts\python.exe"
) else if exist "D:\seatmap_dataset\.venv\Scripts\python.exe" (
    set "PYTHON_EXE=D:\seatmap_dataset\.venv\Scripts\python.exe"
)

cd /d "%~dp0"
"%PYTHON_EXE%" -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
pause

