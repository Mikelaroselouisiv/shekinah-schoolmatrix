import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Button, Screen } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useSchool } from '../../context/SchoolContext';
import { formatRoleLabel } from '../../lib/moreNavigation';
import { isTeacherRole } from '../../lib/permissions';
import { studentDisplayName } from '../../lib/format';
import {
  getImageUrl,
  getRooms,
  getTeacherClasses,
  getTeacherDetail,
  getTeacherPlaces,
  type TeacherPlace,
} from '../../services/api';
import { listBottomPadding } from '../../lib/layout';
import { colors, softTint } from '../../theme/tokens';
import type { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ProfileMain'>;

function placeLines(places: TeacherPlace[]): string[] {
  const byClass = new Map<string, string[]>();
  for (const place of places) {
    const rooms = byClass.get(place.class_name) ?? [];
    if (place.room_name && !rooms.includes(place.room_name)) rooms.push(place.room_name);
    byClass.set(place.class_name, rooms);
  }
  return [...byClass.entries()].map(([className, rooms]) =>
    rooms.length ? `${className} · ${rooms.join(' · ')}` : className,
  );
}

type AssignedPlace = {
  class_id?: string;
  class_name?: string | null;
  room_id?: string | null;
  room_name?: string | null;
};

async function loadTeacherPlaces(userId?: number): Promise<TeacherPlace[]> {
  const collected: TeacherPlace[] = [];
  try {
    collected.push(...(await getTeacherPlaces()));
  } catch {
    // L’endpoint peut être absent tant que le serveur n’est pas relancé.
  }

  if (!collected.some((place) => place.room_name) && userId) {
    try {
      const detail = (await getTeacherDetail(userId)) as {
        class_subjects?: AssignedPlace[];
        schedule_slots?: AssignedPlace[];
      } | null;
      const assigned = [...(detail?.class_subjects ?? []), ...(detail?.schedule_slots ?? [])];
      const classIds = [
        ...new Set(assigned.map((item) => item.class_id).filter((id): id is string => !!id)),
      ];
      const roomNames = new Map<string, string>();
      await Promise.all(
        classIds.map(async (classId) => {
          const needsLookup = assigned.some(
            (item) => item.class_id === classId && item.room_id && !item.room_name?.trim(),
          );
          if (!needsLookup) return;
          const rooms = await getRooms(classId);
          for (const room of rooms) {
            if (room.name?.trim()) roomNames.set(room.id, room.name.trim());
          }
        }),
      );
      for (const item of assigned) {
        const className = item.class_name?.trim();
        if (!className) continue;
        const roomName =
          item.room_name?.trim() || (item.room_id ? roomNames.get(item.room_id) : '') || null;
        if (!roomName) continue;
        collected.push({ class_name: className, room_name: roomName });
      }
    } catch {
      // Le détail professeur reste optionnel.
    }
  }

  const withRoom = collected.filter((place) => place.room_name);
  const classesWithRoom = new Set(withRoom.map((place) => place.class_name));
  const merged = [
    ...withRoom,
    ...collected.filter((place) => !place.room_name && !classesWithRoom.has(place.class_name)),
  ];
  if (merged.length) return merged;

  try {
    const classes = await getTeacherClasses();
    return classes.map((item) => ({ class_name: item.name, room_name: null }));
  } catch {
    return [];
  }
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

export function ProfileScreen({ navigation }: Props) {
  const { user, roleName, linkedStudents, refreshLinkedStudents, logout } = useAuth();
  const { theme, home, context } = useSchool();

  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email || 'Compte';
  const photoUri = getImageUrl(user?.profile_photo_url);
  const schoolName = context?.school?.name || home?.name || '';
  const roleLabel = formatRoleLabel(roleName);
  const showChildren = roleName === 'PARENT' || linkedStudents.length > 0;
  const edge = softTint(theme.accent, 0.72);
  const [places, setPlaces] = useState<TeacherPlace[]>([]);

  useFocusEffect(
    useCallback(() => {
      void refreshLinkedStudents();
      if (!isTeacherRole(roleName)) {
        setPlaces([]);
        return;
      }
      const userId = user?.id ?? user?.userId;
      void loadTeacherPlaces(userId).then(setPlaces);
    }, [refreshLinkedStudents, roleName, user?.id, user?.userId]),
  );

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { borderColor: edge }]}>
          <View style={[styles.photoRing, { borderColor: theme.accent }]}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoFallback, { backgroundColor: theme.accentTint }]}>
                <Text style={[styles.initials, { color: theme.accent }]}>
                  {initialsOf(displayName) || '·'}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.name} numberOfLines={2}>
            {displayName}
          </Text>
          <View style={[styles.rolePill, { backgroundColor: theme.accentTint }]}>
            <Text style={[styles.role, { color: theme.accent }]}>{roleLabel}</Text>
          </View>
          {places.length > 0 ? (
            <View style={styles.places}>
              {placeLines(places).map((line) => (
                <Text key={line} style={styles.place}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
          {schoolName ? <Text style={styles.school}>{schoolName}</Text> : null}
        </View>

        <View style={styles.card}>
          <InfoRow icon="mail-outline" label="E-mail" value={user?.email || '—'} />
          <InfoRow icon="call-outline" label="Téléphone" value={user?.phone || '—'} last />
        </View>

        <Button
          title="Modifier le profil"
          icon="create-outline"
          onPress={() => navigation.navigate('ProfileEdit')}
        />

        {showChildren ? (
          <>
            <Text style={styles.sectionLabel}>Mes enfants</Text>
            {linkedStudents.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.empty}>Aucun enfant lié</Text>
              </View>
            ) : (
              linkedStudents.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() =>
                    navigation.navigate('StudentFiche', {
                      studentId: s.id,
                      studentName: studentDisplayName(s),
                    })
                  }
                  style={({ pressed }) => [
                    styles.childRow,
                    { borderColor: edge },
                    pressed && { opacity: 0.88 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.childName}>{studentDisplayName(s)}</Text>
                    <Text style={styles.childMeta}>
                      {s.class_name || s.order_number || '—'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              ))
            )}
          </>
        ) : null}

        <Button
          title="Déconnexion"
          variant="danger"
          onPress={() => void logout()}
          style={styles.logout}
        />
      </ScrollView>
    </Screen>
  );
}

function InfoRow({
  icon,
  label,
  value,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !last && styles.infoBorder]}>
      <Ionicons name={icon} size={18} color={colors.inkSoft} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: listBottomPadding(24),
    gap: 14,
  },
  hero: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 24,
  },
  photoRing: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 2,
    padding: 4,
    marginBottom: 16,
  },
  photo: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  photoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontSize: 36,
    fontWeight: '600',
  },
  name: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  rolePill: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  role: {
    fontSize: 14,
    fontWeight: '600',
  },
  places: {
    marginTop: 12,
    alignItems: 'center',
    gap: 4,
  },
  place: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'center',
  },
  school: {
    marginTop: 10,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.2,
  },
  infoValue: {
    marginTop: 2,
    fontSize: 16,
    color: colors.text,
  },
  sectionLabel: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  childName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  childMeta: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textMuted,
  },
  empty: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 18,
  },
  logout: {
    marginTop: 8,
  },
});
