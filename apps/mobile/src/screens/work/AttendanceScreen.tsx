import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/ui';
import { AccessDenied, useCanAccess } from '../../lib/access';
import type { WorkStackParamList } from '../../navigation/types';
import { AttendanceBoard } from './AttendanceBoard';

type Props = NativeStackScreenProps<WorkStackParamList, 'Attendance'>;

/** Même feuille d’appel que les professeurs. Le surveillant choisit la salle. */
export function AttendanceScreen({}: Props) {
  const allowed = useCanAccess('discipline');
  if (!allowed) return <AccessDenied />;
  return (
    <Screen>
      <AttendanceBoard mode="room" />
    </Screen>
  );
}
