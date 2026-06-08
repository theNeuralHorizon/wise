# Wise — Run Script
# Builds the Rust backend and opens the app

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          Wise — Bill Splitter            ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check Rust
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Rust not found. Install from: https://rustup.rs" -ForegroundColor Red
    Write-Host "   Run: winget install Rustlang.Rustup" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Rust found: $(cargo --version)" -ForegroundColor Green

# Create .env if it doesn't exist
$envFile = ".\backend\.env"
if (-not (Test-Path $envFile)) {
    Copy-Item ".\backend\.env.example" $envFile
    Write-Host "📄 Created .env from template" -ForegroundColor Yellow
    Write-Host "   Add your GEMINI_API_KEY to $envFile for real AI parsing" -ForegroundColor Yellow
    Write-Host "   (App works without it — uses demo receipt data)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "🔨 Building Rust backend..." -ForegroundColor Cyan

Push-Location backend
cargo build --release 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed. Check errors above." -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

Write-Host "✅ Build complete!" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Starting server on http://localhost:8081" -ForegroundColor Cyan
Write-Host "   Open c:\wise\index.html in your browser" -ForegroundColor Gray
Write-Host "   Status indicator will turn GREEN when connected" -ForegroundColor Gray
Write-Host ""
Write-Host "   Press Ctrl+C to stop" -ForegroundColor DarkGray
Write-Host ""

# Open browser first
Start-Process "c:\wise\index.html"

# Start the server
Push-Location backend
.\target\release\wise-server.exe
Pop-Location
