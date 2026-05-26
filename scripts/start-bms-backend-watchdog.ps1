$ErrorActionPreference = "Stop"

# This script keeps the BMS backend alive for private Tailscale access.
# Task Scheduler starts this script when Windows logs in, then the loop below
# starts backend/index.js and restarts it if Node ever exits.

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackendScript = Join-Path $ProjectRoot "backend\index.js"
$LogDir = Join-Path $ProjectRoot "logs"
$ManagerLog = Join-Path $LogDir "backend-watchdog.log"
$BackendOut = Join-Path $LogDir "backend.log"
$BackendErr = Join-Path $LogDir "backend.err"
$BackendEnv = Join-Path $ProjectRoot "backend\.env"
$NodeExe = "C:\Program Files\nodejs\node.exe"

if (-not (Test-Path $NodeExe)) {
  $NodeExe = "node.exe"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# Keep this PC awake while it is acting as the BMS server.
# This does not change Windows power settings permanently; it only prevents idle sleep while this watchdog runs.
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class BmsSleepBlocker {
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern uint SetThreadExecutionState(uint esFlags);
}
"@

$ES_CONTINUOUS = [uint32]"0x80000000"
$ES_SYSTEM_REQUIRED = [uint32]"0x00000001"
[BmsSleepBlocker]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED) | Out-Null

function Write-ManagerLog {
  param([string] $Message)

  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path $ManagerLog -Value "[$timestamp] $Message"
}

function Get-BackendPort {
  # Read PORT from backend/.env so this watchdog follows the same port as the backend.
  if (Test-Path $BackendEnv) {
    $portLine = Get-Content $BackendEnv | Where-Object { $_ -match "^PORT=" } | Select-Object -First 1

    if ($portLine -match "^PORT=(\d+)") {
      return $matches[1]
    }
  }

  return "3000"
}

function Test-BackendHealth {
  param([string] $Port)

  # Any HTTP response means Node is running. A 503 can happen while MongoDB or env checks are warming up,
  # so do not start a duplicate backend just because health is not fully green yet.
  try {
    $response = Invoke-WebRequest `
      -Uri "http://127.0.0.1:$Port/system/health" `
      -UseBasicParsing `
      -TimeoutSec 5

    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 600
  } catch {
    if ($_.Exception.Response) {
      return $true
    }

    return $false
  }
}

$createdMutex = $false
$watchdogMutex = New-Object System.Threading.Mutex($true, "Global\BMSBackendWatchdog", [ref] $createdMutex)

if (-not $createdMutex) {
  Write-ManagerLog "Another BMS backend watchdog is already running. Exiting this copy."
  exit 0
}

Write-ManagerLog "BMS backend watchdog started."

try {
  while ($true) {
    $backendPort = Get-BackendPort

    if (Test-BackendHealth -Port $backendPort) {
      Write-ManagerLog "Backend is responding on port $backendPort. Checking again in 60 seconds."
      Start-Sleep -Seconds 60
      continue
    }

    Write-ManagerLog "Starting backend from $BackendScript."

    $backendProcess = Start-Process `
      -FilePath $NodeExe `
      -ArgumentList "`"$BackendScript`"" `
      -WorkingDirectory $ProjectRoot `
      -RedirectStandardOutput $BackendOut `
      -RedirectStandardError $BackendErr `
      -WindowStyle Hidden `
      -PassThru

    Write-ManagerLog "Backend started as process $($backendProcess.Id)."
    $backendProcess.WaitForExit()
    Write-ManagerLog "Backend process exited with code $($backendProcess.ExitCode). Restarting in 10 seconds."
    Start-Sleep -Seconds 10
  }
} finally {
  $watchdogMutex.ReleaseMutex()
  $watchdogMutex.Dispose()
}
