import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Button,
  ErrorBanner,
  LoadingBlock,
  Screen,
  SegmentedControl,
  DateField,
  TextField,
  Title,
} from '../../components/ui';
import { useSchool } from '../../context/SchoolContext';
import { AccessDenied, useCanEditStudent } from '../../lib/access';
import { promptPickImage } from '../../lib/pickImage';
import { colors } from '../../theme/tokens';
import {
  createStudent,
  getAcademicYears,
  getClasses,
  getImageUrl,
  getRooms,
  getStudent,
  updateStudent,
  uploadImage,
  type AcademicYear,
  type ClassItem,
  type RoomItem,
  type StudentWriteBody,
} from '../../services/api';
import type { StudentsStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<StudentsStackParamList, 'Enrollment'>;
type StepId = 'identite' | 'scolarite' | 'famille' | 'photos';
type PickerKind = 'year' | 'class' | 'room' | 'gender' | null;
type PhotoKey =
  | 'photo_identity_student'
  | 'photo_identity_mother'
  | 'photo_identity_father'
  | 'photo_identity_responsible';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'identite', label: 'Identité' },
  { id: 'scolarite', label: 'Scolarité' },
  { id: 'famille', label: 'Famille' },
  { id: 'photos', label: 'Photos' },
];

const EMPTY: StudentWriteBody = {
  order_number: '',
  first_name: '',
  last_name: '',
  class_id: '',
  room_id: '',
  academic_year_id: '',
  email: '',
  phone: '',
  address: '',
  birth_date: '',
  birth_place: '',
  gender: '',
  photo_identity_student: '',
  photo_identity_mother: '',
  photo_identity_father: '',
  photo_identity_responsible: '',
  mother_name: '',
  mother_phone: '',
  father_name: '',
  father_phone: '',
  responsible_name: '',
  responsible_phone: '',
};

export function EnrollmentScreen({ navigation, route }: Props) {
  const allowed = useCanEditStudent();
  const studentId = route.params?.studentId;
  const editing = !!studentId;
  const { context } = useSchool();

  const [step, setStep] = useState<StepId>('identite');
  const [form, setForm] = useState<StudentWriteBody>({ ...EMPTY });
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [boot, setBoot] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<PhotoKey | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [picker, setPicker] = useState<PickerKind>(null);

  const roomsForForm = useMemo(
    () => (form.class_id ? rooms.filter((r) => r.class_id === form.class_id) : []),
    [rooms, form.class_id],
  );

  const patch = useCallback((partial: Partial<StudentWriteBody>) => {
    setForm((f) => ({ ...f, ...partial }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [y, c, r] = await Promise.all([
          getAcademicYears(),
          getClasses(),
          getRooms(),
        ]);
        if (cancelled) return;
        setYears(y);
        setClasses(c);
        setRooms(r);

        if (studentId) {
          const s = await getStudent(studentId);
          if (cancelled || !s) return;
          setForm({
            ...EMPTY,
            order_number: s.order_number || '',
            first_name: s.first_name || '',
            last_name: s.last_name || '',
            class_id: s.class_id || '',
            room_id: s.room_id || '',
            email: s.email || '',
            phone: s.phone || '',
            address: s.address || '',
            birth_date: s.birth_date ? String(s.birth_date).slice(0, 10) : '',
            birth_place: s.birth_place || '',
            gender: s.gender || '',
            photo_identity_student: s.photo_identity_student || '',
            photo_identity_mother: s.photo_identity_mother || '',
            photo_identity_father: s.photo_identity_father || '',
            photo_identity_responsible: s.photo_identity_responsible || '',
            mother_name: s.mother_name || '',
            mother_phone: s.mother_phone || '',
            father_name: s.father_name || '',
            father_phone: s.father_phone || '',
            responsible_name: s.responsible_name || '',
            responsible_phone: s.responsible_phone || '',
          });
          navigation.setOptions({ title: 'Modifier l’élève' });
        } else {
          const yearId =
            context?.academic_year?.id ||
            context?.current_academic_year_id ||
            y[0]?.id ||
            '';
          patch({ academic_year_id: yearId });
          navigation.setOptions({ title: 'Inscription' });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Chargement impossible');
        }
      } finally {
        if (!cancelled) setBoot(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, context?.academic_year?.id, context?.current_academic_year_id, navigation, patch]);

  function validateStep(id: StepId): string | null {
    if (id === 'identite') {
      if (!form.order_number.trim()) return 'NISU obligatoire.';
      if (!form.first_name.trim() || !form.last_name.trim()) {
        return 'Prénom et nom obligatoires.';
      }
    }
    if (id === 'scolarite') {
      if (!form.class_id) return 'Classe obligatoire.';
      if (!editing && !form.academic_year_id) return 'Année scolaire obligatoire.';
    }
    return null;
  }

  function goNext() {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    setError('');
    const idx = STEPS.findIndex((s) => s.id === step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].id);
  }

  function goPrev() {
    setError('');
    const idx = STEPS.findIndex((s) => s.id === step);
    if (idx > 0) setStep(STEPS[idx - 1].id);
  }

  async function handleSave() {
    for (const s of STEPS) {
      const err = validateStep(s.id);
      if (err) {
        setStep(s.id);
        setError(err);
        return;
      }
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const nisu = form.order_number.trim().replace(/[\s\u00A0]+/g, '').toUpperCase();
      const body: StudentWriteBody = {
        order_number: nisu,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        class_id: form.class_id,
        room_id: form.room_id || null,
        email: form.email?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        address: form.address?.trim() || undefined,
        birth_date: form.birth_date || undefined,
        birth_place: form.birth_place?.trim() || undefined,
        gender: form.gender?.trim() || undefined,
        photo_identity_student: form.photo_identity_student?.trim() || undefined,
        photo_identity_mother: form.photo_identity_mother?.trim() || undefined,
        photo_identity_father: form.photo_identity_father?.trim() || undefined,
        photo_identity_responsible: form.photo_identity_responsible?.trim() || undefined,
        mother_name: form.mother_name?.trim() || undefined,
        mother_phone: form.mother_phone?.trim() || undefined,
        father_name: form.father_name?.trim() || undefined,
        father_phone: form.father_phone?.trim() || undefined,
        responsible_name: form.responsible_name?.trim() || undefined,
        responsible_phone: form.responsible_phone?.trim() || undefined,
      };
      if (!editing && form.academic_year_id) {
        body.academic_year_id = form.academic_year_id;
      }

      if (editing && studentId) {
        const updated = await updateStudent(studentId, body);
        setSuccess('Élève mis à jour.');
        navigation.replace('StudentFiche', {
          studentId: updated.id,
          studentName: `${updated.first_name} ${updated.last_name}`,
        });
      } else {
        const created = await createStudent(body);
        Alert.alert(
          'Inscription réussie',
          `NISU : ${created.order_number || nisu}`,
          [
            {
              text: 'Voir la fiche',
              onPress: () =>
                navigation.replace('StudentFiche', {
                  studentId: created.id,
                  studentName: `${created.first_name} ${created.last_name}`,
                }),
            },
            {
              text: 'Nouvelle inscription',
              onPress: () => {
                setForm({
                  ...EMPTY,
                  academic_year_id:
                    form.academic_year_id ||
                    context?.academic_year?.id ||
                    years[0]?.id ||
                    '',
                });
                setStep('identite');
                setSuccess('');
              },
            },
          ],
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  function pickPhoto(key: PhotoKey) {
    setError('');
    promptPickImage((image) => {
      void (async () => {
        try {
          setUploading(key);
          const url = await uploadImage(image.uri, {
            mimeType: image.mimeType || 'image/jpeg',
            fileName: image.fileName || undefined,
          });
          patch({ [key]: url });
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Upload impossible');
        } finally {
          setUploading(null);
        }
      })();
    });
  }

  const pickerItems = useMemo(() => {
    if (picker === 'year') return years.map((y) => ({ id: y.id, label: y.name }));
    if (picker === 'class') return classes.map((c) => ({ id: c.id, label: c.name }));
    if (picker === 'room') {
      return [
        { id: '', label: 'Aucune salle' },
        ...roomsForForm.map((r) => ({ id: r.id, label: r.name })),
      ];
    }
    if (picker === 'gender') {
      return [
        { id: '', label: '—' },
        { id: 'M', label: 'Masculin' },
        { id: 'F', label: 'Féminin' },
      ];
    }
    return [];
  }, [picker, years, classes, roomsForForm]);

  if (!allowed) {
    return <AccessDenied />;
  }

  if (boot) {
    return (
      <Screen>
        <LoadingBlock label="Chargement…" />
      </Screen>
    );
  }

  return (
    <Screen style={{ paddingHorizontal: 0, paddingBottom: 0 }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Title>{editing ? 'Modifier l’élève' : 'Inscription'}</Title>

        <View style={{ marginTop: 12 }}>
          <SegmentedControl
            options={STEPS}
            value={step}
            onChange={(id) => {
              setError('');
              setStep(id as StepId);
            }}
          />
        </View>

        <ErrorBanner message={error} />
        {success ? (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>{success}</Text>
          </View>
        ) : null}

        {step === 'identite' ? (
          <View style={styles.block}>
            <TextField
              label="NISU *"
              value={form.order_number}
              onChangeText={(t) => patch({ order_number: t })}
              autoCapitalize="characters"
            />
            <TextField
              label="Prénom *"
              value={form.first_name}
              onChangeText={(t) => patch({ first_name: t })}
            />
            <TextField
              label="Nom *"
              value={form.last_name}
              onChangeText={(t) => patch({ last_name: t })}
            />
            <SelectChip
              label="Genre"
              value={
                form.gender === 'M' ? 'Masculin' : form.gender === 'F' ? 'Féminin' : '—'
              }
              onPress={() => setPicker('gender')}
            />
            <DateField
              label="Date de naissance"
              value={form.birth_date || ''}
              onChange={(t) => patch({ birth_date: t })}
              maximumDate={new Date()}
            />
            <TextField
              label="Lieu de naissance"
              value={form.birth_place || ''}
              onChangeText={(t) => patch({ birth_place: t })}
            />
            <TextField
              label="Téléphone"
              value={form.phone || ''}
              onChangeText={(t) => patch({ phone: t })}
              keyboardType="phone-pad"
            />
            <TextField
              label="Email"
              value={form.email || ''}
              onChangeText={(t) => patch({ email: t })}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextField
              label="Adresse"
              value={form.address || ''}
              onChangeText={(t) => patch({ address: t })}
            />
          </View>
        ) : null}

        {step === 'scolarite' ? (
          <View style={styles.block}>
            {!editing ? (
              <SelectChip
                label="Année scolaire *"
                value={years.find((y) => y.id === form.academic_year_id)?.name || 'Choisir'}
                onPress={() => setPicker('year')}
              />
            ) : null}
            <SelectChip
              label="Classe *"
              value={classes.find((c) => c.id === form.class_id)?.name || 'Choisir'}
              onPress={() => setPicker('class')}
            />
            <SelectChip
              label="Salle"
              value={rooms.find((r) => r.id === form.room_id)?.name || 'Aucune'}
              onPress={() => setPicker('room')}
            />
          </View>
        ) : null}

        {step === 'famille' ? (
          <View style={styles.block}>
            <TextField
              label="Nom de la mère"
              value={form.mother_name || ''}
              onChangeText={(t) => patch({ mother_name: t })}
            />
            <TextField
              label="Tél. mère"
              value={form.mother_phone || ''}
              onChangeText={(t) => patch({ mother_phone: t })}
              keyboardType="phone-pad"
            />
            <TextField
              label="Nom du père"
              value={form.father_name || ''}
              onChangeText={(t) => patch({ father_name: t })}
            />
            <TextField
              label="Tél. père"
              value={form.father_phone || ''}
              onChangeText={(t) => patch({ father_phone: t })}
              keyboardType="phone-pad"
            />
            <TextField
              label="Responsable"
              value={form.responsible_name || ''}
              onChangeText={(t) => patch({ responsible_name: t })}
            />
            <TextField
              label="Tél. responsable"
              value={form.responsible_phone || ''}
              onChangeText={(t) => patch({ responsible_phone: t })}
              keyboardType="phone-pad"
            />
          </View>
        ) : null}

        {step === 'photos' ? (
          <View style={styles.block}>
            {(
              [
                ['photo_identity_student', 'Élève'],
                ['photo_identity_mother', 'Mère'],
                ['photo_identity_father', 'Père'],
                ['photo_identity_responsible', 'Responsable'],
              ] as [PhotoKey, string][]
            ).map(([key, label]) => {
              const uri = getImageUrl(form[key] || null);
              return (
                <View key={key} style={styles.photoRow}>
                  {uri ? (
                    <Image source={{ uri }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <Text style={styles.thumbText}>—</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.photoLabel}>{label}</Text>
                    <Button
                      title={uploading === key ? 'Upload…' : uri ? 'Remplacer' : 'Choisir'}
                      variant="ghost"
                      onPress={() => void pickPhoto(key)}
                      disabled={!!uploading}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={styles.navRow}>
          {step !== 'identite' ? (
            <Button
              title="Précédent"
              variant="ghost"
              icon="chevron-back"
              onPress={goPrev}
              disabled={saving}
              style={styles.navBtn}
            />
          ) : (
            <View style={styles.navBtn} />
          )}
          {step !== 'photos' ? (
            <Button
              title="Suivant"
              icon="chevron-forward"
              iconPosition="right"
              onPress={goNext}
              disabled={saving}
              style={styles.navBtn}
            />
          ) : (
            <Button
              title={saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Inscrire'}
              icon={saving ? undefined : 'checkmark'}
              iconPosition="right"
              onPress={() => void handleSave()}
              disabled={saving || !!uploading}
              style={styles.navBtn}
            />
          )}
        </View>
      </ScrollView>

      <Modal
        visible={!!picker}
        animationType="slide"
        transparent
        onRequestClose={() => setPicker(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPicker(null)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choisir</Text>
              <Pressable onPress={() => setPicker(null)} hitSlop={12}>
                <Text style={styles.modalClose}>Fermer</Text>
              </Pressable>
            </View>
            <FlatList
              data={pickerItems}
              keyExtractor={(item, index) => item.id || `empty-${index}`}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    if (picker === 'year') patch({ academic_year_id: item.id });
                    if (picker === 'class') patch({ class_id: item.id, room_id: '' });
                    if (picker === 'room') patch({ room_id: item.id });
                    if (picker === 'gender') patch({ gender: item.id });
                    setPicker(null);
                  }}
                >
                  <Text style={styles.rowTitle}>{item.label}</Text>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function SelectChip({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue} numberOfLines={1}>
        {value}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  block: { marginTop: 14, gap: 4 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  chipLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  chipValue: { fontSize: 15, color: colors.text, fontWeight: '700', marginTop: 2 },
  navRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 28,
    marginBottom: 8,
    alignItems: 'stretch',
  },
  navBtn: {
    flex: 1,
    marginTop: 0,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  thumb: { width: 64, height: 80, borderRadius: 8, backgroundColor: colors.bg },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  thumbText: { color: colors.textMuted },
  photoLabel: { fontWeight: '700', color: colors.text, marginBottom: 4 },
  successBanner: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
  },
  successText: { color: '#065F46', fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(28,25,23,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '55%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  modalClose: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  modalRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
});
