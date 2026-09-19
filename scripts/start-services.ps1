# Starts the local backing services without Docker (Windows, no admin needed).
#   - Temporal dev server (in-memory) on localhost:7233, UI on http://localhost:8080
#   - MongoDB 7 on 127.0.0.1:27017 with data in .local/mongo-data
# PostgreSQL 17 and MongoDB 7 run as Windows services (auto-start); mongod is launched here only if the service is down.
# Usage: powershell -File scripts/start-services.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$local = Join-Path $root ".local"
New-Item -ItemType Directory -Force (Join-Path $local "mongo-data") | Out-Null

function Listening($port) {
  return [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

$mongod = "C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe"
if (Listening 27017) { Write-Host "MongoDB already listening on 27017" }
else {
  Start-Process -FilePath $mongod -WindowStyle Hidden -ArgumentList @(
    "--dbpath", (Join-Path $local "mongo-data"),
    "--bind_ip", "127.0.0.1", "--port", "27017",
    "--logpath", (Join-Path $local "mongod.log"), "--logappend"
  )
  Write-Host "Started MongoDB on 127.0.0.1:27017"
}

$temporal = (Get-Command temporal -ErrorAction SilentlyContinue).Source
if (-not $temporal) {
  $temporal = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Temporal.TemporalCLI_*\temporal.exe" -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $temporal) { throw "temporal CLI not found; install with: winget install Temporal.TemporalCLI" }
if (Listening 7233) { Write-Host "Temporal already listening on 7233" }
else {
  Start-Process -FilePath $temporal -WindowStyle Hidden -ArgumentList @(
    "server", "start-dev", "--ip", "127.0.0.1", "--port", "7233", "--ui-port", "8080",
    "--log-level", "warn"
  ) -RedirectStandardOutput (Join-Path $local "temporal.log") -RedirectStandardError (Join-Path $local "temporal.err.log")
  Write-Host "Started Temporal dev server on 127.0.0.1:7233 (UI: http://localhost:8080)"
}

$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline -and -not ((Listening 27017) -and (Listening 7233))) { Start-Sleep -Milliseconds 500 }

Write-Host ""
Write-Host ("Postgres 5432: " + $(if (Listening 5432) { "up" } else { "DOWN - start the postgresql-x64-17 service" }))
Write-Host ("MongoDB  27017: " + $(if (Listening 27017) { "up" } else { "DOWN - see .local/mongod.log" }))
Write-Host ("Temporal 7233: " + $(if (Listening 7233) { "up" } else { "DOWN - see .local/temporal.err.log" }))
