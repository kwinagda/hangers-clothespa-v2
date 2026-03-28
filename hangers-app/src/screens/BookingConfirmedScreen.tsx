// ─────────────────────────────────────────────────────────────────────────────
// BOOKING CONFIRMED SCREEN — Success screen after pickup booking
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing } from '../utils/theme';

const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function BookingConfirmedScreen({ route, navigation }: any) {
  const { orderNumber, orderId, date, slot, services = [], itemCount = 0, totalAmount = 0, walletApplied = 0 } = route.params || {};

  const dateObj = date ? new Date(date) : null;
  const dateStr = dateObj
    ? `${DAY_NAMES[dateObj.getDay()]}, ${dateObj.getDate()} ${MONTH_NAMES[dateObj.getMonth()]}`
    : '—';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
      <LinearGradient colors={['#023c62', '#035a8f']} style={styles.gradient}>

        {/* Checkmark */}
        <View style={styles.checkCircle}>
          <Text style={{ fontSize: 48 }}>✓</Text>
        </View>

        <Text style={styles.title}>Pickup Booked!</Text>
        <Text style={styles.subtitle}>
          {orderNumber ? `Order ${orderNumber}` : 'Your pickup has been scheduled.'}
          {'\n'}We'll call to confirm.
        </Text>

        {/* Details card */}
        <View style={styles.card}>
          {[
            { icon: '📅', label: 'Date',     value: dateStr },
            { icon: '🕐', label: 'Slot',     value: slot || '—' },
            { icon: '🧺', label: 'Services', value: services.join(', ') || '—' },
            ...(itemCount > 0 ? [{ icon: '👔', label: 'Items', value: `${itemCount} garments estimated` }] : []),
            ...(walletApplied > 0 ? [{ icon: '💰', label: 'Wallet', value: `−₹${walletApplied.toLocaleString('en-IN')} applied` }] : []),
          ].map(row => (
            <View key={row.label} style={styles.row}>
              <Text style={styles.rowIcon}>{row.icon}</Text>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowValue}>{row.value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.note}>
          Our team will contact you within 30 minutes to confirm. Track your order status in My Orders.
        </Text>

        {/* Actions */}
        {orderId && totalAmount > 0 && (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: '#22c55e', marginBottom: 10 }]}
            onPress={() => navigation.navigate('Payment', { orderId, orderNumber, totalAmount })}
          >
            <Text style={[styles.primaryBtnText, { color: '#fff' }]}>Pay Online — Rs.{totalAmount.toLocaleString('en-IN')}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.primaryBtn}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] })}>
          <Text style={styles.primaryBtnText}>Back to Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Tabs', params: { screen: 'Orders' } }] })}>
          <Text style={styles.secondaryBtnText}>Track in My Orders</Text>
        </TouchableOpacity>

      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1 },
  gradient:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  checkCircle:    { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(184,208,232,0.4)', marginBottom: 24 },
  title:          { color: '#fff', fontSize: 30, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  subtitle:       { color: 'rgba(184,208,232,0.8)', fontSize: 15, textAlign: 'center', lineHeight: 24, marginBottom: 28 },
  card:           { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 18, padding: 20, width: '100%', borderWidth: 1, borderColor: 'rgba(184,208,232,0.2)', marginBottom: 20 },
  row:            { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(184,208,232,0.1)' },
  rowIcon:        { fontSize: 18, width: 30 },
  rowLabel:       { color: 'rgba(184,208,232,0.6)', fontSize: 13, width: 70 },
  rowValue:       { color: '#fff', fontSize: 13, fontWeight: '600', flex: 1 },
  note:           { color: 'rgba(184,208,232,0.6)', fontSize: 12, textAlign: 'center', lineHeight: 18, marginBottom: 28, maxWidth: 300 },
  primaryBtn:     { backgroundColor: '#fff', borderRadius: 14, padding: 16, width: '100%', alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: Colors.primary, fontSize: 16, fontWeight: '700' },
  secondaryBtn:   { padding: 12, alignItems: 'center' },
  secondaryBtnText:{ color: 'rgba(255,255,255,0.7)', fontSize: 14 },
});
