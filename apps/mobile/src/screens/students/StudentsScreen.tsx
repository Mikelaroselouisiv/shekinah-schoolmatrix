import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  EmptyState,
  ErrorBanner,
  ListRow,
  LoadingBlock,
  Screen,
  SearchBar,
  Button,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useSchool } from '../../context/SchoolContext';
import { canEditStudent } from '../../lib/permissions';
import { AccessDenied, useCanBrowseStudents } from '../../lib/access';
import { studentDisplayName } from '../../lib/format';
import {
  getAcademicYears,
  getClasses,
  getLinkedStudents,
  getStudents,
  type AcademicYear,
  type ClassItem,
  type LinkedStudent,
  type StudentListItem,
} from '../../services/api';
import {
  cacheStudentsList,
  readCachedStudentsList,
} from '../../lib/offlineCache';
import { colors } from '../../theme/tokens';
import type { StudentsStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<StudentsStackParamList, 'StudentsMain'>;
type PickerKind = 'year' | 'class' | null;

function useLinkedOnly(roleName: string): boolean {
  return roleName === 'PARENT' || roleName === 'TEACHER';
}

export function StudentsScreen({ navigation }: Props) {
  const { roleName, rolePermissions } = useAuth();
  const { context } = useSchool();
  const canBrowse = useCanBrowseStudents();
  const linkedOnly = useLinkedOnly(roleName);
  const canEnroll = canEditStudent(roleName, rolePermissions);

  const [query, setQuery] = useState('');
  const [items, setItems] = useState<(StudentListItem | LinkedStudent)[]>([]);
  const [loading, setLoading] = useState(linkedOnly);
  const [loadingFilters, setLoadingFilters] = useState(!linkedOnly);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [yearId, setYearId] = useState(context?.academic_year?.id || '');
  const [classId, setClassId] = useState('');
  const [picker, setPicker] = useState<PickerKind>(null);

  const yearLabel = years.find((y) => y.id === yearId)?.name
    || context?.academic_year?.name
    || 'Année académique';
  const classLabel = classes.find((c) => c.id === classId)?.name || 'Classe';
  const filtersReady = !!yearId && !!classId;

  const loadLinked = useCallback(async () => {
    setError('');
    try {
      setItems(await getLinkedStudents());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les élèves');
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadFilterOptions = useCallback(async () => {
    setError('');
    setLoadingFilters(true);
    try {
      const [y, c] = await Promise.all([getAcademicYears(), getClasses()]);
      setYears(y);
      setClasses(c);
      setYearId((prev) => {
        if (prev) return prev;
        const current = context?.academic_year?.id;
        if (current && y.some((item) => item.id === current)) return current;
        return y[0]?.id || '';
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les filtres');
    } finally {
      setLoadingFilters(false);
    }
  }, [context?.academic_year?.id]);

  const loadStudents = useCallback(async () => {
    if (!classId) {
      setItems([]);
      return;
    }
    setError('');
    setLoadingList(true);
    try {
      const list = await getStudents({ class_id: classId });
      setItems(list);
      await cacheStudentsList(list);
    } catch (err) {
      const cached = await readCachedStudentsList();
      const forClass = cached.filter((s) => s.class_id === classId);
      if (forClass.length) {
        setItems(forClass);
        setError('Hors ligne — liste en cache.');
      } else {
        setError(err instanceof Error ? err.message : 'Impossible de charger les élèves');
        setItems([]);
      }
    } finally {
      setLoadingList(false);
      setRefreshing(false);
    }
  }, [classId]);

  useEffect(() => {
    if (linkedOnly) {
      void loadLinked();
      return;
    }
    void loadFilterOptions();
  }, [linkedOnly, loadLinked, loadFilterOptions]);

  useEffect(() => {
    if (linkedOnly) return;
    if (!filtersReady) {
      setItems([]);
      return;
    }
    void loadStudents();
  }, [linkedOnly, filtersReady, loadStudents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => {
      const name = studentDisplayName(s).toLowerCase();
      const nisu = (s.order_number || '').toLowerCase();
      const cls = ('class_name' in s ? s.class_name || '' : '').toLowerCase();
      return name.includes(q) || nisu.includes(q) || cls.includes(q);
    });
  }, [items, query]);

  if (!canBrowse) {
    return <AccessDenied />;
  }

  if (linkedOnly && loading) {
    return (
      <Screen>
        <LoadingBlock label="Chargement des élèves…" />
      </Screen>
    );
  }

  if (!linkedOnly && loadingFilters) {
    return (
      <Screen>
        <LoadingBlock label="Chargement…" />
      </Screen>
    );
  }

  const pickerItems =
    picker === 'year'
      ? years.map((y) => ({ id: y.id, label: y.name }))
      : picker === 'class'
        ? classes.map((c) => ({ id: c.id, label: c.name }))
        : [];

  return (
    <Screen style={{ paddingHorizontal: 0 }}>
      <View style={styles.pad}>
        {!linkedOnly ? (
          <View style={styles.filters}>
            <FilterChip
              label="Année académique"
              value={yearId ? yearLabel : 'Choisir…'}
              onPress={() => setPicker('year')}
            />
            <FilterChip
              label="Classe"
              value={classId ? classLabel : 'Choisir…'}
              onPress={() => setPicker('class')}
              disabled={!yearId}
            />
          </View>
        ) : null}

        {filtersReady || linkedOnly ? (
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder={linkedOnly ? 'Nom ou NISU…' : 'Nom ou NISU…'}
          />
        ) : null}

        {canEnroll ? (
          <View style={styles.enrollBtn}>
            <Button title="Nouvelle inscription" onPress={() => navigation.navigate('Enrollment')} />
          </View>
        ) : null}

        <ErrorBanner message={error} />
      </View>

      {!linkedOnly && !filtersReady ? (
        <View style={styles.emptyWrap}>
          <EmptyState title="Aucun élève" />
        </View>
      ) : loadingList ? (
        <LoadingBlock label="Chargement des élèves…" />
      ) : (
        <FlatList
          data={filtered}
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
                if (linkedOnly) void loadLinked();
                else void loadStudents();
              }}
            />
          }
          ListEmptyComponent={<EmptyState title="Aucun élève" />}
          renderItem={({ item }) => (
            <ListRow
              title={studentDisplayName(item)}
              subtitle={[item.order_number, 'class_name' in item ? item.class_name : null]
                .filter(Boolean)
                .join(' · ')}
              onPress={() =>
                navigation.navigate('StudentFiche', {
                  studentId: item.id,
                  studentName: studentDisplayName(item),
                })
              }
            />
          )}
        />
      )}

      <Modal
        visible={!!picker}
        animationType="slide"
        transparent
        onRequestClose={() => setPicker(null)}
      >
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPicker(null)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {picker === 'year' ? 'Année académique' : 'Classe'}
              </Text>
              <Pressable onPress={() => setPicker(null)} hitSlop={12}>
                <Text style={styles.sheetClose}>Fermer</Text>
              </Pressable>
            </View>
            <FlatList
              data={pickerItems}
              keyExtractor={(item, index) => item.id || `opt-${index}`}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    if (picker === 'year') {
                      setYearId(item.id);
                      setClassId('');
                      setItems([]);
                    }
                    if (picker === 'class') setClassId(item.id);
                    setPicker(null);
                  }}
                >
                  <Text style={styles.sheetRowText}>{item.label}</Text>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function FilterChip({
  label,
  value,
  onPress,
  disabled,
}: {
  label: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.chip, disabled && { opacity: 0.45 }]}
    >
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue} numberOfLines={1}>
        {value}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },
  filters: { gap: 8, marginBottom: 10 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  chipLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  chipValue: { fontSize: 15, color: colors.text, fontWeight: '700', marginTop: 2 },
  enrollBtn: { marginTop: 10, marginBottom: 4 },
  list: { paddingHorizontal: 20, paddingBottom: 32 },
  emptyWrap: { paddingHorizontal: 20, paddingTop: 24 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(28,25,23,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  sheetClose: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  sheetRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetRowText: { fontSize: 16, color: colors.text },
});
