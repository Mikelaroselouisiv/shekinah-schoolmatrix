import { useState } from 'react';
import { Image, StyleSheet, Switch, Text, View } from 'react-native';
import axios from 'axios';
import { Button, ErrorBanner, PasswordField, TextField } from '../../components/ui';
import { FormScrollView } from '../../components/FormScrollView';
import { useAuth } from '../../context/AuthContext';
import { useSchool } from '../../context/SchoolContext';
import { colors } from '../../theme/tokens';

function formatLoginError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      return 'Impossible de joindre le serveur. Vérifiez votre connexion internet.';
    }
    const msg =
      (err.response.data as { message?: string } | undefined)?.message ||
      err.message;
    if (err.response.status >= 500) {
      return 'Le serveur est temporairement indisponible. Réessayez plus tard.';
    }
    return typeof msg === 'string' ? msg : 'Identifiants incorrects.';
  }
  if (err instanceof Error) return err.message;
  return 'Erreur de connexion';
}

export function LoginScreen() {
  const { login } = useAuth();
  const { home, theme, refetch } = useSchool();
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      await login(loginValue, password, rememberMe);
      await refetch();
    } catch (err) {
      setError(formatLoginError(err));
    } finally {
      setLoading(false);
    }
  }

  const schoolName = home?.name || 'Shekinah';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <FormScrollView contentContainerStyle={styles.content} bottomOffset={40}>
        <View style={[styles.logoRing, { borderColor: theme.accentTint }]}>
          <Image source={require('../../../assets/logo.png')} style={styles.logo} />
        </View>
        <Text style={[styles.brand, { color: theme.primary }]}>{schoolName}</Text>
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
        </View>
      </FormScrollView>
    </View>
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
