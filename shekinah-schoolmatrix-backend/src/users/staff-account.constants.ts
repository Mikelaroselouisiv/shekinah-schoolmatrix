import {
  AUTO_PARENT_PASSWORD,
  INSTITUTION_EMAIL_DOMAIN,
} from './parent-account.util';

/** Mot de passe initial de tout compte provisionné (parent ou personnel). */
export const DEFAULT_STAFF_PASSWORD = AUTO_PARENT_PASSWORD;

/** Repli quand school_profile.domain n'est pas un domaine exploitable. */
export const DEFAULT_STAFF_EMAIL_DOMAIN = INSTITUTION_EMAIL_DOMAIN;
