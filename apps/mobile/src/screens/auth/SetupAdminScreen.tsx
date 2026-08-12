import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, ErrorBanner, PasswordField, TextField } from '../../components/ui';
import { createInitialAdmin } from '../../services/api';
import { useSchool } from '../../context/SchoolContext';
import { colors } from '../../theme/tokens';

type Props = {
  onDone: () => void;
  onBackToLogin: () => void;
};

export function SetupAdminScreen({ onDone, onBackToLogin }: Props) {
  const { theme } = useSchool();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await createInitialAdmin({ email, phone, password });
      setMessage('Compte créé. Tu peux te connecter.');
      setTimeout(() => onDone(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.logoRing, { borderColor: theme.accentTint }]}>
          <Image source={require('../../../assets/brand-logo.png')} style={styles.logo} />
        </View>
        <Text style={[styles.brand, { color: theme.primary }]}>Shekinah</Text>
        <Text style={styles.subtitle}>Créer un compte</Text>

        <View style={styles.card}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="admin@exemple.com"
          />
          <TextField
            label="Téléphone (optionnel)"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            placeholder="+509…"
          />
          <PasswordField
            label="Mot de passe"
            value={password}
            onChangeText={setPassword}
            textContentType="newPassword"
            placeholder="••••••••"
          />
          <ErrorBanner message={error} />
          {message ? (
            <View style={styles.okBanner}>
              <Text style={styles.okText}>{message}</Text>
            </View>
          ) : null}
          <Button
            title={loading ? 'Création…' : 'Créer le compte'}
            onPress={() => void handleSubmit()}
            disabled={loading || !email.trim() || !password}
          />
          <Button title="Retour" variant="ghost" onPress={onBackToLogin} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoRing: {
    alignSelf: 'center',
    marginBottom: 16,
    padding: 6,
    borderRadius: 28,
    borderWidth: 1.5,
  },
  logo: {
    width: 112,
    height: 112,
    borderRadius: 22,
  },
  brand: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    textAlign: 'center',
    color: colors.textMuted,
    marginBottom: 24,
    marginTop: 4,
    fontSize: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  okBanner: {
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  okText: {
    color: colors.success,
    fontSize: 14,
  },
});
