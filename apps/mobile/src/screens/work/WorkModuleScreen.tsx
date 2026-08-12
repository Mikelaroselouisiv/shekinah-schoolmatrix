import { useEffect, useLayoutEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Muted, Screen, Title } from '../../components/ui';
import { getScreen } from '../../../spec/productMap';
import { colors } from '../../theme/tokens';
import type { WorkStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<WorkStackParamList, 'WorkModule'>;

export function WorkModuleScreen({ navigation, route }: Props) {
  const { screenId, title } = route.params;
  const screen = getScreen(screenId);
  const label = title || screen?.label || screenId;

  useLayoutEffect(() => {
    navigation.setOptions({ title: label });
  }, [navigation, label]);

  useEffect(() => {
    if (screenId === 'discipline') {
      navigation.replace('Discipline');
    } else if (screenId === 'grades') {
      navigation.replace('Grades');
    } else if (screenId === 'photography') {
      navigation.replace('Photography');
    } else if (screenId === 'schedule') {
      navigation.replace('Schedule');
    } else if (screenId === 'stats-academiques') {
      navigation.replace('AcademicStats');
    } else if (screenId === 'formation-classe') {
      navigation.replace('FormationClasse');
    } else if (screenId === 'students') {
      (
        navigation.getParent() as
          | { navigate: (a: string, b?: object) => void }
          | undefined
      )?.navigate('Students', { screen: 'Enrollment' });
    } else if (screenId === 'stats-financieres') {
      (
        navigation.getParent() as
          | { navigate: (a: string, b?: object) => void }
          | undefined
      )?.navigate('Finance', { screen: 'FinancialMonitor' });
    }
  }, [navigation, screenId]);

  if (
    screenId === 'discipline' ||
    screenId === 'grades' ||
    screenId === 'photography' ||
    screenId === 'schedule' ||
    screenId === 'stats-academiques' ||
    screenId === 'stats-financieres' ||
    screenId === 'formation-classe' ||
    screenId === 'students'
  ) {
    return (
      <Screen>
        <Muted>Ouverture…</Muted>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{label}</Title>
      <Text style={styles.meta}>
        id · {screenId}
        {screen?.phase ? ` · plan ${screen.phase}` : ''}
      </Text>
      {screenId === 'fiche-eleve' ? (
        <Button
          title="Aller aux élèves"
          onPress={() =>
            (navigation.getParent() as { navigate: (a: string) => void } | undefined)?.navigate(
              'Students',
            )
          }
        />
      ) : null}
      {(screenId === 'economat' || screenId === 'depenses') && (
        <Button
          title="Ouvrir Finance"
          onPress={() => {
            const focus = screenId === 'depenses' ? 'depenses' : 'paiements';
            (
              navigation.getParent() as
                | { navigate: (a: string, b?: object) => void }
                | undefined
            )?.navigate('Finance', { screen: 'FinanceMain', params: { focus } });
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: {
    marginTop: 24,
    marginBottom: 16,
    color: colors.textMuted,
    fontSize: 13,
  },
});
