$ErrorActionPreference = "Stop"

# Configuration
$exportDir = "C:\export"
$repoRoot = Split-Path -Parent $PSScriptRoot
$projectName = "kick-chat-integration"
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$zipFileName = "${projectName}_${timestamp}.zip"
$zipPath = Join-Path $exportDir $zipFileName
$tempExportPath = Join-Path $exportDir "${projectName}_temp"

# Items to exclude (rebuilt locally)
$excludePatterns = @(
    ".git",
    ".github", 
    "node_modules",
    "venv311",
    "local-tts-service\venv311",
    "local-tts-service/venv311", 
    ".env",
    "*.log",
    ".DS_Store",
    "Thumbs.db",
    "desktop.ini",
    "*.tmp",
    "*.temp",
    ".vscode/settings.json",
    "uploads/voice-samples/*",
    "*.zip",
    "__pycache__",
    "*.pyc"
)

Write-Host "Exporting project for transfer..." -ForegroundColor Green
Write-Host "Source: $repoRoot"
Write-Host "Export: $zipPath"

# Create export directory if it doesn't exist
if (-not (Test-Path $exportDir)) {
    New-Item -Path $exportDir -ItemType Directory -Force | Out-Null
    Write-Host "Created export directory: $exportDir"
}

# Remove temp directory if it exists
if (Test-Path $tempExportPath) {
    Remove-Item -Path $tempExportPath -Recurse -Force
}

# Create temp export directory
New-Item -Path $tempExportPath -ItemType Directory -Force | Out-Null

Write-Host "Copying files (excluding build artifacts)..."

# Function to check if path should be excluded
function ShouldExclude($relativePath) {
    foreach ($pattern in $excludePatterns) {
        if ($pattern.Contains("*")) {
            if ($relativePath -like $pattern) {
                return $true
            }
        } else {
            # Check if path exactly matches or is a subfolder of the pattern
            if ($relativePath -eq $pattern -or 
                $relativePath.StartsWith("$pattern\") -or 
                $relativePath.StartsWith("$pattern/") -or
                $relativePath -like "*\$pattern" -or
                $relativePath -like "*\$pattern\*" -or
                $relativePath -like "*/$pattern" -or
                $relativePath -like "*/$pattern/*") {
                return $true
            }
        }
    }
    return $false
}

# Copy files recursively, excluding patterns
function Copy-ProjectFiles($sourcePath, $destPath, $rootPath) {
    $items = Get-ChildItem -Path $sourcePath -Force
    
    foreach ($item in $items) {
        $relativePath = $item.FullName.Substring($rootPath.Length + 1)
        
        if (ShouldExclude $relativePath) {
            Write-Host "  Skipping: $relativePath" -ForegroundColor Yellow
            continue
        }
        
        $destItemPath = Join-Path $destPath $item.Name
        
        if ($item.PSIsContainer) {
            New-Item -Path $destItemPath -ItemType Directory -Force | Out-Null
            Copy-ProjectFiles $item.FullName $destItemPath $rootPath
        } else {
            Copy-Item -Path $item.FullName -Destination $destItemPath -Force
            Write-Host "  Copied: $relativePath" -ForegroundColor Gray
        }
    }
}

# Copy project files
Copy-ProjectFiles $repoRoot $tempExportPath $repoRoot

Write-Host "Creating transfer instructions..."

# Create setup instructions for the recipient
$setupInstructions = @'
# 🚀 Kick Chat Integration - Quick Setup

## Prerequisites
- Node.js v18+ (download from nodejs.org)
- Python 3.11 (optional, only for local voice cloning)

## Setup Steps
1. Extract this zip to your desired location
2. Open PowerShell in the project folder
3. Run: `npm install`
4. Run: `npm run setup:core`
5. Optional: `npm run setup:local-tts` (for voice cloning)
6. Configure .env file with your Kick.com OAuth credentials
7. Run: `npm start` or `npm run start:all`
8. Open: http://localhost:3000

## OAuth Setup
1. Go to https://kick.com/developer/applications
2. Create new application
3. Set redirect URI to: http://localhost:3000/auth/callback
4. Copy Client ID and Secret to .env file

## Need Help?
- Run `npm run diagnose` for troubleshooting
- Check README.md for detailed instructions

Generated: {0}
'@ -f (Get-Date)

$setupInstructionsPath = Join-Path $tempExportPath "SETUP-INSTRUCTIONS.md"
$setupInstructions | Out-File -FilePath $setupInstructionsPath -Encoding UTF8

Write-Host "Creating zip archive..."

# Create zip file
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Compress-Archive -Path "$tempExportPath\*" -DestinationPath $zipPath -CompressionLevel Optimal

# Clean up temp directory
Remove-Item -Path $tempExportPath -Recurse -Force

# Get zip file size
$zipSize = (Get-Item $zipPath).Length
$zipSizeMB = [math]::Round($zipSize / 1MB, 2)

Write-Host ""
Write-Host "Export completed successfully!" -ForegroundColor Green
Write-Host "Zip file: $zipPath"
Write-Host "Size: $zipSizeMB MB"
Write-Host ""
Write-Host "What was excluded:" -ForegroundColor Cyan
foreach ($pattern in $excludePatterns) {
    Write-Host "  - $pattern" -ForegroundColor Gray
}
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Copy $zipFileName to target computer"
Write-Host "  2. Extract and follow SETUP-INSTRUCTIONS.md"
Write-Host "  3. The recipient will need to run npm install and setup OAuth"
Write-Host ""

# Open export folder
Start-Process explorer.exe -ArgumentList $exportDir