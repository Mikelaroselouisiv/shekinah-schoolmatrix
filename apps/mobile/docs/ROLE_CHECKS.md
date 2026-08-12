# Checklist ACL mobile vs desktop (S21)

Référence : `src/lib/permissions.ts` (port de `dashboardRoles` desktop) + `spec/productMap.ts`.

Marquer chaque rôle après un passage manuel (Expo Go ou build preview).

## Rôles à couvrir

| Rôle | Accueil | Travail du jour | Élèves / Fiche | Plus (familles) | Écritures critiques |
|------|---------|-----------------|----------------|-----------------|---------------------|
| `SUPER_ADMIN` / `SCHOOL_ADMIN` | KPIs + raccourcis | selon année | liste complète + inscription | org + admin + finance | OK |
| `DIRECTEUR_PEDAGOGIQUE` / `CENSEUR` | stats académiques | notes / horaires | fiche | pédagogie | notes OK |
| `TEACHER` | raccourcis limités | notes / appel si exposé | fiche liée | restreint | notes / appel |
| `ECONOME` | finance | paiements | fiche | finance | paiements (file offline) |
| `COMPTABLE` | moniteur | — | — | banques / compta | lecture + saisie compta |
| `DISCIPLINE` | discipline | discipline | fiche | discipline | incidents |
| `PHOTOGRAPHER` | photo | photographie | — | photo | uploads |
| `PARENT` | enfants liés | onglet Enfants | fiches liées seulement | catalogue réduit | lecture |

## Contrôles négatifs (masqué)

- [ ] `PARENT` ne voit pas org / admin / banques
- [ ] `TEACHER` sans `full_access` ne voit pas finance admin
- [ ] Rôle sans `students` : pas d’inscription / formation de classe
- [ ] Déconnexion : cache offline + file mutations vidés

## Offline (tous rôles concernés)

- [ ] Couper le réseau → bandeau Accueil / Plus
- [ ] Appel ou paiement hors ligne → en file, sync au retour
- [ ] Listes élèves / fiches récentes depuis cache

## Push

- Stub uniquement (`src/lib/pushNotifications.ts`) — activer après credentials EAS FCM/APNs.
