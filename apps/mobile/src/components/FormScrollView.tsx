import type { ComponentProps, ReactNode } from 'react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

type Props = ComponentProps<typeof KeyboardAwareScrollView> & {
  children: ReactNode;
};

/**
 * Scroll formulaire — remonte le champ focalisé au-dessus du clavier (Android + iOS).
 */
export function FormScrollView({
  children,
  contentContainerStyle,
  keyboardShouldPersistTaps = 'handled',
  bottomOffset = 24,
  ...rest
}: Props) {
  return (
    <KeyboardAwareScrollView
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      contentContainerStyle={contentContainerStyle}
      {...rest}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
