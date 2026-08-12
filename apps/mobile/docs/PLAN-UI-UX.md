# Plan UI / UX — Application mobile SchoolMatrix

> Objectif : disposer **toutes** les options du desktop de façon **ergonomique** et **esthétique** sur Android & iOS.  
> Cartographie source : [`CARTOGRAPHIE.md`](./CARTOGRAPHIE.md).  
> Navigation machine-lisible : [`../spec/productMap.ts`](../spec/productMap.ts).  
> Exécution chantier : [`PLAN-APPLICATION.md`](./PLAN-APPLICATION.md) (S0→S21).

---

## 1. Diagnostic desktop → mobile

Le desktop expose ~18 entrées de menu en **barre horizontale** + sous-onglets internes. Sur téléphone :

- trop d’items → surcharge cognitive ;
- tables larges → illisibles ;
- rôles très différents (Parent vs Économe vs DG) → **une seule IA fixe est un échec**.

**Décision structurante :** navigation **adaptative par persona**, organisée en **familles métier**, avec un hub « Plus » pour le reste.

---

## 2. Principes d’ergonomie

1. **Une action principale par écran** (ex. Appel = cocher présents ; pas un CRUD complet en premier plan).
2. **L’élève au centre** — la *Fiche élève* est le hub transversal (notes, discipline, paiements, EDT).
3. **5 destinations max** en tab bar (règle pouce).
4. **Familles, pas flat list** — regrouper Configuration / Vie scolaire / Finance / Pilotage / Admin.
5. **Raccourcis contextuels** sur l’accueil selon le rôle (ce que je fais aujourd’hui).
6. **Progressive disclosure** — config école, comptabilité, import PDF = profondeur, pas tab bar.
7. **Même API / mêmes permissions** que le desktop ; seul le *chemin* change.
8. **Identité visuelle** — logo `assets/logo.png`, couleurs école (`/school/profile`) ; pas de chrome desktop copié.
9. **Marque mobile** — nom produit = **Shekinah** uniquement. Ne jamais afficher ni utiliser Eureka / Parallele dans l’UI, le splash, les stores, ni les textes utilisateur (le dossier backend monorepo peut garder son nom technique).

---

## 3. Architecture de navigation mobile

```text
┌─────────────────────────────────────────┐
│  Stack auth                             │
│   Login  (Signup setup rare)            │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  Tab bar (4–5)  — filtrée par rôle      │
│   Accueil | Travail | Élèves | Finance* │
│              | Plus                     │
└─────────────────────────────────────────┘
         │ stacks imbriqués par famille
         ▼
   Écrans détail / formulaires / onglets locaux
```

\*Finance n’apparaît que si le rôle a `finance` / `economat` / `stats-financieres` / `comptabilite`.

### 3.1 Tab bar — sémantique

| Tab | Id | Mission | Contenu typique |
|-----|-----|---------|-----------------|
| **Accueil** | `home` | Orientation | Contexte année, KPIs autorisés, « Aujourd’hui », logo école |
| **Travail** | `work` | Action du jour | Selon rôle : Appel, Notes, Paiements, Photo… |
| **Élèves** | `students` | Recherche → Fiche | Liste / recherche → Fiche élève (sections) |
| **Finance** | `finance` | Argent | Paiements, Dépenses, Moniteur (si droits) |
| **Plus** | `more` | Catalogue | Toutes les familles restantes + Admin + Déconnexion |

### 3.2 Contenu du tab « Travail » par persona

| Persona | Écran principal du tab Travail | Secondaires (pills / sous-nav) |
|---------|--------------------------------|--------------------------------|
| `DISCIPLINE` | **Appel** | Retards, Points, Mesures |
| `TEACHER` | **Saisie des notes** | Mes classes, Horaires |
| `ECONOME` | **Enregistrer un paiement** | Historique, Dépenses |
| `PHOTOGRAPHER` | **Photographie** | — |
| `PARENT` | *(pas de tab Travail)* → **Mes enfants** à la place | Fiches liées |
| `COMPTABLE` | **Moniteur finance** | Banques, Comptabilité |
| `DIRECTEUR_*` / `CENSEUR` / admins niveau | **Notes** ou **Horaires** | Stats acad. (via Plus) |
| `SUPER_ADMIN` / `DG` / `SCHOOL_ADMIN` | **Vue opérations** (raccourcis : Inscription, Appel, Notes, Paiements) | Tout via Plus |

### 3.3 Tab « Élèves »

Toujours : recherche (nom / NISU) + filtres classe/salle si autorisé → **Fiche élève**.

Sections de la fiche (accordéons ou sous-tabs) :

1. Identité & famille  
2. Discipline  
3. Paiements  
4. Emploi du temps (cours / examens / parascolaire)  
5. Carnet de notes  
6. Actions (badge PDF, modifier inscription si FULL)

Parent / Teacher : liste limitée aux élèves liés (`/users/me/linked-students`).

---

## 4. Familles d’options (catalogue « Plus »)

Le hub **Plus** présente des **cartes de famille** (pas 18 liens plats). Chaque famille ouvre une liste d’écrans.

| Famille | Id | Écrans inclus (labels desktop) |
|---------|-----|--------------------------------|
| **Vie scolaire** | `life` | Inscription · Import anciens · Saisie des notes · Discipline · Formation de classe · Photographie |
| **Organisation** | `org` | Matières · Classes · Salles · Années et périodes · Professeurs · Horaires |
| **Finance** | `money` | Économat · Dépenses · Stats financières (Moniteur / Banques / Comptabilité) |
| **Pilotage** | `insight` | Stats académiques · (raccourci Moniteur si déjà en Finance) |
| **Administration** | `admin` | Gestion Utilisateurs · Gestion établissement |
| **Compte** | `account` | Profil session · Déconnexion · À propos / version |

Visibilité = mêmes règles que `dashboardRoles.ts` / `permissionKeys`.

---

## 5. Mapping onglets desktop → patterns mobile

| Écran desktop | Pattern mobile recommandé |
|---------------|---------------------------|
| Discipline (4 tabs) | Tab Travail = Appel ; autres = segmented control en haut |
| Horaires (3 tabs) | Segmented control ; vue jour (liste) plutôt que grille semaine |
| Économat (3 tabs) | Tab Finance = Paiements ; Services / Exonérations en sous-pages admin |
| Stats financières (3 tabs) | Segmented Moniteur \| Banques \| Comptabilité |
| Comptabilité Balance/Journal | Segmented + formulaires en sheet |
| Années + périodes (2 panneaux) | Liste années → push périodes |
| Inscription (formulaire long) | Wizard multi-étapes (Identité → Scolarité → Famille → Photos) |
| Import PDF | Phase 2+ (desktop-first) |
| Tables CRUD | Liste → détail → FAB « Ajouter » → form sheet |
| Saisie notes (grille) | Liste élèves → sheet note ; verrouillage après save comme desktop |
| Appel | Liste verticale gros touch targets Présent / Absent / Retard / Excusé + CTA sticky Enregistrer |

---

## 6. Schéma d’utilisation logique (parcours)

### 6.1 Matin — Responsable discipline

```text
Login → Accueil (« Appel du jour ») → Travail/Appel
  → choisir classe → cocher → Enregistrer
  → (option) Retard / Mesure depuis Élèves → Fiche
```

### 6.2 Intercours — Enseignant

```text
Login → Accueil → Travail/Notes
  → classe + matière + période → saisir → enregistrer
  → Élèves → Fiche pour vérifier carnet
```

### 6.3 Guichet — Économe

```text
Login → Accueil → Finance/Paiement
  → rechercher élève → service → montant → encaisser
  → Fiche pour situation de paiement
```

### 6.4 Soir — Parent

```text
Login → Accueil → Mes enfants → Fiche
  → Notes / Discipline / Paiements / EDT
```

### 6.5 Direction — Vue d’ensemble

```text
Login → Accueil (KPIs) → Plus → Pilotage / Organisation / Admin
  → ou Élèves pour une fiche précise
```

---

## 7. Hiérarchie visuelle & esthétique

| Zone | Règle |
|------|--------|
| Splash / Login | Logo + marque **Shekinah** (`assets/logo.png`) ; jamais Eureka / Parallele ; champs sobres ; CTA unique |
| Header in-app | Nom école (API) + petite pastille logo ; fallback marque « Shekinah » |
| Tab bar | Icônes + labels courts FR ; accent = couleur primaire école |
| Accueil | Une composition : bienvenue, contexte date/année, 3–6 raccourcis max |
| Listes | Pas de « cards » décoratives inutiles ; séparateurs + avatars élèves |
| Formulaires | Labels clairs FR, dates JJ/MM/AAAA, validation inline |
| Densité admin | Écrans Organisation/Admin plus denses OK ; terrain (Appel/Notes) aéré |
| Motion | Transitions de stack standards ; feedback succès sur enregistrements critiques |
| Dark mode | Pas par défaut — suivre identité établissement (souvent clair) |

Couleurs : variables issues de `/school/profile` (comme le desktop `--school-accent-*`).

---

## 8. Phasage de livraison

| Phase | Livrable | Pourquoi |
|-------|----------|----------|
| **P0** | Shell, Login, Accueil, Plus (catalogue), Fiche élève lecture | Socle + valeur Parent / lecture staff |
| **P1** | Appel + Notes + Paiements | 80 % du terrain quotidien |
| **P2** | Discipline complet, Dépenses, Photographie, Horaires lecture | Opérations courantes |
| **P3** | Inscription wizard, Formation, Stats | Back-office mobile |
| **P4** | Organisation CRUD, Users, School, Comptabilité/Banques | Parité desktop (sauf import PDF / sync) |
| **P5** | Offline, push FCM | Phase architecture cible |

Hors scope mobile volontaire (rester desktop) jusqu’à besoin explicite :

- Import PDF massif d’anciens élèves  
- Preview PDF complexe / badges batch  
- Sync agent (`X-Sync-Key`)  
- Setup initial signup (rare ; possible via desktop)

---

## 9. Règles de décision UX (pour l’équipe)

Quand on ajoute une option desktop au mobile, se demander :

1. Est-ce une **action quotidienne** → tab Travail / Finance ?  
2. Est-ce centré **élève** → Fiche ou tab Élèves ?  
3. Est-ce de la **configuration rare** → famille Organisation / Admin dans Plus ?  
4. Est-ce **lourd / tableur** → desktop-first, mobile lecture seule d’abord ?

---

## 10. Livrables techniques liés

| Fichier | Rôle |
|---------|------|
| `docs/CARTOGRAPHIE.md` | Inventaire complet écrans / API / rôles |
| `docs/PLAN-UI-UX.md` | Ce plan |
| `spec/productMap.ts` | Familles, tabs, écrans, onglets — source pour React Navigation |
| `assets/logo.png` | Logo principal marque |

Ce plan est la référence UI/UX tant que le produit mobile n’est pas initialisé (Expo). Toute navigation future doit s’aligner sur `productMap.ts`.
