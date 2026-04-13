$ErrorActionPreference = "Continue"

$repoRoot = Split-Path -Parent $PSScriptRoot
$localPython = Join-Path $repoRoot "local-tts-service\venv311\Scripts\python.exe"

Write-Host "=== Kick Chat Diagnose ==="

Write-Host "[1] Node"
if (Get-Command node -ErrorAction SilentlyContinue) {
    node --version
}
else {
    Write-Host "node: MISSING"
}

Write-Host "[2] npm"
if (Get-Command npm -ErrorAction SilentlyContinue) {
    npm --version
}
else {
    Write-Host "npm: MISSING"
}

Write-Host "[3] Python launcher"
if (Get-Command py -ErrorAction SilentlyContinue) {
    py --list
}
else {
    Write-Host "py launcher: MISSING"
}

Write-Host "[4] Local TTS venv"
if (Test-Path $localPython) {
    & $localPython --version
}
else {
    Write-Host "local-tts venv311: MISSING"
}

Write-Host "[5] Main app health (3000)"
try {
    (Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3000/api/voices" -TimeoutSec 5).StatusCode
}
catch {
    Write-Host "unreachable"
}

Write-Host "[6] Local TTS health (8000)"
try {
    (Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8000/health" -TimeoutSec 5).Content
}
catch {
    Write-Host "unreachable"
}
