import { SetMetadata } from '@nestjs/common';

/** Où lire l'identifiant d'élève ciblé par la requête. */
export interface StudentIdSource {
  in: 'param' | 'query' | 'body';
  key: string;
}

export const PARENT_SCOPE_KEY = 'parent_scope_student_id';
export const PARENT_DENIED_KEY = 'parent_denied';

/**
 * Route dont l'élève ciblé doit être rattaché au parent connecté.
 * N'a d'effet que sur un JWT de rôle PARENT ; les autres rôles ne changent pas.
 *
 * Le format des identifiants déclarés ici est validé pour TOUS les rôles
 * (un UUID mal formé répond 400 au lieu de partir en 500 côté Postgres).
 */
export const ParentScopedStudent = (...sources: StudentIdSource[]) =>
  SetMetadata(PARENT_SCOPE_KEY, sources);

/**
 * Route entièrement interdite au rôle PARENT : elle expose d'autres élèves
 * (listes d'école, feuille de présence de classe) ou écrit des données métier.
 */
export const DenyParents = () => SetMetadata(PARENT_DENIED_KEY, true);
