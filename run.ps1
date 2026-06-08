# Wise - Run Script
# Builds the Rust backend and opens the app

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "+------------------------------------------+" -ForegroundColor Cyan
Write-Host "|          Wise - Bill Splitter            |" -ForegroundColor Cyan
Write-Host "+------------------------------------------+" -ForegroundColor Cyan
Write-Host ""

# Check Rust
$cargoPath = "$env:USERPROFILE\.cargo\bin"
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    if (Test-Path "$cargoPath\cargo.exe") {
        $env:PATH = "$cargoPath;$env:PATH"
    } else {
        Write-Host "[Error] Rust not found. Install from: https://rustup.rs" -ForegroundColor Red
        Write-Host "   Run: winget install Rustlang.Rustup" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "[OK] Rust found: $(cargo --version)" -ForegroundColor Green

# Create .env if it doesn't exist
$envFile = ".\backend\.env"
if (-not (Test-Path $envFile)) {
    Copy-Item ".\backend\.env.example" $envFile
    Write-Host "[Info] Created .env from template" -ForegroundColor Yellow
    Write-Host "   Add your GEMINI_API_KEY to $envFile for real AI parsing" -ForegroundColor Yellow
    Write-Host "   (App works without it - uses demo receipt data)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[Info] Building Rust backend..." -ForegroundColor Cyan

Push-Location backend
cargo build --release 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[Error] Build failed. Check errors above." -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

Write-Host "[OK] Build complete!" -ForegroundColor Green
Write-Host ""
Write-Host "[Info] Starting services..." -ForegroundColor Cyan

$processes = @()

# 1. Python AI Microservice
if (Test-Path ".\ai_service\main.py") {
    Write-Host "   Starting Python AI Service on http://localhost:5000..." -ForegroundColor Gray
    $p1 = Start-Process "python" -ArgumentList "main.py" -WorkingDirectory ".\ai_service" -PassThru -NoNewWindow
    $processes += $p1
}

# 2. Rust Backend Server
Write-Host "   Starting Rust backend server on http://localhost:8081..." -ForegroundColor Gray
$p2 = Start-Process ".\backend\target\release\wise-server.exe" -WorkingDirectory ".\backend" -PassThru -NoNewWindow
$processes += $p2

# 3. Vite Dev Server
if (Test-Path ".\frontend") {
    Write-Host "   Starting Vite dev server on http://localhost:5173..." -ForegroundColor Gray
    $p3 = Start-Process "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory ".\frontend" -PassThru -NoNewWindow
    $processes += $p3
}

Write-Host ""
Write-Host "Opening application at http://localhost:5173..." -ForegroundColor Green
Start-Sleep -Seconds 2 # Give Vite a moment to initialize
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "All services are running!" -ForegroundColor Green
Write-Host "   Press Ctrl+C in this console to stop all services." -ForegroundColor Yellow
Write-Host ""

try {
    while ($true) {
        # Check if any process has crashed/exited
        foreach ($p in $processes) {
            if ($p -and $p.HasExited) {
                Write-Host "[Warning] A service has stopped (Exit Code: $($p.ExitCode))." -ForegroundColor Red
            }
        }
        Start-Sleep -Seconds 2
    }
}
finally {
    Write-Host "`nStopping all services..." -ForegroundColor Red
    foreach ($p in $processes) {
        if ($p -and -not $p.HasExited) {
            Write-Host "   Killing process ID $($p.Id)..." -ForegroundColor Gray
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host "All services stopped successfully!" -ForegroundColor Green
}
