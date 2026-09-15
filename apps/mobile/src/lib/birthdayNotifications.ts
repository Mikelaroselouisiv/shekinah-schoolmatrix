/**
 * Notifications locales d’anniversaire — professeur connecté.
 * Pas de FCM : la notif part quand l’app est ouverte avec une session professeur
 * (login ou retour au premier plan), une fois par jour.
 */

import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { isTeacherRole } from './permissions';
import { getUpcomingBirthdays, type UpcomingBirthday } from '../services/api';

const CHANNEL_ID = 'birthdays';
const STORAGE_PREFIX = 'birthday_notif_v1:';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
      name: 'Anniversaires',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 100, 180],
    });
  }
  return true;
}

function studentLabel(s: UpcomingBirthday): string {
  const name = `${s.first_name} ${s.last_name}`.trim();
  const place = [s.class_name, s.room_name].filter(Boolean).join(' · ');
  return place ? `${name} (${place})` : name;
}

function buildBody(when: 'today' | 'tomorrow', list: UpcomingBirthday[]): {
  title: string;
  body: string;
} {
  const names = list.map(studentLabel);
  const head = names[0];
  const extra = names.length - 1;
  if (when === 'tomorrow') {
    return {
      title: extra > 0 ? 'Anniversaires demain' : 'Anniversaire demain',
      body:
        extra > 0
          ? `Demain, c’est l’anniversaire de ${head} et ${extra} autre${extra > 1 ? 's' : ''} élève${extra > 1 ? 's' : ''} de vos salles.`
          : `Demain, c’est l’anniversaire de ${head}.`,
    };
  }
  return {
    title: extra > 0 ? 'Anniversaires aujourd’hui' : 'Anniversaire aujourd’hui',
    body:
      extra > 0
        ? `Aujourd’hui, c’est l’anniversaire de ${head} et ${extra} autre${extra > 1 ? 's' : ''} élève${extra > 1 ? 's' : ''} de vos salles.`
        : `Aujourd’hui, c’est l’anniversaire de ${head}.`,
  };
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

async function present(when: 'today' | 'tomorrow', list: UpcomingBirthday[], dayKey: string) {
  if (!list.length) return;
  const storageKey = `${dayKey}:${when}`;
  if (await alreadySent(storageKey)) return;
  const allowed = await ensurePermissionAndChannel();
  if (!allowed) return;
  const { title, body } = buildBody(when, list);
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
    },
    trigger: null,
  });
  await markSent(storageKey);
}

export async function syncTeacherBirthdayNotifications(roleName: string): Promise<UpcomingBirthday[]> {
  if (!isTeacherRole(roleName)) return [];
  try {
    const data = await getUpcomingBirthdays();
    const today = data.birthdays.filter((b) => b.when === 'today');
    const tomorrow = data.birthdays.filter((b) => b.when === 'tomorrow');
    // Priorité : prévenir la veille. Le jour même si le prof ouvre l’app ce matin-là.
    await present('tomorrow', tomorrow, data.today || 'unknown');
    await present('today', today, data.today || 'unknown');
    return data.birthdays;
  } catch {
    return [];
  }
}

export async function clearBirthdayNotificationState(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(STORAGE_PREFIX));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch {
    // ignore
  }
}

export function subscribeAppResume(onActive: () => void): () => void {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') onActive();
  });
  return () => sub.remove();
}
