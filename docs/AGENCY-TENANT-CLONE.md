# Duplication SchoolMatrix — modèle agence

Chaque école = **son propre système** (pas un SaaS multi-tenant) : repo GitHub, projet GCP, secrets cloud/sync, branding Electron, souvent hébergement dédié.

**Exception IA (agence) :** une seule `GEMINI_API_KEY` (et `GEMINI_MODEL` / `OPENAI_API_KEY` si utilisés) pour **tous** les clients. On ne demande pas une clé API à chaque école — on recopie la clé agence du prototype Parallele dans chaque fork (Secret Manager, `.env`, `defaults.env` Server).

**Prototype source :** Eureka SchoolMatrix.  
**Feuille de route agent (source de vérité opérationnelle) :**

`.cursor/skills/schoolmatrix-tenant-clone/SKILL.md`

## Copies sur la machine agence

| Emplacement | Rôle |
|-------------|------|
| `Parallele-Schoolmatrix\.cursor\skills\schoolmatrix-tenant-clone\` | Dans le repo modèle (agents projet) |
| `C:\Users\User\.cursor\skills\schoolmatrix-tenant-clone\` | Skills Cursor globaux (agents) |
| `C:\Users\User\Documents\script de developpement\schoolmatrix-tenant-clone\` | Porte de main Documents (toi) |

Toute mise à jour du skill doit être **recopiée aux trois endroits**.

## Checklist rapide

```
- [ ] Infos client (slug, GCP, repo, logo, billing, ownership)
- [ ] Localiser la clé IA agence (GEMINI_API_KEY) — à recopier telle quelle
- [ ] Nouveau dossier sous Documents (source Parallele intacte)
- [ ] Rebrand + logo Electron
- [ ] Débrancher Parallele → brancher client (sauf clé IA)
- [ ] Recopier GEMINI_* (+ OPENAI si besoin) partout sur le fork
- [ ] Bootstrap GCP + secrets GitHub
- [ ] Push + smoke API
- [ ] Ouvrir le NOUVEAU dossier dans Cursor
```

Détail des étapes, mapping technique et anti-patterns : voir le `SKILL.md`.

Environnements à reproduire pour chaque client : [ENVIRONMENTS.md](ENVIRONMENTS.md).
