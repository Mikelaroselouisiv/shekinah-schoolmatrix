# Cartographie produit — SchoolMatrix (desktop + backend → mobile)

> Source de vérité pour le port React Native / Expo.  
> Dérivée de `apps/desktop/src/renderer` et `shekinah-schoolmatrix-backend`.
> Schéma machine-lisible : [`../spec/productMap.ts`](../spec/productMap.ts).  
> Plan UI/UX mobile : [`PLAN-UI-UX.md`](./PLAN-UI-UX.md).

---

## 1. Positionnement dans l’écosystème

```text
[ Server école ] Postgres + Nest + sync-agent  ──sync──►  [ Cloud GCP ]
                                                              │
                                              ┌───────────────┼───────────────┐
                                              ▼               ▼               ▼
                                         Remote Electron   Mobile Expo    WordPress
```

| Client | Cible API |
|--------|-----------|
| Desktop Server | `http://127.0.0.1:3000` |
| Desktop Remote | API cloud GCP |
| **Mobile (cette app)** | **API cloud** (+ offline plus tard) |

**Important :** Server vs Remote ne change **pas** les écrans desktop — seulement l’URL API. Le mobile reprend la même surface métier, filtrée par **rôle / permissions**.

---

## 2. Shell desktop (référence)

| Élément | Implémentation |
|---------|----------------|
| Router | `HashRouter` → `/#/login`, `/#/dashboard/...` |
| Shell | Header (logo école, MAJ, user, Déconnexion) + **nav horizontale** (pas de sidebar) + breadcrumb + `<Outlet />` |
| Auth | JWT `localStorage` · `POST /auth/login` · `GET /users/me` |
| ACL | `lib/dashboardRoles.ts` (+ `role_permissions` API si présent) |
| Édition | `server` \| `remote` — UI identique |

Fichiers clés : `App.tsx`, `layout/AppLayout.tsx`, `lib/dashboardRoles.ts`, `lib/permissionKeys.ts`.

---

## 3. Arborescence complète des écrans desktop

### 3.1 Auth

| Route | Page | Rôle |
|-------|------|------|
| `/login` | Connexion (email **ou** téléphone + mot de passe, souvenir) | Public |
| `/signup` | Création 1er SUPER_ADMIN (`/setup/*`) | Uniquement si setup ouvert |

### 3.2 Accueil

| Route | Label | Permission | Contenu |
|-------|-------|------------|---------|
| `/dashboard` | Tableau de bord | tous | Bienvenue, date/heure/année, KPIs (admin), raccourcis filtrés, priorité **Fiche élève** si élèves liés |

### 3.3 Bloc Configuration

| Route | Label | Permission | Contenu / sous-onglets |
|-------|-------|------------|------------------------|
| `/dashboard/subjects` | Matières | `subjects` | CRUD Nom, Code |
| `/dashboard/classes` | Classes | `classes` | CRUD + matières multi + badges PDF |
| `/dashboard/rooms` | Salles | `rooms` | CRUD (classe, limite) + filtre + badges PDF |
| `/dashboard/academic-years` | Années et périodes | `academic-years` | Panneau Années + panneau Périodes de l’année |
| `/dashboard/teachers` | Professeurs | `teachers` | Liste, promotion user→TEACHER, assignations matières/classes/salle+matière |
| `/dashboard/schedule` | Horaires | `schedule` | **3 onglets :** Horaire des cours · Horaire des examens · Activités parascolaires |

### 3.4 Bloc Management (vie étudiante)

| Route | Label | Permission | Contenu / sous-onglets |
|-------|-------|------------|------------------------|
| `/dashboard/students` | Inscription | `students` | Formulaire riche (NISU, identité, parents, photos) + filtres |
| `/dashboard/students/import` | Inscription d'anciens élèves | `students` | Upload PDF → preview → import |
| `/dashboard/grades` | Saisie des notes | `grades` | Sélection année/classe/matière/période · mode standard ou préscolaire · seuils · coefficients · PDF |
| `/dashboard/discipline` | Discipline | `discipline` | **4 onglets :** Appel · Retards · Points disciplinaires · Mesures |
| `/dashboard/formation-classe` | Formation de classe | `formation-classe` | Décisions (Admis, Redoubler…) · calcul auto · PDF |

### 3.5 Bloc Finance opérationnelle

| Route | Label | Permission | Contenu / sous-onglets |
|-------|-------|------------|------------------------|
| `/dashboard/economat` | Économat | `finance` / `economat` | **3 onglets :** Enregistrement des paiements · Services à payer par classe (FULL) · Exonérations (FULL) |
| `/dashboard/depenses` | Dépenses | `finance` / `economat` | Brouillon → Valider / Supprimer |

### 3.6 Bloc Statistiques

| Route | Label | Permission | Contenu / sous-onglets |
|-------|-------|------------|------------------------|
| `/dashboard/stats-academiques` | Stats académiques | `stats-academiques` | KPIs moyennes/réussite, discipline, tableaux classes/matières/profs |
| `/dashboard/stats-financieres` | Stats financières | `stats-financieres` | **3 onglets URL :** Moniteur · Banques · Comptabilité |

**Comptabilité (embedded)** : Balance | Journal + plan comptable + exercices.

Redirects legacy : `moniteur-finance`, `comptabilite`, `banques` → `stats-financieres?tab=…`.

### 3.7 Bloc Fiche

| Route | Label | Permission | Contenu |
|-------|-------|------------|---------|
| `/dashboard/fiche-eleve` | Fiche élève | `fiche-eleve` | Identité, parents, discipline, paiements, emploi du temps (3 sous-tabs), carnet de notes, exports PDF / badge |
| `/dashboard/photography` | Photographie | `photography` | Upload/suppression photos (profil, identité, souvenir, promotion, autre) |

### 3.8 Bloc Special (admin)

| Route | Label | Permission | Contenu |
|-------|-------|------------|---------|
| `/dashboard/users` | Gestion Utilisateurs | `users` | CRUD users, rôles+permissions, lier élèves, reset MDP |
| `/dashboard/school` | Gestion établissement | `school` | Profil école (couleurs, logo), signatures |

---

## 4. Matrice rôles (fallback sans `role_permissions`)

| Rôle | Accès typique |
|------|----------------|
| `SUPER_ADMIN`, `DIRECTEUR_GENERAL`, `SCHOOL_ADMIN` | Tout |
| `DIRECTEUR_PEDAGOGIQUE`, `CENSEUR` | Horaires, Notes, Stats acad., Fiche |
| `ADMIN_PRESCOLAIRE` / `FONDAMENTAL` / `SECONDAIRE` | Horaires, Fiche |
| `TEACHER` | Notes (classes assignées), Fiche (liés) |
| `ECONOME` | Économat (paiements), Dépenses, Fiche |
| `COMPTABLE` | Stats financières (3 onglets) |
| `DISCIPLINE` | Discipline |
| `PHOTOGRAPHER` | Photographie |
| `PARENT` | Accueil + Fiche (élèves liés) — moniteur |

Si `role_permissions` non vide → ACL par clés (`full_access`, `subjects`, `grades`, …) prioritaire.

---

## 5. Domaines backend (NestJS)

Pas de préfixe `/api` global. Auth : `Authorization: Bearer <JWT>` (sauf login / setup / home public / sync).

| Domaine | Préfixes HTTP | Écrans desktop |
|---------|---------------|----------------|
| Auth / setup | `/auth`, `/setup` | Login, Signup |
| School | `/school/*` | Shell, Home, School |
| Users / roles | `/users`, `/roles`, `/student-parents` | Users, Fiche, Parent |
| Structure | `/subjects`, `/classes`, `/rooms`, `/academic-years`, `/periods` | Configuration |
| Teachers / EDT | `/teachers`, `/schedule-slots` | Professeurs, Horaires |
| Students | `/students`, `/students/:id/photos` | Inscription, Photo, Fiche |
| Grades | `/grades/*` | Notes, Fiche |
| Formation | `/formation-classe/*` | Formation, seuils notes |
| Discipline | `/discipline/*` | Discipline, Fiche, Stats |
| Economat | `/economat/*` | Économat, Fiche |
| Finance | `/finance/*` | Dépenses, Banques, Comptabilité |
| Planning | `/exam-schedules`, `/extracurricular-activities` | Horaires, Fiche |
| Stats | `/statistics/academic`, `/statistics/financial` | Stats |
| Uploads | `/uploads` | Images |
| Sync | `/sync/*` + `X-Sync-Key` | **Hors mobile** |

### Enums UI utiles

| Domaine | Valeurs |
|---------|---------|
| Appel | `PRESENT`, `ABSENT` (+ UI retard / excusé côté client) |
| Mesures | `SOUS_SURVEILLANCE`, `EN_RETENUE`, `RENVOYE_TEMPORAIREMENT`, `RENVOYE_DEFINITIVEMENT` |
| Formation | `ADMIS`, `ADMIS_AILLEURS`, `REDOUBLER`, `AJOURNE`, `RENVOYE_DEFINITIVEMENT`, … |
| Frais | `OBLIGATOIRE`, `PARASCOLAIRE` · exonération `FULL` / `HALF` |
| Dépense | `BROUILLON`, `VALIDEE` |
| Exercice | `OUVERT`, `CLOTURE` |

---

## 6. Patterns UI desktop à adapter (pas à copier)

| Desktop | Contrainte mobile |
|---------|-------------------|
| Nav horizontale dense (15+ items) | Impossible → familles + tab bar + hub |
| Tables larges CRUD | Listes + fiche détail + sheet formulaire |
| Formulaires inline page | Écrans dédiés / modales bottom sheet |
| PDF preview / badges | Share sheet / WebView / génération différée |
| Crop carré images | Camera + crop natif |
| Electron updater | Store / OTA Expo |

---

## 7. Inventaire pages (checklist port)

- [ ] Login
- [ ] Accueil
- [ ] Matières
- [ ] Classes
- [ ] Salles
- [ ] Années et périodes
- [ ] Professeurs
- [ ] Horaires (cours / examens / parascolaire)
- [ ] Inscription (+ import PDF — priorité basse mobile)
- [ ] Saisie des notes (+ préscolaire)
- [ ] Discipline (appel / retards / points / mesures)
- [ ] Formation de classe
- [ ] Économat (paiements / services / exonérations)
- [ ] Dépenses
- [ ] Stats académiques
- [ ] Stats financières (moniteur / banques / comptabilité)
- [ ] Fiche élève
- [ ] Photographie
- [ ] Gestion utilisateurs
- [ ] Gestion établissement

**Priorité terrain (voir plan UX) :** Login → Accueil → Fiche élève → Appel → Notes → Paiements → Photo → admin/config.
