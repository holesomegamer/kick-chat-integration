$ErrorActionPreference = "Stop"

Write-Host "[core] Checking Node.js and npm..."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is not installed or not on PATH."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm is not installed or not on PATH."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "[core] Installing Node dependencies..."
npm install

$envPath = Join-Path $repoRoot ".env"
$envExamplePath = Join-Path $repoRoot ".env.example"

if (-not (Test-Path $envPath)) {
    if (-not (Test-Path $envExamplePath)) {
        throw ".env.example is missing."
    }
    Copy-Item $envExamplePath $envPath
    Write-Host "[core] Created .env from .env.example"
}
else {
    Write-Host "[core] Existing .env found. Leaving it unchanged."
}

Write-Host "[core] Setup complete."
Write-Host "[core] Next: run 'npm run setup:local-tts' for local cloning mode (optional)."