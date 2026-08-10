#Requires -Version 5.1
<#
.SYNOPSIS
  Provisionne l'infra GCP pour Shekinah SchoolMatrix uniquement.
  N'utilise JAMAIS les projets POS (Israel, Freres, Eau Cascade, etc.).

.NOTES
  Architecture cible (rappel) :
  - Source de verite = serveur LOCAL (machine Server + sync-agent principal).
  - Cloud GCP = miroir / API pour Remote, mobile, WordPress.
  - Sync : last-write-wins (updatedAt) ; voir docs/SYNC_RULES.md.
#>
param(
  [string] $ProjectId = 'shekinah-schoolmatrix',
  [string] $Region = 'northamerica-northeast1',
  [string] $Zone = 'northamerica-northeast1-a',
  [string] $ArtifactRepo = 'schoolmatrix-backend',
  [string] $Bucket = 'shekinah-schoolmatrix-assets',
  [string] $VmName = 'schoolmatrix-api',
  [string] $MachineType = 'e2-medium',
  [string] $CiSaName = 'github-actions',
  [string] $VmSaName = 'schoolmatrix-vm',
  [string] $GitHubOwner = 'Mikelaroselouisiv',
  [string] $GitHubRepo = 'shekinah-schoolmatrix',
  [switch] $SkipVm,
  [switch] $SkipWif
)

$ErrorActionPreference = 'Continue'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $ScriptDir 'assert-schoolmatrix-gcp.ps1')
if (-not $?) { throw 'assert-schoolmatrix-gcp.ps1 a echoue' }

$active = (& gcloud config get-value project 2>$null | Out-String).Trim()
if ($active -ne $ProjectId) {
  throw "ABORT: projet actif=$active (attendu $ProjectId)"
}

$billingEnabled = (& gcloud billing projects describe $ProjectId --format='value(billingEnabled)' 2>$null | Out-String).Trim()
if ($billingEnabled -ne 'True') {
  throw @"
ABORT: billing non active sur $ProjectId.
Liez un compte de facturation (quota libre) puis relancez :
  gcloud billing projects link $ProjectId --billing-account=XXXXXX-XXXXXX-XXXXXX
  powershell -ExecutionPolicy Bypass -File infra/scripts/gcp-bootstrap-schoolmatrix.ps1
"@
}

function Assert-NotOtherTenant([string] $Value) {
  $l = $Value.ToLowerInvariant()
  if ($l -match 'freres|bazile|israel|eau-cascade|pos-entrprise') {
    throw "ABORT: valeur interdite (autre tenant): $Value"
  }
}

Assert-NotOtherTenant $ProjectId
Assert-NotOtherTenant $Bucket

Write-Host "==> Enable APIs ($ProjectId)" -ForegroundColor Cyan
$apis = @(
  'compute.googleapis.com',
  'artifactregistry.googleapis.com',
  'storage.googleapis.com',
  'iam.googleapis.com',
  'iamcredentials.googleapis.com',
  'cloudresourcemanager.googleapis.com',
  'serviceusage.googleapis.com',
  'logging.googleapis.com',
  'monitoring.googleapis.com',
  'secretmanager.googleapis.com',
  'iap.googleapis.com'
)
# Un par un : l'appel groupé échoue parfois juste après création du projet
foreach ($api in $apis) {
  gcloud services enable $api --project=$ProjectId 2>$null | Out-Null
}

gcloud config set compute/region $Region --quiet | Out-Null
gcloud config set compute/zone $Zone --quiet | Out-Null

Write-Host "==> Artifact Registry ($ArtifactRepo)" -ForegroundColor Cyan
$repoExists = gcloud artifacts repositories describe $ArtifactRepo --location=$Region --project=$ProjectId 2>$null
if (-not $repoExists) {
  gcloud artifacts repositories create $ArtifactRepo `
    --repository-format=docker `
    --location=$Region `
    --description='Shekinah SchoolMatrix backend images' `
    --project=$ProjectId
} else {
  Write-Host 'Artifact Registry already exists'
}

Write-Host "==> GCS bucket ($Bucket)" -ForegroundColor Cyan
$bucketUri = "gs://$Bucket"
$bucketOk = gsutil ls -b $bucketUri 2>$null
if (-not $bucketOk) {
  gsutil mb -p $ProjectId -l $Region $bucketUri
  gsutil uniformbucketlevelaccess set on $bucketUri
} else {
  Write-Host 'Bucket already exists'
}
# Public read for desktop auto-update installers
gsutil iam ch allUsers:objectViewer $bucketUri 2>$null
@('installers/remote/', 'installers/server/', 'sync-assets/') | ForEach-Object {
  $marker = Join-Path $env:TEMP "schoolmatrix-keep-$([guid]::NewGuid().ToString('n')).txt"
  Set-Content -LiteralPath $marker -Value 'keep' -Encoding ascii
  gsutil cp $marker "$bucketUri/$_.keep" 2>$null
  Remove-Item $marker -Force -ErrorAction SilentlyContinue
}

Write-Host "==> Service accounts" -ForegroundColor Cyan
function Ensure-Sa([string] $Name, [string] $Display) {
  $email = "$Name@$ProjectId.iam.gserviceaccount.com"
  $exists = gcloud iam service-accounts describe $email --project=$ProjectId 2>$null
  if (-not $exists) {
    gcloud iam service-accounts create $Name --display-name=$Display --project=$ProjectId
  }
  return $email
}

$ciSa = Ensure-Sa $CiSaName 'GitHub Actions SchoolMatrix'
$vmSa = Ensure-Sa $VmSaName 'Compute VM SchoolMatrix'
$desktopSa = Ensure-Sa 'schoolmatrix-desktop' 'SchoolMatrix Desktop Server (GCS)'

$ciRoles = @(
  'roles/artifactregistry.writer',
  'roles/storage.admin',
  'roles/compute.instanceAdmin.v1',
  'roles/iam.serviceAccountUser',
  'roles/iam.serviceAccountKeyAdmin',
  'roles/iap.tunnelResourceAccessor',
  'roles/logging.logWriter',
  'roles/secretmanager.admin'
)
foreach ($role in $ciRoles) {
  gcloud projects add-iam-policy-binding $ProjectId `
    --member="serviceAccount:$ciSa" `
    --role=$role `
    --condition=None `
    --quiet | Out-Null
}

$vmRoles = @(
  'roles/artifactregistry.reader',
  'roles/storage.objectAdmin',
  'roles/logging.logWriter',
  'roles/monitoring.metricWriter'
)
foreach ($role in $vmRoles) {
  gcloud projects add-iam-policy-binding $ProjectId `
    --member="serviceAccount:$vmSa" `
    --role=$role `
    --condition=None `
    --quiet | Out-Null
}

Write-Host "==> Desktop Server SA bucket IAM" -ForegroundColor Cyan
gsutil iam ch "serviceAccount:${desktopSa}:roles/storage.objectAdmin" $bucketUri 2>$null

$projectNumber = (& gcloud projects describe $ProjectId --format='value(projectNumber)' | Out-String).Trim()
$wifProviderResource = ''

if (-not $SkipWif) {
  Write-Host "==> Workload Identity Federation (GitHub Actions)" -ForegroundColor Cyan
  $poolId = 'github-pool'
  $providerId = 'github-provider'
  $poolExists = gcloud iam workload-identity-pools describe $poolId --location=global --project=$ProjectId 2>$null
  if (-not $poolExists) {
    gcloud iam workload-identity-pools create $poolId `
      --project=$ProjectId `
      --location=global `
      --display-name='GitHub Actions Pool'
  } else {
    Write-Host 'WIF pool already exists'
  }

  $providerExists = gcloud iam workload-identity-pools providers describe $providerId `
    --workload-identity-pool=$poolId `
    --location=global `
    --project=$ProjectId 2>$null
  if (-not $providerExists) {
    gcloud iam workload-identity-pools providers create-oidc $providerId `
      --project=$ProjectId `
      --location=global `
      --workload-identity-pool=$poolId `
      --display-name='GitHub OIDC' `
      --issuer-uri='https://token.actions.githubusercontent.com' `
      --attribute-mapping='google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner' `
      --attribute-condition="assertion.repository_owner=='$GitHubOwner'"
  } else {
    Write-Host 'WIF provider already exists'
  }

  $member = "principalSet://iam.googleapis.com/projects/$projectNumber/locations/global/workloadIdentityPools/$poolId/attribute.repository/$GitHubOwner/$GitHubRepo"
  gcloud iam service-accounts add-iam-policy-binding $ciSa `
    --project=$ProjectId `
    --role='roles/iam.workloadIdentityUser' `
    --member=$member `
    --quiet | Out-Null

  $wifProviderResource = "projects/$projectNumber/locations/global/workloadIdentityPools/$poolId/providers/$providerId"
}

if (-not $SkipVm) {
  Write-Host "==> VM $VmName ($Zone)" -ForegroundColor Cyan
  $vmExists = gcloud compute instances describe $VmName --zone=$Zone --project=$ProjectId 2>$null
  $startup = Join-Path $ScriptDir 'gcp-vm-startup.sh'
  if (-not $vmExists) {
    gcloud compute instances create $VmName `
      --project=$ProjectId `
      --zone=$Zone `
      --machine-type=$MachineType `
      --subnet=default `
      --tags='http-server,https-server' `
      --image-family=ubuntu-2204-lts `
      --image-project=ubuntu-os-cloud `
      --boot-disk-size=50GB `
      --boot-disk-type=pd-balanced `
      --service-account=$vmSa `
      --scopes=cloud-platform `
      --metadata-from-file="startup-script=$startup"
  } else {
    Write-Host 'VM already exists'
  }

  $fw = gcloud compute firewall-rules describe allow-schoolmatrix-http --project=$ProjectId 2>$null
  if (-not $fw) {
    gcloud compute firewall-rules create allow-schoolmatrix-http `
      --project=$ProjectId `
      --allow=tcp:80 `
      --target-tags=http-server `
      --description='SchoolMatrix public HTTP'
  }
}

$ip = ''
try {
  $ip = (& gcloud compute instances describe $VmName --zone=$Zone --project=$ProjectId `
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)' | Out-String).Trim()
} catch {}

$secretsDir = Join-Path $ScriptDir '..\..\secrets'
New-Item -ItemType Directory -Force -Path $secretsDir | Out-Null
$outPath = Join-Path $secretsDir 'gcp-schoolmatrix-bootstrap.txt'
@(
  "PROJECT_ID=$ProjectId"
  "PROJECT_NUMBER=$projectNumber"
  "REGION=$Region"
  "ZONE=$Zone"
  "ARTIFACT=northamerica-northeast1-docker.pkg.dev/$ProjectId/$ArtifactRepo/backend"
  "BUCKET=gs://$Bucket"
  "VM=$VmName"
  "VM_IP=$ip"
  "CI_SA=$ciSa"
  "VM_SA=$vmSa"
  "GCP_WORKLOAD_IDENTITY_PROVIDER=$wifProviderResource"
  "GITHUB_REPO=$GitHubOwner/$GitHubRepo"
) | Set-Content -LiteralPath $outPath -Encoding utf8

Write-Host ''
Write-Host '======== BOOTSTRAP SCHOOLMATRIX OK ========' -ForegroundColor Green
Write-Host "PROJECT_ID=$ProjectId"
Write-Host "REGION=$Region"
Write-Host "ZONE=$Zone"
Write-Host "ARTIFACT=northamerica-northeast1-docker.pkg.dev/$ProjectId/$ArtifactRepo/backend"
Write-Host "BUCKET=gs://$Bucket"
Write-Host "VM=$VmName"
Write-Host "VM_IP=$ip"
Write-Host "CI_SA=$ciSa"
Write-Host "WIF=$wifProviderResource"
Write-Host "LOCAL_FILE=$outPath"
Write-Host ''
Write-Host 'GitHub secrets a poser:'
Write-Host "  secrets.GCP_PROJECT_ID                 = $ProjectId"
Write-Host "  secrets.GCP_SERVICE_ACCOUNT            = $ciSa"
Write-Host "  secrets.GCP_WORKLOAD_IDENTITY_PROVIDER = $wifProviderResource"
Write-Host 'GitHub variables a poser:'
Write-Host "  vars.GCP_REGION        = $Region"
Write-Host "  vars.GCP_ARTIFACT_REPO = $ArtifactRepo"
Write-Host "  vars.GCP_VM_NAME       = $VmName"
Write-Host "  vars.GCP_VM_ZONE       = $Zone"
if ($ip) {
  Write-Host "API publique (pending deploy): http://$ip"
}
