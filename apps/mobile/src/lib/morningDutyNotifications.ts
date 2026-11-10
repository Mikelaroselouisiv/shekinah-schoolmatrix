/**
 * Notification locale la veille d’une affectation (accueil, drapeau, défi…).
 * Même mécanisme que les anniversaires : au login ou au retour au premier plan.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureNotificationChannel, presentNotificationNow } from './localNotifications';
import { isParentRole, isTeacherRole } from './permissions';
import {
  getCurrentContext,
  getTeacherClasses,
  listSchoolWeekDuties,
} from '../services/api';
import { toYYYYMMDD } from './format';
import {
  dutiesForTeacher,
  dutyDisplayTitle,
  tomorrowWeekdayIndex,
} from './morningOpening';

const CHANNEL_ID = 'morning-opening';
const STORAGE_PREFIX = 'morning_duty_notif_v1:';

async function alreadySent(key: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(STORAGE_PREFIX + key)) === '1';
  } catch {
    return false;
  }
}

async function markSent(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_PREFIX + key, '1');
  } catch {
    // ignore
  }
}

function todayKey(): string {
  return toYYYYMMDD();
}

export async function syncMorningDutyNotifications(
  roleName: string,
  userId?: number | null,
): Promise<void> {
  if (isParentRole(roleName) || userId == null) return;
  const tomorrow = tomorrowWeekdayIndex();
  if (tomorrow < 1 || tomorrow > 5) return;

  try {
    const ctx = await getCurrentContext();
    const yearName = ctx?.academic_year?.name || ctx?.current_academic_year_name || undefined;
    const classes = isTeacherRole(roleName) ? await getTeacherClasses() : [];
    const duties = await listSchoolWeekDuties({ academic_year: yearName });
    const mine = dutiesForTeacher(
      duties,
      userId,
      classes.map((c) => c.id),
    ).filter((d) => d.day_of_week === tomorrow);
    if (!mine.length) return;

    const dayKey = todayKey();
    const storageKey = `${dayKey}:${userId}:${tomorrow}`;
    if (await alreadySent(storageKey)) return;
    const allowed = await ensureNotificationChannel(CHANNEL_ID, 'Début de journée');
    if (!allowed) return;

    const lines = mine.map((d) => {
      const kind = (d.kind || '').toUpperCase();
      if (kind === 'FLAG' && d.class_id) {
        return d.class_name
          ? `votre classe ${d.class_name} est responsable de la montée du drapeau`
          : 'votre classe est responsable de la montée du drapeau';
      }
      const title = dutyDisplayTitle(d).toLowerCase();
      if (kind === 'DEFI') return `vous êtes responsable du ${title}`;
      if (kind === 'ACCUEIL' || kind === 'ANIMATION') return `vous êtes responsable de l’${title}`;
      return `vous êtes responsable de la ${title}`;
    });
    const unique = [...new Set(lines)];
    const body =
      unique.length === 1
        ? `Demain, ${unique[0]}.`
        : `Demain : ${unique.join(' ; ')}.`;

    await presentNotificationNow(CHANNEL_ID, 'Début de journée demain', body);
    await markSent(storageKey);
  } catch {
    // ignore
  }
}
