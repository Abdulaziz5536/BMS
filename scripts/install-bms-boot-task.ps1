$ErrorActionPreference = "Stop"

# Run this script as Administrator to make BMS start when Windows boots,
# even before anyone logs in. It creates a SYSTEM scheduled task that starts
# the backend watchdog script.

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$WatchdogScript = Join-Path $ProjectRoot "scripts\start-bms-backend-watchdog.ps1"
$InstallLog = Join-Path $ProjectRoot "logs\boot-task-install.log"
$StartupShortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "Start BMS Backend Watchdog.vbs"
$TaskName = "BMS-Backend-Boot"

New-Item -ItemType Directory -Force -Path (Split-Path $InstallLog) | Out-Null

function Write-InstallLog {
  param([string] $Message)

  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path $InstallLog -Value "[$timestamp] $Message"
}

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

Write-InstallLog "Installing boot task $TaskName."

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$WatchdogScript`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal `
  -UserId "SYSTEM" `
  -LogonType ServiceAccount `
  -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Days 0)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "Starts and monitors BMS backend for private Tailscale access before Windows login." `
  -Force | Out-String | ForEach-Object { Write-InstallLog $_.Trim() }

if (Test-Path $StartupShortcut) {
  # The boot task replaces the login-only shortcut, so remove it after the stronger setup exists.
  Remove-Item -LiteralPath $StartupShortcut -Force
  Write-InstallLog "Removed login-only startup shortcut."
}

$registeredTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
Write-InstallLog "Verified scheduled task: $($registeredTask.TaskName), state: $($registeredTask.State)."

Start-ScheduledTask -TaskName $TaskName
Write-InstallLog "Boot task installed and started."

Write-Host "BMS boot task installed. The backend watchdog will start when Windows boots."
Write-Host "Install log: $InstallLog"
Read-Host "Press Enter to close"
