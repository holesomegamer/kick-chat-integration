$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$localServiceRoot = Join-Path $repoRoot "local-tts-service"
$localVenvUvicorn = Join-Path $localServiceRoot "venv311\Scripts\uvicorn.exe"

if (-not (Test-Path $localVenvUvicorn)) {
    throw "Local TTS venv is missing. Run 'npm run setup:local-tts' first."
}

Write-Host "[start] Starting local TTS service in a new terminal..."
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$repoRoot'; & '$localVenvUvicorn' app:app --host 127.0.0.1 --port 8000 --app-dir '$localServiceRoot'"
)

Write-Host "[start] Starting main app in a new terminal..."
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$repoRoot'; `$env:PORT='3001'; node server.js"
)

Write-Host "[start] Health checks:"
try {
    $localHealth = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8000/health" -TimeoutSec 5
    Write-Host "  local-tts: OK"
}
catch {
    Write-Host "  local-tts: not ready yet (first model load can take time)"
}

try {
    $mainHealth = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3001/api/voices" -TimeoutSec 5
    Write-Host "  main-app: OK"
}
catch {
    Write-Host "  main-app: starting or unavailable"
}

Write-Host "[start] Open http://localhost:3001"