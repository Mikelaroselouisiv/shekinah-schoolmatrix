import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Button, ErrorBanner, PasswordField, TextField } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useSchool } from '../../context/SchoolContext';
import { getSetupRequired } from '../../services/api';
import { colors } from '../../theme/tokens';
import { SetupAdminScreen } from './SetupAdminScreen';

export function LoginScreen() {
  const { login } = useAuth();
  const { theme, refetch } = useSchool();
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  const refreshSetup = useCallback(async () => {
    try {
      const required = await getSetupRequired();
      setSetupRequired(required);
      if (required) setShowSetup(true);
    } catch {
      setSetupRequired(false);
    }
  }, []);

  useEffect(() => {
    void refreshSetup();
  }, [refreshSetup]);

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      await login(loginValue, password, rememberMe);
      await refetch();
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Erreur de connexion';
      setError(/invalid credentials/i.test(raw) ? 'Identifiants invalides' : raw);
      void refreshSetup();
    } finally {
      setLoading(false);
    }
  }

  if (showSetup && setupRequired) {
    return (
      <SetupAdminScreen
        onDone={() => {
          setShowSetup(false);
          setSetupRequired(false);
          void refreshSetup();
        }}
        onBackToLogin={() => setShowSetup(false)}
      />
    );
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
        <Text style={styles.subtitle}>Connexion</Text>

        <View style={styles.card}>
          <TextField
            label="Email ou téléphone"
            value={loginValue}
            onChangeText={setLoginValue}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            placeholder="exemple@email.com"
          />
          <PasswordField
            label="Mot de passe"
            value={password}
            onChangeText={setPassword}
            textContentType="password"
            placeholder="••••••••"
          />
          <View style={styles.remember}>
            <Switch
              value={rememberMe}
              onValueChange={setRememberMe}
              trackColor={{ false: colors.border, true: theme.primary }}
              thumbColor={colors.surface}
              ios_backgroundColor={colors.border}
            />
            <Text style={styles.rememberLabel}>Se souvenir de moi</Text>
          </View>
          <ErrorBanner message={error} />
          <Button
            title={loading ? 'Connexion…' : 'Se connecter'}
            onPress={() => void handleSubmit()}
            disabled={loading || !loginValue.trim() || !password}
          />
          {setupRequired ? (
            <Button title="Créer un compte" variant="ghost" onPress={() => setShowSetup(true)} />
          ) : null}
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
  remember: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  rememberLabel: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
