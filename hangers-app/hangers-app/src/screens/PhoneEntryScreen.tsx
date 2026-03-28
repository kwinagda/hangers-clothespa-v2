// ─────────────────────────────────────────────────────────────────────────────
// PHONE ENTRY SCREEN — Enter phone number to receive WhatsApp OTP
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  StatusBar, Animated, Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { authAPI } from '../services/api';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../utils/theme';

const { height } = Dimensions.get('window');

export default function PhoneEntryScreen({ navigation }: any) {
  const [phone,     setPhone]     = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState('');

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const cardAnim  = useRef(new Animated.Value(80)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  // Card slide-in on mount
  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(cardAnim,  { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const shakeCard = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 60,  useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60,  useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6,   duration: 60,  useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6,  duration: 60,  useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60,  useNativeDriver: true }),
    ]).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const handlePhoneChange = (text: string) => {
    const numeric = text.replace(/\D/g, '').slice(0, 10);
    setPhone(numeric);
    if (error) setError('');
  };

  const handleSendOtp = async () => {
    if (phone.length !== 10) {
      setError('Please enter your 10-digit mobile number');
      shakeCard();
      return;
    }
    if (!['6','7','8','9'].includes(phone[0])) {
      setError('Please enter a valid Indian mobile number');
      shakeCard();
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const response: any = await authAPI.sendOtp(phone);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.navigate('OTPVerify', {
        phone,
        isNewUser: response.data?.isNewUser,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP. Please try again.');
      shakeCard();
    } finally {
      setIsLoading(false);
    }
  };

  const isPhoneComplete = phone.length === 10;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Background */}
      <LinearGradient
        colors={['#023c62', '#035a8f']}
        style={styles.topSection}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.bgCircle} />

        {/* Header content */}
        <View style={styles.headerContent}>
          <View style={styles.whatsappBadge}>
            <Text style={styles.whatsappBadgeText}>💬 OTP via WhatsApp</Text>
          </View>
          <Text style={styles.headerTitle}>Welcome to{'\n'}Hangers</Text>
          <Text style={styles.headerSub}>Care in Every Clean</Text>
        </View>
      </LinearGradient>

      {/* Card */}
      <Animated.View style={[
        styles.card,
        {
          transform: [
            { translateY: cardAnim },
            { translateX: shakeAnim }
          ],
          opacity: cardOpacity,
        }
      ]}>
        <Text style={styles.cardTitle}>Enter your mobile number</Text>
        <Text style={styles.cardSub}>
          We'll send a verification code to your{' '}
          <Text style={styles.waHighlight}>WhatsApp</Text>
        </Text>

        {/* Phone Input */}
        <View style={[styles.inputRow, error ? styles.inputRowError : null]}>
          <View style={styles.countryCode}>
            <Text style={styles.flag}>🇮🇳</Text>
            <Text style={styles.code}>+91</Text>
            <View style={styles.divider} />
          </View>
          <TextInput
            style={styles.phoneInput}
            placeholder="9876 543 210"
            placeholderTextColor={Colors.textLight}
            keyboardType="number-pad"
            maxLength={10}
            value={phone}
            onChangeText={handlePhoneChange}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={isPhoneComplete ? handleSendOtp : undefined}
          />
          {isPhoneComplete && (
            <View style={styles.checkIcon}>
              <Text style={styles.checkText}>✓</Text>
            </View>
          )}
        </View>

        {/* Error */}
        {error ? (
          <View style={styles.errorRow}>
            <Text style={styles.errorText}>⚠ {error}</Text>
          </View>
        ) : null}

        {/* Info strip */}
        <View style={styles.infoStrip}>
          <Text style={styles.infoIcon}>💬</Text>
          <Text style={styles.infoText}>
            You'll receive a 6-digit OTP on WhatsApp at +91 {phone || 'XXXXXXXXXX'}
          </Text>
        </View>

        {/* CTA Button */}
        <TouchableOpacity
          style={[styles.btn, !isPhoneComplete && styles.btnDisabled]}
          onPress={handleSendOtp}
          disabled={!isPhoneComplete || isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <>
              <Text style={styles.btnText}>Send OTP on WhatsApp</Text>
              <Text style={styles.btnArrow}>→</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.termsText}>
          By continuing, you agree to our{' '}
          <Text style={styles.termsLink}>Terms of Service</Text> &{' '}
          <Text style={styles.termsLink}>Privacy Policy</Text>
        </Text>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  topSection: {
    height: height * 0.38,
    paddingTop: 60,
    paddingHorizontal: Spacing.lg,
    overflow: 'hidden',
  },
  bgCircle: {
    position: 'absolute',
    top: -50,
    right: -70,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(3,90,143,0.5)',
  },
  headerContent: {
    marginTop: 16,
  },
  whatsappBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(37,211,102,0.18)',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(37,211,102,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 18,
  },
  whatsappBadgeText: {
    color: '#25D366',
    fontSize: FontSize.xs,
    fontFamily: 'DMSans_500Medium',
    letterSpacing: 0.3,
  },
  headerTitle: {
    fontFamily: 'Syne_800ExtraBold',
    fontSize: 38,
    color: Colors.white,
    lineHeight: 44,
    marginBottom: 6,
  },
  headerSub: {
    fontFamily: 'DMSans_400Regular',
    fontSize: FontSize.sm,
    color: Colors.primaryLight,
    letterSpacing: 0.5,
    fontStyle: 'italic',
  },

  // Card
  card: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -28,
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: 32,
    ...Shadow.lg,
  },
  cardTitle: {
    fontFamily: 'Syne_700Bold',
    fontSize: FontSize.lg,
    color: Colors.textDark,
    marginBottom: 6,
  },
  cardSub: {
    fontFamily: 'DMSans_400Regular',
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: 28,
    lineHeight: 20,
  },
  waHighlight: {
    color: '#25D366',
    fontFamily: 'DMSans_500Medium',
  },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  inputRowError: {
    borderColor: Colors.error,
    backgroundColor: Colors.errorBg,
  },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 6,
  },
  flag: { fontSize: 20 },
  code: {
    fontFamily: 'DMSans_500Medium',
    fontSize: FontSize.md,
    color: Colors.textDark,
  },
  divider: {
    width: 1,
    height: 22,
    backgroundColor: Colors.border,
    marginLeft: 8,
  },
  phoneInput: {
    flex: 1,
    fontSize: FontSize.xl,
    fontFamily: 'DMSans_500Medium',
    color: Colors.textDark,
    paddingVertical: 18,
    paddingLeft: 12,
    letterSpacing: 2,
  },
  checkIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkText: { color: Colors.white, fontSize: 14, fontWeight: '700' },

  // Error
  errorRow: {
    backgroundColor: Colors.errorBg,
    borderRadius: Radius.sm,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: FontSize.sm,
    color: Colors.error,
  },

  // Info strip
  infoStrip: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#f0faf4',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(37,211,102,0.2)',
    padding: 12,
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  infoIcon: { fontSize: 16, marginTop: 1 },
  infoText: {
    flex: 1,
    fontFamily: 'DMSans_400Regular',
    fontSize: FontSize.xs,
    color: Colors.textMid,
    lineHeight: 17,
  },

  // Button
  btn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 20,
    ...Shadow.md,
  },
  btnDisabled: {
    backgroundColor: Colors.primaryLight,
    ...Shadow.sm,
  },
  btnText: {
    fontFamily: 'Syne_700Bold',
    fontSize: FontSize.md,
    color: Colors.white,
  },
  btnArrow: {
    fontFamily: 'Syne_700Bold',
    fontSize: FontSize.md,
    color: Colors.primaryLight,
  },
  termsText: {
    textAlign: 'center',
    fontFamily: 'DMSans_400Regular',
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 17,
  },
  termsLink: {
    color: Colors.primary,
    fontFamily: 'DMSans_500Medium',
  },
});
