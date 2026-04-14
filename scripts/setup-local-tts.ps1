$ErrorActionPreference = "Stop"

# Allow manual CUDA override via environment variable
$forceCuda = $env:FORCE_CUDA -eq "true"

$repoRoot = Split-Path -Parent $PSScriptRoot
$serviceRoot = Join-Path $repoRoot "local-tts-service"
$venvPath = Join-Path $serviceRoot "venv311"
$pythonExe = Join-Path $venvPath "Scripts\python.exe"
$pipExe = Join-Path $venvPath "Scripts\pip.exe"

function Assert-LastExitCode {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ErrorMessage
    )

    if ($LASTEXITCODE -ne 0) {
        throw "$ErrorMessage (exit code: $LASTEXITCODE)"
    }
}

if (-not (Test-Path $serviceRoot)) {
    throw "local-tts-service folder not found."
}

Write-Host "[local-tts] Checking Python launcher..."
if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    throw "Python launcher 'py' not found. Install Python 3.11 from python.org and retry."
}

$pythonList = py --list 2>&1 | Out-String
if ($pythonList -notmatch "3\.11") {
    throw "Python 3.11 not found. Install Python 3.11 and retry."
}

if (-not (Test-Path $venvPath)) {
    Write-Host "[local-tts] Creating venv311 with Python 3.11..."
    Push-Location $serviceRoot
    try {
        py -3.11 -m venv venv311
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host "[local-tts] Existing venv311 found."
}

if (-not (Test-Path $pythonExe)) {
    throw "venv python not found at $pythonExe"
}

Write-Host "[local-tts] Upgrading pip..."
& $pythonExe -m pip install --upgrade pip
Assert-LastExitCode -ErrorMessage "Failed to upgrade pip"

# Check if NVIDIA GPU is available for CUDA support
$cudaAvailable = $false
Write-Host "[local-tts] Checking for NVIDIA GPU..."

try {
    Write-Host "[local-tts] Looking for nvidia-smi command..."
    $nvidiaSmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
    
    if ($nvidiaSmi) {
        Write-Host "[local-tts] nvidia-smi found at: $($nvidiaSmi.Source)"
        Write-Host "[local-tts] Querying GPU information..."
        
        $gpuInfo = & nvidia-smi --query-gpu=name --format=csv,noheader,nounits 2>&1
        Write-Host "[local-tts] nvidia-smi output: '$gpuInfo'"
        
        if ($gpuInfo -and $gpuInfo.Trim() -and -not $gpuInfo.Contains("NVIDIA-SMI has failed")) {
            $cudaAvailable = $true
            Write-Host "[local-tts] NVIDIA GPU detected: $($gpuInfo.Trim())" -ForegroundColor Green
        } else {
            Write-Host "[local-tts] nvidia-smi failed or returned no GPU info" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[local-tts] nvidia-smi command not found in PATH" -ForegroundColor Yellow
        
        # Try common installation paths
        $commonPaths = @(
            "C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe",
            "C:\Windows\System32\nvidia-smi.exe"
        )
        
        foreach ($path in $commonPaths) {
            if (Test-Path $path) {
                Write-Host "[local-tts] Found nvidia-smi at: $path"
                $gpuInfo = & $path --query-gpu=name --format=csv,noheader,nounits 2>&1
                Write-Host "[local-tts] GPU info: '$gpuInfo'"
                
                if ($gpuInfo -and $gpuInfo.Trim() -and -not $gpuInfo.Contains("NVIDIA-SMI has failed")) {
                    $cudaAvailable = $true
                    Write-Host "[local-tts] NVIDIA GPU detected: $($gpuInfo.Trim())" -ForegroundColor Green
                    break
                }
            }
        }
    }
} catch {
    Write-Host "[local-tts] Error during GPU detection: $($_.Exception.Message)" -ForegroundColor Red
}

if ($cudaAvailable -or $forceCuda) {
    if ($forceCuda) {
        Write-Host "[local-tts] CUDA installation forced via FORCE_CUDA=true" -ForegroundColor Cyan
    }
    Write-Host "[local-tts] Installing PyTorch with CUDA support..." -ForegroundColor Green
    
    # Uninstall existing PyTorch packages to avoid conflicts (suppress warnings if not installed)
    Write-Host "[local-tts] Removing existing PyTorch packages (if any)..."
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        # pip may emit benign "Skipping ... not installed" warnings on stderr.
        $uninstallOutput = & $pipExe uninstall torch torchvision torchaudio -y 2>&1
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($LASTEXITCODE -ne 0) {
        $uninstallText = ($uninstallOutput | Out-String)
        if ($uninstallText -notmatch "Skipping .* not installed") {
            throw "Failed to uninstall existing PyTorch packages: $uninstallText"
        }
    }
    
    # Install latest available CUDA versions (2.5.1 is newest with CUDA)
    Write-Host "[local-tts] Installing latest available CUDA PyTorch (2.5.1)..."
    & $pipExe install torch==2.5.1+cu121 torchvision==0.20.1+cu121 torchaudio==2.5.1+cu121 --index-url https://download.pytorch.org/whl/cu121
    Assert-LastExitCode -ErrorMessage "Failed to install CUDA PyTorch packages"
    
    # Verify CUDA PyTorch installed
    $torchCheck = & $pythonExe -c "import torch; print(f'PyTorch {torch.__version__} CUDA available: {torch.cuda.is_available()}')" 2>$null
    Write-Host "[local-tts] $torchCheck" -ForegroundColor Green
    
} else {
    Write-Host "[local-tts] No NVIDIA GPU detected, installing CPU-only PyTorch..." -ForegroundColor Yellow
    Write-Host "[local-tts] To force CUDA installation, run: `$env:FORCE_CUDA='true'; .\scripts\setup-local-tts.ps1" -ForegroundColor Yellow
    # Use exact versions for CPU builds
    & $pipExe install torch==2.6.0 torchvision==0.21.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu
    Assert-LastExitCode -ErrorMessage "Failed to install CPU PyTorch packages"
}

Write-Host "[local-tts] Installing local TTS dependencies..."
& $pipExe install fastapi==0.135.3 uvicorn==0.44.0 python-multipart==0.0.24
Assert-LastExitCode -ErrorMessage "Failed to install local TTS dependencies"

# Handle chatterbox-tts installation with potential PyTorch version mismatch
Write-Host "[local-tts] Installing chatterbox-tts..."
if ($cudaAvailable -or $forceCuda) {
    Write-Host "[local-tts] Note: Installing chatterbox-tts with CUDA PyTorch 2.5.1 (bypassing version check)" -ForegroundColor Yellow
    & $pipExe install chatterbox-tts==0.1.7 --no-deps
    Assert-LastExitCode -ErrorMessage "Failed to install chatterbox-tts"

    Write-Host "[local-tts] Installing chatterbox dependencies compatible with CUDA PyTorch..." -ForegroundColor Yellow
    & $pipExe install `
        conformer==0.3.2 `
        diffusers==0.29.0 `
        gradio==6.8.0 `
        librosa==0.11.0 `
        omegaconf `
        pykakasi==2.3.0 `
        pyloudnorm `
        "resemble-perth>=1.0.0" `
        s3tokenizer `
        spacy-pkuseg `
        "numpy>=1.24,<2.0" `
        safetensors==0.5.3 `
        transformers==5.2.0 `
        peft==0.19.0
    Assert-LastExitCode -ErrorMessage "Failed to install chatterbox CUDA dependency set"
} else {
    & $pipExe install chatterbox-tts==0.1.7
    Assert-LastExitCode -ErrorMessage "Failed to install chatterbox-tts"
}

Write-Host "[local-tts] Verifying imports..."
& $pythonExe -c "import fastapi, uvicorn; print('Core dependencies OK')"
Assert-LastExitCode -ErrorMessage "Core dependency import check failed"
& $pythonExe -c "import torch, torchaudio; print('PyTorch OK')"
Assert-LastExitCode -ErrorMessage "PyTorch import check failed"
& $pythonExe -c "import chatterbox; print('Chatterbox TTS OK')"
Assert-LastExitCode -ErrorMessage "Chatterbox import check failed"

Write-Host "[local-tts] Checking PyTorch CUDA support..."
& $pythonExe -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}'); print(f'CUDA devices: {torch.cuda.device_count()}') if torch.cuda.is_available() else None"
Assert-LastExitCode -ErrorMessage "CUDA capability check failed"

if ($cudaAvailable -or $forceCuda) {
    Write-Host "[local-tts] Testing chatterbox with CUDA..." -ForegroundColor Cyan
    & $pythonExe -c "import warnings; warnings.filterwarnings('ignore'); from chatterbox.tts import ChatterboxTTS; print('Chatterbox TTS can be imported successfully')"
    Assert-LastExitCode -ErrorMessage "Chatterbox CUDA import test failed"
}

Write-Host "[local-tts] Setup complete."
Write-Host "[local-tts] Next: run 'npm run start:all'"