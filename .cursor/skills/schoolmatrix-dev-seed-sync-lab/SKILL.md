---
name: schoolmatrix-dev-seed-sync-lab
description: >-
  Seeds fictional SchoolMatrix data on the local DEV Docker Postgres and
  installs a two-node sync lab on the laptop (école :3000 + miroir :3001)
  without touching GCP. Use when the user asks for données fictives, seed
  local, tester la sync, miroir cloud local, front local vs front mirror,
  start:lab, or systeme12.
---

# Lab DEV SchoolMatrix (Shekinah)

Même recette que le skill personnel `schoolmatrix-dev-seed-sync-lab`.

**Ce dépôt :**

| | |
|--|--|
| Postgres école | `shekinah-db-dev` **5436** |
| Postgres miroir | `shekinah-db-cloud-dev` **5437** |
| Backend | `shekinah-schoolmatrix-backend` |
| Seed | `scripts/seed-dev-demo.js` — mdp `systeme12` |
| Agent | `apps/sync-agent` → `npm run start:lab` |
| Isolation GCP | projet `shekinah-schoolmatrix` / VM `34.118.138.96` — **ne pas y pousser le seed** |

Suivre le skill user `~/.cursor/skills/schoolmatrix-dev-seed-sync-lab/SKILL.md` pour
les fichiers, pièges Windows, et les 5 terminaux.
