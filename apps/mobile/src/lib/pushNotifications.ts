/**
 * Push notifications — architecture cible (S21).
 *
 * Non branché en production tant que les projets FCM / APNs ne sont pas configurés
 * dans EAS. Cible :
 * - Expo Notifications + FCM (Android) / APNs (iOS)
 * - Backend Nest : topics absences / paiements
 * - Token stocké côté user après login
 *
 * Pour activer plus tard :
 * 1. `npx expo install expo-notifications expo-device`
 * 2. Configurer credentials EAS
 * 3. Appeler `registerForPushNotificationsAsync()` après login
 */

export type PushTopic = 'absences' | 'paiements' | 'discipline';

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Stub volontaire — pas de permission / token tant que FCM n’est pas provisionné.
  return null;
}

export function describePushArchitecture(): string {
  return (
    'Push FCM/APNs prévu pour absences et paiements. ' +
    'Configurer EAS credentials puis brancher expo-notifications.'
  );
}
