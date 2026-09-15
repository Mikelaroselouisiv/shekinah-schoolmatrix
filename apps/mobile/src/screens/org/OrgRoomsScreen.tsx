import { useEffect } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LoadingBlock, Screen } from '../../components/ui';
import type { MoreStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MoreStackParamList, 'OrgRooms'>;

/** Salles gérées dans la fiche classe. */
export function OrgRoomsScreen({ navigation }: Props) {
  useEffect(() => {
    navigation.replace('OrgClasses');
  }, [navigation]);
  return (
    <Screen>
      <LoadingBlock />
    </Screen>
  );
}
