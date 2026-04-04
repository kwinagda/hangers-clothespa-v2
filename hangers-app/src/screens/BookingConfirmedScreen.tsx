import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, FontSize, Fonts, Radius, Shadow, Spacing } from '../utils/theme';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function BookingConfirmedScreen({ route, navigation }: any) {
  const { orderNumber, orderId, date, slot, services = [], itemCount = 0, totalAmount = 0, walletApplied = 0 } =
    route.params || {};
  const [secondsRemaining, setSecondsRemaining] = useState(10);

  const dateObj = date ? new Date(date) : null;
  const dateStr = dateObj
    ? `${DAY_NAMES[dateObj.getDay()]}, ${dateObj.getDate()} ${MONTH_NAMES[dateObj.getMonth()]}`
    : '—';

  const rows = [
    { icon: 'calendar-blank-outline', label: 'Pickup Date', value: dateStr },
    { icon: 'clock-outline', label: 'Time Slot', value: slot || '—' },
    { icon: 'hanger', label: 'Services', value: services.join(', ') || '—' },
    ...(itemCount > 0 ? [{ icon: 'tshirt-crew-outline', label: 'Pieces', value: `${itemCount} garments estimated` }] : []),
    ...(walletApplied > 0 ? [{ icon: 'wallet-outline', label: 'Wallet Used', value: `₹${walletApplied.toLocaleString('en-IN')}` }] : []),
  ];

  const goHome = useCallback(() => {
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  }, [navigation]);

  useEffect(() => {
    const timeout = setTimeout(goHome, 10000);
    const interval = setInterval(() => {
      setSecondsRemaining((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [goHome]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        goHome();
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [goHome])
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
      <LinearGradient colors={['#06233a', '#023c62', '#1480b2']} style={styles.gradient}>
        <TouchableOpacity style={styles.closeBtn} onPress={goHome}>
          <Text style={styles.closeText}>×</Text>
        </TouchableOpacity>

        <View style={styles.ringOuter}>
          <View style={styles.ringInner}>
            <Feather name="check" size={42} color="#fff" />
          </View>
        </View>

        <Text style={styles.eyebrow}>Pickup Confirmed</Text>
        <Text style={styles.title}>{orderNumber ? `${orderNumber} is booked` : 'Your pickup is locked in'}</Text>
        <Text style={styles.subtitle}>
          The team will review the request and contact you shortly to confirm pickup details.
        </Text>

        <View style={styles.redirectBadge}>
          <Text style={styles.redirectText}>Returning to home in {secondsRemaining}s</Text>
        </View>

        <View style={styles.detailCard}>
          {rows.map((row, index) => (
            <View
              key={row.label}
              style={[styles.detailRow, index < rows.length - 1 && styles.detailRowBorder]}
            >
              <MaterialCommunityIcons name={row.icon as any} size={18} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>{row.label}</Text>
                <Text style={styles.detailValue}>{row.value}</Text>
              </View>
            </View>
          ))}
        </View>

        {totalAmount > 0 ? (
          <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>Estimated payable</Text>
            <Text style={styles.amountValue}>₹{totalAmount.toLocaleString('en-IN')}</Text>
            <Text style={styles.amountSub}>Final amount can adjust after inspection if needed.</Text>
          </View>
        ) : null}

        {orderId && totalAmount > 0 && (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('Payment', { orderId, orderNumber, totalAmount })}
          >
            <Text style={styles.primaryBtnText}>Pay Online Now</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.ghostBtn}
          onPress={goHome}
        >
          <Text style={styles.ghostBtnText}>Close and go home now</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: {
    flex: 1,
    paddingTop: 72,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 36,
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 58,
    right: Spacing.lg,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#fff', fontFamily: Fonts.medium, fontSize: 24, lineHeight: 24 },
  ringOuter: {
    width: 122,
    height: 122,
    borderRadius: 61,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  ringInner: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: Fonts.medium,
    fontSize: FontSize.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  title: {
    color: '#fff',
    fontFamily: Fonts.displayBold,
    fontSize: 32,
    lineHeight: 36,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: Fonts.body,
    fontSize: FontSize.base,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: 14,
  },
  redirectBadge: {
    marginBottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  redirectText: { color: '#fff', fontFamily: Fonts.medium, fontSize: FontSize.sm },
  detailCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    ...Shadow.md,
  },
  detailRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingVertical: 12 },
  detailRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  detailLabel: { color: Colors.textMuted, fontFamily: Fonts.medium, fontSize: FontSize.xs, marginBottom: 4 },
  detailValue: { color: Colors.textDark, fontFamily: Fonts.bold, fontSize: FontSize.base, lineHeight: 20 },
  amountCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    marginBottom: 18,
    alignItems: 'center',
  },
  amountLabel: { color: 'rgba(255,255,255,0.72)', fontFamily: Fonts.medium, fontSize: FontSize.sm },
  amountValue: { color: '#fff', fontFamily: Fonts.display, fontSize: 32, marginTop: 6 },
  amountSub: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: Fonts.body,
    fontSize: FontSize.xs,
    marginTop: 6,
    textAlign: 'center',
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: Radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryBtnText: { color: Colors.primary, fontFamily: Fonts.bold, fontSize: FontSize.base },
  ghostBtn: { paddingVertical: 10 },
  ghostBtnText: { color: 'rgba(255,255,255,0.74)', fontFamily: Fonts.medium, fontSize: FontSize.sm },
});
