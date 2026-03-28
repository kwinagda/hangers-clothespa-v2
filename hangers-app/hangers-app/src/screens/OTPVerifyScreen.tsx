// ─────────────────────────────────────────────────────────────────────────────
// OTP VERIFY SCREEN — 6-digit WhatsApp OTP entry with auto-advance
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, StatusBar, Animated, KeyboardAvoidingView,
  Platform, Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { authAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../utils/theme';

const { height } = Dimensions.get('window');
const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 30; // seconds

export default function OTPVerifyScreen({ navigation, route }: any) {
  const { phone, isNewUser } = route.params;
  const { login }            = useAuth();

  const [otp,        setOtp]        = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [isLoading,  setIsLoading]  = useState(false);
  const [isResending,setIsResending]= useState(false);
  const [error,      setError]      = useState('');
  const [cooldown,   setCooldown]   = useState(RESEND_COOLDOWN);
  const [canResend,  setCanResend]  = useState(false);

  const inputRefs = useRef<TextInput[]>([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const cardAnim  = useRef(new Animated.Value(60)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  // Card animation
  useEffect(() => {
    Animated.parallel([
      Animated.spring(cardAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
    inputRefs.current[0]?.focus();
  }, []);

  // Resend cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) { setCanResend(true); return; }
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12,  duration: 60,  useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 60,  useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6,   duration: 60,  useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6,  duration: 60,  useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60,  useNativeDriver: true }),
    ]).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const handleOtpChange = (text: string, index: number) => {
    const digit = text.replace(/\D/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setError('');

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    // Auto-submit when all filled
    if (digit && index === OTP_LENGTH - 1) {
      const fullOtp = [...newOtp.slice(0, -1), digit].join('');
      if (fullOtp.length === OTP_LENGTH) {
        handleVerify(fullOtp);
      }
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (fullOtp?: string) => {
    const otpString = fullOtp || otp.join('');
    if (otpString.length < OTP_LENGTH) {
      setError('Please enter the 6-digit OTP from WhatsApp');
      shake();
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const response: any = await authAPI.verifyOtp(phone, otpString);
      const { token, customer } = response.data;
      await login(customer, token);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Navigation handled by AppNavigator based on auth state
    } catch (err: any) {
      setError(err.message || 'Incorrect OTP. Please try again.');
      shake();
      // Clear OTP fields on error
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!canResend || isResending) return;
    setIsResending(true);
    setError('');
    try {
      await authAPI.sendOtp(phone);
      setOtp(Array(OTP_LENGTH).fill(''));
      setCooldown(RESEND_COOLDOWN);
      setCanResend(false);
      inputRefs.current[0]?.focus();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setError('Failed to resend OTP. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  const maskedPhone = `+91 ${'•'.repeat(6)}${phone.slice(-4)}`;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      <LinearGradient
        colors={['#023c62', '#035a8f']}
        style={styles.topSection}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.bgCircle} />
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <View style={styles.whatsappBadge}>
            <Text style={styles.waBadgeText}>💬 WhatsApp OTP Sent</Text>
          </View>
          <Text style={styles.headerTitle}>Enter{'\n'}Your OTP</Text>
          <Text style={styles.headerSub}>Sent to {maskedPhone}</Text>
        </View>
      </LinearGradient>

      <Animated.View style={[
        styles.card,
        { transform: [{ translateY: cardAnim }, { translateX: shakeAnim }], opacity: cardOpacity }
      ]}>

        <Text style={styles.cardTitle}>6-digit verification code</Text>
        <Text style={styles.cardSub}>
          Open WhatsApp to find your OTP from Hangers Clothes Spa
        </Text>

        {/* OTP boxes */}
        <View style={styles.otpRow}>
          {Array(OTP_LENGTH).fill(0).map((_, i) => (
            <TextInput
              key={i}
              ref={ref => { if (ref) inputRefs.current[i] = ref; }}
              style={[
                styles.otpBox,
                otp[i] ? styles.otpBoxFilled : null,
                error && !otp[i] ? styles.otpBoxError : null,
              ]}
              value={otp[i]}
              onChangeText={text => handleOtpChange(text, i)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
              caretHidden
            />
          ))}
        </View>

        {/* Error */}
        {error ? (
          <View style={styles.errorRow}>
            <Text style={styles.errorText}>⚠ {error}</Text>
          </View>
        ) : null}

        {/* Verify button */}
        <TouchableOpacity
          style={[styles.btn, otp.join('').length < OTP_LENGTH && styles.btnDisabled]}
          onPress={() => handleVerify()}
          disabled={otp.join('').length < OTP_LENGTH || isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <>
              <Text style={styles.btnText}>
                {isNewUser ? 'Create Account' : 'Verify & Login'}
              </Text>
              <Text style={styles.btnArrow}>→</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Resend */}
        <View style={styles.resendRow}>
          <Text style={styles.resendLabel}>Didn't receive it? </Text>
          {canResend ? (
            <TouchableOpacity onPress={handleResend} disabled={isResending}>
              <Text style={styles.resendLink}>
                {isResending ? 'Sending...' : 'Resend on WhatsApp'}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.resendCooldown}>Resend in {cooldown}s</Text>
          )}
        </View>

        {/* WhatsApp note */}
        <View style={styles.waNote}>
          <Text style={styles.waNoteIcon}>💬</Text>
          <Text style={styles.waNoteText}>
            Check your WhatsApp messages. The OTP is valid for 10 minutes.
          </Text>
        </View>

      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: Colors.white },
  topSection:    { height: height * 0.40, paddingTop: 56, paddingHorizontal: Spacing.lg, overflow: 'hidden' },
  bgCircle:      { position:'absolute', top:-50, right:-70, width:220, height:220, borderRadius:110, backgroundColor:'rgba(3,90,143,0.5)' },
  backBtn:       { marginBottom: 20 },
  backText:      { fontFamily:'DMSans_500Medium', fontSize:FontSize.base, color:'rgba(232,240,247,0.8)' },
  headerContent: { marginTop: 4 },
  whatsappBadge: { alignSelf:'flex-start', backgroundColor:'rgba(37,211,102,0.18)', borderRadius:Radius.full, borderWidth:1, borderColor:'rgba(37,211,102,0.35)', paddingHorizontal:12, paddingVertical:5, marginBottom:16 },
  waBadgeText:   { color:'#25D366', fontSize:FontSize.xs, fontFamily:'DMSans_500Medium' },
  headerTitle:   { fontFamily:'Syne_800ExtraBold', fontSize:36, color:Colors.white, lineHeight:42, marginBottom:6 },
  headerSub:     { fontFamily:'DMSans_400Regular', fontSize:FontSize.sm, color:Colors.primaryLight },

  card: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    marginTop: -28, flex: 1,
    paddingHorizontal: Spacing.lg, paddingTop: 32,
    ...Shadow.lg,
  },
  cardTitle: { fontFamily:'Syne_700Bold', fontSize:FontSize.lg, color:Colors.textDark, marginBottom:6 },
  cardSub:   { fontFamily:'DMSans_400Regular', fontSize:FontSize.sm, color:Colors.textMuted, marginBottom:32, lineHeight:20 },

  // OTP boxes
  otpRow:     { flexDirection:'row', gap:10, justifyContent:'center', marginBottom:16 },
  otpBox: {
    width:52, height:62, borderRadius:Radius.md,
    backgroundColor:Colors.accent, borderWidth:1.5, borderColor:Colors.border,
    textAlign:'center', fontSize:FontSize.xl,
    fontFamily:'Syne_700Bold', color:Colors.textDark,
  },
  otpBoxFilled: { backgroundColor:Colors.primary, borderColor:Colors.primary, color:Colors.white },
  otpBoxError:  { borderColor:Colors.error, backgroundColor:Colors.errorBg },

  errorRow:  { backgroundColor:Colors.errorBg, borderRadius:Radius.sm, padding:10, marginBottom:12 },
  errorText: { fontFamily:'DMSans_400Regular', fontSize:FontSize.sm, color:Colors.error },

  btn:         { backgroundColor:Colors.primary, borderRadius:Radius.md, paddingVertical:18, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10, marginBottom:20, ...Shadow.md },
  btnDisabled: { backgroundColor:Colors.primaryLight },
  btnText:     { fontFamily:'Syne_700Bold', fontSize:FontSize.md, color:Colors.white },
  btnArrow:    { fontFamily:'Syne_700Bold', fontSize:FontSize.md, color:Colors.primaryLight },

  resendRow:     { flexDirection:'row', justifyContent:'center', alignItems:'center', marginBottom:20 },
  resendLabel:   { fontFamily:'DMSans_400Regular', fontSize:FontSize.sm, color:Colors.textMuted },
  resendLink:    { fontFamily:'DMSans_500Medium', fontSize:FontSize.sm, color:Colors.primary, textDecorationLine:'underline' },
  resendCooldown:{ fontFamily:'DMSans_400Regular', fontSize:FontSize.sm, color:Colors.textLight },

  waNote:     { flexDirection:'row', gap:10, backgroundColor:'#f0faf4', borderRadius:Radius.sm, borderWidth:1, borderColor:'rgba(37,211,102,0.2)', padding:12, alignItems:'flex-start' },
  waNoteIcon: { fontSize:16, marginTop:1 },
  waNoteText: { flex:1, fontFamily:'DMSans_400Regular', fontSize:FontSize.xs, color:Colors.textMid, lineHeight:17 },
});
