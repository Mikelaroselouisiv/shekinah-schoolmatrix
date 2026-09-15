# Plan d’application — Mobile SchoolMatrix

> Feuille de route **exécutable** : squelette → onglets → branchement backend → parité.  
> Références : [`CARTOGRAPHIE.md`](./CARTOGRAPHIE.md) · [`PLAN-UI-UX.md`](./PLAN-UI-UX.md) · [`../spec/productMap.ts`](../spec/productMap.ts)

**Stack cible :** Expo (React Native) + TypeScript + React Navigation · API cloud Nest (même contrat que desktop Remote).  
**Règle d’or :** un jalon = une chose qui tourne sur appareil/simulateur + appels API réels (pas de mock durable).  
**Marque :** l’app mobile s’appelle **Shekinah** — aucun libellé « Parallele » dans l’UI, `app.json`, splash, stores ou messages utilisateur.

---

## Comment utiliser ce plan

1. Exécuter les étapes **dans l’ordre** (S0 → S1 → …).  
2. Cocher chaque case quand c’est **mergeable** (build OK + écran utilisable).  
3. Ne pas sauter un onglet « complet » pour en commencer un autre : finir le **câblage API** du jalon avant le suivant.  
4. Réutiliser les patterns desktop (`services/api.ts`, ACL `dashboardRoles`) — **ne pas** inventer une 2ᵉ API.

Légende statut (à mettre à jour au fil du chantier) :

- `[ ]` à faire · `[~]` en cours · `[x]` fait

---

## Vue d’ensemble des étapes

| Étape | Nom | Objectif | Dépend |
|-------|-----|----------|--------|
| **S0** | Socle repo | Expo dans `apps/mobile`, scripts racine | — |
| **S1** | Couche API + auth | Client HTTP, JWT, session | S0 |
| **S2** | Navigation squelette | Auth stack + tab bar vide filtrée | S1 |
| **S3** | Design system minimal | Thème école, logo, composants de base | S2 |
| **S4** | Onglet Accueil | Contexte + raccourcis | S3 |
| **S5** | Onglet Plus | Catalogue familles + déconnexion | S3 |
| **S6** | Onglet Élèves + Fiche | Recherche → fiche lecture | S3 |
| **S7** | Onglet Travail (socle) | Routeur persona → écran placeholder branché | S3 |
| **S8** | Onglet Finance (socle) | Visibilité droits + entrée paiements | S3 |
| **S9** | Discipline / Appel | Premier flux terrain écriture | S7 |
| **S10** | Saisie des notes | Flux enseignant | S7 |
| **S11** | Économat paiements | Flux économe | S8 |
| **S12** | Discipline reste | Retards, points, mesures | S9 |
| **S13** | Dépenses | CRUD brouillon / validation | S11 |
| **S14** | Photographie | Upload photos élèves | S6 |
| **S15** | Horaires | Lecture + édition selon droits | S7 |
| **S16** | Stats | Académiques + moniteur finance | S8 |
| **S17** | Inscription + formation | Wizard + décisions | S6 |
| **S18** | Organisation CRUD | Matières… Professeurs | S5 |
| **S19** | Admin | Users + School | S5 |
| **S20** | Finance avancée | Banques + comptabilité | S16 |
| **S21** | Durcissement | Offline léger, push, stores | S11+ |

---

## S0 — Socle repo (squelette technique)

**But :** une app Expo qui démarre dans le monorepo, sans métier encore.

- [x] Initialiser Expo (TypeScript) **dans** `apps/mobile` en préservant `assets/`, `docs/`, `spec/`
- [x] Dépendances : `@react-navigation/native` + bottom-tabs + native-stack
- [x] Secure store : `expo-secure-store` (token JWT)
- [x] HTTP : `axios` (aligné desktop)
- [x] Config env : `EXPO_PUBLIC_API_BASE_URL` / `EXPO_PUBLIC_API_TARGET` (voir `.env.example`)
- [x] Scripts racine `package.json` : `dev:mobile`, `dev:mobile:ios`, `dev:mobile:android`
- [x] `.gitignore` mobile (`.expo`, builds)
- [x] App Expo + logo `assets/logo.png`

**Livrable :** app vide lancée ; logo visible.

---

## S1 — Couche API + authentification

**But :** se connecter au backend comme le desktop Remote.

### Fichiers cibles (indicatif)

```text
apps/mobile/src/
  config/api.ts          # base URL
  services/api.ts        # axios + Bearer + 401 → logout
  services/auth.ts       # login, me
  context/AuthContext.tsx
  lib/permissions.ts     # port de dashboardRoles / permissionKeys
```

### Tâches

- [x] `POST /auth/login` (`login` | `email`, `password`, `remember_me`)
- [x] Persister `access_token` (SecureStore) ; TTL long si souvenir
- [x] `GET /users/me` → user + `role` + `role_permissions`
- [x] Intercepteur 401 → clear session → Login
- [x] Écran **Login** : logo, email/téléphone, mot de passe, souvenir, erreur API
- [x] Guard : non auth → Login ; auth → app
- [x] Port ACL : `canAccessPermission`, `getVisibleTabIds`, aligné `productMap` + `dashboardRoles`

**API :** `/auth/login`, `/users/me`  
**Livrable :** login réel → session persistée → écran « connecté » minimal.

---

## S2 — Navigation squelette (onglets vides)

**But :** structure d’app définitive, contenus stub.

```text
RootNavigator
├── AuthStack (Login)
└── AppTabs (filtrés)
    ├── HomeStack
    ├── WorkStack | ChildrenStack (PARENT)
    ├── StudentsStack
    ├── FinanceStack (si droits)
    └── MoreStack
```

### Tâches

- [x] Tab bar 4–5 items selon rôle (`productMap` + ACL)
- [x] PARENT : tab **Mes enfants** à la place de **Travail**
- [x] FULL / finance : tab **Finance** visible
- [x] Chaque tab → Stack avec écran stub (`Accueil`, `Travail`, …)
- [x] Headers stack par onglet
- [x] Déconnexion accessible depuis Plus

**Livrable :** navigation complète, vide, filtrée par rôle.

---

## S3 — Design system minimal + profil école

**But :** identité visuelle et briques UI réutilisables.

- [x] `GET /school/home` (public branding) + `GET /school/current-context` (auth)
- [x] Thème : couleurs école (`primary` / `secondary`) → tokens RN
- [x] Composants de base : `Screen`, `Button`, `TextField`, `ListRow`, `EmptyState`, `Loading`, `ErrorBanner` (SegmentedControl / SearchBar / Fab / dates → au fil des écrans)
- [ ] Dates FR JJ/MM/AAAA (composant dédié)
- [ ] Format argent `fr-FR`

**Livrable :** Login + stubs utilisentent le thème école.

---

## S4 — Onglet Accueil (complet)

**API :** `/school/current-context`, `/school/dashboard-stats` (si droits), `/users/me/linked-students`

- [x] En-tête : logo école / app, nom, date, année scolaire active
- [x] KPIs admin (classes / élèves / profs) si FULL / `full_access`
- [x] Carte priorité « Fiche élève » si élèves liés
- [x] Grille 3–6 raccourcis filtrés (depuis `getNavItemsForRole` / `productMap`)
- [x] Raccourci « Aujourd’hui » → deep-link tab Travail (Appel / Notes / Paiement)

**Livrable :** Accueil utile, plus de stub.

---

## S5 — Onglet Plus (catalogue)

- [x] Liste des **familles** visibles (`MOBILE_FAMILIES` filtrées)
- [x] Push liste d’écrans de la famille (écrans pas encore faits → placeholder « Bientôt » avec id)
- [x] Section Compte : user, rôle, Déconnexion, version app
- [x] Navigation vers écrans déjà livrés (Accueil ne duplique pas)

**Livrable :** hub Plus = carte du produit ; déconnexion OK.

---

## S6 — Onglet Élèves + Fiche élève (lecture)

### 6.1 Liste / recherche

**API :** `GET /students` (+ filtres), ou linked-students pour PARENT/TEACHER

- [x] SearchBar nom / NISU
- [ ] Filtres classe / salle si permission (liste complète OK ; filtres UI → itération)
- [x] Liste → push Fiche

### 6.2 Fiche (sections `FICHE_ELEVE_SECTIONS`)

| Section | API |
|---------|-----|
| Identité & famille | `GET /students/:id` |
| Discipline | `GET /discipline/student-summary/:id` |
| Paiements | `GET /economat/student-payment-status/:id` |
| Emploi du temps | schedule-slots / exam-schedules / extracurricular (+ filtres élève/classe) |
| Carnet | `GET /grades/student-exam-results` |
| Actions | liens (édition inscription = plus tard S17) |

- [x] PARENT : tab Mes enfants = liste linked → même Fiche
- [x] États vide / erreur / loading par section (lazy / accordéons)

**Livrable :** parcours Parent + staff lecture fiche bout-en-bout.

---

## S7 — Onglet Travail (socle persona)

- [x] Résoudre `WORK_TAB_BY_ROLE[role]` → écran cible
- [x] Si écran pas encore livré → stub clair (« Notes — étape S10 »)
- [x] FULL : grille opérations (Inscription, Appel, Notes, Paiements) → navigate
- [x] Segmented secondaire si défini (sans implémenter tout le métier encore)

**Livrable :** Travail route correctement ; prêts pour S9–S11.

---

## S8 — Onglet Finance (socle)

- [x] Afficher tab seulement si `finance` | `economat` | `stats-financieres` | `comptabilite` | FULL
- [x] Entrées : Paiements (S11), Dépenses (S13), Moniteur (S16)
- [x] Économe : atterrissage = Paiements (même écran que Travail)

**Livrable :** tab Finance câblé, écrans métier à venir.

---

## S9 — Discipline · Appel (écriture terrain #1)

**API :** `GET /classes`, `GET /students?class_id=`, `GET/POST /discipline/attendance`, `POST .../bulk`

- [x] Choisir classe + date
- [x] Liste élèves : Présent / Absent / Retard / Excusé (gros touch)
- [x] CTA sticky **Enregistrer l’appel**
- [x] Feedback succès / erreur
- [x] Brancher depuis Travail (DISCIPLINE) + Accueil + Plus/Vie scolaire

**Livrable :** appel réel enregistré en base.

---

## S10 — Saisie des notes

**API :** `/grades/form-data`, `/grades/save`, `/grades/preschool/*`, `/teachers/me/classes`, périodes, coefficients si besoin

- [x] Sélecteurs : année, classe, matière, période
- [x] TEACHER : seulement classes/matières assignées
- [x] Liste élèves → saisie note ; règles lock desktop (`can_edit`)
- [x] Mode préscolaire si classe préscolaire
- [x] Brancher Travail (TEACHER / pédagogiques)

**Livrable :** notes sauvegardées via API.

---

## S11 — Économat · Paiements

**API :** `/economat/payments`, `transactions`, `fee-services`, `class-fees`, `current-year`, `/finance/bank-accounts`

- [x] Recherche / sélection élève → service → montant → mode → compte → date
- [x] Historique transactions (filtres)
- [x] Brancher Finance + Travail (ECONOME)
- [ ] Services / Exonérations : entrées Plus (FULL) — UI simple ou reporter S17+

**Livrable :** paiement encaissé réel.

---

## S12 — Discipline (reste des onglets)

- [x] Retards — CRUD `/discipline/latenesses`
- [x] Points — `/discipline/deductions`
- [x] Mesures — `/discipline/measures` (+ types enum)
- [x] Segmented control dans Discipline
- [x] Rafraîchir section Discipline de la Fiche (déjà via API summary)

**Livrable :** module Discipline complet.

---

## S13 — Dépenses

**API :** `/finance/expenses`, `/validate`, `/activities`, `/bank-accounts`

- [x] Liste brouillons / validées
- [x] Formulaire nouvelle dépense
- [x] Valider / Supprimer brouillon
- [x] Entrée Finance + Plus/Finance

**Livrable :** dépenses opérationnelles sur mobile.

---

## S14 — Photographie

**API :** `GET /students`, `POST /uploads`, photos student endpoints

- [x] Filtres classe / salle / recherche
- [x] Prendre / choisir image → upload → associer type
- [x] Suppression
- [x] Travail (PHOTOGRAPHER) + Plus

**Livrable :** photos élèves à jour.

---

## S15 — Horaires

**API :** `/schedule-slots`, `/exam-schedules`, `/extracurricular-activities`, classes, teachers, rooms

- [x] Segmented : Cours | Examens | Parascolaire
- [x] Vue liste par jour (pas grille desktop)
- [x] CRUD si permission `schedule` / FULL ; sinon lecture
- [x] Réutiliser données dans Fiche (EDT)

**Livrable :** horaires consultables / éditables selon rôle.

---

## S16 — Statistiques

- [x] Stats académiques — `GET /statistics/academic` (Plus / Pilotage)
- [x] Moniteur finance — `GET /statistics/financial` (Finance + COMPTABLE Travail)
- [x] KPIs + listes scrollables (pas tableaux denses desktop)
- [x] Banques / Comptabilité → stubs vers S20

**Livrable :** pilotage lecture sur mobile.

---

## S17 — Inscription + Formation de classe

### Inscription

- [x] Wizard 4 étapes (Identité → Scolarité → Famille → Photos)
- [x] `POST/PATCH /students`, uploads
- [x] Édition depuis Fiche (FULL)
- [x] Import PDF = **hors scope** (lien / message desktop-only)

### Formation

- [x] Liste assignments, décisions, `compute-decisions`
- [x] Plus / Vie scolaire

**Livrable :** cycle de vie élève (inscription + passage) sur mobile.

---

## S18 — Organisation (CRUD configuration)

Ordre recommandé (dépendances données) :

1. [x] Années et périodes  
2. [x] Matières  
3. [x] Classes (+ matières)  
4. [x] Salles  
5. [x] Professeurs (+ assignations)  

Chaque écran : Liste → détail/form sheet → API CRUD desktop équivalente.  
Entrée : Plus → Organisation.

**Livrable :** structure scolaire administrable sans desktop.

---

## S19 — Administration

- [x] Gestion établissement — `GET/PATCH /school/profile`, signatures
- [x] Gestion utilisateurs — `/users`, `/roles`, linked students, reset password
- [x] Appliquer couleurs profil à chaud dans le thème

**Livrable :** admin école sur mobile.

---

## S20 — Finance avancée

- [x] Banques & comptes — `/finance/banks`, `/bank-accounts`
- [x] Comptabilité — exercices, balance, journal, écritures, autres revenus
- [x] Segmented dans Stats financières
- [x] Densité UI acceptée plus « pro » (utilisateurs COMPTABLE)

**Livrable :** parité finance desktop (hors PDF complexes).

---

## S21 — Durcissement & produit

- [x] Gestion offline lecture (cache contexte + fiches récentes)
- [x] File d’attente mutations (appel / paiement) si réseau coupé
- [x] Push FCM (absences, paiements) — stub archi cible (`pushNotifications.ts`) ; activer après credentials EAS
- [x] Builds EAS iOS / Android (`eas.json`) ; icônes / splash = `assets/logo.png`
- [x] Revue perf listes (virtualisation FlatList élèves / enfants + listes métier)
- [x] Alignement final permissions vs desktop — checklist [`ROLE_CHECKS.md`](ROLE_CHECKS.md)

**Livrable :** app store-ready (hors credentials store / FCM production).

---

## Ordre de branchement backend (résumé)

```text
Auth/me/school
    → Accueil + Plus
        → Élèves/Fiche (read)
            → Appel (write)
            → Notes (write)
            → Paiements (write)
                → Discipline full / Dépenses / Photos / Horaires
                    → Stats
                        → Inscription / Formation
                            → Organisation / Admin
                                → Banques / Comptabilité
                                    → Offline / Push
```

---

## Définition de « onglet complet »

Un onglet est **complet** quand :

1. Visible seulement si ACL OK  
2. États loading / vide / erreur gérés  
3. Données **réelles** API (cloud ou Nest local)  
4. Navigation depuis Accueil **et** Plus (si catalogue)  
5. Pas de régression sur Login / session  
6. Test manuel sur **au moins un rôle** concerné + un rôle sans accès (masqué)

---

## Checklist rôles de validation (régression)

À rejouer après S6, S11, S17, S19 :

| Rôle | Doit pouvoir | Ne doit pas voir |
|------|--------------|------------------|
| PARENT | Mes enfants, Fiche | Finance, Organisation, Admin |
| TEACHER | Notes (ses classes), Fiche liées | Économat admin, Users |
| DISCIPLINE | Appel + discipline | Notes saisie (sauf droits), Comptabilité |
| ECONOME | Paiements, Dépenses, Fiche | Stats acad. (sauf droits), Users |
| COMPTABLE | Moniteur / banques / compta | Inscription (sauf droits) |
| SUPER_ADMIN | Tout | — |

---

## Prochaine action concrète

**Démarrer S0** : initialiser Expo dans `apps/mobile`, brancher le logo, scripts `dev:mobile`, puis enchaîner S1 (Login API).

Quand tu donnes le feu vert « go S0 », l’implémentation suit ce document case par case.
