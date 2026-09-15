import type { ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  type ModalProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { FormScrollView } from './FormScrollView';
import { colors } from '../theme/tokens';

type Props = {
  visible: boolean;
  onRequestClose: () => void;
  children: ReactNode;
  /** Contenu scrollable avec clavier (défaut true). Mettre false pour un picker FlatList. */
  keyboardAware?: boolean;
  sheetStyle?: StyleProp<ViewStyle>;
  animationType?: ModalProps['animationType'];
};

/**
 * Modale formulaire — backdrop + feuille + KeyboardAwareScrollView.
 */
export function FormModal({
  visible,
  onRequestClose,
  children,
  keyboardAware = true,
  sheetStyle,
  animationType = 'slide',
}: Props) {
  return (
    <Modal
      visible={visible}
      animationType={animationType}
      transparent
      onRequestClose={onRequestClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} />
        <View style={[styles.sheet, sheetStyle]}>
          {keyboardAware ? (
            <FormScrollView
              contentContainerStyle={styles.scrollContent}
              bottomOffset={32}
            >
              {children}
            </FormScrollView>
          ) : (
            children
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(28, 25, 23, 0.45)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  scrollContent: {
    paddingBottom: 28,
  },
});
