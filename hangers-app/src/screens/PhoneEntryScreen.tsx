// ─────────────────────────────────────────────────────────────────────────────
// PHONE ENTRY SCREEN — Enter phone number to receive WhatsApp OTP via MSG91
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
import { Colors, Spacing, Radius, FontSize, Shadow } from '../utils/theme';

const { height } = Dimensions.get('window');


export default function PhoneEntryScreen({ navigation }: any) {
  const [phone,     setPhone]     = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState('');

  const shakeAnim   = useRef(new Animated.Value(0)).current;
  const cardAnim    = useRef(new Animated.Value(80)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(cardAnim,    { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();

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
        devOtp:    response.data?.devOtp,
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

      <LinearGradient
        colors={[Colors.primary, '#012a4a']}
        style={styles.gradient}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brandName}>Hangers</Text>
          <Text style={styles.brandTagline}>Clothes Spa</Text>
        </View>

        {/* Card */}
        <Animated.View style={[styles.card, { transform: [{ translateY: cardAnim }, { translateX: shakeAnim }], opacity: cardOpacity }]}>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Enter your mobile number to continue</Text>

          {/* Phone input */}
          <View style={styles.inputContainer}>
            <View style={styles.countryCode}>
              <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
            </View>
            <TextInput
              style={styles.phoneInput}
              value={phone}
              onChangeText={handlePhoneChange}
              placeholder="9876543210"
              placeholderTextColor={Colors.textLight}
              keyboardType="phone-pad"
              maxLength={10}
              autoFocus
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Send OTP Button */}
          <TouchableOpacity
            style={[styles.button, !isPhoneComplete && styles.buttonDisabled]}
            onPress={handleSendOtp}
            disabled={!isPhoneComplete || isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Send OTP via WhatsApp</Text>
            )}
          </TouchableOpacity>

          {/* Info */}
          <View style={styles.infoRow}>
            <Text style={styles.infoText}>💬 You'll receive a 6-digit OTP on WhatsApp</Text>
          </View>
        </Animated.View>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1 },
  gradient:      { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.lg },
  header:        { alignItems: 'center', marginBottom: 32 },
  brandName:     { fontSize: 36, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  brandTagline:  { fontSize: 16, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  card:          { backgroundColor: '#fff', borderRadius: Radius.xl, padding: Spacing.xl, ...Shadow.lg },
  title:         { fontSize: FontSize.xl, fontWeight: '700', color: Colors.primary, marginBottom: 6 },
  subtitle:      { fontSize: FontSize.sm, color: Colors.textLight, marginBottom: Spacing.xl },
  inputContainer:{ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, marginBottom: Spacing.md, overflow: 'hidden' },
  countryCode:   { backgroundColor: Colors.background, paddingHorizontal: Spacing.md, paddingVertical: 14, borderRightWidth: 1, borderRightColor: Colors.border },
  countryCodeText:{ fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  phoneInput:    { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: FontSize.lg, color: Colors.text, fontWeight: '600' },
  errorText:     { color: Colors.error, fontSize: FontSize.sm, marginBottom: Spacing.sm },
  button:        { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 16, alignItems: 'center', marginTop: Spacing.sm },
  buttonDisabled:{ opacity: 0.5 },
  buttonText:    { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  infoRow:       { marginTop: Spacing.md, alignItems: 'center' },
  infoText:      { fontSize: FontSize.xs, color: Colors.textLight, textAlign: 'center' },
});
