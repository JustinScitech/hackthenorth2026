# Starts the local backing services without Docker (Windows, no admin needed).
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

$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline -and -not (Listening 27017)) { Start-Sleep -Milliseconds 500 }

Write-Host ""
Write-Host ("Postgres 5432: " + $(if (Listening 5432) { "up" } else { "DOWN - start the postgresql-x64-17 service" }))
Write-Host ("MongoDB  27017: " + $(if (Listening 27017) { "up" } else { "DOWN - see .local/mongod.log" }))
