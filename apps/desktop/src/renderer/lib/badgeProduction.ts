import { API_BASE, fetchWithAuth, getImageUrl, getToken, initApi } from "@/services/api";
import {
  BadgeSchoolInfo,
  BadgeSignatureInfo,
  BadgeStudentInfo,
  getStudentBadgesPdfBlob,
} from "@/lib/badgePdf";

type SchoolLike = {
  name?: string;
  slogan?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  primary_color?: string;
  secondary_color?: string;
} | null;

export async function fetchDirecteurSignature(): Promise<BadgeSignatureInfo | null> {
  try {
    const res = await fetchWithAuth(`${API_BASE}/school/signatures`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    const list = (data.signatures ?? []) as Array<{
      slot_key: string;
      signer_name?: string;
      signer_role?: string;
      image_url?: string | null;
    }>;
    const dg = list.find((s) => s.slot_key === "directeur_general");
    if (!dg) return null;
    return {
      signer_name: dg.signer_name ?? "",
      signer_role: dg.signer_role ?? "Directeur / Directrice Général(e)",
      image_url: dg.image_url ?? null,
    };
  } catch {
    return null;
  }
}

export async function fetchRoomNameForClass(classId: string | null | undefined): Promise<string | null> {
  if (!classId) return null;
  try {
    const res = await fetchWithAuth(`${API_BASE}/classes`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    const cls = (data.classes ?? []).find((c: { id: string }) => c.id === classId);
    return cls?.room_name ?? null;
  } catch {
    return null;
  }
}

export async function buildBadgesPdfBlob(params: {
  school: SchoolLike;
  students: BadgeStudentInfo[];
}): Promise<Blob> {
  const school = params.school;
  if (!school?.name) {
    throw new Error("Profil établissement introuvable");
  }
  await initApi();
  const signature = await fetchDirecteurSignature();
  const schoolInfo: BadgeSchoolInfo = {
    name: school.name,
    slogan: school.slogan,
    address: school.address,
    phone: school.phone,
    email: school.email,
    logo_url: school.logo_url,
    primary_color: school.primary_color,
    secondary_color: school.secondary_color,
  };
  return getStudentBadgesPdfBlob({
    school: schoolInfo,
    students: params.students,
    signature,
    resolveUrl: getImageUrl,
    apiBase: API_BASE,
    token: getToken(),
  });
}

/** Élèves d'une classe (pour badges en lot). */
export async function fetchStudentsForClassBadges(classId: string): Promise<BadgeStudentInfo[]> {
  const [studentsRes, classesRes] = await Promise.all([
    fetchWithAuth(`${API_BASE}/students?class_id=${encodeURIComponent(classId)}`),
    fetchWithAuth(`${API_BASE}/classes`),
  ]);
  const studentsData = await studentsRes.json().catch(() => ({}));
  const classesData = await classesRes.json().catch(() => ({}));
  if (!studentsRes.ok) {
    throw new Error(studentsData.message || "Impossible de charger les élèves");
  }
  const roomName =
    (classesData.classes ?? []).find((c: { id: string }) => c.id === classId)?.room_name ?? null;
  const list = (studentsData.students ?? []) as Array<{
    first_name: string;
    last_name: string;
    management_code?: string | null;
    class_name?: string | null;
    room_name?: string | null;
    photo_identity_student?: string | null;
  }>;
  return list
    .slice()
    .sort((a, b) =>
      `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, "fr"),
    )
    .map((s) => ({
      first_name: s.first_name,
      last_name: s.last_name,
      management_code: s.management_code,
      class_name: s.class_name,
      room_name: s.room_name || roomName,
      photo_url: s.photo_identity_student,
    }));
}

/** Élèves inscrits dans une salle (groupe). */
export async function fetchStudentsForRoomBadges(roomId: string): Promise<{
  students: BadgeStudentInfo[];
  roomName: string;
}> {
  const [roomRes, studentsRes] = await Promise.all([
    fetchWithAuth(`${API_BASE}/rooms/${encodeURIComponent(roomId)}`),
    fetchWithAuth(`${API_BASE}/students?room_id=${encodeURIComponent(roomId)}`),
  ]);
  const roomData = await roomRes.json().catch(() => ({}));
  const studentsData = await studentsRes.json().catch(() => ({}));
  if (!roomRes.ok) {
    throw new Error(roomData.message || "Salle introuvable");
  }
  if (!studentsRes.ok) {
    throw new Error(studentsData.message || "Impossible de charger les élèves");
  }
  const roomName = roomData.room?.name || "Salle";
  const students = ((studentsData.students ?? []) as Array<{
    first_name: string;
    last_name: string;
    management_code?: string | null;
    class_name?: string | null;
    room_name?: string | null;
    photo_identity_student?: string | null;
  }>)
    .map((s) => ({
      first_name: s.first_name,
      last_name: s.last_name,
      management_code: s.management_code,
      class_name: s.class_name,
      room_name: s.room_name || roomName,
      photo_url: s.photo_identity_student,
    }))
    .sort((a, b) =>
      `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, "fr"),
    );
  if (!students.length) {
    throw new Error("Aucun élève dans cette salle");
  }
  return { students, roomName };
}
