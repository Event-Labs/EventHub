<#
.SYNOPSIS
Khởi chạy dịch vụ Ollama AI và mở Cloudflare Tunnel kết nối với Backend Deploy.
#>

param (
    [string]$CloudflareToken = ""
)

$ErrorActionPreference = "Continue"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "    EVENTHUB - KHOI CHAY AI WORKER CHO SERVER DEPLOY      " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Cấu hình biến môi trường quan trọng cho Ollama (Full GPU - NVIDIA RTX 3070)
$env:OLLAMA_ORIGINS = "*"
$env:OLLAMA_HOST = "0.0.0.0:11434"
$env:CUDA_VISIBLE_DEVICES = "0"
$env:OLLAMA_FLASH_ATTENTION = "1"
$env:OLLAMA_NUM_PARALLEL = "1"

# Lưu vào User Environment để Ollama App (tray icon) luôn nhận biến này
[System.Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "*", "User")
[System.Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:11434", "User")
[System.Environment]::SetEnvironmentVariable("CUDA_VISIBLE_DEVICES", "0", "User")
[System.Environment]::SetEnvironmentVariable("OLLAMA_FLASH_ATTENTION", "1", "User")

# 2. Kiểm tra Ollama CLI
$ollamaCmd = Get-Command "ollama" -ErrorAction SilentlyContinue
if (-not $ollamaCmd) {
    Write-Host "[!] Khong tim thay Ollama trong PATH." -ForegroundColor Red
    Write-Host "Vui long kiem tra lai duong dan cai dat Ollama." -ForegroundColor Yellow
    pause
    exit 1
}

# 3. Kiểm tra xem Ollama service đã chạy chưa
Write-Host "`n[1/3] Kiem tra ket noi Ollama..." -ForegroundColor Yellow
$ollamaUp = $false
try {
    $testRes = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 2 -ErrorAction Stop
    $ollamaUp = $true
    Write-Host "-> [OK] Ollama dang chay tai http://127.0.0.1:11434" -ForegroundColor Green
} catch {
    Write-Host "-> Ollama chua bat. Dang khoi dong 'ollama serve'..." -ForegroundColor Yellow
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 3
    try {
        $testRes = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 3 -ErrorAction Stop
        $ollamaUp = $true
        Write-Host "-> [OK] Da khoi dong Ollama thanh cong." -ForegroundColor Green
    } catch {
        Write-Host "[!] Canh bao: Chua the ket noi toi Ollama. Vui long mo ung dung Ollama tren may." -ForegroundColor Red
    }
}

# 4. Kiểm tra các models cần thiết
Write-Host "`n[2/3] Kiem tra danh sach Models da co..." -ForegroundColor Yellow
$aiDir = Split-Path -Parent $MyInvocation.MyCommand.Path
try {
    $existingModels = (ollama list) -join "`n"
    
    # Model 1: qwen3-eventhub-Q4_K_M.gguf
    if ($existingModels -notmatch "qwen3-eventhub-Q4_K_M.gguf") {
        Write-Host "-> Dang nap model trich xuat tai lieu (qwen3-eventhub-Q4_K_M.gguf)..." -ForegroundColor Cyan
        Push-Location $aiDir
        ollama create qwen3-eventhub-Q4_K_M.gguf -f Modelfile.extractor
        Pop-Location
    } else {
        Write-Host "-> Model 'qwen3-eventhub-Q4_K_M.gguf': SAN SANG" -ForegroundColor Green
    }

    # Model 2: eventhub-qwen3
    if ($existingModels -notmatch "eventhub-qwen3") {
        Write-Host "-> Dang nap model kiem duyet su kien (eventhub-qwen3)..." -ForegroundColor Cyan
        Push-Location $aiDir
        ollama create eventhub-qwen3 -f Modelfile
        Pop-Location
    } else {
        Write-Host "-> Model 'eventhub-qwen3': SAN SANG" -ForegroundColor Green
    }

    # Model 3: moondream
    if ($existingModels -notmatch "moondream") {
        Write-Host "-> Dang tai model thi giac 'moondream'..." -ForegroundColor Cyan
        ollama pull moondream
    } else {
        Write-Host "-> Model 'moondream': SAN SANG" -ForegroundColor Green
    }
} catch {
    Write-Host "[!] Khong the kiem tra models: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 5. Khởi chạy Cloudflare Tunnel trực tiếp
Write-Host "`n[3/3] Dang mo Cloudflare Tunnel ket noi port 11434..." -ForegroundColor Yellow
Write-Host "----------------------------------------------------------" -ForegroundColor Gray
Write-Host "[Luu y 1] Cloudflare se hien thi o mau xanh ben duoi chua duong link https://xxx.trycloudflare.com" -ForegroundColor Cyan
Write-Host "[Luu y 2] Copy link do dan vao OLLAMA_BASE_URL tren server deploy" -ForegroundColor Cyan
Write-Host "[Luu y 3] KHONG tat cua so nay trong khi test AI!" -ForegroundColor Red
Write-Host "----------------------------------------------------------`n" -ForegroundColor Gray

$cloudflaredCmd = Get-Command "cloudflared" -ErrorAction SilentlyContinue
if (-not $cloudflaredCmd) {
    Write-Host "[!] Khong tim thay cloudflared.exe." -ForegroundColor Red
    pause
    exit 1
}

if ($CloudflareToken) {
    cloudflared tunnel run --token $CloudflareToken
} else {
    # Chạy trực tiếp với --http-host-header localhost để Ollama không chặn request từ ngoài
    cloudflared tunnel --url http://127.0.0.1:11434 --http-host-header localhost
}
