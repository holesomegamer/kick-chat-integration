$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$serviceRoot = Join-Path $repoRoot "local-tts-service"
$venvPath = Join-Path $serviceRoot "venv311"
$pythonExe = Join-Path $venvPath "Scripts\python.exe"
$pipExe = Join-Path $venvPath "Scripts\pip.exe"

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

Write-Host "[local-tts] Installing PyTorch CPU wheels..."
& $pipExe install torch==2.6.0 torchvision==0.21.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu

Write-Host "[local-tts] Installing local TTS dependencies..."
& $pipExe install fastapi==0.135.3 uvicorn==0.44.0 python-multipart==0.0.24 chatterbox-tts==0.1.7

Write-Host "[local-tts] Verifying imports..."
& $pythonExe -c "import fastapi, uvicorn, chatterbox, torch, torchaudio; print('local tts env ready')"

Write-Host "[local-tts] Setup complete."
Write-Host "[local-tts] Next: run 'npm run start:all'"