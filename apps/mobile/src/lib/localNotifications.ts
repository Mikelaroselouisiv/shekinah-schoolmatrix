import { AppState, Platform } from 'react-native';

/**
 * Expo Go (SDK 53+) plante si on importe `expo-notifications` : le point
 * d’entrée enregistre un listener de push Android et lève une erreur.
 * On charge seulement les notifications locales, pas le push distant.
 */

type PermissionStatus = {
  status: string;
  granted?: boolean;
  ios?: { status?: number; allowsAlert?: boolean; allowsSound?: boolean };
};

type LocalNotifications = {
  getPermissionsAsync: () => Promise<PermissionStatus>;
  requestPermissionsAsync: (permissions?: {
    ios?: { allowAlert?: boolean; allowBadge?: boolean; allowSound?: boolean };
  }) => Promise<PermissionStatus>;
  setNotificationChannelAsync: (
    id: string,
    channel: { name: string; importance: number; vibrationPattern: number[] },
  ) => Promise<unknown>;
  scheduleNotificationAsync: (request: {
    content: { title: string; body: string; sound: boolean | string; channelId?: string };
    trigger: null | { type: 'timeInterval'; seconds: number; repeats: false };
  }) => Promise<string>;
  AndroidImportance: { HIGH: number };
};

function loadLocalNotifications(): LocalNotifications | null {
  try {
    const permissions = require('expo-notifications/build/NotificationPermissions') as Pick<
      LocalNotifications,
      'getPermissionsAsync' | 'requestPermissionsAsync'
    >;
    const handler = require('expo-notifications/build/NotificationsHandler') as {
      setNotificationHandler: (handler: {
        handleNotification: () => Promise<{
          shouldShowAlert: boolean;
          shouldPlaySound: boolean;
          shouldSetBadge: boolean;
          shouldShowBanner: boolean;
          shouldShowList: boolean;
        }>;
      }) => void;
    };
    const channel = require('expo-notifications/build/setNotificationChannelAsync') as Pick<
      LocalNotifications,
      'setNotificationChannelAsync'
    >;
    const schedule = require('expo-notifications/build/scheduleNotificationAsync') as Pick<
      LocalNotifications,
      'scheduleNotificationAsync'
    >;
    const types = require('expo-notifications/build/NotificationChannelManager.types') as Pick<
      LocalNotifications,
      'AndroidImportance'
    >;
    handler.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    return {
      getPermissionsAsync: permissions.getPermissionsAsync,
      requestPermissionsAsync: permissions.requestPermissionsAsync,
      setNotificationChannelAsync: channel.setNotificationChannelAsync,
      scheduleNotificationAsync: schedule.scheduleNotificationAsync,
      AndroidImportance: types.AndroidImportance,
    };
  } catch {
    return null;
  }
}

const notifications = loadLocalNotifications();

function alertsAllowed(settings: PermissionStatus): boolean {
  if (settings.granted || settings.status === 'granted') return true;
  const iosStatus = settings.ios?.status;
  // Autorisé, provisoire ou éphémère.
  if (iosStatus === 2 || iosStatus === 3 || iosStatus === 4) return true;
  return !!settings.ios?.allowsAlert;
}

function whenAppIsActive(): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve) => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        sub.remove();
        resolve();
      }
    });
  });
}

export async function ensureNotificationChannel(channelId: string, name: string): Promise<boolean> {
  if (!notifications) return false;
  if (Platform.OS === 'ios') await whenAppIsActive();
  let settings = await notifications.getPermissionsAsync();
  if (!alertsAllowed(settings)) {
    settings = await notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
  }
  if (!alertsAllowed(settings)) return false;
  if (Platform.OS === 'android') {
    await notifications.setNotificationChannelAsync(channelId, {
      name,
      importance: notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 100, 180],
    });
  }
  return true;
}

export async function presentNotificationNow(
  channelId: string,
  title: string,
  body: string,
): Promise<void> {
  if (!notifications) return;
  await notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: Platform.OS === 'ios' ? 'default' : true,
      ...(Platform.OS === 'android' ? { channelId } : {}),
    },
    // Sur iPhone, une notif immédiate pendant que l’app est ouverte ne s’affiche pas.
    // Une seconde plus tard, iOS la présente comme une vraie bannière.
    trigger:
      Platform.OS === 'ios' ? { type: 'timeInterval', seconds: 1, repeats: false } : null,
  });
}
