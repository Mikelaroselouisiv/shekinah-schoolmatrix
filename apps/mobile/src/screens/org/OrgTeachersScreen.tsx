import { useEffect } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LoadingBlock, Screen } from '../../components/ui';
import type { MoreStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MoreStackParamList, 'OrgTeachers'>;

/** Professeurs assignés dans la fiche classe. */
export function OrgTeachersScreen({ navigation }: Props) {
  useEffect(() => {
    navigation.replace('OrgClasses');
  }, [navigation]);
  return (
    <Screen>
      <LoadingBlock />
    </Screen>
  );
}
