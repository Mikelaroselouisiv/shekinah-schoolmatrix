import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormScrollView } from '../../components/FormScrollView';
import {
  Button,
  ErrorBanner,
  LoadingBlock,
  Muted,
  Screen,
  TextField,
  Title,
} from '../../components/ui';
import { useSchool } from '../../context/SchoolContext';
import { promptPickImage } from '../../lib/pickImage';
import { colors } from '../../theme/tokens';
import {
  getImageUrl,
  listSchoolSignatures,
  patchSchoolProfile,
  uploadImage,
  type SchoolSignature,
} from '../../services/api';
import type { MoreStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';

type Props = NativeStackScreenProps<MoreStackParamList, 'SchoolAdmin'>;

const FIXED_SLOTS: { slot_key: string; default_role: string; sort_order: number }[] = [
  { slot_key: 'directeur_general', default_role: 'Directeur / Directrice Général(e)', sort_order: 0 },
  { slot_key: 'econome', default_role: 'Économe', sort_order: 1 },
  { slot_key: 'coord_prescolaire', default_role: 'Coord. préscolaire', sort_order: 2 },
  { slot_key: 'coord_fondamentale', default_role: 'Coord. fondamentale', sort_order: 3 },
  { slot_key: 'coord_secondaire', default_role: 'Coord. secondaire', sort_order: 4 },
];

function mergeSignatures(api: SchoolSignature[]): SchoolSignature[] {
  const byKey = new Map(api.map((s) => [s.slot_key, s]));
  const fixed = FIXED_SLOTS.map((slot) => {
    const existing = byKey.get(slot.slot_key);
    return {
      id: existing?.id ?? null,
      slot_key: slot.slot_key,
      signer_name: existing?.signer_name || '',
      signer_role: existing?.signer_role || slot.default_role,
      image_url: existing?.image_url ?? null,
      sort_order: existing?.sort_order ?? slot.sort_order,
    };
  });
  const extras = api.filter((s) => !FIXED_SLOTS.some((f) => f.slot_key === s.slot_key));
  return [...fixed, ...extras];
}

export function SchoolAdminScreen({}: Props) {
  const allowed = useCanAccess('school');
  const { home, refetch, theme } = useSchool();
  const [boot, setBoot] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [name, setName] = useState('');
  const [slogan, setSlogan] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [domain, setDomain] = useState('');
  const [primary, setPrimary] = useState(colors.flame);
  const [secondary, setSecondary] = useState(colors.flameMuted);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [signatures, setSignatures] = useState<SchoolSignature[]>([]);
  const [openSig, setOpenSig] = useState<string | null>(null);

  const hydrateFromHome = useCallback(() => {
    if (!home) return;
    setName(home.name || '');
    setSlogan(home.slogan || '');
    setAddress(home.address || '');
    setPhone(home.phone || '');
    setEmail(home.email || '');
    setDomain(home.domain || '');
    setPrimary(home.primary_color || colors.flame);
    setSecondary(home.secondary_color || colors.flameMuted);
    setLogoUrl(home.logo_url || null);
  }, [home]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        hydrateFromHome();
        const sigs = await listSchoolSignatures();
        if (!cancelled) setSignatures(mergeSignatures(sigs));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur');
      } finally {
        if (!cancelled) setBoot(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateFromHome]);

  function updateSig(slotKey: string, patch: Partial<SchoolSignature>) {
    setSignatures((prev) =>
      prev.map((s) => (s.slot_key === slotKey ? { ...s, ...patch } : s)),
    );
  }

  function pickLogo() {
    setError('');
    promptPickImage((image) => {
      void (async () => {
        try {
          setUploading(true);
          const url = await uploadImage(image.uri, {
            mimeType: image.mimeType || 'image/png',
            fileName: image.fileName || undefined,
          });
          setLogoUrl(url);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Upload impossible');
        } finally {
          setUploading(false);
        }
      })();
    });
  }

  async function save() {
    if (!name.trim()) {
      setError('Nom de l’établissement requis.');
      return;
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(primary.trim()) || !/^#[0-9A-Fa-f]{6}$/.test(secondary.trim())) {
      setError('Couleurs au format #RRGGBB.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await patchSchoolProfile({
        name: name.trim(),
        slogan: slogan.trim() || null,
        domain: domain.trim() || null,
        address: address.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        primary_color: primary.trim(),
        secondary_color: secondary.trim(),
        logo_url: logoUrl,
        signatures: signatures.map((s) => ({
          id: s.id || undefined,
          slot_key: s.slot_key,
          signer_name: s.signer_name || '',
          signer_role: s.signer_role || '',
          image_url: s.image_url ?? null,
          sort_order: s.sort_order ?? 0,
        })),
      });
      await refetch();
      setSuccess('Établissement enregistré — thème mis à jour.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
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

  const logoUri = getImageUrl(logoUrl);

  return (
    <Screen style={{ paddingHorizontal: 0, paddingBottom: 0 }}>
      <FormScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Title>Établissement</Title>
        <ErrorBanner message={error} />
        {success ? (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>{success}</Text>
          </View>
        ) : null}

        <View style={styles.preview}>
          <View style={[styles.swatch, { backgroundColor: theme.primary }]} />
          <View style={[styles.swatch, { backgroundColor: theme.secondary }]} />
        </View>

        <TextField label="Nom *" value={name} onChangeText={setName} />
        <TextField label="Slogan" value={slogan} onChangeText={setSlogan} />
        <TextField label="Adresse" value={address} onChangeText={setAddress} />
        <TextField
          label="Téléphone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextField label="Domaine" value={domain} onChangeText={setDomain} autoCapitalize="none" />
        <TextField
          label="Couleur marque / accent (#RRGGBB)"
          value={primary}
          onChangeText={setPrimary}
          autoCapitalize="characters"
        />
        <TextField
          label="Couleur secondaire (#RRGGBB)"
          value={secondary}
          onChangeText={setSecondary}
          autoCapitalize="characters"
        />

        <Text style={styles.section}>Logo</Text>
        <View style={styles.logoRow}>
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={styles.logo} />
          ) : (
            <View style={[styles.logo, styles.logoEmpty]}>
              <Text style={{ color: colors.textMuted }}>—</Text>
            </View>
          )}
          <Button
            title={uploading ? 'Upload…' : 'Choisir un logo'}
            variant="ghost"
            onPress={() => void pickLogo()}
            disabled={uploading}
          />
        </View>

        <Text style={styles.section}>Signatures</Text>
        {signatures.map((s) => {
          const open = openSig === s.slot_key;
          return (
            <View key={s.slot_key} style={styles.sigCard}>
              <Pressable onPress={() => setOpenSig(open ? null : s.slot_key)}>
                <Text style={styles.sigTitle}>
                  {s.signer_role || s.slot_key} {open ? '▾' : '▸'}
                </Text>
                <Muted>{s.signer_name || 'Sans nom'}</Muted>
              </Pressable>
              {open ? (
                <View style={{ marginTop: 8 }}>
                  <TextField
                    label="Nom du signataire"
                    value={s.signer_name || ''}
                    onChangeText={(t) => updateSig(s.slot_key, { signer_name: t })}
                  />
                  <TextField
                    label="Fonction"
                    value={s.signer_role || ''}
                    onChangeText={(t) => updateSig(s.slot_key, { signer_role: t })}
                  />
                </View>
              ) : null}
            </View>
          );
        })}

        <View style={{ marginTop: 16, marginBottom: 40, gap: 8 }}>
          <Button
            title={saving ? 'Enregistrement…' : 'Enregistrer'}
            onPress={() => void save()}
            disabled={saving || uploading}
          />
        </View>
      </FormScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 12,
  },
  swatch: { width: 28, height: 28, borderRadius: 8 },
  section: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  logo: { width: 64, height: 64, borderRadius: 12, backgroundColor: colors.bg },
  logoEmpty: { alignItems: 'center', justifyContent: 'center' },
  sigCard: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sigTitle: { fontWeight: '700', color: colors.text, fontSize: 15 },
  successBanner: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
  },
  successText: { color: '#065F46', fontWeight: '600' },
});
