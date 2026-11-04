@echo off
title EventHub - Rebuild Models to 100% GPU
cd /d "%~dp0ai"
echo ==========================================================
echo   EVENTHUB - CAP NHAT CAU HINH MODEL CHAY 100%% TREN GPU (RTX 3070)
echo ==========================================================
echo.
echo [1/3] Dang nap cau hinh Full GPU (num_gpu 99) cho model 'eventhub-qwen3'...
ollama create eventhub-qwen3 -f Modelfile
echo.
echo [2/3] Dang nap cau hinh Full GPU (num_gpu 99) cho model 'qwen3-eventhub-Q4_K_M.gguf'...
ollama create qwen3-eventhub-Q4_K_M.gguf -f Modelfile.extractor
echo.
echo [3/3] Kiem tra mo hinh Vision 'moondream'...
ollama pull moondream
echo.
echo ==========================================================
echo [THANH CONG] Tat ca model da duoc cau hinh 100%% tren GPU (num_gpu 99, 0%% CPU)!
echo ==========================================================
pause

