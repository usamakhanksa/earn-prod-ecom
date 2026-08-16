import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ApiRequestError } from '@omnisell/api-client';
import { createTranslator } from '@omnisell/i18n';
import { useSession } from '@/lib/session-context';
import { useLocale } from '@/lib/locale';

export default function LoginScreen() {
  const [locale] = useLocale();
  const { t } = createTranslator(locale);
  const { login, completeMfaChallenge } = useSession();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleLogin(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const outcome = await login(email, password);
      if (outcome.status === 'mfa_required') {
        setChallengeToken(outcome.challengeToken);
      } else {
        router.replace('/');
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.error.generic'));
    } finally {
      setBusy(false);
    }
  }

  async function handleMfaSubmit(): Promise<void> {
    if (challengeToken === null) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await completeMfaChallenge(challengeToken, mfaCode);
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.error.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>{challengeToken !== null ? t('auth.mfa.title') : t('auth.login.title')}</Text>

        {challengeToken !== null ? (
          <>
            <Text style={styles.muted}>{t('auth.mfa.body')}</Text>
            <TextInput
              accessibilityLabel={t('auth.mfa.code')}
              placeholder={t('auth.mfa.code')}
              value={mfaCode}
              onChangeText={setMfaCode}
              keyboardType="number-pad"
              style={styles.input}
            />
            {error !== null ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}
            <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={handleMfaSubmit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('auth.mfa.submit')}</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput
              accessibilityLabel={t('auth.email')}
              placeholder={t('auth.email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />
            <TextInput
              accessibilityLabel={t('auth.password')}
              placeholder={t('auth.password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={styles.input}
            />
            {error !== null ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}
            <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={handleLogin} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('auth.login.submit')}</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f7fa' },
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  muted: { color: '#6b7484', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#c9cfda',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  button: {
    backgroundColor: '#3b4be8',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#e5484d', fontSize: 13 },
});
