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
    "Set-Location '$repoRoot'; `$env:PORT='3000'; npm start"
)

Write-Host "[start] Health checks:"
Write-Host "[start] Waiting for local-tts health endpoint..."

$localReady = $false
for ($i = 0; $i -lt 20; $i++) {
    try {
        $null = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8000/health" -TimeoutSec 3
        $localReady = $true
        break
    }
    catch {
        Start-Sleep -Milliseconds 500
    }
}

try {
    if ($localReady) {
        Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8000/health" -TimeoutSec 5 | Out-Null
        Write-Host "  local-tts: OK"

        Write-Host "[start] Triggering local-tts model warmup..."
        $warmupResponse = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8000/warmup" -Method Post -TimeoutSec 900
        if ($warmupResponse.StatusCode -ge 200 -and $warmupResponse.StatusCode -lt 300) {
            Write-Host "  local-tts warmup: started/completed"
        } else {
            Write-Host "  local-tts warmup: unexpected status $($warmupResponse.StatusCode)"
        }
    } else {
        Write-Host "  local-tts: not ready yet (warmup skipped)"
    }
}
catch {
    Write-Host "  local-tts warmup: failed or still loading"
}

try {
    Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3000/api/voices" -TimeoutSec 5 | Out-Null
    Write-Host "  main-app: OK"
}
catch {
    Write-Host "  main-app: starting or unavailable"
}

Write-Host "[start] Open http://localhost:3000"