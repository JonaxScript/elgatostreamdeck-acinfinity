$src = "$PSScriptRoot\com.acinfinity.sensor.sdPlugin"
$dst = "$env:APPDATA\Elgato\StreamDeck\Plugins\com.acinfinity.sensor.sdPlugin"

Write-Host "Installing AC Infinity Stream Deck Plugin..." -ForegroundColor Cyan

# Stop Stream Deck if running
$sd = Get-Process -Name "StreamDeck" -ErrorAction SilentlyContinue
if ($sd) {
    Write-Host "Stopping Stream Deck..." -ForegroundColor Yellow
    $sd | Stop-Process -Force
    Start-Sleep -Seconds 2
}

# Copy plugin files
if (-not (Test-Path $dst)) {
    New-Item -ItemType Directory -Path $dst -Force | Out-Null
}
Copy-Item "$src\*" $dst -Recurse -Force

Write-Host "Plugin installed to:" -ForegroundColor Green
Write-Host "  $dst" -ForegroundColor Gray

# Restart Stream Deck
$exe = "C:\Program Files\Elgato\StreamDeck\StreamDeck.exe"
if (Test-Path $exe) {
    Write-Host "Starting Stream Deck..." -ForegroundColor Yellow
    Start-Process $exe
} else {
    Write-Host "Stream Deck not found at default path — please start it manually." -ForegroundColor Red
}

Write-Host "Done." -ForegroundColor Green
