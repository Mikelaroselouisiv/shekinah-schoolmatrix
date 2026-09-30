import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Button,
  DateField,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  Screen,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useSchool } from '../../context/SchoolContext';
import { toYYYYMMDD } from '../../lib/format';
import {
  createHomework,
  listStudentsInTeacherRoom,
  deleteHomework,
  getHomework,
  updateHomework,
  getTeacherClasses,
  getTeacherSubjectsInClass,
  listHomework,
  listClassDayLists,
  replaceClassDayLists,
  saveHomeworkGrade,
  type ClassItem,
  type HomeworkAssignment,
  type HomeworkKind,
  type HomeworkResult,
  type SubjectItem,
} from '../../services/api';
import { emptyClassDayLists, classDayListsFromApi, mergeMaterialCatalog, toggleMaterialLabel, ensureMaterialLabel, MORNING_WEEKDAYS } from '../../lib/morningOpening';
import { AttendanceBoard } from './AttendanceBoard';
import { listBottomPadding } from '../../lib/layout';
import { colors } from '../../theme/tokens';
import type { WorkStackParamList } from '../../navigation/types';

const HOMEWORK_RESULTS: { id: HomeworkResult; label: string; color: string; bg: string }[] = [
  { id: 'PASSE', label: 'Passé', color: '#3F6212', bg: '#F3F7EA' },
  { id: 'A_REFAIRE', label: 'À refaire', color: '#C2410C', bg: '#FFF7ED' },
  { id: 'A_RELIRE', label: 'À relire', color: '#57534E', bg: '#F5F5F4' },
];
import { AccessDenied, useCanAccess } from '../../lib/access';

type Props = NativeStackScreenProps<WorkStackParamList, 'TeacherHub'>;
type HubTab = 'travaux' | 'appel';

const HUB_TITLES: Record<HubTab, string> = {
  travaux: 'Devoirs et leçons',
  appel: 'Appel',
};

export function TeacherHubScreen({ navigation, route }: Props) {
  const allowed = useCanAccess('teacher-hub') || useCanAccess('grades');
  const { theme } = useSchool();
  const { user } = useAuth();
  const userId = user?.id ?? user?.userId ?? null;
  const [tab, setTab] = useState<HubTab>(route.params?.tab ?? 'travaux');

  useEffect(() => {
    if (route.params?.tab) setTab(route.params.tab);
  }, [route.params?.tab]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: HUB_TITLES[tab] });
  }, [navigation, tab]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const list = await getTeacherClasses();
        setClasses(list);
        if (list[0]) setClassId(list[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Impossible de charger vos classes');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (!allowed) return <AccessDenied />;
  if (loading) return <LoadingBlock />;

  return (
    <Screen>
      {error ? <ErrorBanner message={error} /> : null}
      {classes.length === 0 ? (
        <EmptyState title="Aucune classe affectée" />
      ) : tab === 'travaux' ? (
        <HomeworkPanel
          classes={classes}
          classId={classId}
          onClassId={setClassId}
          accent={theme.accent}
          teacherId={userId}
        />
      ) : (
        <AttendanceBoard
          classes={classes.filter((c) => c.can_take_attendance)}
          classId={classId}
          onClassId={setClassId}
          teacherId={userId}
        />
      )}
    </Screen>
  );
}

function ClassChips({
  classes,
  classId,
  onClassId,
}: {
  classes: ClassItem[];
  classId: string;
  onClassId: (id: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 10 }}>
      {classes.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => onClassId(c.id)}
          style={[styles.chip, classId === c.id && styles.chipOn]}
        >
          <Text style={[styles.chipText, classId === c.id && styles.chipTextOn]}>{c.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function todayInHaiti(): string {
  return toYYYYMMDD();
}

function lessonStillOpen(dueDate?: string | null): boolean {
  if (!dueDate) return true;
  return dueDate.slice(0, 10) >= todayInHaiti();
}

function formatDue(value: string | null | undefined): string {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function homeworkRows(value: unknown): HomeworkAssignment[] {
  if (Array.isArray(value)) return value;
  if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as { assignments?: unknown }).assignments)
  ) {
    return (value as { assignments: HomeworkAssignment[] }).assignments;
  }
  return [];
}

function matchesHomework(
  item: { title: string; subject_name?: string | null; instructions?: string | null },
  query: string,
): boolean {
  const needle = normalizeSearch(query.trim());
  if (!needle) return true;
  return [item.title, item.subject_name, item.instructions].some((part) =>
    normalizeSearch(part || '').includes(needle),
  );
}

function byLastName(
  a: { last_name: string; first_name: string },
  b: { last_name: string; first_name: string },
) {
  return (
    a.last_name.localeCompare(b.last_name, 'fr', { sensitivity: 'base' }) ||
    a.first_name.localeCompare(b.first_name, 'fr', { sensitivity: 'base' })
  );
}

function ListFold({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.hwFold}>
      <Pressable onPress={onToggle} style={styles.hwFoldHead}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.hwFoldTitle}>{title}</Text>
          <Text style={styles.hwFoldSummary} numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkSoft} />
      </Pressable>
      {open ? <View style={styles.hwFoldBody}>{children}</View> : null}
    </View>
  );
}

function HomeworkPanel({
  classes,
  classId,
  onClassId,
  accent,
  teacherId,
}: {
  classes: ClassItem[];
  classId: string;
  onClassId: (id: string) => void;
  accent: string;
  teacherId: number | null;
}) {
  const { theme } = useSchool();
  const activeId = classes.some((c) => c.id === classId) ? classId : classes[0]?.id || '';
  const activeClass = classes.find((c) => c.id === activeId);
  const [mode, setMode] = useState<'list' | 'compose' | 'detail'>('list');
  const [filter, setFilter] = useState<'ALL' | HomeworkKind>('ALL');
  const [kind, setKind] = useState<HomeworkKind>('DEVOIR');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [due, setDue] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [list, setList] = useState<HomeworkAssignment[]>([]);
  const [detail, setDetail] = useState<HomeworkAssignment | null>(null);
  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [coefficient, setCoefficient] = useState('');
  const [savingCoef, setSavingCoef] = useState(false);
  const [roster, setRoster] = useState<
    { student_id: string; first_name: string; last_name: string }[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  const [childrenOpen, setChildrenOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(0);
  const hasMoreRef = useRef(false);
  const loadingRef = useRef(false);
  const preschool = !!activeClass?.is_preschool || !!detail?.is_preschool;

  const scopeStudents = useCallback(
    async (item: HomeworkAssignment) => {
      const classKey = item.class_id || activeId;
      if (!teacherId || !classKey) return item;
      const mine = await listStudentsInTeacherRoom(classKey, teacherId);
      const allowed = new Set(mine.map((student) => student.id));
      return {
        ...item,
        students: (item.students ?? [])
          .filter((student) => allowed.has(student.student_id))
          .sort(byLastName),
      };
    },
    [teacherId, activeId],
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const loadPage = useCallback(
    async (reset: boolean) => {
      if (!activeId) return;
      if (!reset && (loadingRef.current || !hasMoreRef.current)) return;
      loadingRef.current = true;
      setLoadingList(true);
      const offset = reset ? 0 : pageRef.current;
      try {
        const [subs, page] = await Promise.all([
          reset ? getTeacherSubjectsInClass(activeId) : Promise.resolve(null),
          listHomework({
            classId: activeId,
            kind: filter === 'ALL' ? undefined : filter,
            q: debouncedQuery || undefined,
            limit: 20,
            offset,
          }),
        ]);
        if (subs) setSubjects(subs);
        const rows = Array.isArray(page.assignments) ? page.assignments : [];
        setList((prev) => (reset ? rows : [...(Array.isArray(prev) ? prev : []), ...rows]));
        pageRef.current = offset + rows.length;
        hasMoreRef.current = page.has_more;
        setHasMore(page.has_more);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Chargement impossible');
      } finally {
        loadingRef.current = false;
        setLoadingList(false);
      }
    },
    [activeId, filter, debouncedQuery],
  );

  useEffect(() => {
    void loadPage(true);
  }, [loadPage]);

  useEffect(() => {
    setMode('list');
    setDetail(null);
  }, [activeId]);

  useEffect(() => {
    if (!detail) return;
    setCoefficient(detail.coefficient != null ? String(detail.coefficient) : '');
  }, [detail?.id, detail?.coefficient]);

  useEffect(() => {
    if (!preschool || !activeId || !teacherId) {
      setRoster([]);
      return;
    }
    let cancelled = false;
    void listStudentsInTeacherRoom(activeId, teacherId)
      .then((students) => {
        if (cancelled) return;
        setRoster(
          students.map((student) => ({
            student_id: student.id,
            first_name: student.first_name,
            last_name: student.last_name,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setRoster([]);
      });
    return () => {
      cancelled = true;
    };
  }, [preschool, activeId, teacherId]);

  function resetForm() {
    setKind('DEVOIR');
    setTitle('');
    setInstructions('');
    setDue('');
    setCoefficient('');
    setSubjectId('');
    setSelectedIds([]);
    setEditingId(null);
  }

  function beginEdit(item: HomeworkAssignment) {
    setEditingId(item.id);
    setKind(item.kind);
    setTitle(item.title);
    setInstructions(item.instructions ?? '');
    setDue(item.due_date?.slice(0, 10) ?? '');
    setCoefficient(item.coefficient != null ? String(item.coefficient) : '');
    setSubjectId(item.subject_id ?? '');
    setSelectedIds(
      (item.students ?? []).filter((student) => student.included).map((student) => student.student_id),
    );
    setChildrenOpen(true);
    setError('');
    setMode('compose');
  }

  function toggleStudent(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function confirmDelete(item: HomeworkAssignment) {
    Alert.alert('Supprimer', `Supprimer « ${item.title} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setDeleting(true);
            try {
              await deleteHomework(item.id);
              setDetail(null);
              resetForm();
              await loadPage(true);
              setMode('list');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Suppression impossible');
            } finally {
              setDeleting(false);
            }
          })();
        },
      },
    ]);
  }

  const visible = homeworkRows(list).filter((item) => matchesHomework(item, query));

  const detailMeta = detail
    ? [detail.subject_name, detail.due_date ? `Pour le ${formatDue(detail.due_date)}` : null]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <ScrollView
      contentContainerStyle={styles.hwPad}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      onScroll={(event) => {
        if (mode !== 'list') return;
        const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
        const nearEnd = layoutMeasurement.height + contentOffset.y >= contentSize.height - 120;
        if (nearEnd) void loadPage(false);
      }}
      scrollEventThrottle={200}
    >
      {mode === 'list' ? (
        <>
          {classes.length > 1 ? (
            <ClassChips classes={classes} classId={activeId} onClassId={onClassId} />
          ) : activeClass ? (
            <Text style={styles.hwClassName}>{activeClass.name}</Text>
          ) : null}
          <View style={styles.hwFilters}>
            {(
              [
                ['ALL', 'Tout'],
                ['DEVOIR', 'Devoirs'],
                ['LECON', 'Leçons'],
              ] as const
            ).map(([id, label]) => {
              const on = filter === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => setFilter(id)}
                  style={[styles.hwFilter, on && styles.hwFilterOn]}
                >
                  <Text style={[styles.hwFilterText, on && styles.hwFilterTextOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          {error ? <ErrorBanner message={error} /> : null}
          <Pressable
            onPress={() => {
              resetForm();
              setError('');
              setMode('compose');
            }}
            style={({ pressed }) => [styles.hwAdd, pressed && { opacity: 0.92 }]}
          >
            <View style={[styles.hwAddIcon, { backgroundColor: theme.accentTint }]}>
              <Ionicons name="add" size={22} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.hwAddTitle}>Ajouter</Text>
              <Text style={styles.hwAddHint}>Un devoir ou une leçon</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
          </Pressable>
          <View style={styles.hwSearchBox}>
            <Ionicons name="search" size={18} color={colors.inkSoft} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Rechercher un devoir ou une leçon"
              placeholderTextColor={colors.textMuted}
              style={styles.hwSearch}
              autoCorrect={false}
              returnKeyType="search"
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.inkSoft} />
              </Pressable>
            ) : null}
          </View>
          {visible.length === 0 && !loadingList ? (
            <EmptyState
              title={
                query.trim()
                  ? 'Aucun résultat'
                  : filter === 'DEVOIR'
                    ? 'Aucun devoir'
                    : filter === 'LECON'
                      ? 'Aucune leçon'
                      : 'Rien pour le moment'
              }
            />
          ) : (
            visible.map((item) => (
              <Pressable
                key={item.id}
                onPress={async () => {
                  try {
                    setDetail(await scopeStudents(await getHomework(item.id)));
                    setMode('detail');
                    setError('');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Ouverture impossible');
                  }
                }}
                style={({ pressed }) => [styles.hwItem, pressed && { opacity: 0.92 }]}
              >
                <View style={styles.hwItemTop}>
                  <Text style={[styles.hwKind, { color: accent, backgroundColor: theme.accentTint }]}>
                    {item.kind === 'DEVOIR' ? 'Devoir' : 'Leçon'}
                  </Text>
                  {item.due_date ? (
                    <Text style={styles.hwDue}>Pour le {formatDue(item.due_date)}</Text>
                  ) : null}
                </View>
                <Text style={styles.hwItemTitle}>{item.title}</Text>
                {item.subject_name ? <Text style={styles.hwMeta}>{item.subject_name}</Text> : null}
                {item.is_preschool ? (
                  <Text style={styles.hwMeta}>
                    {item.student_count
                      ? `${item.student_count} élève${item.student_count > 1 ? 's' : ''}`
                      : 'Aucun élève choisi'}
                  </Text>
                ) : null}
                {item.instructions ? (
                  <Text style={styles.hwExcerpt} numberOfLines={2}>
                    {item.instructions}
                  </Text>
                ) : null}
              </Pressable>
            ))
          )}
          {loadingList ? <Text style={styles.hwLoading}>Chargement…</Text> : null}
          {!loadingList && hasMore ? <Text style={styles.hwLoading}>Faites défiler pour la suite</Text> : null}
        </>
      ) : null}

      {mode === 'compose' ? (
        <>
          <Pressable onPress={() => setMode('list')} style={styles.hwBack}>
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
            <Text style={styles.hwBackText}>Retour</Text>
          </Pressable>
          <Text style={styles.hwSection}>{editingId ? 'Modifier' : 'Nouveau'}</Text>
          {error ? <ErrorBanner message={error} /> : null}
          <View style={styles.hwKindRow}>
            {(
              [
                ['DEVOIR', 'Devoir'],
                ['LECON', 'Leçon'],
              ] as const
            ).map(([id, label]) => {
              const on = kind === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => setKind(id)}
                  style={[
                    styles.hwKindCard,
                    on && { borderColor: accent, backgroundColor: theme.accentTint },
                  ]}
                >
                  <Ionicons
                    name={id === 'DEVOIR' ? 'create-outline' : 'book-outline'}
                    size={20}
                    color={on ? accent : colors.inkSoft}
                  />
                  <Text style={[styles.hwKindCardText, on && { color: accent }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hwFieldLabel}>Titre</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Ex. Lecture pages 12 à 15"
            placeholderTextColor={colors.textMuted}
            style={styles.hwInput}
          />
          <Text style={styles.hwFieldLabel}>Consigne</Text>
          <TextInput
            value={instructions}
            onChangeText={setInstructions}
            placeholder="Ce que les élèves doivent faire"
            placeholderTextColor={colors.textMuted}
            multiline
            style={[styles.hwInput, styles.hwInputMulti]}
          />
          <DateField label="Pour le" value={due} onChange={setDue} />
          {!preschool ? (
            <>
              <Text style={styles.hwFieldLabel}>Coefficient</Text>
              <TextInput
                value={coefficient}
                onChangeText={setCoefficient}
                placeholder="10"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                style={styles.hwScore}
              />
            </>
          ) : null}
          {subjects.length > 0 ? (
            <ListFold
              title="Matière"
              summary={subjects.find((subject) => subject.id === subjectId)?.name ?? 'Aucune'}
              open={subjectsOpen}
              onToggle={() => setSubjectsOpen((open) => !open)}
            >
              {subjects.map((subject) => {
                const on = subjectId === subject.id;
                return (
                  <Pressable
                    key={subject.id}
                    onPress={() => setSubjectId(on ? '' : subject.id)}
                    style={[
                      styles.hwSubjectRow,
                      on && { borderColor: accent, backgroundColor: theme.accentTint },
                    ]}
                  >
                    <View style={[styles.hwRadio, on && { borderColor: accent }]}>
                      {on ? <View style={[styles.hwRadioDot, { backgroundColor: accent }]} /> : null}
                    </View>
                    <Text style={[styles.hwSubjectName, on && { color: accent }]}>{subject.name}</Text>
                  </Pressable>
                );
              })}
            </ListFold>
          ) : null}
          {preschool ? (
            <ListFold
              title="Enfants"
              summary={
                selectedIds.length === 0
                  ? 'Aucun'
                  : `${selectedIds.length} sélectionné${selectedIds.length > 1 ? 's' : ''}`
              }
              open={childrenOpen}
              onToggle={() => setChildrenOpen((open) => !open)}
            >
              {roster.length === 0 ? (
                <EmptyState title="Aucun élève" />
              ) : (
                [...roster].sort(byLastName).map((student) => {
                  const on = selectedIds.includes(student.student_id);
                  return (
                    <Pressable
                      key={student.student_id}
                      onPress={() => toggleStudent(student.student_id)}
                      style={styles.hwSubjectRow}
                    >
                      <View
                        style={[
                          styles.hwCheck,
                          on && { backgroundColor: accent, borderColor: accent },
                        ]}
                      >
                        {on ? <Ionicons name="checkmark" size={14} color={colors.surface} /> : null}
                      </View>
                      <Text style={styles.hwSubjectName}>
                        {student.last_name} {student.first_name}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </ListFold>
          ) : null}
          <View style={styles.hwActions}>
            <Button
              title="Annuler"
              variant="ghost"
              onPress={() => {
                resetForm();
                setMode('list');
              }}
              style={styles.hwActionBtn}
            />
            <Button
              title={publishing ? 'Enregistrement…' : editingId ? 'Enregistrer' : 'Publier'}
              disabled={
                !title.trim() ||
                publishing ||
                (preschool && (!instructions.trim() || selectedIds.length === 0))
              }
              style={styles.hwActionBtn}
              onPress={async () => {
                if (!activeId) return;
                setPublishing(true);
                try {
                  const payload = {
                    kind,
                    title: title.trim(),
                    instructions: instructions.trim() || null,
                    due_date: due || null,
                    subject_id: subjectId || null,
                    student_ids: preschool ? selectedIds : undefined,
                    coefficient: preschool ? undefined : coefficient.trim() ? coefficient.trim() : null,
                  };
                  if (editingId) await updateHomework(editingId, payload);
                  else await createHomework({ ...payload, class_id: activeId });
                  resetForm();
                  setFilter(kind);
                  await loadPage(true);
                  setMode('list');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Publication impossible');
                } finally {
                  setPublishing(false);
                }
              }}
            />
          </View>
        </>
      ) : null}

      {mode === 'detail' && detail ? (
        <>
          <Pressable
            onPress={() => {
              setDetail(null);
              setMode('list');
            }}
            style={styles.hwBack}
          >
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
            <Text style={styles.hwBackText}>Retour</Text>
          </Pressable>
          {lessonStillOpen(detail.due_date) ? (
            <View style={styles.hwActions}>
              <Button
                title="Modifier"
                icon="create-outline"
                onPress={() => beginEdit(detail)}
                style={styles.hwActionBtn}
              />
              <Button
                title={deleting ? 'Suppression…' : 'Supprimer'}
                icon="trash-outline"
                variant="danger"
                disabled={deleting}
                onPress={() => confirmDelete(detail)}
                style={styles.hwActionBtn}
              />
            </View>
          ) : null}
          <Text style={[styles.hwKind, { color: accent, backgroundColor: theme.accentTint }]}>
            {detail.kind === 'DEVOIR' ? 'Devoir' : 'Leçon'}
          </Text>
          <Text style={styles.hwDetailTitle}>{detail.title}</Text>
          {detailMeta ? <Text style={styles.hwMeta}>{detailMeta}</Text> : null}
          {detail.instructions ? (
            <Text style={styles.hwInstructions}>{detail.instructions}</Text>
          ) : null}
          {!preschool ? (
            <View style={styles.hwStudent}>
              <Text style={styles.hwFieldLabel}>Coefficient</Text>
              {lessonStillOpen(detail.due_date) ? (
                <View style={styles.hwNoteRow}>
                  <TextInput
                    value={coefficient}
                    onChangeText={setCoefficient}
                    placeholder="10"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                    style={styles.hwScore}
                  />
                  <Button
                    title={savingCoef ? 'Enregistrement…' : 'Enregistrer'}
                    variant="ghost"
                    disabled={savingCoef}
                    onPress={async () => {
                      setSavingCoef(true);
                      try {
                        const next = await updateHomework(detail.id, {
                          coefficient: coefficient.trim() ? coefficient.trim() : null,
                        });
                        setDetail(await scopeStudents(next));
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Coefficient impossible');
                      } finally {
                        setSavingCoef(false);
                      }
                    }}
                  />
                </View>
              ) : (
                <Text style={styles.hwMeta}>
                  {detail.coefficient != null ? String(detail.coefficient) : '—'}
                </Text>
              )}
            </View>
          ) : null}
          <Text style={styles.hwSection}>
            {preschool ? 'Enfants' : 'Élèves'}
          </Text>
          {preschool ? (
            (detail.students ?? []).filter((student) => student.included).sort(byLastName).length === 0 ? (
              <EmptyState title="Aucun élève" />
            ) : (
              (detail.students ?? [])
                .filter((student) => student.included)
                .sort(byLastName)
                .map((student) => (
                  <AppreciationRow
                    key={student.student_id}
                    student={student}
                    editable={lessonStillOpen(detail.due_date)}
                    onSave={async (result) => {
                      const next = await saveHomeworkGrade(detail.id, {
                        student_id: student.student_id,
                        result,
                      });
                      setDetail(await scopeStudents(next));
                    }}
                  />
                ))
            )
          ) : (detail.students ?? []).length === 0 ? (
            <EmptyState title="Aucun élève" />
          ) : (
            detail.students?.map((student) => (
              <GradeEditor
                key={student.student_id}
                student={student}
                coefficient={detail.coefficient}
                editable={lessonStillOpen(detail.due_date)}
                onSave={async (score, comment) => {
                  const next = await saveHomeworkGrade(detail.id, {
                    student_id: student.student_id,
                    score,
                    comment,
                  });
                  setDetail(await scopeStudents(next));
                }}
              />
            ))
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

function PreschoolWorkEditor({
  student,
  accent,
  tint,
  editable = true,
  onSave,
}: {
  student: {
    student_id: string;
    first_name: string;
    last_name: string;
    included?: boolean;
    source?: 'LIVRE' | 'PHRASE' | null;
    content?: string | null;
  };
  accent: string;
  tint: string;
  editable?: boolean;
  onSave: (body: {
    included: boolean;
    source: 'LIVRE' | 'PHRASE' | null;
    content: string | null;
  }) => Promise<void>;
}) {
  const [included, setIncluded] = useState(!!student.included);
  const [source, setSource] = useState<'LIVRE' | 'PHRASE'>(student.source === 'PHRASE' ? 'PHRASE' : 'LIVRE');
  const [content, setContent] = useState(student.content ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIncluded(!!student.included);
    setSource(student.source === 'PHRASE' ? 'PHRASE' : 'LIVRE');
    setContent(student.content ?? '');
  }, [student.student_id, student.included, student.source, student.content]);

  if (!editable) {
    return (
      <View style={styles.hwStudent}>
        <Text style={styles.hwStudentName}>
          {student.last_name} {student.first_name}
        </Text>
        {student.included ? (
          <Text style={styles.hwMeta}>
            {[student.source === 'PHRASE' ? 'Phrase' : student.source === 'LIVRE' ? 'Livre' : null, student.content]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : (
          <Text style={styles.hwMeta}>Non concerné</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.hwStudent}>
      <Pressable
        onPress={() => {
          const next = !included;
          setIncluded(next);
          if (!next && student.included) {
            setSaving(true);
            void onSave({ included: false, source: null, content: null }).finally(() => setSaving(false));
          }
        }}
        style={styles.hwInclude}
      >
        <View style={[styles.hwCheck, included && { backgroundColor: accent, borderColor: accent }]}>
          {included ? <Ionicons name="checkmark" size={14} color={colors.surface} /> : null}
        </View>
        <Text style={styles.hwStudentName}>
          {student.last_name} {student.first_name}
        </Text>
      </Pressable>
      {included ? (
        <>
          <View style={styles.hwSubjectList}>
            {(
              [
                ['LIVRE', 'Livre', 'book-outline'],
                ['PHRASE', 'Phrase', 'create-outline'],
              ] as const
            ).map(([id, label, icon]) => {
              const on = source === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => setSource(id)}
                  style={[styles.hwSubjectRow, on && { borderColor: accent, backgroundColor: tint }]}
                >
                  <Ionicons name={icon} size={18} color={on ? accent : colors.inkSoft} />
                  <Text style={[styles.hwSubjectName, on && { color: accent }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder={source === 'LIVRE' ? 'Titre du livre, page…' : 'La phrase à écrire ou à lire'}
            placeholderTextColor={colors.textMuted}
            multiline
            style={[styles.hwInput, styles.hwInputMulti]}
          />
          <Button
            title={saving ? 'Enregistrement…' : 'Enregistrer'}
            variant="ghost"
            disabled={saving}
            onPress={async () => {
              setSaving(true);
              try {
                await onSave({ included: true, source, content: content.trim() || null });
              } finally {
                setSaving(false);
              }
            }}
          />
        </>
      ) : null}
    </View>
  );
}

function AppreciationRow({
  student,
  editable,
  onSave,
}: {
  student: {
    student_id: string;
    first_name: string;
    last_name: string;
    result?: HomeworkResult | null;
    result_label?: string | null;
  };
  editable: boolean;
  onSave: (result: HomeworkResult | null) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const current = student.result ?? null;
  const choices = editable
    ? HOMEWORK_RESULTS
    : HOMEWORK_RESULTS.filter((item) => item.id === current);

  return (
    <View style={styles.hwStudent}>
      <Text style={styles.hwStudentName}>
        {student.last_name} {student.first_name}
      </Text>
      {choices.length ? (
        <View style={styles.hwResultRow}>
          {choices.map((item) => {
            const on = current === item.id;
            return (
              <Pressable
                key={item.id}
                disabled={!editable || saving}
                onPress={() => {
                  setSaving(true);
                  void onSave(on ? null : item.id).finally(() => setSaving(false));
                }}
                style={[
                  styles.hwResultChip,
                  {
                    borderColor: on ? item.color : colors.border,
                    backgroundColor: on ? item.bg : colors.surface,
                  },
                ]}
              >
                <Text style={[styles.hwResultLabel, { color: on ? item.color : colors.inkSoft }]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function GradeEditor({
  student,
  coefficient,
  editable = true,
  onSave,
}: {
  student: {
    student_id: string;
    first_name: string;
    last_name: string;
    score: string | null;
    comment: string | null;
  };
  coefficient?: number | null;
  editable?: boolean;
  onSave: (score: string, comment: string) => Promise<void>;
}) {
  const [score, setScore] = useState(student.score ?? '');
  const [comment, setComment] = useState(student.comment ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setScore(student.score ?? '');
    setComment(student.comment ?? '');
  }, [student.student_id, student.score, student.comment]);

  if (!editable) {
    return (
      <View style={styles.hwStudent}>
        <Text style={styles.hwStudentName}>
          {student.last_name} {student.first_name}
        </Text>
        <Text style={styles.hwMeta}>
          {student.score
            ? coefficient != null
              ? `${student.score} / ${coefficient}`
              : student.score
            : '—'}
          {student.comment ? ` · ${student.comment}` : ''}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.hwStudent}>
      <Text style={styles.hwStudentName}>
        {student.last_name} {student.first_name}
      </Text>
      <View style={styles.hwNoteRow}>
        <TextInput
          value={score}
          onChangeText={setScore}
          placeholder="Note"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          style={styles.hwScore}
        />
        {coefficient != null ? <Text style={styles.hwMeta}>/ {coefficient}</Text> : null}
      </View>
      <TextInput
        value={comment}
        onChangeText={setComment}
        placeholder="Commentaire"
        placeholderTextColor={colors.textMuted}
        style={styles.hwComment}
      />
      <Button
        title={saving ? 'Enregistrement…' : 'Enregistrer'}
        variant="ghost"
        disabled={saving}
        onPress={async () => {
          setSaving(true);
          try {
            await onSave(score, comment);
          } finally {
            setSaving(false);
          }
        }}
      />
    </View>
  );
}

function MaterialsPanel({
  classes,
  classId,
  onClassId,
}: {
  classes: ClassItem[];
  classId: string;
  onClassId: (id: string) => void;
}) {
  const { context } = useSchool();
  const yearName =
    context?.academic_year?.name || context?.current_academic_year_name || undefined;
  const activeId = classes.some((c) => c.id === classId) ? classId : classes[0]?.id || '';
  const [lists, setLists] = useState(emptyClassDayLists);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [draftByDay, setDraftByDay] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!activeId) return;
    (async () => {
      try {
        const [{ days, catalog: labels }, subj] = await Promise.all([
          listClassDayLists(activeId, yearName),
          getTeacherSubjectsInClass(activeId).catch(() => []),
        ]);
        const next = classDayListsFromApi(days);
        setLists(next);
        setCatalog(mergeMaterialCatalog(labels, ...Object.values(next).map((s) => s.materials)));
        setSubjects(subj);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Chargement impossible');
      }
    })();
  }, [activeId, yearName]);

  async function save(next = lists) {
    if (!activeId) return;
    setSaving(true);
    try {
      const { days, catalog: labels } = await replaceClassDayLists({
        class_id: activeId,
        academic_year: yearName || null,
        days: MORNING_WEEKDAYS.map((d) => ({
          day_of_week: d.index,
          subject_ids: next[d.index]?.subjectIds ?? [],
          materials: next[d.index]?.materials ?? [],
        })),
      });
      const parsed = classDayListsFromApi(days);
      setLists(parsed);
      setCatalog(mergeMaterialCatalog(labels, ...Object.values(parsed).map((s) => s.materials)));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  }

  if (classes.length === 0) {
    return <EmptyState title="Aucune classe" />;
  }

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <ClassChips classes={classes} classId={activeId} onClassId={onClassId} />
      {error ? <ErrorBanner message={error} /> : null}
      {MORNING_WEEKDAYS.map((d) => {
        const slot = lists[d.index] ?? { subjectIds: [], materials: [] };
        const draft = draftByDay[d.index] ?? '';
        return (
          <View key={d.index} style={styles.card}>
            <Text style={styles.cardTitle}>{d.label}</Text>
            <Text style={styles.label}>Matières</Text>
            <View style={styles.pills}>
              {subjects.map((s) => {
                const on = slot.subjectIds.includes(s.id);
                return (
                  <Pressable
                    key={s.id}
                    onPress={() =>
                      setLists((prev) => ({
                        ...prev,
                        [d.index]: {
                          ...slot,
                          subjectIds: on
                            ? slot.subjectIds.filter((x) => x !== s.id)
                            : [...slot.subjectIds, s.id],
                        },
                      }))
                    }
                    style={[styles.pill, on ? styles.pillOn : null]}
                  >
                    <Text style={styles.pillText}>{s.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.label}>Matériel à apporter</Text>
            <View style={styles.pills}>
              {mergeMaterialCatalog(catalog, ...Object.values(lists).map((s) => s.materials)).map(
                (label) => {
                  const on = slot.materials.some((x) => x.toLowerCase() === label.toLowerCase());
                  return (
                    <Pressable
                      key={label}
                      onPress={() =>
                        setLists((prev) => ({
                          ...prev,
                          [d.index]: {
                            ...slot,
                            materials: toggleMaterialLabel(slot.materials, label),
                          },
                        }))
                      }
                      style={[styles.pill, on ? styles.pillOn : null]}
                    >
                      <Text style={styles.pillText}>{label}</Text>
                    </Pressable>
                  );
                },
              )}
            </View>
            <TextInput
              value={draft}
              onChangeText={(t) => setDraftByDay((p) => ({ ...p, [d.index]: t }))}
              onSubmitEditing={() => {
                const line = draft.trim().replace(/\s+/g, ' ');
                if (!line) return;
                setCatalog((prev) => mergeMaterialCatalog(prev, [line]));
                setLists((prev) => ({
                  ...prev,
                  [d.index]: { ...slot, materials: ensureMaterialLabel(slot.materials, line) },
                }));
                setDraftByDay((p) => ({ ...p, [d.index]: '' }));
              }}
              returnKeyType="done"
              style={styles.input}
            />
          </View>
        );
      })}
      <Button title={saving ? '…' : 'Enregistrer'} onPress={() => void save()} disabled={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  morningBox: {
    marginTop: 10,
    marginBottom: 4,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  morningKicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#92400E',
    marginBottom: 4,
  },
  morningLine: { color: '#78350F', fontSize: 14, fontWeight: '600', marginTop: 2 },
  pad: { paddingBottom: 40 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { color: colors.text, fontWeight: '600' },
  chipTextOn: { color: colors.surface },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  name: { fontWeight: '700', color: colors.text, marginBottom: 6 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillOn: { backgroundColor: colors.border },
  pillText: { fontSize: 12, fontWeight: '600' },
  label: { fontWeight: '700', marginTop: 8, marginBottom: 6, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    marginVertical: 6,
    color: colors.text,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    backgroundColor: colors.surface,
  },
  kind: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  cardTitle: { fontWeight: '800', color: colors.text, marginTop: 4 },
  meta: { color: colors.textMuted, marginTop: 4 },
  score: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 8,
    width: 80,
    marginBottom: 6,
  },
  hwPad: { paddingBottom: listBottomPadding(16), gap: 12 },
  hwSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  hwSearch: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  hwLoading: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 8,
  },
  hwSubjectList: { gap: 8 },
  hwFold: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  hwFoldHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  hwFoldTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  hwFoldSummary: { fontSize: 13, fontWeight: '500', color: colors.inkSoft },
  hwFoldBody: { gap: 8, paddingHorizontal: 10, paddingBottom: 10 },
  hwSubjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  hwRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hwRadioDot: { width: 10, height: 10, borderRadius: 5 },
  hwSubjectName: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  hwInclude: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hwCheck: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  hwClassName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.inkSoft,
    marginBottom: 2,
  },
  hwFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hwFilter: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  hwFilterOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  hwFilterText: { fontSize: 13, fontWeight: '600', color: colors.text },
  hwFilterTextOn: { color: colors.surface },
  hwAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  hwAddIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hwAddTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  hwAddHint: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  hwItem: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
  },
  hwItemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  hwKind: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  hwDue: { fontSize: 12, fontWeight: '600', color: colors.inkSoft },
  hwItemTitle: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2, color: colors.text },
  hwMeta: { fontSize: 13, fontWeight: '500', color: colors.inkSoft },
  hwExcerpt: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  hwBack: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  hwBackText: { fontSize: 16, fontWeight: '600', color: colors.ink },
  hwSection: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginTop: 8,
  },
  hwKindRow: { flexDirection: 'row', gap: 10 },
  hwKindCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 8,
  },
  hwKindCardText: { fontSize: 15, fontWeight: '600', color: colors.text },
  hwFieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 4,
  },
  hwInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
  },
  hwInputMulti: { minHeight: 96, textAlignVertical: 'top' },
  hwSubjects: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hwActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  hwActionBtn: { flex: 1 },
  hwDetailTitle: {
    fontSize: 26,
    fontWeight: '600',
    letterSpacing: -0.4,
    color: colors.text,
  },
  hwInstructions: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  hwStudent: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  hwStudentName: { fontSize: 16, fontWeight: '600', color: colors.text },
  hwNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hwResultRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hwResultChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  hwResultLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  hwScore: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: 96,
    color: colors.text,
    fontSize: 16,
    backgroundColor: colors.bg,
  },
  hwComment: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 16,
    backgroundColor: colors.bg,
  },
});
