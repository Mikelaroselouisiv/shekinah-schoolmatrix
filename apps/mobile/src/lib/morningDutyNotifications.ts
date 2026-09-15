/**
 * Notification locale la veille d’une affectation (accueil, drapeau, défi…).
 * Même mécanisme que les anniversaires : au login ou au retour au premier plan.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { isParentRole, isTeacherRole } from './permissions';
import {
  getCurrentContext,
  getTeacherClasses,
  listSchoolWeekDuties,
} from '../services/api';
import {
  dutiesForTeacher,
  dutyDisplayTitle,
  tomorrowWeekdayIndex,
} from './morningOpening';

const CHANNEL_ID = 'morning-opening';
const STORAGE_PREFIX = 'morning_duty_notif_v1:';

async function ensurePermissionAndChannel(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  if (status !== 'granted') return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Début de journée',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 100, 180],
    });
  }
  return true;
}

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

function todayKey(now = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
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
    const allowed = await ensurePermissionAndChannel();
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

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Début de journée demain',
        body,
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: null,
    });
    await markSent(storageKey);
  } catch {
    // ignore
  }
}
