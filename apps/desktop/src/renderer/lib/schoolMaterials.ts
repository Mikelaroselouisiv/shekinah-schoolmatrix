export type SchoolMaterialKind = "LIVRE" | "CAHIER";

export type SchoolMaterialItem = {
  id: string;
  kind: SchoolMaterialKind;
  name: string;
  label: string;
  subject_id?: string | null;
  subject_name?: string | null;
};

export function parseMaterialLines(raw?: string | null): string[] {
  return String(raw ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function serializeMaterialLines(lines: string[]): string {
  return [...new Set(lines.map((s) => s.trim()).filter(Boolean))].join("\n");
}

export function toggleMaterialLine(raw: string | null | undefined, label: string): string {
  const lines = parseMaterialLines(raw);
  const next = lines.includes(label) ? lines.filter((x) => x !== label) : [...lines, label];
  return serializeMaterialLines(next);
}
