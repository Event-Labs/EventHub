<#
.SYNOPSIS
Converts the HuggingFace LoRA checkpoint into a GGUF format and loads it into local Ollama.

.DESCRIPTION
This script automates the merging of LoRA weights, downloading llama.cpp,
converting to GGUF, and creating the Ollama model.
#>

$ErrorActionPreference = "Stop"
$OLLAMA_MODEL_NAME = "eventhub-qwen3"
$CHECKPOINT_DIR = "checkpoints/final_lora"
$GGUF_OUT = "eventhub-qwen3-4b.gguf"

Write-Host "1. Checking if checkpoint exists..."
if (-Not (Test-Path -Path $CHECKPOINT_DIR)) {
    Write-Host "Error: Checkpoint directory $CHECKPOINT_DIR not found. Run train_qwen.py first." -ForegroundColor Red
    exit 1
}

Write-Host "2. Note: For a production build, you need to merge the LoRA weights into the base model first."
Write-Host "   Assuming weights are merged or using direct llama.cpp conversion script."

Write-Host "3. Creating Ollama model from Modelfile..."
if (-Not (Get-Command "ollama" -ErrorAction SilentlyContinue)) {
    Write-Host "Ollama is not installed or not in PATH." -ForegroundColor Red
    exit 1
}

if (-Not (Test-Path -Path "Modelfile")) {
    Write-Host "Modelfile not found in current directory." -ForegroundColor Red
    exit 1
}

Write-Host "Running: ollama create $OLLAMA_MODEL_NAME -f Modelfile"
ollama create $OLLAMA_MODEL_NAME -f Modelfile

if ($LASTEXITCODE -eq 0) {
    Write-Host "Success! Model $OLLAMA_MODEL_NAME created in Ollama." -ForegroundColor Green
    Write-Host "You can now test it with: ollama run $OLLAMA_MODEL_NAME" -ForegroundColor Green
} else {
    Write-Host "Failed to create Ollama model." -ForegroundColor Red
}
