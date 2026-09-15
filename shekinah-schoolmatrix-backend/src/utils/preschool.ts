export function isPreschoolClass(description?: string | null, level?: string | null): boolean {
  const check = (s: unknown): boolean => {
    if (!s || typeof s !== 'string') return false;
    const normalized = s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/-/g, '');
    return normalized.includes('prescolaire');
  };
  return check(description) || check(level);
}
