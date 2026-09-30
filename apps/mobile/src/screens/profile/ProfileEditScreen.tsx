import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import {
  Button,
  ErrorBanner,
  PasswordField,
  Screen,
  TextField,
} from '../../components/ui';
import { FormScrollView } from '../../components/FormScrollView';
import { useAuth } from '../../context/AuthContext';
import { useSchool } from '../../context/SchoolContext';
import { promptPickImage } from '../../lib/pickImage';
import { getImageUrl, updateOwnProfile, uploadOwnPhoto, changeOwnPassword } from '../../services/api';
import { listBottomPadding } from '../../lib/layout';
import { colors, softTint } from '../../theme/tokens';
import type { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ProfileEdit'>;

const PROFILE_CROP = { allowsEditing: true, aspect: [1, 1] as [number, number] };

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

export function ProfileEditScreen({ navigation }: Props) {
  const { user, refreshUser, logout } = useAuth();
  const { theme } = useSchool();
  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const displayName =
    [firstName, lastName].filter(Boolean).join(' ') || user?.email || 'Compte';
  const photoUri = previewUri || getImageUrl(user?.profile_photo_url);
  const edge = softTint(theme.accent, 0.72);

  useEffect(() => {
    setFirstName(user?.first_name ?? '');
    setLastName(user?.last_name ?? '');
    setEmail(user?.email ?? '');
    setPhone(user?.phone ?? '');
  }, [user]);

  function choosePhoto() {
    promptPickImage((image) => {
      void (async () => {
        setError('');
        setNotice('');
        setPreviewUri(image.uri);
        setUploadingPhoto(true);
        try {
          await uploadOwnPhoto(image.uri, {
            mimeType: image.mimeType || 'image/jpeg',
            fileName: image.fileName || undefined,
          });
          await refreshUser();
          setPreviewUri(null);
          setNotice('Photo enregistrée.');
        } catch (err) {
          setPreviewUri(null);
          setError(err instanceof Error ? err.message : 'Impossible d’enregistrer la photo');
        } finally {
          setUploadingPhoto(false);
        }
      })();
    }, PROFILE_CROP);
  }

  async function saveProfile() {
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await updateOwnProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      await refreshUser();
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer');
    } finally {
      setSaving(false);
    }
  }

  async function savePassword() {
    setError('');
    setNotice('');
    if (newPassword !== confirmPassword) {
      setError('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }
    setSavingPassword(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      await logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de changer le mot de passe');
      setSavingPassword(false);
    }
  }

  return (
    <Screen style={styles.screen}>
      <FormScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={choosePhoto}
          disabled={uploadingPhoto}
          accessibilityRole="button"
          accessibilityLabel="Modifier la photo de profil"
          style={styles.photoWrap}
        >
          <View style={[styles.photoRing, { borderColor: edge }]}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoFallback, { backgroundColor: theme.accentTint }]}>
                <Text style={[styles.initials, { color: theme.accent }]}>
                  {initialsOf(displayName) || '·'}
                </Text>
              </View>
            )}
            {uploadingPhoto ? (
              <View style={styles.photoBusy}>
                <ActivityIndicator color={colors.surface} />
              </View>
            ) : null}
          </View>
          <View style={[styles.cameraBadge, { backgroundColor: theme.accent }]}>
            <Ionicons name="camera" size={16} color={colors.surface} />
          </View>
        </Pressable>
        <Text style={styles.photoHint}>Caméra ou galerie, puis recadrage</Text>

        <ErrorBanner message={error} />
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <Text style={styles.sectionLabel}>Coordonnées</Text>
        <View style={styles.card}>
          <TextField label="Prénom" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
          <TextField label="Nom" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
          <TextField
            label="Téléphone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <TextField
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <Button
            title={saving ? 'Enregistrement…' : 'Enregistrer'}
            onPress={() => void saveProfile()}
            disabled={saving || savingPassword || uploadingPhoto}
          />
        </View>

        <Text style={styles.sectionLabel}>Mot de passe</Text>
        <View style={styles.card}>
          <PasswordField
            label="Mot de passe actuel"
            value={currentPassword}
            onChangeText={setCurrentPassword}
          />
          <PasswordField
            label="Nouveau mot de passe"
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <PasswordField
            label="Confirmer"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
          <Button
            title={savingPassword ? 'Mise à jour…' : 'Changer le mot de passe'}
            variant="ghost"
            onPress={() => void savePassword()}
            disabled={saving || savingPassword || uploadingPhoto}
          />
        </View>
      </FormScrollView>
    </Screen>
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
    gap: 12,
  },
  photoWrap: {
    alignSelf: 'center',
    marginTop: 4,
  },
  photoRing: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 1,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontSize: 36,
    fontWeight: '600',
  },
  photoBusy: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(28, 25, 23, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  photoHint: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 4,
  },
  notice: {
    fontSize: 14,
    color: colors.success,
    textAlign: 'center',
  },
  sectionLabel: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 12,
  },
});
