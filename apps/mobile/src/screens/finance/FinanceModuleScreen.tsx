import { useLayoutEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Title } from '../../components/ui';
import { colors } from '../../theme/tokens';
import type { FinanceStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<FinanceStackParamList, 'FinanceModule'>;

export function FinanceModuleScreen({ navigation, route }: Props) {
  const { focus, title, phase } = route.params;

  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  return (
    <Screen>
      <Title>{title}</Title>
      <Text style={styles.meta}>
        focus · {focus} · plan {phase}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: {
    marginTop: 24,
    color: colors.textMuted,
    fontSize: 13,
  },
});
