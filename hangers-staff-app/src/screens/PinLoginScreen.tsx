import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator, KeyboardAvoidingView, Vibration,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing } from '../utils/theme';
import { authAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';

export default function PinLoginScreen() {
  const { login } = useAuth();
  const [phone, setPhone]     = useState('');
  const [pin,   setPin]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const pinRef = useRef<TextInput>(null);

  const handleLogin = async () => {
    if (!phone.trim() || pin.length < 4) {
      setError('Enter your phone number and 4-digit PIN');
      return;
    }
    setLoading(true); setError('');
    try {
      const r: any = await authAPI.pinLogin(phone.trim(), pin);
      await login(r.data.staff, r.data.token, r.data.appType);
    } catch (e: any) {
      Vibration.vibrate(200);
      setError(e.message || 'Login failed');
      setPin('');
    } finally { setLoading(false); }
  };

  return (
    <LinearGradient colors={['#012a45','#023c62','#035a8f']} style={styles.bg}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>

        {/* Logo block */}
        <View style={styles.logoBlock}>
          <Text style={styles.logo}>🧺</Text>
          <Text style={styles.appName}>HANGERS</Text>
          <Text style={styles.appSub}>Staff App</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign In</Text>
          <Text style={styles.cardSub}>Phone + PIN — Plant & Delivery staff only</Text>

          {error ? (
            <View style={styles.errBox}>
              <Text style={styles.errText}>⚠️  {error}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="+91 98765 43210"
            placeholderTextColor="#9dafc8"
            returnKeyType="next"
            onSubmitEditing={() => pinRef.current?.focus()}
          />

          <Text style={styles.label}>PIN</Text>
          <TextInput
            ref={pinRef}
            style={[styles.input, styles.pinInput]}
            value={pin}
            onChangeText={t => setPin(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="numeric"
            secureTextEntry
            placeholder="• • • •"
            placeholderTextColor="#9dafc8"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Sign In →</Text>
            }
          </TouchableOpacity>

          <Text style={styles.hint}>
            PIN is set by your manager.{'\n'}First-time? Contact admin@hangers.in
          </Text>
        </View>

      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg:         { flex: 1 },
  center:     { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logoBlock:  { alignItems: 'center', marginBottom: 36 },
  logo:       { fontSize: 52, marginBottom: 10 },
  appName:    { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: 4 },
  appSub:     { fontSize: 13, color: 'rgba(184,208,232,0.7)', marginTop: 4, letterSpacing: 2 },
  card:       { backgroundColor: '#fff', borderRadius: 22, padding: 28 },
  cardTitle:  { fontSize: 22, fontWeight: '800', color: Colors.primary, marginBottom: 4 },
  cardSub:    { fontSize: 13, color: Colors.textMuted, marginBottom: 22 },
  errBox:     { backgroundColor: Colors.errorBg, borderRadius: 10, padding: 12, marginBottom: 16 },
  errText:    { color: Colors.error, fontSize: 13 },
  label:      { fontSize: 12, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' },
  input:      { backgroundColor: Colors.offWhite, borderRadius: 12, padding: 14, fontSize: 16, color: Colors.textDark, marginBottom: 18, borderWidth: 1.5, borderColor: Colors.border },
  pinInput:   { fontSize: 22, letterSpacing: 8, textAlign: 'center' },
  btn:        { backgroundColor: Colors.primary, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 4 },
  btnText:    { color: '#fff', fontSize: 16, fontWeight: '800' },
  hint:       { textAlign: 'center', color: Colors.textMuted, fontSize: 12, marginTop: 18, lineHeight: 18 },
});
