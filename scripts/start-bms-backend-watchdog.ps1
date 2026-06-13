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
$TailscaleExe = "C:\Program Files\Tailscale\tailscale.exe"
$TailscaleRecoveryCooldownSeconds = 300
$lastTailscaleRecoveryAt = [datetime]::MinValue

if (-not (Test-Path $NodeExe)) {
  $NodeExe = "node.exe"
}

if (-not (Test-Path $TailscaleExe)) {
  $TailscaleExe = "tailscale.exe"
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

function Get-TailscaleIp {
  try {
    $tailscaleOutput = & $TailscaleExe ip -4 2>$null

    if ($LASTEXITCODE -ne 0) {
      return ""
    }

    $tailscaleIp = $tailscaleOutput |
      Where-Object { $_ -match "^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$" } |
      Select-Object -First 1

    return [string] $tailscaleIp
  } catch {
    return ""
  }
}

function Test-TailscaleBackendHealth {
  param([string] $Port)

  $tailscaleIp = Get-TailscaleIp

  if (-not $tailscaleIp) {
    return @{
      Ok = $false
      Ip = ""
      Message = "Tailscale has no 100.x.x.x IP"
    }
  }

  try {
    $response = Invoke-WebRequest `
      -Uri "http://${tailscaleIp}:${Port}/system/health" `
      -UseBasicParsing `
      -TimeoutSec 5

    return @{
      Ok = $response.StatusCode -ge 200 -and $response.StatusCode -lt 600
      Ip = $tailscaleIp
      Message = "Tailscale backend health responded with $($response.StatusCode)"
    }
  } catch {
    if ($_.Exception.Response) {
      return @{
        Ok = $true
        Ip = $tailscaleIp
        Message = "Tailscale backend returned an HTTP response"
      }
    }

    return @{
      Ok = $false
      Ip = $tailscaleIp
      Message = "Tailscale backend did not respond"
    }
  }
}

function Repair-Tailscale {
  Write-ManagerLog "Attempting Tailscale recovery."

  try {
    & $TailscaleExe up 2>&1 | ForEach-Object {
      if ($_ -and $_.ToString().Trim()) {
        Write-ManagerLog "tailscale up: $($_.ToString().Trim())"
      }
    }
  } catch {
    Write-ManagerLog "tailscale up failed: $($_.Exception.Message)"
  }

  Start-Sleep -Seconds 5

  if (Get-TailscaleIp) {
    Write-ManagerLog "Tailscale recovered after tailscale up."
    return
  }

  try {
    Write-ManagerLog "Restarting Tailscale service."
    Restart-Service -Name Tailscale -Force -ErrorAction Stop
    Start-Sleep -Seconds 8

    & $TailscaleExe up 2>&1 | ForEach-Object {
      if ($_ -and $_.ToString().Trim()) {
        Write-ManagerLog "tailscale up after service restart: $($_.ToString().Trim())"
      }
    }
  } catch {
    Write-ManagerLog "Tailscale service restart failed: $($_.Exception.Message)"
  }
}

$createdMutex = $false
$watchdogMutex = New-Object System.Threading.Mutex($true, "Global\BMSBackendWatchdog", [ref] $createdMutex)

if (-not $createdMutex) {
  Write-ManagerLog "Another BMS backend watchdog is already running. Exiting this copy."
  exit 0
}

Write-ManagerLog "BMS backend watchdog started."

$backendProcess = $null

try {
  while ($true) {
    if ($backendProcess -and $backendProcess.HasExited) {
      Write-ManagerLog "Backend process exited with code $($backendProcess.ExitCode)."
      $backendProcess = $null
    }

    $backendPort = Get-BackendPort
    $backendHealthy = Test-BackendHealth -Port $backendPort

    if (-not $backendHealthy) {
      if ($backendProcess -and -not $backendProcess.HasExited) {
        Write-ManagerLog "Backend process $($backendProcess.Id) is running, but localhost port $backendPort is not responding. Checking again in 10 seconds."
        Start-Sleep -Seconds 10
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
      Start-Sleep -Seconds 10
      continue
    }

    $tailscaleHealth = Test-TailscaleBackendHealth -Port $backendPort

    if (-not $tailscaleHealth["Ok"]) {
      $secondsSinceRecovery = (New-TimeSpan -Start $lastTailscaleRecoveryAt -End (Get-Date)).TotalSeconds

      if ($secondsSinceRecovery -ge $TailscaleRecoveryCooldownSeconds) {
        Write-ManagerLog "Tailscale health check failed: $($tailscaleHealth["Message"])."
        Repair-Tailscale
        $lastTailscaleRecoveryAt = Get-Date
      } else {
        Write-ManagerLog "Tailscale health check failed: $($tailscaleHealth["Message"]). Recovery is cooling down."
      }
    }

    if ($tailscaleHealth["Ok"]) {
      Write-ManagerLog "Backend is responding on localhost and Tailscale $($tailscaleHealth["Ip"]):$backendPort. Checking again in 60 seconds."
    } else {
      Write-ManagerLog "Backend is responding on localhost port $backendPort. Checking again in 60 seconds."
    }

    Start-Sleep -Seconds 60
  }
} finally {
  $watchdogMutex.ReleaseMutex()
  $watchdogMutex.Dispose()
}
