
# install-and-debug.ps1
# Installs Wise debug APK on the running emulator and tails logcat for app logs.

$ANDROID_HOME = "$env:USERPROFILE\AppData\Local\Android\Sdk"
$adb = "$ANDROID_HOME\platform-tools\adb.exe"
$apk = "C:\wise\frontend\android\app\build\outputs\apk\debug\app-debug.apk"
$package = "app.wise.split"

Write-Host "[1/4] Installing APK..." -ForegroundColor Cyan
& $adb install -r $apk
if ($LASTEXITCODE -ne 0) { Write-Host "Install failed!" -ForegroundColor Red; exit 1 }

Write-Host "[2/4] Clearing previous logcat..." -ForegroundColor Cyan
& $adb logcat -c

Write-Host "[3/4] Launching app..." -ForegroundColor Cyan
& $adb shell am start -n "$package/.MainActivity"
Start-Sleep -Seconds 1

Write-Host "[4/4] Streaming logs (Ctrl+C to stop)..." -ForegroundColor Green
Write-Host "   Filter: Wise app + Capacitor WebView + Network errors" -ForegroundColor Gray
Write-Host ""

# Stream logcat — filter for the Wise app and Capacitor/Chromium WebView
& $adb logcat -v time --pid (& $adb shell pidof -s $package) 2>&1 | Where-Object {
    $_ -match "Wise|Capacitor|chromium|WiseSplit|wise|JSERROR|AndroidRuntime|NetworkError|FATAL|I/System.out|E/|W/WebView"
}
