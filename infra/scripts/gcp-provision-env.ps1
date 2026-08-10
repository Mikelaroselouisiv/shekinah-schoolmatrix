#Requires -Version 5.1
<#
.SYNOPSIS
  Crée /opt/schoolmatrix/.env.prod sur la VM GCP si absent (mots de passe générés).
#>
param(
  [string] $ProjectId = 'shekinah-schoolmatrix',
  [string] $VmName = 'schoolmatrix-api',
  [string] $Zone = 'northamerica-northeast1-a',
  [string] $RemoteDir = '/opt/schoolmatrix',
  [switch] $ForceRotate
)

$ErrorActionPreference = 'Continue'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $ScriptDir 'assert-schoolmatrix-gcp.ps1')
if (-not $?) { throw 'assert-schoolmatrix-gcp.ps1 a echoue' }

function New-Secret([int] $Bytes = 32) {
  $buf = New-Object byte[] $Bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
  return ([Convert]::ToBase64String($buf) -replace '[/+=]', 'x')
}

$dbPass = New-Secret 24
$jwt = New-Secret 32

$check = @"
if [ -f '$RemoteDir/.env.prod' ] && [ '$ForceRotate' != 'True' ]; then
  echo EXISTS
else
  echo MISSING
fi
"@

$state = (& gcloud compute ssh $VmName --zone=$Zone --project=$ProjectId --tunnel-through-iap --command=$check | Out-String).Trim()
Write-Host "Etat .env.prod: $state"

if ($state -eq 'EXISTS' -and -not $ForceRotate) {
  Write-Host '.env.prod deja present — aucun changement.' -ForegroundColor Green
  return
}

$envBody = @"
DB_USER=schoolmatrix
DB_PASS=$dbPass
DB_NAME=schoolmatrix
JWT_SECRET=$jwt
NODE_ID=CLOUD
STORAGE_ROOT=/app/storage
"@

$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($envBody))
$remote = @"
set -euo pipefail
sudo mkdir -p '$RemoteDir'
echo '$b64' | base64 -d | sudo tee '$RemoteDir/.env.prod' >/dev/null
sudo chmod 600 '$RemoteDir/.env.prod'
sudo chown root:root '$RemoteDir/.env.prod'
echo OK
"@

& gcloud compute ssh $VmName --zone=$Zone --project=$ProjectId --tunnel-through-iap --command=$remote
Write-Host "Ecrit $RemoteDir/.env.prod sur $VmName" -ForegroundColor Green
Write-Host 'Conservez DB_PASS / JWT_SECRET (sur la VM uniquement).' -ForegroundColor Yellow
