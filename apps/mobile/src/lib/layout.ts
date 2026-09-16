import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Marge basse pour que le contenu ne passe pas sous la tab bar
 * (surtout Android, où la barre + nav système masquent souvent le bas).
 */
export function listBottomPadding(extra = 24): number {
  const tabBar = Platform.OS === 'android' ? 72 : 52;
  return tabBar + extra;
}

/** Hook : tab bar + safe area + extra (sticky footer, boutons, etc.). */
export function useBottomContentPadding(extra = 24): number {
  const insets = useSafeAreaInsets();
  return listBottomPadding(extra) + Math.max(insets.bottom, 0);
}
