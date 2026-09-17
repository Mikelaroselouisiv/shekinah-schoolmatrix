import { Platform, StyleSheet, type ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import type { ComponentProps, ReactNode } from 'react';
import { useBottomContentPadding } from '../lib/layout';

type Props = ComponentProps<typeof KeyboardAwareScrollView> & {
  children: ReactNode;
  /** Laisse de la place pour la tab bar (désactiver dans les modales). */
  clearTabBar?: boolean;
};

/**
 * Scroll formulaire — remonte le champ focalisé au-dessus du clavier (Android + iOS).
 */
export function FormScrollView({
  children,
  contentContainerStyle,
  keyboardShouldPersistTaps = 'handled',
  bottomOffset = 24,
  clearTabBar = true,
  ...rest
}: Props) {
  const bottomPad = useBottomContentPadding(16);
  const flat = StyleSheet.flatten(contentContainerStyle) as ViewStyle | undefined;
  const existing = typeof flat?.paddingBottom === 'number' ? flat.paddingBottom : 0;

  return (
    <KeyboardAwareScrollView
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      contentContainerStyle={
        clearTabBar
          ? [contentContainerStyle, { paddingBottom: Math.max(existing, bottomPad) }]
          : contentContainerStyle
      }
      {...rest}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
