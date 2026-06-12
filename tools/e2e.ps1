# tools/e2e.ps1
# Lightweight end-to-end smoke test using curl and PowerShell

$api = "http://localhost:8081/api"
$workdir = Join-Path $PSScriptRoot "..\backend"
$splitFile = Join-Path $workdir "e2e_split.json"
$imgFile = Join-Path $workdir "e2e_receipt.jpg"

# Create payload
@'
{
  "name": "E2E Test Split",
  "restaurant": "E2E Diner",
  "participants": [
    {"name": "Eve", "emoji": ":)", "upi_id": null},
    {"name": "Mallory", "emoji": ":D", "upi_id": null}
  ]
}
'@ | Out-File -FilePath $splitFile -Encoding utf8

# Create dummy image bytes (text is fine for smoke)
"THIS-IS-A-FAKE-IMAGE-BYTES" | Out-File -FilePath $imgFile -Encoding ascii

Write-Host "Posting split payload..."
try {
  $body = Get-Content -Raw -Path $splitFile
  $createObj = Invoke-RestMethod -Uri "$api/splits" -Method Post -ContentType 'application/json' -Body $body -ErrorAction Stop
  Write-Host "Created split id:" $createObj.split_id
} catch {
  Write-Error "Create split failed: $_"
  exit 1
}

Write-Host "Uploading receipt..."
$uploadResp = curl.exe -sS -X POST "$api/splits/$($createObj.split_id)/receipt" -F "receipt=@$imgFile"
Write-Host "Upload response:" $uploadResp

# Cleanup
Remove-Item -Force $splitFile -ErrorAction SilentlyContinue
Remove-Item -Force $imgFile -ErrorAction SilentlyContinue

Write-Host "E2E script complete."
