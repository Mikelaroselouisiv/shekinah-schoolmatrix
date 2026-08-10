# GCP — Shekinah SchoolMatrix

**Isolation :** ce document et ce dépôt concernent **uniquement** `shekinah-schoolmatrix`.  
Ne jamais opérer sur `pos-entrprise-israel`, `pos-freres-basiles`, `eau-cascade`, etc.

## Modèle (source de vérité)

- **Source de vérité = serveur LOCAL** (logiciel Server) : Postgres + API + **sync-agent principal**.
- **Cloud GCP** = miroir / API pour Remote, mobile, WordPress (et petit support offline côté clients).
- **Conflits : last-write-wins** sur `updatedAt` (à égalité, biais local). Voir `docs/SYNC_RULES.md`.
- Un seul agent sync « métier » sur la machine Server (pas deux sources de vérité).

## Ressources cibles

| Ressource | Valeur |
|-----------|--------|
| Project | `shekinah-schoolmatrix` |
| Project number | `972156035703` |
| Compte SDK | config `schoolmatrix-shekinah` / `larosemikelson@gmail.com` |
| Région / zone | `northamerica-northeast1` / `northamerica-northeast1-a` |
| Artifact Registry | `schoolmatrix-backend` |
| Image backend | `northamerica-northeast1-docker.pkg.dev/shekinah-schoolmatrix/schoolmatrix-backend/backend` |
| Bucket GCS | `gs://shekinah-schoolmatrix-assets` |
| VM | `schoolmatrix-api` → IP `34.118.138.96` (API : http://34.118.138.96) |
| Billing | `01D27D-8BA5C8-721AC7` (Troisième Compte de facturation) |
| SA CI | `github-actions@shekinah-schoolmatrix.iam.gserviceaccount.com` |
| SA VM | `schoolmatrix-vm@shekinah-schoolmatrix.iam.gserviceaccount.com` |
| WIF | `projects/972156035703/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| GitHub repo | `Mikelaroselouisiv/shekinah-schoolmatrix` |

## Garde-fous

```powershell
gcloud config configurations activate schoolmatrix-shekinah
gcloud config set account larosemikelson@gmail.com
gcloud config set project shekinah-schoolmatrix
powershell -ExecutionPolicy Bypass -File infra/scripts/assert-schoolmatrix-gcp.ps1
powershell -ExecutionPolicy Bypass -File infra/scripts/gcp-bootstrap-schoolmatrix.ps1
```

## Billing

Lié à `01D27D-8BA5C8-721AC7` (Troisième Compte de facturation).

## GitHub secrets / vars

À coller dans le repo `Mikelaroselouisiv/shekinah-schoolmatrix` → Settings → Secrets and variables → Actions.

**Secrets**

| Secret | Valeur |
|--------|--------|
| `GCP_PROJECT_ID` | `shekinah-schoolmatrix` |
| `GCP_SERVICE_ACCOUNT` | `github-actions@shekinah-schoolmatrix.iam.gserviceaccount.com` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/1093524002924/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |

**Variables**

| Variable | Valeur |
|----------|--------|
| `GCP_REGION` | `northamerica-northeast1` |
| `GCP_ARTIFACT_REPO` | `schoolmatrix-backend` |
| `GCP_VM_NAME` | `schoolmatrix-api` |
| `GCP_VM_ZONE` | `northamerica-northeast1-a` |

Copie locale : `secrets/gcp-schoolmatrix-bootstrap.txt` (gitignoré).
