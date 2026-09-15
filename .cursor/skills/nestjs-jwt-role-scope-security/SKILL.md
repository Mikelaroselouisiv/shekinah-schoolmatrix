---
name: nestjs-jwt-role-scope-security
description: >-
  Hardens a NestJS JWT API so low-privilege roles (PARENT, customer, guest)
  cannot read or write school-wide or other-users data. Use when securing
  permissions, roles, IDOR, parent scope, JWT guards, DenyParents,
  ParentScopeGuard, or when an API had almost no authorization beyond login.
---

# NestJS — JWT + rôle + périmètre ressource

Un jeton valide **n’est pas** une autorisation métier. Le modèle ci-dessous
vient de SchoolMatrix : comptes PARENT vs staff desktop. Réutilise-le tel quel
sur un autre NestJS (école, POS, portail client).

## Règle d’or

| Jeton | Comportement |
|-------|----------------|
| Staff (admin, enseignant, caisse…) | **Inchangé** : pas de requête extra, pas de 403 nouveau |
| Staff **+** ressources liées (ex. enfants) | Le rôle **ne change pas**. Les liens sont un overlay (fiche famille, « mes enfants ») ; `@DenyParents()` ne s’applique **pas**. |
| Rôle restreint (ex. `PARENT`) | Interdit sur les listes / écritures d’école ; lectures **uniquement** de ses ressources liées |
| Anonyme | Login + bootstrap initial seulement |

Ne **pas** coller `@Roles()` partout : ça casse le desktop/staff. Le garde de
périmètre ignore les non-parents.

**Lier une ressource ≠ changer le rôle.** `user_linked_student` n’appelle jamais
`setUserRole('PARENT')`. Un `save({ user: { id } })` TypeORM sur la table de
lien peut persister un User partiel et **écraser `role_id`** — utiliser
`insert()` / `update()` colonnes. Le JWT `validate` relit le rôle **en base**,
pas le payload (jeton périmé). Ne jamais faire `role ?? 'PARENT'` au login.

## Trois couches (dans cet ordre)

```
JwtAuthGuard  →  ParentScopeGuard (ou équivalent)  →  RolesGuard (mutations admin)
```

1. **JWT** — qui est connecté (`sub` / `userId` + `role` dans le payload).
2. **Périmètre du rôle faible** — table d’appartenance canonique, pas une
   ancienne table jamais écrite.
3. **Rôles admin** — création d’utilisateurs, rôles, finance, reset password.
   Un enseignant ne doit pas se promouvoir `SUPER_ADMIN`.

## Table d’appartenance (obligatoire)

Une **seule** source de vérité pour « cette ressource appartient à cet user ».

SchoolMatrix : `user_linked_student` (`user_id`, `student_id`).  
Autre projet : `user_linked_order`, `customer_store`, etc.

- Les liens se créent dans l’admin **et** à l’inscription (hook métier).
- Le garde lit **cette** table, pas le JWT (le jeton n’embarque pas la liste).

## Décorateurs

```ts
@UseGuards(JwtAuthGuard, ParentScopeGuard)  // classe
@ParentScopedStudent({ in: 'param', key: 'id' })     // lecture d’UN élève
@ParentScopedStudent({ in: 'query', key: 'student_id' })
@ParentScopedStudent({ in: 'body', key: 'student_id' })
@DenyParents()  // liste d’école, écriture, admin
```

Effets du garde :

- UUID mal formé → **400** pour tous les rôles (évite un 500 SQL).
- `@DenyParents()` + rôle PARENT → **403**.
- `@ParentScopedStudent` + PARENT sans id → **403** (sinon fuite de toute l’école).
- PARENT + id hors table d’appartenance → **403**.
- Autre rôle → `return true` immédiatement après la validation de format.

`ParentScopeModule` exporte le garde et importe `TypeOrmModule.forFeature([Lien])`.
Chaque module métier **importe** `ParentScopeModule`. Le module **exporte**
aussi `TypeOrmModule` (repo de la table d’appartenance) : sans ça, Nest plante
au boot (`can't resolve UserLinkedStudentRepository in XModule`).

## Où coller quoi

| Type de route | Annotation |
|---------------|------------|
| `GET /me`, `PATCH /me/*`, photo / mot de passe soi-même | JWT seul (pas `@DenyParents`) |
| `GET /:id` d’une ressource liée (élève, commande) | `@ParentScopedStudent` |
| Liste globale, recherche par code, feuille de classe | `@DenyParents()` |
| POST/PATCH/DELETE métier (notes, paiements, rôles, finance) | `@DenyParents()` ; + `@Roles(...)` si ce n’est pas pour tout le staff |
| Contrôleur entier staff-only (finance, rôles, profs) | `@DenyParents()` **sur la classe** |
| Catalogue inoffensif (années, barèmes) en lecture | JWT ; écritures `@DenyParents()` |
| Bootstrap `register-super-admin` / `setup` | Public **seulement** si 0 utilisateurs ; sinon 403 |

## Anti-IDOR service

Le garde ne suffit pas si le service ignore le filtre :

```ts
// Mauvais : parent envoie student_id=sien ET class_id=autre → notes de toute la classe
findGrades({ student_id, class_id }) // AND des deux = OK si student_id est forcé

// Pour un PARENT, exiger l’id lié et ne jamais lister sans cet id.
```

Ne pas lire l’id **uniquement** dans le body sur une route GET (le garde doit
déclarer `param` ou `query` ou `body` selon le client).

## Login

- Throttle **par identifiant saisi**, pas seulement par IP (un front WordPress /
  proxy a une seule IP).
- Compteur IP large et désactivable.
- Compte désactivé : message **après** vérif mot de passe (pas d’énumération).
- `JWT_SECRET` obligatoire au boot.

## Checklist agent

```
Sécurité API Nest :
- [ ] JwtAuthGuard sur tout sauf login / health / setup vide
- [ ] Table d’appartenance unique, lue par le garde
- [ ] @DenyParents (ou équivalent) sur listes + écritures d’école
- [ ] @ParentScopedStudent sur lectures d’une ressource liée
- [ ] Staff non cassé (le garde no-op hors rôle faible)
- [ ] Mutations users/roles/finance : rôle admin, pas seulement « loggé »
- [ ] register-super-admin / setup fermés dès qu’il existe un user
- [ ] /me self-service reste ouvert au rôle faible
```

## SchoolMatrix — fichiers de référence

- `shekinah-schoolmatrix-backend/src/auth/parent-scope.guard.ts`
- `shekinah-schoolmatrix-backend/src/auth/parent-scope.decorator.ts`
- `shekinah-schoolmatrix-backend/src/auth/login-throttle.service.ts`
- Appartenance : `user_linked_student` (même source que l’écran Utilisateurs)

Ne pas confondre `student_parent` (table historique, souvent vide) avec
`user_linked_student`.
