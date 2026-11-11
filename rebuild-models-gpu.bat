@echo off
title EventHub - Rebuild Models to 100% GPU
cd /d "%~dp0ai"
echo ==========================================================
echo   EVENTHUB - CAP NHAT CAU HINH MODEL CHAY 100%% TREN GPU (RTX 3070 8GB)
echo ==========================================================
echo.
echo [1/4] Dang nap cau hinh Full GPU (num_gpu 99, num_ctx 8192, temp 0.1) cho 'eventhub-qwen3'...
ollama create eventhub-qwen3 -f Modelfile
echo.
echo [2/4] Dang nap cau hinh Full GPU (num_gpu 99) cho model 'qwen3-eventhub-Q4_K_M.gguf'...
ollama create qwen3-eventhub-Q4_K_M.gguf -f Modelfile.extractor
echo.
echo [3/4] Dang tai mo hinh Vision uu tien 'qwen2.5vl:3b' (ho tro OCR tieng Viet & ngu canh anh)...
ollama pull qwen2.5vl:3b
if errorlevel 1 (
  echo [CANH BAO] Khong tai duoc 'qwen2.5vl:3b'. Backend se tu dong fallback sang 'moondream'.
)
echo.
echo [4/4] Kiem tra / tai mo hinh Vision du phong 'moondream'...
ollama pull moondream
echo.
echo ==========================================================
echo [THANH CONG] Tat ca model da san sang cho RTX 3070 8GB VRAM!
echo - Text/Review Stage 2 : eventhub-qwen3 (num_ctx 8192, temperature 0.1)
echo - Vision Primary      : qwen2.5vl:3b (fallback: moondream)
echo ==========================================================
pause

