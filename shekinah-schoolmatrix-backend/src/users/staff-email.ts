/** ASCII minuscule sans séparateurs — pour local-part d’e-mail. */
export function slugEmailPart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** « NOM Prénom … » → last_name = 1er mot, first_name = le reste. */
export function splitPersonName(fullName: string): { last_name: string; first_name: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { last_name: 'Parent', first_name: '—' };
  if (parts.length === 1) return { last_name: parts[0], first_name: '—' };
  return { last_name: parts[0], first_name: parts.slice(1).join(' ') };
}

export function buildStaffEmail(lastName: string, firstName: string, domain: string): string {
  const last = slugEmailPart(lastName);
  const first = slugEmailPart(firstName);
  const local = [first, last].filter(Boolean).join('.') || 'user';
  const host = domain.replace(/^@/, '').trim().toLowerCase();
  return `${local}@${host}`;
}
