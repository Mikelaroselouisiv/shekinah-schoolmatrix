#Requires -Version 5.1
<#
  Bootstrap machine Server SchoolMatrix - appelé automatiquement au lancement de l'app.
  Tout est embarqué dans l'installeur : images .tar, docker-compose, defaults.env
  (SYNC_API_KEY + GCS + GEMINI), credentials/gcs-sa.json. Aucune config manuelle sur site.
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $StackDir
)

$ErrorActionPreference = 'Stop'
$StackDir = (Resolve-Path -LiteralPath $StackDir).Path
$ComposeFile = Join-Path $StackDir 'docker-compose.yml'
$EnvFile = Join-Path $StackDir '.env.server'
$DefaultsFile = Join-Path $StackDir 'defaults.env'
$DefaultsExample = Join-Path $StackDir 'defaults.env.example'
$ImagesDir = Join-Path $StackDir 'images'
$StateFile = Join-Path $StackDir '.bootstrap-done'
$TaskName = 'Shekinah-SchoolMatrix-Server-Stack'
$StartScript = Join-Path $StackDir 'stack-start.ps1'

function Write-Step([string]$Message) {
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function New-RandomSecret([int]$ByteLength = 32) {
  $bytes = New-Object byte[] $ByteLength
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  -join ($bytes | ForEach-Object { '{0:x2}' -f $_ })
}

function Read-EnvMap([string]$Path) {
  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $map }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*([^#=]+)=(.*)$') {
      $map[$Matches[1].Trim()] = $Matches[2].Trim()
    }
  }
  return $map
}

function Write-EnvMap([string]$Path, [hashtable]$Map) {
  $out = foreach ($key in @($Map.Keys | Sort-Object)) { "$key=$($Map[$key])" }
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllLines($Path, @($out), $utf8)
}

function Get-BundledDefaultsPath {
  if (Test-Path -LiteralPath $DefaultsFile) { return $DefaultsFile }
  if (Test-Path -LiteralPath $DefaultsExample) { return $DefaultsExample }
  throw 'defaults.env manquant dans server-stack (installeur incomplet).'
}

function Test-Placeholder([string]$Value) {
  return (-not $Value) -or ($Value -match '^CHANGE_ME')
}

function Test-DockerReady {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return $false }
  docker info 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
}

function Install-DockerDesktop {
  if (Test-DockerReady) { return }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw 'Docker Desktop est requis. Installez Docker Desktop puis relancez SchoolMatrix Server (une seule fois).'
  }
  Write-Step 'Installation de Docker Desktop (winget)...'
  winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
  $deadline = (Get-Date).AddMinutes(5)
  while ((Get-Date) -lt $deadline) {
    if (Test-DockerReady) { return }
    Start-Sleep -Seconds 5
  }
  throw 'Docker Desktop installe mais pas pret. Redemarrez le PC puis relancez SchoolMatrix Server.'
}

function Assert-GcsCredentials {
  $cred = Join-Path $StackDir 'credentials\gcs-sa.json'
  if (-not (Test-Path -LiteralPath $cred)) {
    throw 'credentials/gcs-sa.json manquant dans server-stack (installeur incomplet — rebuild Server).'
  }
}

function Ensure-EnvFile {
  $source = Get-BundledDefaultsPath
  $bundled = Read-EnvMap $source

  if (-not (Test-Path -LiteralPath $EnvFile)) {
    $map = @{}
    foreach ($k in $bundled.Keys) { $map[$k] = $bundled[$k] }

    if (Test-Placeholder $map['DB_PASS']) { $map['DB_PASS'] = New-RandomSecret -ByteLength 18 }
    if (Test-Placeholder $map['JWT_SECRET']) { $map['JWT_SECRET'] = New-RandomSecret -ByteLength 32 }

    # SYNC_API_KEY : DOIT venir de l'installeur (defaults.env bake au build). Jamais de cle aleatoire.
    if (Test-Placeholder $map['SYNC_API_KEY']) {
      throw 'SYNC_API_KEY absente de defaults.env - rebuild l installateur Server (prepare:server-stack + secrets).'
    }

    if (-not $map['DB_USER']) { $map['DB_USER'] = 'schoolmatrix' }
    if (-not $map['DB_NAME']) { $map['DB_NAME'] = 'schoolmatrix' }
    if (-not $map['REMOTE_API_URL']) { $map['REMOTE_API_URL'] = 'http://34.118.138.96' }
    if (-not $map['NODE_ID']) { $map['NODE_ID'] = 'LOCAL' }
    if (-not $map['SYNC_INTERVAL_MS']) { $map['SYNC_INTERVAL_MS'] = '5000' }
    if (-not $map['SYNC_KICK_URL']) { $map['SYNC_KICK_URL'] = 'http://sync-agent:3911/kick' }
    if (-not $map['SYNC_NODE_ID']) { $map['SYNC_NODE_ID'] = 'local-mother' }
    if (-not $map['GCS_BUCKET']) { $map['GCS_BUCKET'] = 'shekinah-schoolmatrix-assets' }
    if (-not $map['GCS_PREFIX']) { $map['GCS_PREFIX'] = 'schoolmatrix' }
    if (-not $map['GCS_PROJECT_ID']) { $map['GCS_PROJECT_ID'] = 'shekinah-schoolmatrix' }
    if (-not $map['GOOGLE_APPLICATION_CREDENTIALS']) {
      $map['GOOGLE_APPLICATION_CREDENTIALS'] = '/run/secrets/gcs-sa.json'
    }

    Write-EnvMap $EnvFile $map
    Write-Step 'Fichier .env.server cree (SYNC_API_KEY + GCS + GEMINI embarques)'
    return
  }

  # Mise a jour / repair : realigner cloud config depuis le bundle (MAJ installateur)
  [void](Align-BundledCloudConfig)
}

function Align-BundledCloudConfig {
  $source = Get-BundledDefaultsPath
  $bundled = Read-EnvMap $source
  $bundledKey = $bundled['SYNC_API_KEY']
  if (Test-Placeholder $bundledKey) { return $false }

  $map = Read-EnvMap $EnvFile
  $changed = $false
  # Realigne aussi le rythme sync / kick (sinon une ancienne .env.server
  # sur la machine ecole garde 45000ms apres MAJ installateur).
  $keysToAlign = @(
    'SYNC_API_KEY',
    'REMOTE_API_URL',
    'SYNC_INTERVAL_MS',
    'SYNC_KICK_URL',
    'SYNC_NODE_ID',
    'GCS_BUCKET',
    'GCS_PREFIX',
    'GCS_PROJECT_ID',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GEMINI_API_KEY',
    'GEMINI_MODEL'
  )
  foreach ($k in $keysToAlign) {
    $bv = $bundled[$k]
    if (-not $bv) { continue }
    if ($k -eq 'SYNC_API_KEY' -and (Test-Placeholder $bv)) { continue }
    if ($map[$k] -ne $bv) {
      $map[$k] = $bv
      $changed = $true
    }
  }
  if ($changed) {
    Write-EnvMap $EnvFile $map
    Write-Step 'Config cloud realignee depuis l installateur (sync + GCS + GEMINI)'
  }
  return $changed
}

function Import-BundledImages {
  if (-not (Test-Path -LiteralPath $ImagesDir)) {
    throw "Dossier images introuvable: $ImagesDir"
  }
  $tars = @(Get-ChildItem -LiteralPath $ImagesDir -Filter '*.tar' -File -ErrorAction SilentlyContinue)
  if ($tars.Count -eq 0) {
    throw "Aucune image .tar dans $ImagesDir - installateur Server incomplet."
  }
  foreach ($tar in $tars) {
    Write-Step "Chargement image $($tar.Name)..."
    docker load -i $tar.FullName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "docker load a echoue pour $($tar.Name)" }
  }
}

function Test-LocalApi {
  try {
    Invoke-WebRequest -Uri 'http://127.0.0.1:3000/setup/status' -UseBasicParsing -TimeoutSec 3 | Out-Null
    return $true
  } catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -lt 500) { return $true }
    try {
      Invoke-WebRequest -Uri 'http://127.0.0.1:3000/' -UseBasicParsing -TimeoutSec 3 | Out-Null
      return $true
    } catch {
      if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -lt 500) { return $true }
      return $false
    }
  }
}

function Test-PortInUse([int]$Port) {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return $null -ne $conn
}

function Assert-PortsFree {
  if (-not (Test-PortInUse -Port 3000)) { return }
  if (Test-LocalApi) {
    Write-Step 'API locale deja active sur le port 3000'
    return
  }
  throw 'Le port 3000 est deja utilise. Fermez l autre service puis relancez SchoolMatrix Server.'
}

function Invoke-DockerCompose {
  param(
    [string[]] $ComposeArgs,
    [switch] $Quiet
  )
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    if (Get-Command docker -ErrorAction SilentlyContinue) {
      if (docker compose version 2>$null) {
        & docker compose @ComposeArgs
      } else {
        & docker-compose @ComposeArgs
      }
    } else {
      throw 'docker introuvable'
    }
    if ($LASTEXITCODE -ne 0 -and -not $Quiet) {
      throw "docker compose a echoue (code $LASTEXITCODE)"
    }
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Start-Stack {
  Assert-PortsFree
  Write-Step 'Demarrage Postgres + API + sync-agent...'
  Push-Location $StackDir
  try {
    Invoke-DockerCompose -ComposeArgs @('-f', $ComposeFile, '--env-file', $EnvFile, 'up', '-d')
  } finally {
    Pop-Location
  }
}

function Write-StackStartScript {
  @"
#Requires -Version 5.1
`$ErrorActionPreference = 'Continue'
`$StackDir = '$StackDir'
`$ComposeFile = Join-Path `$StackDir 'docker-compose.yml'
`$EnvFile = Join-Path `$StackDir '.env.server'
`$deadline = (Get-Date).AddMinutes(3)
while ((Get-Date) -lt `$deadline) {
  docker info 2>`$null | Out-Null
  if (`$LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 3
}
Set-Location `$StackDir
if (docker compose version 2>`$null) {
  docker compose -f `$ComposeFile --env-file `$EnvFile up -d
} else {
  docker-compose -f `$ComposeFile --env-file `$EnvFile up -d
}
"@ | Set-Content -LiteralPath $StartScript -Encoding UTF8
}

function Register-ScheduledTask {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($existing) { return }
  Write-StackStartScript
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""
  $trigger = New-ScheduledTaskTrigger -AtLogon -User $env:USERNAME
  $trigger.Delay = 'PT1M'
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
  try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
      -Description 'Stack SchoolMatrix Server (Postgres + API + sync-agent)' | Out-Null
    Write-Step "Tache planifiee creee: $TaskName"
  } catch {
    Write-Warning 'Tache planifiee non creee (droits admin). La stack tourne quand meme.'
  }
}

function Invoke-ComposeUp {
  param(
    [switch]$Quiet,
    [switch]$ForceRecreateApp
  )
  Push-Location $StackDir
  try {
    if ($ForceRecreateApp) {
      # Backend (SYNC_KICK_URL) + sync-agent (intervalle / kick) — machine ecole apres MAJ
      Invoke-DockerCompose -Quiet:$Quiet -ComposeArgs @(
        '-f', $ComposeFile, '--env-file', $EnvFile,
        'up', '-d', '--force-recreate', 'backend', 'sync-agent'
      )
    } elseif ($Quiet) {
      Invoke-DockerCompose -Quiet -ComposeArgs @('-f', $ComposeFile, '--env-file', $EnvFile, 'up', '-d')
    } else {
      Invoke-DockerCompose -ComposeArgs @('-f', $ComposeFile, '--env-file', $EnvFile, 'up', '-d')
    }
  } finally {
    Pop-Location
  }
}

# --- main ---
$cloudCfgChanged = $false
if (Test-Path -LiteralPath $EnvFile) {
  $cloudCfgChanged = [bool](Align-BundledCloudConfig)
} else {
  # cree .env.server au besoin meme si bootstrap-done existe (repair)
}

if (Test-Path -LiteralPath $StateFile) {
  Assert-GcsCredentials
  Ensure-EnvFile
  if (Test-DockerReady) {
    Import-BundledImages
    if ($cloudCfgChanged) {
      Write-Step 'Recreate backend + sync-agent (config sync / kick / GCS depuis installateur)'
      Invoke-ComposeUp -Quiet -ForceRecreateApp
    } else {
      # Nouvelles images .tar (meme tags) : recreate pour prendre le code sync LWW / photos GCS
      Write-Step 'Recreate backend + sync-agent (images embarquees)'
      Invoke-ComposeUp -Quiet -ForceRecreateApp
    }
  }
  exit 0
}

if ((Test-Path -LiteralPath $EnvFile) -and (Test-LocalApi)) {
  Ensure-EnvFile
  if (Test-DockerReady) {
    Invoke-ComposeUp -Quiet
  }
  Set-Content -LiteralPath $StateFile -Value (Get-Date).ToString('o') -Encoding UTF8
  exit 0
}

Write-Step 'Configuration machine Server (premier lancement)'
Install-DockerDesktop
Assert-GcsCredentials
Ensure-EnvFile
Import-BundledImages
Start-Stack
Register-ScheduledTask
Set-Content -LiteralPath $StateFile -Value (Get-Date).ToString('o') -Encoding UTF8
Write-Step 'Machine Server prete - API http://127.0.0.1:3000'
