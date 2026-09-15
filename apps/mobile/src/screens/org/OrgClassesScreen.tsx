import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormModal } from '../../components/FormModal';
import {
  Button,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  Screen,
} from '../../components/ui';
import { colors } from '../../theme/tokens';
import {
  deleteClass,
  getImageUrl,
  listClassesOrg,
  listTeacherAssignments,
  type ClassOrg,
  type TeacherAssignment,
} from '../../services/api';
import type { MoreStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';
import {
  EDUCATION_LEVELS,
  educationLevelLabel,
  learnerNoun,
} from '../../lib/educationLevels';
import { ClassConfigSheet } from './ClassConfigSheet';

type Props = NativeStackScreenProps<MoreStackParamList, 'OrgClasses'>;

function TeacherStack({ teachers }: { teachers: { name: string; photo?: string | null }[] }) {
  if (teachers.length === 0) {
    return <Text style={styles.previewEmpty}>Aucun professeur</Text>;
  }
  return (
    <View style={styles.avatarRow}>
      {teachers.slice(0, 4).map((t, i) => {
        const uri = getImageUrl(t.photo ?? undefined);
        const initials = t.name
          .split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w[0]?.toUpperCase() ?? '')
          .join('');
        return uri ? (
          <Image
            key={`${t.name}-${i}`}
            source={{ uri }}
            style={[styles.avatar, i > 0 && { marginLeft: -8 }]}
          />
        ) : (
          <View key={`${t.name}-${i}`} style={[styles.avatarFallback, i > 0 && { marginLeft: -8 }]}>
            <Text style={styles.avatarInitials}>{initials || '?'}</Text>
          </View>
        );
      })}
      {teachers.length > 4 ? (
        <Text style={styles.more}>+{teachers.length - 4}</Text>
      ) : null}
    </View>
  );
}

export function OrgClassesScreen({}: Props) {
  const allowed = useCanAccess('classes');
  const [items, setItems] = useState<ClassOrg[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [boot, setBoot] = useState(true);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<ClassOrg | 'new' | null>(null);

  const load = useCallback(async () => {
    const [c, a] = await Promise.all([listClassesOrg(), listTeacherAssignments()]);
    setItems(c);
    setAssignments(a);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur');
      } finally {
        if (!cancelled) setBoot(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const sections = useMemo(() => {
    const byLevel = new Map<string, ClassOrg[]>();
    for (const c of items) {
      const key = c.level || '_';
      const list = byLevel.get(key) ?? [];
      list.push(c);
      byLevel.set(key, list);
    }
    const ordered: { title: string; data: ClassOrg[] }[] = [];
    for (const l of EDUCATION_LEVELS) {
      const data = byLevel.get(l.key);
      if (data?.length) ordered.push({ title: l.label, data });
    }
    const unknown = byLevel.get('_');
    if (unknown?.length) ordered.push({ title: 'Autres', data: unknown });
    return ordered;
  }, [items]);

  function teachersForClass(classId: string) {
    const seen = new Set<number>();
    const list: { name: string; photo?: string | null }[] = [];
    for (const a of assignments) {
      if (a.class_id !== classId || seen.has(a.teacher_id)) continue;
      seen.add(a.teacher_id);
      list.push({ name: a.teacher_name, photo: a.teacher_photo_url });
    }
    return list;
  }

  function confirmDelete(id: string, className: string) {
    Alert.alert('Supprimer', `Supprimer la classe « ${className} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              await deleteClass(id);
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erreur');
            }
          })(),
      },
    ]);
  }

  if (!allowed) {
    return <AccessDenied />;
  }

  if (boot) {
    return (
      <Screen>
        <LoadingBlock />
      </Screen>
    );
  }

  return (
    <Screen style={{ paddingHorizontal: 0, paddingBottom: 0 }}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Organisation</Text>
          <Text style={styles.title}>Classes</Text>
        </View>
        <Button title="Ajouter" onPress={() => setPanel('new')} />
      </View>
      <ErrorBanner message={error} />

      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        extraData={assignments}
        stickySectionHeadersEnabled
        ListEmptyComponent={<EmptyState title="Aucune classe" />}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionCount}>
              {section.data.length} classe{section.data.length > 1 ? 's' : ''}
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          const teachers = teachersForClass(item.id);
          const rooms = item.room_count ?? 0;
          const students = item.student_count ?? 0;
          return (
            <View style={styles.card}>
              <Pressable style={styles.cardBody} onPress={() => setPanel(item)}>
                <View style={styles.accent} />
                <View style={{ flex: 1, padding: 14 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.cardMeta}>{educationLevelLabel(item.level)}</Text>
                  <View style={styles.stats}>
                    <View style={styles.statTeal}>
                      <Text style={styles.statValue}>{rooms}</Text>
                      <Text style={styles.statLabel}>{rooms > 1 ? 'salles' : 'salle'}</Text>
                    </View>
                    <View style={styles.statAmber}>
                      <Text style={styles.statValueAmber}>{students}</Text>
                      <Text style={styles.statLabelAmber}>
                        {learnerNoun(item.level, students !== 1)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.teacherBox}>
                    <Text style={styles.teacherLabel}>Professeurs</Text>
                    <TeacherStack teachers={teachers} />
                  </View>
                </View>
              </Pressable>
              <View style={styles.footer}>
                <Pressable onPress={() => setPanel(item)}>
                  <Text style={styles.link}>Configurer</Text>
                </Pressable>
                <Pressable onPress={() => confirmDelete(item.id, item.name)}>
                  <Text style={styles.danger}>Supprimer</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      <FormModal
        visible={!!panel}
        onRequestClose={() => setPanel(null)}
        sheetStyle={{ maxHeight: '94%' }}
      >
        {panel ? (
          <ClassConfigSheet
            initial={panel}
            onClose={() => setPanel(null)}
            onSaved={() => void load()}
          />
        ) : null}
      </FormModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 12,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#0F766E',
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  list: { paddingHorizontal: 20, paddingBottom: 48 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    marginBottom: 10,
    backgroundColor: colors.bg,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  sectionLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  sectionCount: { fontSize: 12, color: colors.textMuted },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 12,
  },
  cardBody: { flexDirection: 'row' },
  accent: { width: 6, backgroundColor: '#0F766E' },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  cardMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 12 },
  statTeal: {
    flex: 1,
    backgroundColor: '#F0FDFA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statAmber: {
    flex: 1,
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statValue: { fontSize: 18, fontWeight: '800', color: '#134E4A' },
  statValueAmber: { fontSize: 18, fontWeight: '800', color: '#78350F' },
  statLabel: { fontSize: 11, color: '#0F766E', marginTop: 2, fontWeight: '600' },
  statLabelAmber: { fontSize: 11, color: '#92400E', marginTop: 2, fontWeight: '600' },
  teacherBox: {
    marginTop: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
  },
  teacherLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#0F766E',
    marginBottom: 6,
  },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#fff',
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#F0FDFA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontSize: 10, fontWeight: '700', color: '#0F766E' },
  more: { marginLeft: 8, fontSize: 12, fontWeight: '600', color: colors.textMuted },
  previewEmpty: { fontSize: 12, color: colors.textMuted },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  link: { color: '#0F766E', fontWeight: '700', fontSize: 13 },
  danger: { color: colors.danger, fontWeight: '700', fontSize: 13 },
});
