---
name: post-change-release
description: >-
  Post-modification release for Shekinah SchoolMatrix: bump desktop semver,
  run ship-all.ps1 (git push, backend GCP, Remote/Server GCS installers so
  installed apps get update notifications). Use when the user finished changes
  and asks to ship, publier, push, release, déployer, GCS, GCP, or mettre à jour partout.
---

# Post-change release — SchoolMatrix

Ne lance ce workflow **que sur demande explicite** (ex. « ship », « publie », « fais les pushs », « mets à jour partout »).

## Checklist

```
Post-change SchoolMatrix:
- [ ] 1. Diff + périmètre (cloud vs Server école vs UI)
- [ ] 2. ship-all.ps1 (attend CI backend AR avant build Server)
- [ ] 3. Rapport (version, URLs feeds, digest backend embarqué si Server)
```

## Modèle mental (CRITIQUE)

| Cible | Mis à jour par |
|-------|----------------|
| Apps **Remote** (API cloud) | CI backend → VM GCP `34.118.138.96` |
| Apps **Server** (école) | Installateur NSIS qui embarque `server-stack/images/*.tar` → GCS → MAJ auto → `bootstrap.ps1` sur **le Docker de l’école** |
| Docker sur le **poste de dev** | Ignoré pour la prod école |

**Ne jamais** considérer que déployer la VM GCP ou toucher Docker sur la machine de développement met à jour un Server école.  
Voir règle `.cursor/rules/server-stack-vs-cloud.mdc`.

## Commande préférée

```powershell
powershell -ExecutionPolicy Bypass -File infra/scripts/ship-all.ps1 -Bump patch -Commit
```

Par défaut, si Desktop inclut **server** : déclenche le backend GCP, **attend le succès CI** (image AR), puis `prepare-server-stack` + build + upload GCS.

| Besoin | Flags |
|--------|--------|
| Fix / UI + stacks | `-Bump patch -Commit` |
| Feature | `-Bump minor -Commit` |
| Backend cloud **seul** (Remote only ; écoles inchangées) | `-Bump none -Desktop none -Commit -Message "…"` |
| Backend + écoles | `-Bump patch -Commit` (Desktop both/server — attend AR) |
| CI build desktop | `-Bump patch -Commit -UseCI` |
| Simulation | `-DryRun` |
| Skip attente CI (déconseillé) | `-SkipWaitBackend` |

Détails : [docs/RELEASE.md](../../../docs/RELEASE.md), [docs/DESKTOP.md](../../../docs/DESKTOP.md).

## Périmètre

| Chemins | Effet via ship / CI |
|---------|---------------------|
| `shekinah-schoolmatrix-backend/**`, `infra/docker/**` | Image AR + deploy VM GCP (**Remote**). Pour les **écoles** : aussi rebuild installateur Server après AR. |
| `apps/desktop/**` | Bump + installers GCS → notif MAJ |
| `apps/sync-agent/**` | Doit être re-bundlé dans Server (`prepare-server-stack`) |
| `docs/**`, `.github/**` | Push GitHub |

Remote Git : **`origin`** → `https://github.com/Mikelaroselouisiv/shekinah-schoolmatrix.git`  
GCP : projet **`shekinah-schoolmatrix`** uniquement (`assert-schoolmatrix-gcp.ps1`).

## Anti-patterns

- Pousser vers un projet Israel / Frères / Eau Cascade
- Committer `secrets/`, `*.pem`, `.env`, `release/*.exe`
- Builder sans bump si on publie un nouvel installateur (les clients ne verraient pas de MAJ)
- Builder Server **avant** que `backend:latest` soit poussé sur Artifact Registry
- Confondre Docker local (dev) / VM GCP / stack embarqué Server école
