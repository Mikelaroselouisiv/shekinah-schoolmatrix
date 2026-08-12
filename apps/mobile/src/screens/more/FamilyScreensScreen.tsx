import { useLayoutEffect } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { EmptyState, ListRow, Screen } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { screensForFamilyVisible } from '../../lib/permissions';
import { openProductScreen } from '../../lib/moreNavigation';
import type { MobileFamilyId } from '../../../spec/productMap';
import type { MoreStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MoreStackParamList, 'FamilyScreens'>;

/** Conservé pour navigation profonde ; le hub Plus liste désormais les entrées directement. */
export function FamilyScreensScreen({ navigation, route }: Props) {
  const { familyId, familyLabel } = route.params;
  const { roleName, rolePermissions } = useAuth();
  const screens = screensForFamilyVisible(
    familyId as MobileFamilyId,
    roleName,
    rolePermissions,
  );

  useLayoutEffect(() => {
    navigation.setOptions({ title: familyLabel });
  }, [navigation, familyLabel]);

  return (
    <Screen style={{ paddingHorizontal: 0 }}>
      <ScrollView contentContainerStyle={styles.content}>
        {screens.length === 0 ? (
          <EmptyState title="Aucun module" />
        ) : (
          screens.map((s) => (
            <ListRow
              key={s.id}
              title={s.label}
              onPress={() => openProductScreen(navigation, s.id, s.label, s.phase)}
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 32, paddingTop: 8 },
});
