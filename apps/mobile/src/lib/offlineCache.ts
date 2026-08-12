import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SchoolContext, SchoolHome, StudentListItem } from '../services/api';

const KEYS = {
  schoolHome: 'sm_cache_school_home',
  schoolContext: 'sm_cache_school_context',
  students: 'sm_cache_students',
  studentPrefix: 'sm_cache_student:',
  recentFiches: 'sm_cache_recent_fiches',
} as const;

const MAX_RECENT = 20;

async function setJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / storage errors
  }
}

async function getJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSchoolHome(home: SchoolHome | null): Promise<void> {
  await setJson(KEYS.schoolHome, home);
}

export async function readCachedSchoolHome(): Promise<SchoolHome | null> {
  return getJson<SchoolHome>(KEYS.schoolHome);
}

export async function cacheSchoolContext(ctx: SchoolContext | null): Promise<void> {
  await setJson(KEYS.schoolContext, ctx);
}

export async function readCachedSchoolContext(): Promise<SchoolContext | null> {
  return getJson<SchoolContext>(KEYS.schoolContext);
}

export async function cacheStudentsList(students: StudentListItem[]): Promise<void> {
  await setJson(KEYS.students, students);
}

export async function readCachedStudentsList(): Promise<StudentListItem[]> {
  return (await getJson<StudentListItem[]>(KEYS.students)) ?? [];
}

export async function cacheStudentFiche(student: StudentListItem): Promise<void> {
  await setJson(`${KEYS.studentPrefix}${student.id}`, student);
  const recent = (await getJson<string[]>(KEYS.recentFiches)) ?? [];
  const next = [student.id, ...recent.filter((id) => id !== student.id)].slice(0, MAX_RECENT);
  await setJson(KEYS.recentFiches, next);
}

export async function readCachedStudentFiche(
  studentId: string,
): Promise<StudentListItem | null> {
  return getJson<StudentListItem>(`${KEYS.studentPrefix}${studentId}`);
}

export async function readRecentFicheIds(): Promise<string[]> {
  return (await getJson<string[]>(KEYS.recentFiches)) ?? [];
}

export async function clearOfflineCaches(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith('sm_cache_'));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch {
    // ignore
  }
}
