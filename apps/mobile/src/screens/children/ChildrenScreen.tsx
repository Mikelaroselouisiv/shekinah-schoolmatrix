import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  EmptyState,
  ErrorBanner,
  ListRow,
  LoadingBlock,
  Screen,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { AccessDenied } from '../../lib/access';
import { studentDisplayName } from '../../lib/format';
import type { LinkedStudent } from '../../services/api';
import type { ChildrenStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ChildrenStackParamList, 'ChildrenMain'>;

export function ChildrenScreen({ navigation }: Props) {
  const { linkedStudents, refreshLinkedStudents, hasLinkedChildren, roleName } = useAuth();
  const [items, setItems] = useState<LinkedStudent[]>(linkedStudents);
  const [loading, setLoading] = useState(!linkedStudents.length);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      await refreshLinkedStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshLinkedStudents]);

  useEffect(() => {
    setItems(linkedStudents);
    if (linkedStudents.length) setLoading(false);
  }, [linkedStudents]);

  useEffect(() => {
    void load();
  }, [load]);

  // Accès : parent dédié, ou tout compte avec au moins un élève lié.
  if (roleName !== 'PARENT' && !hasLinkedChildren && !loading) {
    return <AccessDenied title="Aucun enfant lié" />;
  }

  if (loading) {
    return (
      <Screen>
        <LoadingBlock label="Chargement…" />
      </Screen>
    );
  }

  return (
    <Screen style={{ paddingHorizontal: 0 }}>
      <View style={styles.pad}>
        <ErrorBanner message={error} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        initialNumToRender={16}
        windowSize={8}
        maxToRenderPerBatch={12}
        removeClippedSubviews
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        ListEmptyComponent={
          <EmptyState title="Aucun enfant lié" />
        }
        renderItem={({ item }) => (
          <ListRow
            title={studentDisplayName(item)}
            subtitle={[item.order_number, item.class_name].filter(Boolean).join(' · ')}
            onPress={() =>
              navigation.navigate('StudentFiche', {
                studentId: item.id,
                studentName: studentDisplayName(item),
              })
            }
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },
  list: { paddingHorizontal: 20, paddingBottom: 32 },
});
