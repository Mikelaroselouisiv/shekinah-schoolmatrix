import axios, { type AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { resolveApiBaseUrl } from '../config/api';

const TOKEN_KEY = 'schoolmatrix_token';

export type SessionUser = {
  id?: number;
  userId?: number;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  profile_photo_url?: string | null;
  role?: { name: string } | string;
  role_permissions?: string[];
};

export type LoginResponse = {
  access_token: string;
  user?: SessionUser;
  message?: string;
};

let memoryToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const API_BASE = resolveApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  if (memoryToken) {
    config.headers.Authorization = `Bearer ${memoryToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      void clearToken();
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export async function hydrateToken(): Promise<string | null> {
  try {
    memoryToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    memoryToken = null;
  }
  return memoryToken;
}

export function getToken(): string | null {
  return memoryToken;
}

export async function writeToken(token: string): Promise<void> {
  memoryToken = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  memoryToken = null;
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // ignore
  }
}

function axiosMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      return 'Impossible de joindre le serveur. Vérifiez votre connexion internet.';
    }
    const data = err.response?.data as { message?: string | string[] } | undefined;
    const msg = data?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string' && msg.trim()) return msg;
    return err.message || fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export async function login(
  loginOrEmail: string,
  password: string,
  rememberMe = false,
): Promise<LoginResponse> {
  try {
    const { data } = await api.post<LoginResponse>('/auth/login', {
      login: loginOrEmail.trim() || undefined,
      email: loginOrEmail.trim() || undefined,
      password,
      remember_me: rememberMe,
    });
    if (!data.access_token) {
      throw new Error(data.message || 'Réponse serveur invalide');
    }
    await writeToken(data.access_token);
    return data;
  } catch (err) {
    throw new Error(axiosMessage(err, 'Identifiants invalides'));
  }
}

export async function logout(): Promise<void> {
  await clearToken();
}

export async function getMe(): Promise<SessionUser | null> {
  const { data } = await api.get<{ user?: SessionUser } | SessionUser>('/users/me');
  if (data && typeof data === 'object' && 'user' in data) {
    return (data as { user?: SessionUser }).user ?? null;
  }
  return (data as SessionUser) ?? null;
}

export type SchoolHome = {
  id?: string;
  name?: string;
  slogan?: string | null;
  domain?: string | null;
  logo_url?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  active?: boolean;
  current_academic_year_id?: string | null;
  current_period_id?: string | null;
};

export async function getSchoolHome(): Promise<SchoolHome | null> {
  try {
    const { data } = await api.get<{ school?: SchoolHome } | SchoolHome>('/school/home');
    if (data && typeof data === 'object' && 'school' in data) {
      return (data as { school?: SchoolHome }).school ?? null;
    }
    return (data as SchoolHome) ?? null;
  } catch {
    return null;
  }
}

export type SchoolContext = {
  current_academic_year_id?: string | null;
  current_academic_year_name?: string | null;
  current_period_id?: string | null;
  current_period_name?: string | null;
  current_preschool_period_id?: string | null;
  current_preschool_period_name?: string | null;
  academic_year?: { id?: string; name?: string } | null;
  period?: { id?: string; name?: string } | null;
  school?: SchoolHome | null;
};

export async function getCurrentContext(): Promise<SchoolContext | null> {
  try {
    const { data } = await api.get<SchoolContext>('/school/current-context');
    if (!data) return null;
    return {
      ...data,
      academic_year:
        data.academic_year ??
        (data.current_academic_year_id
          ? {
              id: data.current_academic_year_id,
              name: data.current_academic_year_name ?? undefined,
            }
          : null),
      period:
        data.period ??
        (data.current_period_id
          ? {
              id: data.current_period_id,
              name: data.current_period_name ?? undefined,
            }
          : null),
    };
  } catch {
    return null;
  }
}

const GCS_PUBLIC_UPLOADS =
  'https://storage.googleapis.com/parallele-schoolmatrix-assets/schoolmatrix/uploads';

function extractUploadFilename(stored: string): string | null {
  const s = stored.trim();
  if (!s) return null;
  const rel = s.match(/^(?:\/)?uploads\/([^/?#]+)$/i);
  if (rel) return rel[1];
  const gcs = s.match(
    /storage\.googleapis\.com\/[^/]+\/[^/]+\/uploads\/([^/?#]+)(?:\?|#|$)/i,
  );
  return gcs ? gcs[1] : null;
}

/** URL affichable pour une photo stockée (chemin relatif, GCS ou absolue). */
export function getImageUrl(storedUrl: string | null | undefined): string | null {
  if (!storedUrl?.trim()) return null;
  const trimmed = storedUrl.trim();
  const base = API_BASE.replace(/\/$/, '');
  const filename = extractUploadFilename(trimmed);
  if (filename && base) {
    return `${base}/uploads/${encodeURIComponent(filename)}`;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (filename) return `${GCS_PUBLIC_UPLOADS}/${filename}`;
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${base}${path.startsWith('/uploads') ? path : `/uploads${path}`}`;
}

export type DashboardStats = {
  classesCount: number;
  studentsCount: number;
  teachersCount: number;
};

export async function getDashboardStats(): Promise<DashboardStats | null> {
  try {
    const { data } = await api.get<{
      ok?: boolean;
      classesCount?: number;
      studentsCount?: number;
      teachersCount?: number;
      // anciens alias éventuels
      classes?: number;
      students?: number;
      teachers?: number;
    }>('/school/dashboard-stats');
    if (!data) return null;
    const classesCount = Number(data.classesCount ?? data.classes);
    const studentsCount = Number(data.studentsCount ?? data.students);
    const teachersCount = Number(data.teachersCount ?? data.teachers);
    if (
      Number.isNaN(classesCount) &&
      Number.isNaN(studentsCount) &&
      Number.isNaN(teachersCount)
    ) {
      return null;
    }
    return {
      classesCount: Number.isFinite(classesCount) ? classesCount : 0,
      studentsCount: Number.isFinite(studentsCount) ? studentsCount : 0,
      teachersCount: Number.isFinite(teachersCount) ? teachersCount : 0,
    };
  } catch {
    return null;
  }
}

export function getRoleName(user: SessionUser | null | undefined): string {
  if (!user?.role) return '';
  return typeof user.role === 'string' ? user.role : user.role.name || '';
}

export type StudentListItem = {
  id: string;
  order_number?: string | null;
  management_code?: string | null;
  first_name: string;
  last_name: string;
  class_id?: string;
  class_name?: string;
  class_level?: string | null;
  room_id?: string | null;
  room_name?: string | null;
  photo_identity_student?: string | null;
  photo_identity_mother?: string | null;
  photo_identity_father?: string | null;
  photo_identity_responsible?: string | null;
  phone?: string | null;
  email?: string | null;
  mother_name?: string | null;
  mother_phone?: string | null;
  father_name?: string | null;
  father_phone?: string | null;
  responsible_name?: string | null;
  responsible_phone?: string | null;
  birth_date?: string | null;
  birth_place?: string | null;
  gender?: string | null;
  address?: string | null;
  active?: boolean;
};

export type LinkedStudent = {
  id: string;
  order_number: string | null;
  management_code?: string | null;
  first_name: string;
  last_name: string;
  class_id: string;
  class_name: string;
};

export type ClassItem = {
  id: string;
  name: string;
  is_preschool?: boolean;
  description?: string | null;
  level?: string | null;
  can_take_attendance?: boolean;
  can_set_materials?: boolean;
};


export type DisciplineSummary = {
  student_id: string;
  student_name?: string;
  class_name?: string;
  disciplinary_points?: number;
  lateness_count?: number;
  absence_count?: number;
  latest_measure?: {
    id: string;
    label: string;
    color?: string;
    reason?: string;
    expires_at?: string;
  } | null;
};

export type PaymentByService = {
  service_id: string;
  service_name: string;
  amount_due: number;
  total_paid: number;
  balance: number;
  due_date?: string | null;
  payment_modality?: string | null;
};

export type PaymentStatus = {
  academic_year?: string;
  by_service?: PaymentByService[];
};

export type EconomatBalance = {
  amount_due: number;
  total_paid: number;
  balance: number;
};

export type ExamResults = {
  academic_year_id?: string;
  academic_year_name?: string | null;
  periods?: { id: string; name: string; order_index: number }[];
  subjects?: {
    subject_id: string;
    subject_name: string;
    periods: {
      period_id: string;
      period_name: string;
      order_index: number;
      coefficient: number;
      grade_value: number;
      /** false = aucune note saisie ; grade_value vaut alors 0 par défaut. */
      has_grade?: boolean;
    }[];
  }[];
};

export type ScheduleSlot = {
  id: string;
  academic_year?: string | null;
  class_id?: string;
  class_name?: string;
  subject_id?: string;
  subject_name?: string;
  teacher_id?: number;
  teacher_name?: string | null;
  room_id?: string | null;
  room_name?: string | null;
  day_of_week?: number;
  start_time?: string;
  end_time?: string;
  materials?: string | null;
  kind?: string;
  title?: string;
  is_school_wide?: boolean;
};

export type ClassDayMoment = {
  id: string;
  class_id: string;
  class_name?: string | null;
  academic_year?: string | null;
  kind: string;
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  label?: string | null;
};

export type SchoolWeekDuty = {
  id: string;
  academic_year: string;
  kind: string;
  title: string;
  cycle?: string | null;
  class_id?: string | null;
  class_name?: string | null;
  class_level?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  responsible_user_id: number | null;
  responsible_name: string | null;
  manual_name?: string | null;
};

export type ExamScheduleItem = {
  id: string;
  class_id?: string;
  class_name?: string;
  subject_id?: string;
  subject_name?: string;
  period?: string;
  exam_date?: string;
  start_time?: string;
  end_time?: string;
};

export type ExtracurricularItem = {
  id: string;
  academic_year_id?: string;
  academic_year_name?: string;
  activity_date?: string;
  start_time?: string;
  end_time?: string;
  class_id?: string;
  class_name?: string;
  occasion?: string;
  participation_fee?: string | null;
  dress_code?: string | null;
};

export type RoomItem = {
  id: string;
  name: string;
  class_id?: string | null;
  capacity?: number | null;
  student_count?: number;
  active?: boolean;
};

export type TeacherItem = {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string;
  phone?: string | null;
  profile_photo_url?: string | null;
  role?: string | null;
  active?: boolean;
};

export type StudentPhoto = {
  id: string;
  kind: string;
  label?: string | null;
  url: string;
  created_at?: string;
};

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of [
      'students',
      'data',
      'items',
      'linked_students',
      'classes',
      'academic_years',
      'periods',
      'subjects',
      'rows',
      'fee_services',
      'transactions',
      'accounts',
      'latenesses',
      'deductions',
      'measures',
      'expenses',
      'activities',
      'schedule_slots',
      'schedule_moments',
      'school_week_duties',
      'school_materials',
      'exam_schedules',
      'extracurricular_activities',
      'rooms',
      'teachers',
      'assignments',
      'photos',
      'users',
      'roles',
      'signatures',
      'banks',
      'exercices',
      'entries',
      'balance',
      'other_revenues',
    ]) {
      if (Array.isArray(obj[key])) return obj[key] as T[];
    }
  }
  return [];
}

export async function getLinkedStudents(): Promise<LinkedStudent[]> {
  const { data } = await api.get('/users/me/linked-students');
  return unwrapList<LinkedStudent>(data);
}

export async function getStudents(params?: {
  class_id?: string;
  room_id?: string;
}): Promise<StudentListItem[]> {
  const { data } = await api.get('/students', { params });
  return unwrapList<StudentListItem>(data);
}

export async function getStudent(id: string): Promise<StudentListItem | null> {
  const { data } = await api.get<StudentListItem | { student?: StudentListItem }>(
    `/students/${id}`,
  );
  if (data && typeof data === 'object' && 'student' in data) {
    return (data as { student?: StudentListItem }).student ?? null;
  }
  return (data as StudentListItem) ?? null;
}

export async function getClasses(): Promise<ClassItem[]> {
  const { data } = await api.get('/classes');
  return unwrapList<ClassItem>(data);
}

export async function getDisciplineSummary(
  studentId: string,
): Promise<DisciplineSummary | null> {
  try {
    const { data } = await api.get<DisciplineSummary>(
      `/discipline/student-summary/${studentId}`,
    );
    return data ?? null;
  } catch {
    return null;
  }
}

export async function getPaymentStatus(
  studentId: string,
  academicYear?: string,
): Promise<PaymentStatus | null> {
  try {
    const { data } = await api.get<PaymentStatus & { ok?: boolean }>(
      `/economat/student-payment-status/${studentId}`,
      { params: academicYear ? { academic_year: academicYear } : undefined },
    );
    if (!data) return null;
    return {
      academic_year: data.academic_year,
      by_service: data.by_service || [],
    };
  } catch {
    return null;
  }
}

/** Solde dû pour un élève + année + service (préremplissage paiement). */
export async function getEconomatBalance(params: {
  student_id: string;
  academic_year: string;
  service_id: string;
}): Promise<EconomatBalance> {
  const { data } = await api.get<{
    ok?: boolean;
    amount_due?: number;
    total_paid?: number;
    balance?: number;
  }>('/economat/balance', {
    params: {
      student_id: params.student_id,
      academic_year: params.academic_year,
      service_id: params.service_id,
    },
  });
  return {
    amount_due: Number(data?.amount_due ?? 0),
    total_paid: Number(data?.total_paid ?? 0),
    balance: Number(data?.balance ?? 0),
  };
}

export async function getExamResults(
  studentId: string,
  academicYearId?: string,
): Promise<ExamResults | null> {
  try {
    const { data } = await api.get<ExamResults>('/grades/student-exam-results', {
      params: {
        student_id: studentId,
        ...(academicYearId ? { academic_year_id: academicYearId } : {}),
      },
    });
    return data ?? null;
  } catch {
    return null;
  }
}

export async function getScheduleSlots(classId: string): Promise<ScheduleSlot[]> {
  return listScheduleSlots({ class_id: classId });
}

export async function listScheduleSlots(params?: {
  class_id?: string;
  room_id?: string;
  teacher_id?: number;
  day_of_week?: number;
  academic_year?: string;
}): Promise<ScheduleSlot[]> {
  try {
    const { data } = await api.get('/schedule-slots', { params });
    return unwrapList<ScheduleSlot>(data);
  } catch {
    return [];
  }
}

export async function createScheduleSlot(body: {
  academic_year?: string;
  class_id: string;
  subject_id: string;
  teacher_id: number;
  room_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}): Promise<void> {
  await api.post('/schedule-slots', body);
}

export async function deleteScheduleSlot(id: string): Promise<void> {
  await api.delete(`/schedule-slots/${id}`);
}

export async function listScheduleMoments(params?: {
  class_id?: string;
  academic_year?: string;
  kind?: string;
  day_of_week?: number;
}): Promise<ClassDayMoment[]> {
  try {
    const { data } = await api.get('/schedule-moments', { params });
    return unwrapList<ClassDayMoment>(data);
  } catch {
    return [];
  }
}

export async function createScheduleMoments(body: {
  class_id: string;
  academic_year?: string;
  kind: string;
  days?: number[];
  day_of_week?: number;
  start_time: string;
  end_time: string;
  label?: string | null;
}): Promise<void> {
  await api.post('/schedule-moments', body);
}

export async function deleteScheduleMoment(id: string): Promise<void> {
  await api.delete(`/schedule-moments/${id}`);
}

export async function listSchoolWeekDuties(params?: {
  academic_year?: string;
  kind?: string;
}): Promise<SchoolWeekDuty[]> {
  try {
    const { data } = await api.get('/school-week-duties', { params });
    return unwrapList<SchoolWeekDuty>(data);
  } catch {
    return [];
  }
}

export async function getSchoolOpeningProgram(academicYear?: string): Promise<{
  school_week_duties: SchoolWeekDuty[];
  preschool_instructions: string[];
  primary_instructions: string[];
}> {
  const { data } = await api.get('/school-week-duties', {
    params: academicYear ? { academic_year: academicYear } : undefined,
  });
  return {
    school_week_duties: unwrapList<SchoolWeekDuty>(data),
    preschool_instructions: Array.isArray(data?.preschool_instructions)
      ? data.preschool_instructions
      : [],
    primary_instructions: Array.isArray(data?.primary_instructions)
      ? data.primary_instructions
      : [],
  };
}

export async function listSchoolWeekStaff(): Promise<{ id: number; name: string; role: string }[]> {
  try {
    const { data } = await api.get('/school-week-duties/staff');
    return Array.isArray(data?.staff) ? data.staff : [];
  } catch {
    return [];
  }
}

export async function upsertSchoolWeekDuties(body: {
  academic_year: string;
  days: {
    day_of_week: number;
    preschool?: {
      accueil_ids?: number[];
      flag_ids?: number[];
      animation_ids?: number[];
      service_names?: string[];
    };
    primary?: {
      accueil_ids?: number[];
      devotion_ids?: number[];
      flag_class_id?: string | null;
      defi_ids?: number[];
      prayer_names?: string[];
    };
    flag_class_id?: string | null;
    preschool_teacher_ids?: number[];
    primary_teacher_ids?: number[];
  }[];
  preschool_instructions?: string[];
  primary_instructions?: string[];
}): Promise<void> {
  await api.put('/school-week-duties', body);
}

export type ClassDayList = {
  day_of_week: number;
  subject_ids: string[];
  subject_names: string[];
  materials: string[];
};

export async function listClassDayLists(
  classId: string,
  academicYear?: string,
): Promise<{ days: ClassDayList[]; catalog: string[] }> {
  try {
    const { data } = await api.get('/class-day-lists', {
      params: { class_id: classId, academic_year: academicYear },
    });
    return {
      days: Array.isArray(data?.days) ? data.days : [],
      catalog: Array.isArray(data?.catalog) ? data.catalog : [],
    };
  } catch {
    return { days: [], catalog: [] };
  }
}

export async function replaceClassDayLists(body: {
  class_id: string;
  academic_year?: string | null;
  days: {
    day_of_week: number;
    subject_ids?: string[];
    materials?: string[];
  }[];
}): Promise<{ days: ClassDayList[]; catalog: string[] }> {
  const { data } = await api.put('/class-day-lists', body);
  return {
    days: Array.isArray(data?.days) ? data.days : [],
    catalog: Array.isArray(data?.catalog) ? data.catalog : [],
  };
}

export async function getStudentSchedule(
  studentId: string,
  academicYear?: string,
): Promise<{
  slots: ScheduleSlot[];
  schedule_mode?: string;
  day_lists?: ClassDayList[];
  bring_items?: { id: string; label: string }[];
  list_subjects?: string[];
  class_level?: string | null;
  room_id?: string | null;
  room_name?: string | null;
}> {
  const { data } = await api.get(`/schedule/student/${studentId}`, {
    params: academicYear ? { academic_year: academicYear } : undefined,
  });
  return {
    slots: Array.isArray(data?.slots) ? data.slots : [],
    schedule_mode: data?.schedule_mode,
    day_lists: Array.isArray(data?.day_lists) ? data.day_lists : [],
    bring_items: Array.isArray(data?.bring_items) ? data.bring_items : [],
    list_subjects: Array.isArray(data?.list_subjects) ? data.list_subjects : [],
    class_level: data?.class_level ?? null,
    room_id: data?.room_id ?? null,
    room_name: data?.room_name ?? null,
  };
}

export type SchoolMaterialItem = {
  id: string;
  kind: 'LIVRE' | 'CAHIER';
  name: string;
  label: string;
  subject_id?: string | null;
  subject_name?: string | null;
};

export async function listSchoolMaterials(): Promise<SchoolMaterialItem[]> {
  try {
    const { data } = await api.get('/school-materials');
    return unwrapList<SchoolMaterialItem>(data);
  } catch {
    return [];
  }
}

export async function createSchoolMaterial(body: {
  kind: 'LIVRE' | 'CAHIER';
  name: string;
  subject_id?: string | null;
}): Promise<SchoolMaterialItem> {
  const { data } = await api.post<{ school_material?: SchoolMaterialItem }>('/school-materials', body);
  if (!data?.school_material) throw new Error('Matériel non créé');
  return data.school_material;
}

export async function deleteSchoolMaterial(id: string): Promise<void> {
  await api.delete(`/school-materials/${id}`);
}

export async function listExamSchedules(params?: {
  class_id?: string;
}): Promise<ExamScheduleItem[]> {
  const { data } = await api.get('/exam-schedules', { params });
  return unwrapList<ExamScheduleItem>(data);
}

export async function createExamSchedule(body: {
  class_id: string;
  subject_id: string;
  period: string;
  exam_date: string;
  start_time: string;
  end_time: string;
}): Promise<void> {
  await api.post('/exam-schedules', body);
}

export async function deleteExamSchedule(id: string): Promise<void> {
  await api.delete(`/exam-schedules/${id}`);
}

export async function listExtracurricularActivities(params?: {
  academic_year_id?: string;
  class_id?: string;
}): Promise<ExtracurricularItem[]> {
  const { data } = await api.get('/extracurricular-activities', { params });
  return unwrapList<ExtracurricularItem>(data);
}

export async function createExtracurricularActivity(body: {
  academic_year_id: string;
  activity_date: string;
  start_time: string;
  end_time: string;
  class_ids: string[];
  occasion: string;
  participation_fee?: string | null;
  dress_code?: string | null;
}): Promise<void> {
  await api.post('/extracurricular-activities', body);
}

export async function updateExtracurricularActivity(
  id: string,
  body: {
    academic_year_id?: string;
    activity_date?: string;
    start_time?: string;
    end_time?: string;
    class_id?: string;
    occasion?: string;
    participation_fee?: string | null;
    dress_code?: string | null;
  },
): Promise<void> {
  await api.patch(`/extracurricular-activities/${id}`, body);
}

export async function deleteExtracurricularActivity(id: string): Promise<void> {
  await api.delete(`/extracurricular-activities/${id}`);
}

export async function getRooms(classId?: string): Promise<RoomItem[]> {
  const { data } = await api.get('/rooms', {
    params: classId ? { class_id: classId } : undefined,
  });
  return unwrapList<RoomItem>(data);
}

export async function getTeachers(params?: {
  class_id?: string;
  subject_id?: string;
}): Promise<TeacherItem[]> {
  const { data } = await api.get('/teachers', { params });
  return unwrapList<TeacherItem>(data);
}

export async function listStudentPhotos(studentId: string): Promise<StudentPhoto[]> {
  const { data } = await api.get(`/students/${studentId}/photos`);
  return unwrapList<StudentPhoto>(data);
}

export async function addStudentPhoto(
  studentId: string,
  body: { kind: string; url: string; label?: string },
): Promise<void> {
  await api.post(`/students/${studentId}/photos`, body);
}

export async function deleteStudentPhoto(
  studentId: string,
  photoId: string,
): Promise<void> {
  await api.delete(`/students/${studentId}/photos/${photoId}`);
}

export async function uploadImage(
  uri: string,
  options?: { mimeType?: string; fileName?: string },
): Promise<string> {
  const mimeType = options?.mimeType || 'image/jpeg';
  const fileName = options?.fileName || `photo-${Date.now()}.jpg`;
  const form = new FormData();
  form.append('file', {
    uri,
    type: mimeType,
    name: fileName,
  } as unknown as Blob);
  try {
    const { data } = await api.post<{ ok?: boolean; url?: string }>('/uploads', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
    if (!data?.url) throw new Error('Réponse upload invalide');
    return data.url;
  } catch (err) {
    throw new Error(axiosMessage(err, 'Échec de l’upload'));
  }
}

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'EXCUSED' | 'LATE';

export type AttendanceStudent = {
  id: string;
  first_name: string;
  last_name: string;
  status: AttendanceStatus | string | null;
};

export type AttendancePayload = {
  class_id: string;
  date: string;
  students: AttendanceStudent[];
};

export async function getAttendance(
  classId: string,
  date: string,
): Promise<AttendancePayload> {
  const { data } = await api.get<AttendancePayload>('/discipline/attendance', {
    params: { class_id: classId, date },
  });
  return {
    class_id: data?.class_id || classId,
    date: data?.date || date,
    students: data?.students || [],
  };
}

export async function saveAttendanceBulk(
  classId: string,
  date: string,
  records: { student_id: string; status: string }[],
): Promise<void> {
  await api.post('/discipline/attendance/bulk', {
    class_id: classId,
    date,
    records,
  });
}

export type AcademicYear = { id: string; name: string };
export type PeriodItem = { id: string; name: string; order_index?: number; scope?: string };
export type SubjectItem = { id: string; name: string };

export type GradeFormRow = {
  student_id: string;
  student_name: string;
  coefficient?: number;
  grade_value?: number | null;
  detail?: string;
  grade_id?: string | null;
};

export type PreschoolGradeRow = {
  student_id: string;
  student_name: string;
  level: string | null;
  frequency: string | null;
  observation: string;
  grade_id: string | null;
  assignment_id?: string | null;
  decision?: string | null;
};

export async function getAcademicYears(): Promise<AcademicYear[]> {
  const { data } = await api.get('/academic-years');
  return unwrapList<AcademicYear>(data);
}

export async function getPeriods(academicYearId: string): Promise<PeriodItem[]> {
  const { data } = await api.get('/periods', {
    params: { academic_year_id: academicYearId },
  });
  return unwrapList<PeriodItem>(data);
}

export async function getTeacherClasses(): Promise<ClassItem[]> {
  const { data } = await api.get('/teachers/me/classes');
  return unwrapList<ClassItem>(data);
}

export type UpcomingBirthday = {
  student_id: string;
  first_name: string;
  last_name: string;
  class_id: string | null;
  class_name: string | null;
  room_id: string | null;
  room_name: string | null;
  birth_date: string;
  turning_age: number | null;
  when: 'today' | 'tomorrow';
};

export async function getUpcomingBirthdays(): Promise<{
  today: string;
  tomorrow: string;
  birthdays: UpcomingBirthday[];
}> {
  const { data } = await api.get('/teachers/me/upcoming-birthdays');
  return {
    today: data?.today ?? '',
    tomorrow: data?.tomorrow ?? '',
    birthdays: data?.birthdays ?? [],
  };
}

export type HomeworkKind = 'DEVOIR' | 'LECON';

export type HomeworkAssignment = {
  id: string;
  kind: HomeworkKind;
  title: string;
  instructions: string | null;
  due_date: string | null;
  class_id: string | null;
  class_name: string | null;
  subject_name: string | null;
  score?: string | null;
  comment?: string | null;
  students?: {
    student_id: string;
    first_name: string;
    last_name: string;
    score: string | null;
    comment: string | null;
  }[];
};

export async function listHomework(classId?: string): Promise<HomeworkAssignment[]> {
  const { data } = await api.get('/homework', { params: classId ? { class_id: classId } : undefined });
  return data?.assignments || [];
}

export async function getHomework(id: string): Promise<HomeworkAssignment> {
  const { data } = await api.get(`/homework/${id}`);
  return data.assignment;
}

export async function createHomework(body: {
  kind: HomeworkKind;
  title: string;
  instructions?: string | null;
  due_date?: string | null;
  class_id: string;
  subject_id?: string | null;
}): Promise<HomeworkAssignment> {
  const { data } = await api.post('/homework', body);
  return data.assignment;
}

export async function saveHomeworkGrade(
  id: string,
  body: { student_id: string; score?: string | null; comment?: string | null },
): Promise<HomeworkAssignment> {
  const { data } = await api.put(`/homework/${id}/grades`, body);
  return data.assignment;
}

export async function getStudentHomework(studentId: string): Promise<HomeworkAssignment[]> {
  const { data } = await api.get(`/homework/student/${studentId}`);
  return data?.assignments || [];
}

export async function saveSlotMaterials(slotId: string, materials: string | null): Promise<void> {
  await api.patch(`/teachers/me/schedule-slots/${slotId}/materials`, { materials });
}

export async function getTeacherSubjectsInClass(classId: string): Promise<SubjectItem[]> {
  const { data } = await api.get(`/teachers/me/classes/${classId}/subjects`);
  return unwrapList<SubjectItem>(data);
}

export async function getClassSubjects(classId: string): Promise<SubjectItem[]> {
  const { data } = await api.get(`/classes/${classId}/subjects`);
  return unwrapList<SubjectItem>(data);
}

export async function getGradesFormData(params: {
  academic_year_id: string;
  class_id: string;
  subject_id: string;
  period_id: string;
  preschool?: boolean;
}): Promise<{
  rows: GradeFormRow[] | PreschoolGradeRow[];
  can_edit: boolean;
  default_coefficient?: number | null;
  teacher?: { id: number; name: string } | null;
  eval_mode?: 'LEVEL' | 'FREQUENCY';
  is_last_period?: boolean;
}> {
  const path = params.preschool ? '/grades/preschool/form-data' : '/grades/form-data';
  const { data } = await api.get(path, {
    params: {
      academic_year_id: params.academic_year_id,
      class_id: params.class_id,
      subject_id: params.subject_id,
      period_id: params.period_id,
    },
  });
  const payload = data as {
    rows?: GradeFormRow[] | PreschoolGradeRow[];
    can_edit?: boolean;
    default_coefficient?: number | null;
    teacher?: { id: number; name: string } | null;
    eval_mode?: 'LEVEL' | 'FREQUENCY';
    is_last_period?: boolean;
  };
  return {
    rows: payload.rows || [],
    can_edit: payload.can_edit !== false,
    default_coefficient: payload.default_coefficient ?? null,
    teacher: payload.teacher ?? null,
    eval_mode: payload.eval_mode === 'FREQUENCY' ? 'FREQUENCY' : 'LEVEL',
    is_last_period: !!payload.is_last_period,
  };
}

export async function setSubjectPreschoolEval(
  id: string,
  preschool_eval: 'LEVEL' | 'FREQUENCY',
): Promise<void> {
  await api.patch(`/subjects/${id}`, { preschool_eval });
}

export async function saveGrades(body: {
  academic_year_id: string;
  class_id: string;
  subject_id: string;
  period_id: string;
  preschool?: boolean;
  grades:
    | {
        student_id: string;
        coefficient: number;
        grade_value: number | null;
        detail?: string;
      }[]
    | {
        student_id: string;
        level?: string;
        frequency?: string;
        observation?: string;
      }[];
  decisions?: { assignment_id: string; decision?: string | null }[];
}): Promise<void> {
  const path = body.preschool ? '/grades/preschool/save' : '/grades/save';
  await api.post(path, {
    academic_year_id: body.academic_year_id,
    class_id: body.class_id,
    subject_id: body.subject_id,
    period_id: body.period_id,
    grades: body.grades,
    ...(body.decisions ? { decisions: body.decisions } : {}),
  });
}

export type FeeService = { id: string; name: string; code?: string | null; nature?: string | null };
export type BankAccountOption = {
  id: string;
  label: string;
  bank_id?: string;
  bank_name?: string;
  account_name?: string;
};
export type PaymentTransaction = {
  id: string;
  student_id?: string;
  student_name?: string;
  class_id?: string;
  class_name?: string;
  academic_year?: string;
  service_id?: string;
  service_name?: string;
  amount_paid?: number;
  payment_date?: string;
  cancelled_at?: string | null;
};

export async function getFeeServices(): Promise<FeeService[]> {
  const { data } = await api.get('/economat/fee-services');
  return unwrapList<FeeService>(data);
}

export async function getBankAccounts(): Promise<BankAccountOption[]> {
  const { data } = await api.get('/finance/bank-accounts');
  if (data && typeof data === 'object' && Array.isArray((data as { accounts?: unknown }).accounts)) {
    return (data as { accounts: BankAccountOption[] }).accounts;
  }
  return unwrapList<BankAccountOption>(data);
}

export async function getPaymentTransactions(params?: {
  academic_year?: string;
  class_id?: string;
  student_id?: string;
  limit?: number;
  offset?: number;
}): Promise<{ transactions: PaymentTransaction[]; has_more: boolean }> {
  const { data } = await api.get('/economat/transactions', {
    params: {
      academic_year: params?.academic_year,
      class_id: params?.class_id,
      student_id: params?.student_id,
      limit: params?.limit ?? 40,
      offset: params?.offset ?? 0,
    },
  });
  const payload = data as { transactions?: PaymentTransaction[]; has_more?: boolean };
  return {
    transactions: payload.transactions ?? unwrapList<PaymentTransaction>(data),
    has_more: !!payload.has_more,
  };
}

export async function recordPayment(body: {
  student_id: string;
  class_id: string;
  academic_year: string;
  service_id: string;
  amount_paid: number;
  payment_date: string;
  bank_account_id?: string | null;
}): Promise<void> {
  await api.post('/economat/payments', body);
}

export async function cancelPayment(id: string): Promise<void> {
  await api.post(`/economat/payments/${id}/cancel`);
}

export type LatenessItem = {
  id: string;
  student_id?: string;
  student_name?: string;
  class_id?: string;
  class_name?: string;
  date?: string;
  arrival_time?: string;
};

export type DeductionItem = {
  id: string;
  student_id?: string;
  student_name?: string;
  points_deducted?: number;
  reason?: string | null;
  created_at?: string;
};

export type MeasureItem = {
  id: string;
  student_id?: string;
  student_name?: string;
  measure_type?: string;
  reason?: string | null;
  expires_at?: string | null;
  created_at?: string;
};

export async function listLatenesses(params?: {
  class_id?: string;
  date?: string;
  student_id?: string;
}): Promise<LatenessItem[]> {
  const { data } = await api.get('/discipline/latenesses', { params });
  return unwrapList<LatenessItem>(data);
}

export async function createLateness(body: {
  student_id: string;
  class_id: string;
  date: string;
  arrival_time: string;
}): Promise<void> {
  await api.post('/discipline/latenesses', body);
}

export async function deleteLateness(id: string): Promise<void> {
  await api.delete(`/discipline/latenesses/${id}`);
}

export async function listDeductions(studentId?: string): Promise<DeductionItem[]> {
  const { data } = await api.get('/discipline/deductions', {
    params: studentId ? { student_id: studentId } : undefined,
  });
  return unwrapList<DeductionItem>(data);
}

export async function createDeduction(body: {
  student_id: string;
  points_deducted: number;
  reason?: string;
}): Promise<void> {
  await api.post('/discipline/deductions', body);
}

export async function deleteDeduction(id: string): Promise<void> {
  await api.delete(`/discipline/deductions/${id}`);
}

export async function listMeasures(studentId?: string): Promise<MeasureItem[]> {
  const { data } = await api.get('/discipline/measures', {
    params: studentId ? { student_id: studentId } : undefined,
  });
  return unwrapList<MeasureItem>(data);
}

export async function createMeasure(body: {
  student_id: string;
  measure_type: string;
  reason?: string;
  duration_days?: number;
}): Promise<void> {
  await api.post('/discipline/measures', body);
}

export async function deleteMeasure(id: string): Promise<void> {
  await api.delete(`/discipline/measures/${id}`);
}

export type ExpenseItem = {
  id: string;
  expense_date?: string;
  amount?: number;
  label?: string;
  beneficiary?: string | null;
  category?: string | null;
  document_ref?: string | null;
  fee_service_id?: string | null;
  bank_account_id?: string | null;
  statut?: string;
};

export type FinanceActivity = { id: string; name: string };

export async function listExpenses(params?: {
  date_from?: string;
  date_to?: string;
}): Promise<ExpenseItem[]> {
  const { data } = await api.get('/finance/expenses', { params });
  return unwrapList<ExpenseItem>(data);
}

export async function createExpense(body: {
  expense_date: string;
  amount: number;
  label: string;
  beneficiary?: string;
  category?: string;
  document_ref?: string;
  fee_service_id?: string | null;
  bank_account_id?: string | null;
}): Promise<void> {
  await api.post('/finance/expenses', body);
}

export async function validateExpense(id: string): Promise<void> {
  await api.post(`/finance/expenses/${id}/validate`);
}

export async function deleteExpense(id: string): Promise<void> {
  await api.delete(`/finance/expenses/${id}`);
}

export async function listFinanceActivities(): Promise<FinanceActivity[]> {
  const { data } = await api.get('/finance/activities');
  return unwrapList<FinanceActivity>(data);
}

export type AcademicStats = {
  academic_year_id?: string | null;
  academic_year_name?: string | null;
  period_id?: string | null;
  period_name?: string | null;
  overview?: {
    classes?: number;
    students?: number;
    teachers?: number;
    grades?: number;
    graded_students?: number;
    school_average?: number | null;
    success_rate?: number | null;
  };
  distribution?: {
    insuffisant?: number;
    passable?: number;
    bien?: number;
    excellent?: number;
  };
  by_class?: {
    class_id: string;
    class_name: string;
    level?: string | null;
    students?: number;
    graded_students?: number;
    average?: number | null;
    success_rate?: number | null;
  }[];
  by_subject?: {
    subject_id: string;
    subject_name: string;
    grades_count?: number;
    average?: number | null;
  }[];
  by_teacher?: {
    teacher_id: number;
    teacher_name: string;
    assignments?: number;
    grades_count?: number;
    average?: number | null;
  }[];
  top_students?: {
    id: string;
    name: string;
    class_name?: string | null;
    average: number;
  }[];
  bottom_students?: {
    id: string;
    name: string;
    class_name?: string | null;
    average: number;
  }[];
  discipline?: {
    absences?: number;
    presents?: number;
    latenesses?: number;
    deductions_count?: number;
    deductions_points?: number;
  };
};

export type FinancialStats = {
  academic_year?: string;
  date_from?: string;
  date_to?: string;
  overview?: {
    amount_due?: number;
    amount_paid?: number;
    balance?: number;
    collection_rate?: number | null;
    students_total?: number;
    students_with_balance?: number;
    students_fully_paid?: number;
    transactions_count?: number;
  };
  cashflow?: {
    total_entrees?: number;
    total_sorties?: number;
    solde?: number;
    detail_entrees_economat?: number;
    detail_entrees_autres?: number;
    detail_sorties?: number;
  };
  by_class?: {
    class_id: string;
    class_name: string;
    students?: number;
    amount_due?: number;
    amount_paid?: number;
    balance?: number;
    collection_rate?: number | null;
  }[];
  by_service?: {
    service_id: string;
    service_name: string;
    amount_due?: number;
    amount_paid?: number;
    balance?: number;
    collection_rate?: number | null;
  }[];
  by_month?: { month: string; amount: number }[];
  top_debtors?: {
    student_id: string;
    student_name: string;
    class_name?: string | null;
    amount_due?: number;
    amount_paid?: number;
    balance?: number;
  }[];
  banks?: {
    total_balance?: number;
    accounts?: {
      id: string;
      bank_name: string;
      account_name: string;
      account_number?: string | null;
      opening_balance?: number;
      inflows?: number;
      outflows?: number;
      balance?: number;
    }[];
  };
};

export async function getAcademicStats(params: {
  academic_year_id: string;
  period_id?: string;
}): Promise<AcademicStats> {
  try {
    const { data } = await api.get<AcademicStats>('/statistics/academic', { params });
    return data ?? {};
  } catch (err) {
    throw new Error(axiosMessage(err, 'Stats académiques indisponibles'));
  }
}

export async function getFinancialStats(params: {
  academic_year: string;
  date_from?: string;
  date_to?: string;
}): Promise<FinancialStats> {
  try {
    const { data } = await api.get<FinancialStats>('/statistics/financial', { params });
    return data ?? {};
  } catch (err) {
    throw new Error(axiosMessage(err, 'Stats financières indisponibles'));
  }
}

export type StudentWriteBody = {
  order_number?: string | null;
  first_name: string;
  last_name: string;
  class_id: string;
  room_id?: string | null;
  academic_year_id?: string;
  email?: string;
  phone?: string;
  address?: string;
  birth_date?: string;
  birth_place?: string;
  gender?: string;
  photo_identity_student?: string;
  photo_identity_mother?: string;
  photo_identity_father?: string;
  photo_identity_responsible?: string;
  mother_name?: string;
  mother_phone?: string;
  father_name?: string;
  father_phone?: string;
  responsible_name?: string;
  responsible_phone?: string;
};

export async function createStudent(
  body: StudentWriteBody,
): Promise<StudentListItem> {
  try {
    const { data } = await api.post<{ student?: StudentListItem }>('/students', body);
    if (!data?.student) throw new Error('Réponse invalide');
    return data.student;
  } catch (err) {
    throw new Error(axiosMessage(err, 'Création impossible'));
  }
}

export async function updateStudent(
  id: string,
  body: Partial<StudentWriteBody>,
): Promise<StudentListItem> {
  try {
    const { data } = await api.patch<{ student?: StudentListItem }>(`/students/${id}`, body);
    if (!data?.student) throw new Error('Réponse invalide');
    return data.student;
  } catch (err) {
    throw new Error(axiosMessage(err, 'Mise à jour impossible'));
  }
}

export type FormationStudent = {
  id: string;
  first_name: string;
  last_name: string;
  order_number?: string | null;
  room_id?: string | null;
  room_name?: string | null;
  decision?: string | null;
  average?: number | null;
  assignment_id?: string | null;
};

export async function getFormationStudents(
  academicYearId: string,
  classId: string,
): Promise<FormationStudent[]> {
  const { data } = await api.get('/formation-classe/students', {
    params: { academic_year_id: academicYearId, class_id: classId },
  });
  return unwrapList<FormationStudent>(data);
}

export async function computeFormationDecisions(
  academicYearId: string,
  classId: string,
): Promise<void> {
  await api.post('/formation-classe/compute-decisions', {
    academic_year_id: academicYearId,
    class_id: classId,
  });
}

export async function setFormationDecision(
  assignmentId: string,
  decision: string,
): Promise<void> {
  await api.patch(`/formation-classe/assignments/${assignmentId}/decision`, {
    decision,
  });
}

export async function moveFormationStudent(
  studentId: string,
  academicYearId: string,
  classId: string,
): Promise<void> {
  await api.post('/formation-classe/move-student', {
    student_id: studentId,
    academic_year_id: academicYearId,
    class_id: classId,
  });
}

/* ——— Organisation CRUD ——— */

export type SubjectOrg = {
  id: string;
  name: string;
  code?: string | null;
  active?: boolean;
  audience?: string;
  section?: string | null;
  preschool_eval?: 'LEVEL' | 'FREQUENCY';
};

export type ClassOrg = ClassItem & {
  section?: string | null;
  room_count?: number;
  student_count?: number;
  subject_ids?: string[];
};

export type PeriodOrg = PeriodItem & {
  academic_year_id?: string;
  academic_year_name?: string;
};

export type AcademicYearOrg = AcademicYear & {
  start_date?: string | null;
  end_date?: string | null;
  active?: boolean;
};

export type TeacherClassSubject = {
  id: string;
  class_id: string;
  class_name?: string;
  subject_id: string;
  subject_name?: string;
  room_id?: string | null;
  room_name?: string;
};

export type TeacherDetail = TeacherItem & {
  classes?: { id: string; class_id: string; class_name: string; is_main: boolean }[];
  subjects?: { id: string; subject_id: string; subject_name: string }[];
  class_subjects?: TeacherClassSubject[];
};

export type OrgUser = {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
  phone?: string | null;
  role?: string | null;
  active?: boolean;
  profile_photo_url?: string | null;
  linked_student_ids?: string[];
};

export type RoleItem = {
  id: number;
  name: string;
  description?: string | null;
  permissions?: string[];
};

export type SchoolSignature = {
  id?: string | null;
  slot_key: string;
  signer_name?: string;
  signer_role?: string;
  image_url?: string | null;
  sort_order?: number;
};

export async function listSubjects(): Promise<SubjectOrg[]> {
  const { data } = await api.get('/subjects');
  return unwrapList<SubjectOrg>(data);
}

export async function createSubject(body: {
  name: string;
  code?: string;
  audience?: string;
  section?: string | null;
  preschool_eval?: 'LEVEL' | 'FREQUENCY';
}): Promise<SubjectOrg> {
  const { data } = await api.post<{ subject?: SubjectOrg }>('/subjects', body);
  if (!data?.subject) throw new Error('Matière non créée');
  return data.subject;
}

export async function updateSubject(
  id: string,
  body: {
    name?: string;
    code?: string;
    active?: boolean;
    audience?: string;
    section?: string | null;
    preschool_eval?: 'LEVEL' | 'FREQUENCY';
  },
): Promise<void> {
  await api.patch(`/subjects/${id}`, body);
}

export async function deleteSubject(id: string): Promise<void> {
  await api.delete(`/subjects/${id}`);
}

export type BringCatalogItem = { id: string; label: string };

export async function listBringItemCatalog(): Promise<BringCatalogItem[]> {
  const { data } = await api.get('/bring-item-catalog');
  return Array.isArray(data?.catalog) ? data.catalog : [];
}

export async function createBringCatalogItem(label: string): Promise<BringCatalogItem> {
  const { data } = await api.post<{ item?: BringCatalogItem }>('/bring-item-catalog', { label });
  if (!data?.item) throw new Error('Matériel non créé');
  return data.item;
}

export async function updateBringCatalogItem(id: string, label: string): Promise<void> {
  await api.patch(`/bring-item-catalog/${id}`, { label });
}

export async function deleteBringCatalogItem(id: string): Promise<void> {
  await api.delete(`/bring-item-catalog/${id}`);
}

export async function listClassesOrg(): Promise<ClassOrg[]> {
  const { data } = await api.get('/classes');
  return unwrapList<ClassOrg>(data);
}

export async function getClassDetail(id: string): Promise<ClassOrg | null> {
  const { data } = await api.get<{ class?: ClassOrg }>(`/classes/${id}`);
  return data?.class ?? null;
}

export async function createClass(body: {
  name: string;
  description?: string;
  level?: string;
  section?: string;
  subject_ids?: string[];
}): Promise<ClassOrg> {
  const { data } = await api.post<{ class?: ClassOrg }>('/classes', body);
  if (!data?.class) throw new Error('Classe non créée');
  return data.class;
}

export async function updateClass(
  id: string,
  body: {
    name?: string;
    description?: string;
    level?: string;
    section?: string;
    active?: boolean;
    subject_ids?: string[];
  },
): Promise<void> {
  await api.patch(`/classes/${id}`, body);
}

export async function deleteClass(id: string): Promise<void> {
  await api.delete(`/classes/${id}`);
}

export async function createRoom(body: {
  name: string;
  description?: string;
  capacity?: number | null;
  class_id?: string | null;
}): Promise<RoomItem> {
  const { data } = await api.post<{ room?: RoomItem }>('/rooms', body);
  if (!data?.room) throw new Error('Salle non créée');
  return data.room;
}

export async function updateRoom(
  id: string,
  body: {
    name?: string;
    description?: string;
    capacity?: number | null;
    class_id?: string | null;
    active?: boolean;
  },
): Promise<void> {
  await api.patch(`/rooms/${id}`, body);
}

export async function deleteRoom(id: string): Promise<void> {
  await api.delete(`/rooms/${id}`);
}

export async function listAcademicYearsOrg(): Promise<AcademicYearOrg[]> {
  const { data } = await api.get('/academic-years');
  return unwrapList<AcademicYearOrg>(data);
}

export async function createAcademicYear(body: {
  name: string;
  start_date?: string;
  end_date?: string;
}): Promise<void> {
  await api.post('/academic-years', body);
}

export async function updateAcademicYear(
  id: string,
  body: Partial<{
    name: string;
    start_date: string;
    end_date: string;
    active: boolean;
  }>,
): Promise<void> {
  await api.patch(`/academic-years/${id}`, body);
}

export async function deleteAcademicYear(id: string): Promise<void> {
  await api.delete(`/academic-years/${id}`);
}

export async function createPeriod(body: {
  academic_year_id: string;
  name: string;
  order_index?: number;
  scope?: string;
}): Promise<void> {
  await api.post('/periods', body);
}

export async function updatePeriod(
  id: string,
  body: { name?: string; order_index?: number; scope?: string },
): Promise<void> {
  await api.patch(`/periods/${id}`, body);
}

export async function deletePeriod(id: string): Promise<void> {
  await api.delete(`/periods/${id}`);
}

export async function patchSchoolProfile(body: {
  current_academic_year_id?: string | null;
  current_period_id?: string | null;
  current_preschool_period_id?: string | null;
  name?: string;
  slogan?: string | null;
  domain?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  primary_color?: string;
  secondary_color?: string;
  logo_url?: string | null;
  signatures?: SchoolSignature[];
}): Promise<{ school?: SchoolHome; signatures?: SchoolSignature[] }> {
  const { data } = await api.patch<{
    school?: SchoolHome;
    signatures?: SchoolSignature[];
  }>('/school/profile', body);
  return data ?? {};
}

export async function listSchoolSignatures(): Promise<SchoolSignature[]> {
  const { data } = await api.get('/school/signatures');
  return unwrapList<SchoolSignature>(data);
}

export async function getTeacherDetail(id: number): Promise<TeacherDetail | null> {
  const { data } = await api.get<{ teacher?: TeacherDetail }>(`/teachers/${id}`);
  return data?.teacher ?? null;
}

export type TeacherAssignment = {
  id: string;
  teacher_id: number;
  teacher_name: string;
  teacher_photo_url?: string | null;
  class_id: string;
  subject_id: string;
  subject_name: string;
  room_id: string | null;
  room_name: string;
};

export async function listTeacherAssignments(params?: {
  class_id?: string;
  room_id?: string;
}): Promise<TeacherAssignment[]> {
  const { data } = await api.get('/teachers/assignments', { params });
  return unwrapList<TeacherAssignment>(data);
}

export async function searchStaffTeachers(q?: string): Promise<TeacherItem[]> {
  const { data } = await api.get('/teachers/staff-search', {
    params: q?.trim() ? { q: q.trim() } : undefined,
  });
  return unwrapList<TeacherItem>(data);
}

export async function promoteToTeacher(userId: number): Promise<TeacherItem> {
  const { data } = await api.post<{ teacher?: TeacherItem }>('/teachers/promote', {
    user_id: userId,
  });
  if (!data?.teacher) throw new Error('Promotion impossible');
  return data.teacher;
}

export async function createTeacher(body: {
  first_name?: string;
  last_name?: string;
  email: string;
  phone?: string;
  password: string;
  profile_photo_url?: string;
}): Promise<TeacherItem> {
  const { data } = await api.post<{ teacher?: TeacherItem }>('/teachers', body);
  if (!data?.teacher) throw new Error('Compte professeur non créé');
  return data.teacher;
}

export async function addTeacherClassSubject(
  teacherId: number,
  body: {
    class_id: string;
    room_id: string;
    subject_id?: string;
    subject_ids?: string[];
  },
): Promise<void> {
  await api.post(`/teachers/${teacherId}/class-subjects`, body);
}

export async function removeTeacherClassSubject(
  teacherId: number,
  assignmentId: string,
): Promise<void> {
  await api.delete(`/teachers/${teacherId}/class-subjects/${assignmentId}`);
}

export type UsersPage = {
  users: OrgUser[];
  total: number;
  page: number;
  take: number;
};

export async function listUsers(params?: {
  q?: string;
  role?: string;
  exclude_role?: string;
  page?: number;
  take?: number;
}): Promise<UsersPage> {
  try {
    const { data } = await api.get('/users', {
      params: {
        page: params?.page ?? 1,
        take: params?.take ?? 25,
        ...(params?.q ? { q: params.q } : {}),
        ...(params?.role ? { role: params.role } : {}),
        ...(params?.exclude_role ? { exclude_role: params.exclude_role } : {}),
      },
    });
    const payload = data as { total?: number; page?: number; take?: number };
    return {
      users: unwrapList<OrgUser>(data),
      total: Number(payload?.total) || 0,
      page: Number(payload?.page) || (params?.page ?? 1),
      take: Number(payload?.take) || (params?.take ?? 25),
    };
  } catch (err) {
    throw new Error(axiosMessage(err, 'Impossible de charger les utilisateurs'));
  }
}

export async function getUser(id: number): Promise<OrgUser> {
  const { data } = await api.get<{ user?: OrgUser }>(`/users/${id}`);
  if (!data?.user) throw new Error('Utilisateur introuvable');
  return data.user;
}

export async function setUserRole(userId: number, roleName: string): Promise<void> {
  await api.patch(`/users/${userId}/role`, { roleName });
}

export async function createUser(body: {
  first_name?: string;
  last_name?: string;
  email: string;
  phone?: string;
  password: string;
  roleName?: string;
  linked_student_ids?: string[];
}): Promise<OrgUser> {
  const { data } = await api.post<{ user?: OrgUser }>('/users', body);
  if (!data?.user) throw new Error('Création utilisateur échouée');
  return data.user;
}

export async function updateUser(
  id: number,
  body: Partial<{
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    active: boolean;
    password: string;
    linked_student_ids: string[];
  }>,
): Promise<OrgUser> {
  const { data } = await api.patch<{ user?: OrgUser }>(`/users/${id}`, body);
  if (!data?.user) throw new Error('Mise à jour échouée');
  return data.user;
}

export async function resetUserPassword(
  id: number,
  newPassword: string,
): Promise<void> {
  await api.post(`/users/${id}/reset-password`, { newPassword });
}

export async function deleteUser(id: number): Promise<void> {
  await api.delete(`/users/${id}`);
}

export async function listRoles(): Promise<RoleItem[]> {
  try {
    const { data } = await api.get('/roles');
    return unwrapList<RoleItem>(data);
  } catch (err) {
    throw new Error(axiosMessage(err, 'Impossible de charger les rôles'));
  }
}

export async function findStudentByOrderNumber(
  orderNumber: string,
): Promise<{ id: string; first_name?: string; last_name?: string; order_number?: string | null } | null> {
  try {
    const { data } = await api.get<{
      ok?: boolean;
      student?: {
        id: string;
        first_name?: string;
        last_name?: string;
        order_number?: string | null;
      } | null;
    }>(`/students/by-order-number/${encodeURIComponent(orderNumber)}`);
    if (!data?.ok || !data.student) return null;
    return data.student;
  } catch {
    return null;
  }
}

/* ——— Finance avancée ——— */

export type FinanceBankAccount = {
  id: string;
  bank_id: string;
  name: string;
  account_number?: string | null;
  opening_balance?: number;
  active?: boolean;
  balance?: number;
};

export type FinanceBank = {
  id: string;
  name: string;
  active?: boolean;
  accounts?: FinanceBankAccount[];
};

export type FinanceExercice = {
  id: string;
  date_debut: string;
  date_fin: string;
  statut: string;
};

export type LedgerAccount = {
  id: string;
  code: string;
  label: string;
  type: string;
};

export type JournalEntry = {
  id: string;
  entry_date?: string;
  label?: string;
  source?: string;
  lines?: {
    account_code?: string;
    account_label?: string;
    debit?: number;
    credit?: number;
  }[];
};

export type BalanceLine = {
  account_code?: string;
  account_label?: string;
  total_debit?: number;
  total_credit?: number;
  solde?: number;
};

export type OtherRevenue = {
  id: string;
  revenue_date?: string;
  amount?: number;
  label?: string;
  category?: string | null;
  fee_service_id?: string | null;
};

export async function listFinanceBanks(): Promise<FinanceBank[]> {
  const { data } = await api.get('/finance/banks');
  return unwrapList<FinanceBank>(data);
}

export async function createFinanceBank(name: string): Promise<void> {
  await api.post('/finance/banks', { name });
}

export async function deleteFinanceBank(id: string): Promise<void> {
  await api.delete(`/finance/banks/${id}`);
}

export async function createFinanceBankAccount(body: {
  bank_id: string;
  name: string;
  account_number?: string | null;
  opening_balance?: number;
}): Promise<void> {
  await api.post('/finance/bank-accounts', body);
}

export async function deleteFinanceBankAccount(id: string): Promise<void> {
  await api.delete(`/finance/bank-accounts/${id}`);
}

export async function listFinanceExercices(): Promise<FinanceExercice[]> {
  const { data } = await api.get('/finance/exercices');
  return unwrapList<FinanceExercice>(data);
}

export async function getOpenFinanceExercice(): Promise<FinanceExercice | null> {
  const { data } = await api.get<{ exercice?: FinanceExercice | null }>(
    '/finance/exercices/open',
  );
  return data?.exercice ?? null;
}

export async function openFirstFinanceExercice(body: {
  date_debut: string;
  date_fin: string;
}): Promise<void> {
  await api.post('/finance/exercices/open-first', body);
}

export async function openNextFinanceExercice(body: {
  date_debut: string;
  date_fin: string;
}): Promise<void> {
  await api.post('/finance/exercices/open-next', body);
}

export async function closeFinanceExercice(id: string): Promise<void> {
  await api.patch(`/finance/exercices/${id}/close`);
}

export async function listLedgerAccounts(): Promise<LedgerAccount[]> {
  const { data } = await api.get('/finance/accounts');
  return unwrapList<LedgerAccount>(data);
}

export async function createLedgerAccount(body: {
  code: string;
  label: string;
  type: string;
}): Promise<void> {
  await api.post('/finance/accounts', body);
}

export async function suggestLedgerAccountType(
  code: string,
): Promise<{ type?: string; label_suggestion?: string }> {
  const { data } = await api.get<{ type?: string; label_suggestion?: string }>(
    '/finance/accounts/suggest-type',
    { params: { code } },
  );
  return data ?? {};
}

export async function listJournalEntries(params?: {
  exercice_id?: string;
  date_from?: string;
  date_to?: string;
}): Promise<JournalEntry[]> {
  const { data } = await api.get('/finance/entries', { params });
  return unwrapList<JournalEntry>(data);
}

export async function createJournalEntry(body: {
  exercice_id: string;
  entry_date: string;
  label: string;
  source: string;
  source_ref?: string;
  lines: { account_id: string; debit: number; credit: number; line_label?: string }[];
}): Promise<void> {
  await api.post('/finance/entries', body);
}

export async function getFinanceBalance(exerciceId: string): Promise<BalanceLine[]> {
  const { data } = await api.get('/finance/balance', {
    params: { exercice_id: exerciceId },
  });
  return unwrapList<BalanceLine>(data);
}

export async function listOtherRevenues(params?: {
  date_from?: string;
  date_to?: string;
}): Promise<OtherRevenue[]> {
  const { data } = await api.get('/finance/other-revenues', { params });
  return unwrapList<OtherRevenue>(data);
}

export async function createOtherRevenue(body: {
  revenue_date: string;
  amount: number;
  label: string;
  category?: string;
  fee_service_id?: string | null;
}): Promise<void> {
  await api.post('/finance/other-revenues', body);
}

export { api };
