$ErrorActionPreference = "Stop"

# Run as Administrator if you ever want to remove the boot-level BMS startup task.

$TaskName = "BMS-Backend-Boot"

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)

  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
  Write-Host "Opening Administrator permission prompt..."
  Start-Process `
    -FilePath "powershell.exe" `
    -Verb RunAs `
    -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  exit 0
}

schtasks /Delete /TN $TaskName /F
Write-Host "BMS boot task removed."
Read-Host "Press Enter to close"
