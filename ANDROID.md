# Wise Android App

Wise runs natively on Android via Capacitor — the same React/Vite web UI,
packaged as a native app that talks to the local Rust backend.

## Architecture

```
Android App (Capacitor WebView)
        │
        │  HTTP / WebSocket
        ▼
Rust Axum Backend (port 8081)   ←── runs on your PC
        │
        ├── SQLite (wise.db)
        └── Gemini Vision API (optional)
```

---

## Quick Start (Emulator)

### 1. Start the backend services
```powershell
# In c:\wise root
.\run.ps1
```

### 2. Build and open in Android Studio
```powershell
cd frontend
npm run android:sync   # builds web + copies to Android project
```
Android Studio should already be open at `frontend/android`.

### 3. Run on emulator
In Android Studio: click the **▶ Run** button (or `Shift+F10`).
The emulator reaches your PC's backend at `10.0.2.2:8081` automatically.

---

## Physical Device (same WiFi)

Your PC's LAN IP is: **172.24.119.4**

### 1. Edit `.env.android`
```
# c:\wise\frontend\.env.android
VITE_API_BASE_URL=http://172.24.119.4:8081/api
VITE_WS_BASE_URL=ws://172.24.119.4:8081/api
```
(Uncomment the physical device lines, comment out the emulator ones.)

### 2. Allow Windows Firewall for port 8081
```powershell
# Run as Administrator
New-NetFirewallRule -DisplayName "Wise Backend" -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow
```

### 3. Re-sync and run
```powershell
cd frontend
npm run android:sync
```
In Android Studio: select your physical device → **▶ Run**.

---

## Rebuilding After Code Changes

Whenever you change `src/` files:
```powershell
cd frontend
npm run android:sync   # rebuilds web + syncs to Android
```
Then re-run from Android Studio (no full Gradle build needed — just reinstall APK).

---

## Release APK (for sideloading)

```powershell
# Use Android Studio's bundled JDK (avoids Gradle/JDK version conflicts)
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
cd frontend
npm run android:sync
cd android
.\gradlew.bat assembleDebug
```
APK will be at: `android\app\build\outputs\apk\debug\app-debug.apk`

---

## UPI Deeplinks on Physical Device

The app opens `upi://` scheme URLs natively. On a physical Android phone,
tapping "Pay via UPI" or "Open UPI App" will launch GPay, PhonePe, BHIM, etc.
On the emulator this will fail gracefully (no UPI apps installed).

---

## Troubleshooting

| Issue | Fix |
|---|---|
| "Connection refused" on emulator | Make sure `.\run.ps1` is running on PC |
| "Connection refused" on device | Use LAN IP in `.env.android`, check firewall |
| Gradle JDK error | Run `$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'` |
| White screen on launch | Check backend is running; try `npm run android:sync` again |
| Camera doesn't open | Emulator: set up a virtual camera in AVD settings |
