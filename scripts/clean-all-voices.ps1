# Clean All Voices Script
Write-Host "🧹 Cleaning All Voice Data" -ForegroundColor Cyan

$repoRoot = Split-Path -Parent $PSScriptRoot
$confirmation = Read-Host "Type 'yes' to delete all voice data"
if ($confirmation -ne 'yes') {
    Write-Host "❌ Cancelled" -ForegroundColor Red
    return
}

# Clean main voices.json (UTF-8 without BOM)
$mainVoices = Join-Path $repoRoot "data\voices.json"
if (Test-Path $mainVoices) {
    [System.IO.File]::WriteAllText($mainVoices, "[]", [System.Text.UTF8Encoding]::new($false))
    Write-Host "✅ Cleared main voices.json" -ForegroundColor Green
}

# Clean voice samples
$samplesDir = Join-Path $repoRoot "uploads\voice-samples"
if (Test-Path $samplesDir) {
    $files = Get-ChildItem $samplesDir -File
    if ($files) {
        Remove-Item "$samplesDir\*" -Force
        Write-Host "✅ Deleted $($files.Count) samples" -ForegroundColor Green
    }
}

# Clean voice images
$imagesDir = Join-Path $repoRoot "uploads\voice-images"
if (Test-Path $imagesDir) {
    $files = Get-ChildItem $imagesDir -File
    if ($files) {
        Remove-Item "$imagesDir\*" -Force
        Write-Host "✅ Deleted $($files.Count) images" -ForegroundColor Green
    }
}

# Clean TTS voices.json (UTF-8 without BOM)
$ttsDir = Join-Path $repoRoot "local-tts-service\data"
$ttsVoices = Join-Path $ttsDir "voices.json"
if (-not (Test-Path $ttsDir)) { 
    New-Item -ItemType Directory -Path $ttsDir -Force | Out-Null
}
[System.IO.File]::WriteAllText($ttsVoices, "[]", [System.Text.UTF8Encoding]::new($false))
Write-Host "✅ Cleared TTS voices.json" -ForegroundColor Green

# Clean TTS samples
$ttsSamples = Join-Path $ttsDir "samples"
if (Test-Path $ttsSamples) {
    $files = Get-ChildItem $ttsSamples -File
    if ($files) {
        Remove-Item "$ttsSamples\*" -Force
        Write-Host "✅ Deleted $($files.Count) TTS samples" -ForegroundColor Green
    }
}

Write-Host "✅ Voice cleanup complete!" -ForegroundColor Green