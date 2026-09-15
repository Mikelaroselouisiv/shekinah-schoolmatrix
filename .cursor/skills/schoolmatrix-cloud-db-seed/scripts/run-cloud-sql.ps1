#Requires -Version 5.1
<#
.SYNOPSIS
  Exécute un fichier SQL sur le Postgres cloud SchoolMatrix du dépôt courant
  (VM GCP via IAP + docker exec psql). Lit docs/GCP-SCHOOLMATRIX.md.
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $SqlFile,
  [string] $RepoRoot = '',
  [string] $Container = 'shekinah_postgres_cloud',
  [string] $DbUser = 'schoolmatrix',
  [string] $DbName = 'schoolmatrix'
)

$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
  $RepoRoot = (Get-Location).Path
}

$sqlPath = $SqlFile
if (-not [System.IO.Path]::IsPathRooted($sqlPath)) {
  $sqlPath = Join-Path $RepoRoot $SqlFile
}
if (-not (Test-Path -LiteralPath $sqlPath)) {
  throw "Fichier SQL introuvable: $sqlPath"
}

$docPath = Join-Path $RepoRoot 'docs\GCP-SCHOOLMATRIX.md'
if (-not (Test-Path -LiteralPath $docPath)) {
  throw "docs/GCP-SCHOOLMATRIX.md introuvable dans $RepoRoot — ouvre le bon fork école."
}

$doc = Get-Content -LiteralPath $docPath -Raw -Encoding UTF8

function Get-MdCell([string] $label, [string] $text) {
  $pattern = '\|\s*' + [regex]::Escape($label) + '\s*\|\s*`([^`]+)`'
  $m = [regex]::Match($text, $pattern)
  if (-not $m.Success) { return $null }
  return $m.Groups[1].Value.Trim()
}

$projectId = Get-MdCell 'Project' $doc
$vmCell = Get-MdCell 'VM' $doc
$zone = $null
$zm = [regex]::Match($doc, '\|\s*R[ée]gion\s*/\s*zone\s*\|\s*`[^`]+`\s*/\s*`([^`]+)`')
if ($zm.Success) { $zone = $zm.Groups[1].Value.Trim() }

if (-not $projectId) { throw "Impossible de lire Project dans $docPath" }
if (-not $vmCell) { throw "Impossible de lire VM dans $docPath" }
if (-not $zone) { throw "Impossible de lire la zone dans $docPath" }

$vmName = ($vmCell -split '\s')[0].Trim()

$forbidden = @('freres', 'bazile', 'israel', 'eau-cascade', 'pos-entrprise')
$lower = $projectId.ToLowerInvariant()
foreach ($bad in $forbidden) {
  if ($lower -like "*$bad*") {
    throw "ABORT: project ID '$projectId' n'est pas un projet SchoolMatrix."
  }
}

$gcloud = 'C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd'
if (-not (Test-Path -LiteralPath $gcloud)) {
  $cmd = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
  if ($cmd) { $gcloud = $cmd.Source }
  else { throw 'gcloud.cmd introuvable' }
}

Write-Host "SchoolMatrix cloud SQL"
Write-Host "  repo    : $RepoRoot"
Write-Host "  project : $projectId"
Write-Host "  vm      : $vmName"
Write-Host "  zone    : $zone"
Write-Host "  sql     : $sqlPath"

$ssh = @(
  "--zone=$zone",
  "--project=$projectId",
  '--tunnel-through-iap'
)

$remote = '/tmp/schoolmatrix-agent.sql'

& $gcloud compute scp $sqlPath "${vmName}:${remote}" @ssh
if ($LASTEXITCODE -ne 0) { throw "gcloud scp failed: $LASTEXITCODE" }

$remoteCmd = "sudo cat $remote | sudo docker exec -i $Container psql -U $DbUser -d $DbName; sudo rm -f $remote"
& $gcloud compute ssh $vmName @ssh --command=$remoteCmd
if ($LASTEXITCODE -ne 0) { throw "gcloud ssh / psql failed: $LASTEXITCODE" }
