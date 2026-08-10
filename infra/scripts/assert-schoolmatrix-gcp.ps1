#Requires -Version 5.1
<#
.SYNOPSIS
  Refuse toute ops GCP si le projet actif n'est pas Shekinah SchoolMatrix.
#>
$ErrorActionPreference = 'Continue'

$ExpectedProject = 'shekinah-schoolmatrix'
$ForbiddenSubstrings = @(
  'freres', 'bazile', 'baziles', 'pos-freres',
  'israel', 'entrprise-israel', 'eau-cascade', 'pos-entrprise',
  'parallele-schoolmatrix'
)

function Get-GcloudValue([string] $Key) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  $raw = & gcloud config get-value $Key 2>$null
  $ErrorActionPreference = $prev
  if (-not $raw) { return '' }
  return ([string]$raw).Trim()
}

$project = Get-GcloudValue 'project'
$account = Get-GcloudValue 'account'

if (-not $project) {
  throw 'Aucun projet gcloud actif. Activez schoolmatrix-shekinah puis : gcloud config set project shekinah-schoolmatrix'
}

$lower = $project.ToLowerInvariant()
foreach ($bad in $ForbiddenSubstrings) {
  if ($lower -like "*$bad*") {
    throw "ABORT: projet interdit '$project'. Restez sur $ExpectedProject."
  }
}

if ($project -ne $ExpectedProject) {
  throw "ABORT: projet actif='$project' attendu='$ExpectedProject'. gcloud config configurations activate schoolmatrix-shekinah"
}

Write-Host "OK GCP SchoolMatrix: project=$project account=$account" -ForegroundColor Green
