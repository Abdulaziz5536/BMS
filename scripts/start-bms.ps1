param(
  [switch] $DevFrontend
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackendScript = Join-Path $ProjectRoot "backend\index.js"
$FrontendDir = Join-Path $ProjectRoot "frontend"
$EnvPath = Join-Path $ProjectRoot "backend\.env"
$LogDir = Join-Path $ProjectRoot "logs"
$StartupLog = Join-Path $LogDir "startup.log"
$BackendOut = Join-Path $LogDir "backend.log"
$BackendErr = Join-Path $LogDir "backend.err"
$FrontendOut = Join-Path $LogDir "frontend-dev.log"
$FrontendErr = Join-Path $LogDir "frontend-dev.err"
$MaxLogBytes = 5MB
$MinFreeDiskMB = 200

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Rotate-LogFile {
  param([string] $Path)

  if (-not (Test-Path $Path)) {
    return
  }

  $item = Get-Item $Path
  if ($item.Length -lt $MaxLogBytes) {
    return
  }

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  Move-Item -LiteralPath $Path -Destination "$Path.$stamp.old" -Force
}

function Rotate-BmsLogs {
  @($StartupLog, $BackendOut, $BackendErr, $FrontendOut, $FrontendErr) | ForEach-Object {
    Rotate-LogFile -Path $_
  }

  Get-ChildItem -Path $LogDir -Filter "*.old" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 20 |
    Remove-Item -Force
}

function Write-StartupLog {
  param([string] $Message)

  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$timestamp] $Message"
  Add-Content -Path $StartupLog -Value $line
  Write-Host $line
}

function Assert-FreeDisk {
  $rootPath = [System.IO.Path]::GetPathRoot($ProjectRoot.ProviderPath)
  $drive = [System.IO.DriveInfo]::GetDrives() |
    Where-Object { $_.Name -eq $rootPath } |
    Select-Object -First 1

  if (-not $drive) {
    Write-StartupLog "Could not read free disk space for $rootPath. Continuing startup."
    return
  }

  $freeMB = [math]::Round($drive.AvailableFreeSpace / 1MB)

  if ($freeMB -lt $MinFreeDiskMB) {
    throw "Only $freeMB MB free on $rootPath. Free disk space before starting BMS."
  }
}

function Get-EnvValue {
  param(
    [string] $Name,
    [string] $Default = ""
  )

  if (-not (Test-Path $EnvPath)) {
    return $Default
  }

  $line = Get-Content $EnvPath | Where-Object { $_ -match "^$Name=" } | Select-Object -First 1

  if ($line -match "^$Name=(.*)$") {
    return $matches[1].Trim()
  }

  return $Default
}

function Get-PortOwner {
  param([int] $Port)

  $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    Where-Object { $_.State -eq "Listen" } |
    Select-Object -First 1

  if (-not $connection) {
    return $null
  }

  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue

  return [PSCustomObject]@{
    Port = $Port
    ProcessId = $connection.OwningProcess
    ProcessName = $process.Name
    CommandLine = $process.CommandLine
  }
}

function Test-Health {
  param([string] $Url)

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    if ($_.Exception.Response) {
      return $true
    }

    return $false
  }
}

function Wait-ForHealth {
  param(
    [string] $Url,
    [int] $TimeoutSeconds = 45
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    if (Test-Health -Url $Url) {
      return $true
    }

    Start-Sleep -Seconds 2
  }

  return $false
}

function Assert-PortAvailableOrHealthy {
  param(
    [int] $Port,
    [string] $HealthUrl,
    [string] $Label
  )

  $owner = Get-PortOwner -Port $Port

  if (-not $owner) {
    return
  }

  if ($HealthUrl -and (Test-Health -Url $HealthUrl)) {
    Write-StartupLog "$Label already responds on port $Port. Not starting a duplicate."
    return
  }

  Write-StartupLog "$Label port $Port is already used by PID $($owner.ProcessId): $($owner.CommandLine)"
  throw "$Label port $Port is busy but health did not respond. Stop the stale process before starting another server."
}

$backendPort = [int](Get-EnvValue -Name "PORT" -Default "3000")
$backendHealthUrl = "http://127.0.0.1:$backendPort/system/health"

Rotate-BmsLogs
Assert-FreeDisk
Write-StartupLog "Starting BMS checked startup from $ProjectRoot"
Assert-PortAvailableOrHealthy -Port $backendPort -HealthUrl $backendHealthUrl -Label "Backend"

if (-not (Test-Health -Url $backendHealthUrl)) {
  Write-StartupLog "Starting backend on port $backendPort. Logs: $BackendOut and $BackendErr"

  Start-Process `
    -FilePath "node.exe" `
    -ArgumentList "`"$BackendScript`"" `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $BackendOut `
    -RedirectStandardError $BackendErr `
    -PassThru | Out-Null

  if (-not (Wait-ForHealth -Url $backendHealthUrl)) {
    Write-StartupLog "Backend did not become healthy. Check $BackendErr"
    exit 1
  }
}

Write-StartupLog "Backend health OK: $backendHealthUrl"

if ($DevFrontend) {
  $frontendPort = 5173
  $frontendUrl = "http://127.0.0.1:$frontendPort/"
  Assert-PortAvailableOrHealthy -Port $frontendPort -HealthUrl $frontendUrl -Label "Frontend dev"

  if (-not (Test-Health -Url $frontendUrl)) {
    Write-StartupLog "Starting frontend dev server on port $frontendPort. Logs: $FrontendOut and $FrontendErr"

    Start-Process `
      -FilePath "npm.cmd" `
      -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1") `
      -WorkingDirectory $FrontendDir `
      -WindowStyle Hidden `
      -RedirectStandardOutput $FrontendOut `
      -RedirectStandardError $FrontendErr `
      -PassThru | Out-Null

    if (-not (Wait-ForHealth -Url $frontendUrl)) {
      Write-StartupLog "Frontend dev server did not become healthy. Check $FrontendErr"
      exit 1
    }
  }

  Write-StartupLog "Frontend dev OK: $frontendUrl"
}

Write-StartupLog "BMS startup complete."
