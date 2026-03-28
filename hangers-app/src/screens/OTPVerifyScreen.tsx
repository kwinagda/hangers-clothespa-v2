// ─────────────────────────────────────────────────────────────────────────────
// OTP VERIFY SCREEN — Verify OTP via MSG91 widget, then login via backend
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  StatusBar, Animated, Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { authAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../utils/theme';

const OTP_LENGTH = 6;
const { height } = Dimensions.get('window');

export default function OTPVerifyScreen({ route, navigation }: any) {
  const { phone, sendOTPObj, reqId, isNewUser, devOtp } = route.params || {};
  const { login } = useAuth();
  

  const [otp,       setOtp]       = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState('');
  const [resendTimer, setResendTimer] = useState(30);
  const [isDevMode, setIsDevMode] = useState(false);

  const inputRefs  = useRef<any[]>([]);
  const cardAnim   = useRef(new Animated.Value(80)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const shakeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(cardAnim,    { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Auto-fill if dev mode OTP was returned from backend
    if (devOtp) {
      setIsDevMode(true);
      const digits = devOtp.toString().split('').slice(0, OTP_LENGTH);
      const filled = [...digits, ...Array(OTP_LENGTH - digits.length).fill('')];
      setOtp(filled);
    } else {
      setTimeout(() => inputRefs.current[0]?.focus(), 400);
    }

    // Resend countdown
    const timer = setInterval(() => {
      setResendTimer(t => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const shakeCard = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6,   duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const handleOtpChange = (text: string, index: number) => {
    const digit = text.replace(/\D/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    if (error) setError('');
    if (digit && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
    if (newOtp.every(d => d !== '') && digit) handleVerify(newOtp.join(''));
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (otpString?: string) => {
    const otpValue = otpString || otp.join('');
    if (otpValue.length !== OTP_LENGTH) {
      setError('Please enter the complete 6-digit OTP');
      shakeCard();
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Verify via backend
      const response: any = await authAPI.verifyOtp(phone, otpValue);
      const { token, customer } = (response.data || response) as any;

      if (!token) throw new Error('Login failed — no token received');

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await login(customer, token);

    } catch (err: any) {
      setError(err.message || 'Invalid OTP. Please try again.');
      shakeCard();
      setIsLoading(false);
    }
  };

  const handleResend = () => {
    if (resendTimer > 0 || !sendOTPObj) return;
    setResendTimer(30);
    setOtp(Array(OTP_LENGTH).fill(''));
    setError('');
    sendOTPObj.retryOTP(
      `91${phone}`,
      'text', // or 'voice'
      (data: any) => { console.log('OTP resent:', data); },
      (err: any) => { setError('Failed to resend OTP'); }
    );
  };

  const otpComplete = otp.every(d => d !== '');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      <LinearGradient colors={[Colors.primary, '#012a4a']} style={styles.gradient}>

        <View style={styles.header}>
          <Text style={styles.brandName}>Hangers</Text>
          <Text style={styles.brandTagline}>Clothes Spa</Text>
        </View>

        <Animated.View style={[styles.card, { transform: [{ translateY: cardAnim }, { translateX: shakeAnim }], opacity: cardOpacity }]}>

          {/* Badge */}
          <View style={[styles.badge, isDevMode ? styles.badgeDev : styles.badgeWa]}>
            <Text style={styles.badgeText}>
              {isDevMode ? '🔧 DEV MODE — OTP is 123456' : '💬 OTP sent via WhatsApp'}
            </Text>
          </View>

          <Text style={styles.title}>Enter OTP</Text>
          <Text style={styles.subtitle}>
            Sent to <Text style={styles.phoneHighlight}>+91 {phone}</Text>
          </Text>

          {isDevMode && (
            <View style={styles.devBanner}>
              <Text style={styles.devBannerText}>
                🔧 Dev Mode — OTP auto-filled as <Text style={styles.devBannerCode}>123456</Text>. Just tap Verify.
              </Text>
            </View>
          )}

          {/* OTP inputs */}
          <View style={styles.otpRow}>
            {otp.map((digit, index) => (
              <TextInput
                key={index}
                ref={r => { inputRefs.current[index] = r; }}
                style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                value={digit}
                onChangeText={t => handleOtpChange(t, index)}
                onKeyPress={e => handleKeyPress(e, index)}
                keyboardType="number-pad"
                maxLength={1}
                textAlign="center"
                selectTextOnFocus
              />
            ))}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Verify button */}
          <TouchableOpacity
            style={[styles.button, !otpComplete && styles.buttonDisabled]}
            onPress={() => handleVerify()}
            disabled={!otpComplete || isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Verify & Login</Text>
            )}
          </TouchableOpacity>

          {/* Resend */}
          <View style={styles.resendRow}>
            <Text style={styles.resendText}>Didn't receive OTP? </Text>
            <TouchableOpacity onPress={handleResend} disabled={resendTimer > 0}>
              <Text style={[styles.resendLink, resendTimer > 0 && styles.resendDisabled]}>
                {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Change number */}
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.changeNumber}>
            <Text style={styles.changeNumberText}>← Change number</Text>
          </TouchableOpacity>

        </Animated.View>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1 },
  gradient:        { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.lg },
  header:          { alignItems: 'center', marginBottom: 32 },
  brandName:       { fontSize: 36, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  brandTagline:    { fontSize: 16, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  card:            { backgroundColor: '#fff', borderRadius: Radius.xl, padding: Spacing.xl, ...Shadow.lg },
  badge:           { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: Spacing.md },
  badgeWa:         { backgroundColor: '#e8f5e9' },
  badgeDev:        { backgroundColor: '#fff3e0' },
  badgeText:       { fontSize: FontSize.xs, fontWeight: '600', color: Colors.text },
  title:           { fontSize: FontSize.xl, fontWeight: '700', color: Colors.primary, marginBottom: 4 },
  subtitle:        { fontSize: FontSize.sm, color: Colors.textLight, marginBottom: Spacing.lg },
  phoneHighlight:  { fontWeight: '700', color: Colors.primary },
  devBanner:       { backgroundColor: '#fff8e1', borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: Spacing.md },
  devBannerText:   { fontSize: FontSize.xs, color: '#e65100' },
  devBannerCode:   { fontWeight: '800' },
  otpRow:          { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md },
  otpBox:          { width: 44, height: 52, borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, fontSize: 22, fontWeight: '700', color: Colors.primary, backgroundColor: Colors.background },
  otpBoxFilled:    { borderColor: Colors.primary, backgroundColor: '#e8f0ff' },
  errorText:       { color: Colors.error, fontSize: FontSize.sm, marginBottom: Spacing.sm, textAlign: 'center' },
  button:          { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 16, alignItems: 'center', marginTop: Spacing.sm },
  buttonDisabled:  { opacity: 0.5 },
  buttonText:      { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  resendRow:       { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.md },
  resendText:      { fontSize: FontSize.sm, color: Colors.textLight },
  resendLink:      { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  resendDisabled:  { color: Colors.textLight },
  changeNumber:    { alignItems: 'center', marginTop: Spacing.md },
  changeNumberText:{ fontSize: FontSize.sm, color: Colors.textLight },
});
