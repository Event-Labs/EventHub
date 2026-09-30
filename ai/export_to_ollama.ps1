<#
.SYNOPSIS
Converts the HuggingFace LoRA checkpoint into a GGUF format and loads it into local Ollama.

.DESCRIPTION
This script automates the merging of LoRA weights, downloading llama.cpp,
converting to GGUF, and creating the Ollama model.
#>

$ErrorActionPreference = "Stop"
$OLLAMA_MODEL_NAME = "qwen3-eventhub-Q4_K_M.gguf"
$GGUF_FILE = "qwen3-eventhub-Q4_K_M.gguf"
$MODELFILE = "Modelfile.extractor"

Write-Host "1. Checking if GGUF model exists..."
if (-Not (Test-Path -Path $GGUF_FILE)) {
    Write-Host "Error: GGUF file $GGUF_FILE not found in current directory." -ForegroundColor Red
    exit 1
}

Write-Host "2. Checking Ollama CLI..."
if (-Not (Get-Command "ollama" -ErrorAction SilentlyContinue)) {
    Write-Host "Ollama is not installed or not in PATH." -ForegroundColor Red
    exit 1
}

if (-Not (Test-Path -Path $MODELFILE)) {
    Write-Host "$MODELFILE not found in current directory." -ForegroundColor Red
    exit 1
}

Write-Host "3. Creating Ollama model $OLLAMA_MODEL_NAME from $MODELFILE..."
ollama create $OLLAMA_MODEL_NAME -f $MODELFILE

if ($LASTEXITCODE -eq 0) {
    Write-Host "Success! Model $OLLAMA_MODEL_NAME created in Ollama." -ForegroundColor Green
    Write-Host "You can now test it with: ollama run $OLLAMA_MODEL_NAME" -ForegroundColor Green
} else {
    Write-Host "Failed to create Ollama model." -ForegroundColor Red
}
