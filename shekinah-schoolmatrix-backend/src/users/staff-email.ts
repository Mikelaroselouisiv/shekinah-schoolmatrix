import { slugEmailPart, splitPersonName } from './parent-account.util';

export { slugEmailPart, splitPersonName };

/**
 * Convention Shekinah : `prenom.nom@domaine`.
 *
 * Les comptes parents déjà en base suivent ce format ; ne pas basculer en
 * `nom.prenom` sans migrer l'existant, sinon deux conventions cohabitent.
 */
export function buildStaffEmail(
  lastName: string,
  firstName: string,
  domain: string,
): string {
  const f = slugEmailPart(firstName);
  const l = slugEmailPart(lastName);
  return `${f}.${l}@${domain}`;
}
