// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT HISTORY SCREEN
//   Lists all past payments with amount, method, date, order ref, and status
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  StatusBar, ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../utils/theme';
import { paymentsAPI } from '../services/api';

// ─────────────────────────────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

const METHOD_LABEL: Record<string, string> = {
  RAZORPAY: 'Razorpay',
  CASH:     'Cash',
  COD:      'COD',
  ONLINE:   'Online',
};

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  COMPLETED: { bg: '#d1fae5', text: '#065f46', label: 'Paid' },
  SUCCESS:   { bg: '#d1fae5', text: '#065f46', label: 'Paid' },
  PENDING:   { bg: '#fef3c7', text: '#92400e', label: 'Pending' },
  FAILED:    { bg: '#fee2e2', text: '#991b1b', label: 'Failed' },
  REFUNDED:  { bg: '#ede9fe', text: '#6d28d9', label: 'Refunded' },
};

// ─────────────────────────────────────────────────────────────────────────────
export default function PaymentHistoryScreen({ navigation }: any) {
  const [payments,   setPayments]   = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const loadPayments = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result: any = await paymentsAPI.getHistory();
      setPayments(result?.data?.payments || result?.payments || []);
    } catch (e: any) {
      setError(e?.message || 'Could not load payment history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadPayments(); }, [loadPayments]);
  const onRefresh = () => { setRefreshing(true); loadPayments(); };

  // Running total of successful payments
  const totalPaid = payments
    .filter(p => ['COMPLETED','SUCCESS'].includes(p.status))
    .reduce((acc, p) => acc + (p.amount || 0), 0);

  const renderPayment = (p: any) => {
    const ss = STATUS_STYLE[p.status] || { bg: '#f0f4f8', text: '#6b7fa3', label: p.status };
    return (
      <View key={p.id} style={styles.card}>
        {/* Top row: method + status badge */}
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.method}>{METHOD_LABEL[p.method] || p.method || 'Payment'}</Text>
            {p.order?.orderNumber && (
              <Text style={styles.orderRef}>Order {p.order.orderNumber}</Text>
            )}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: ss.bg }]}>
            <Text style={[styles.statusText, { color: ss.text }]}>{ss.label}</Text>
          </View>
        </View>

        {/* Amount + date */}
        <View style={styles.cardBottom}>
          <Text style={styles.amount}>Rs.{(p.amount || 0).toLocaleString('en-IN')}</Text>
          {p.createdAt && (
            <Text style={styles.date}>{formatDate(p.createdAt)}</Text>
          )}
        </View>

        {/* Razorpay payment ID (tap to view) */}
        {p.razorpayPaymentId && (
          <Text style={styles.ref} numberOfLines={1}>
            Ref: {p.razorpayPaymentId}
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.offWhite }}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Header */}
      <LinearGradient colors={['#023c62', '#035a8f']} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.back}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Payment History</Text>
        <View style={{ width: 36 }} />
      </LinearGradient>

      {/* Summary banner */}
      {!loading && !error && payments.length > 0 && (
        <View style={styles.summaryBanner}>
          <View>
            <Text style={styles.summaryLabel}>Total Paid</Text>
            <Text style={styles.summaryAmount}>Rs.{totalPaid.toLocaleString('en-IN')}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.summaryLabel}>Transactions</Text>
            <Text style={styles.summaryCount}>{payments.length}</Text>
          </View>
        </View>
      )}

      {/* Loading */}
      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ color: Colors.textMuted, marginTop: 12 }}>Loading payment history...</Text>
        </View>
      )}

      {/* Error */}
      {!loading && error && (
        <View style={styles.center}>
          <Text style={{ color: Colors.textDark, fontWeight: '700', marginBottom: 8 }}>
            Could not load payments
          </Text>
          <Text style={{ color: Colors.textMuted, textAlign: 'center', marginBottom: 20 }}>{error}</Text>
          <TouchableOpacity onPress={() => loadPayments()} style={styles.retryBtn}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Empty */}
      {!loading && !error && payments.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No payments yet</Text>
          <Text style={styles.emptySub}>
            Your payment history will appear here once you make a payment.
          </Text>
        </View>
      )}

      {/* Payment list */}
      {!loading && !error && payments.length > 0 && (
        <ScrollView
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
        >
          {payments.map(renderPayment)}
        </ScrollView>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header:        { paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 20, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  back:          { fontSize: 22, color: '#fff' },
  title:         { fontSize: FontSize.lg, fontWeight: '700', color: '#fff' },

  summaryBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  summaryLabel:  { fontSize: FontSize.xs, color: Colors.primaryLight, marginBottom: 2 },
  summaryAmount: { fontSize: FontSize.lg, fontWeight: '800', color: '#fff' },
  summaryCount:  { fontSize: FontSize.lg, fontWeight: '800', color: '#fff' },

  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle:    { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textDark, marginBottom: 8 },
  emptySub:      { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  retryBtn:      { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 24, paddingVertical: 12 },

  card:          { backgroundColor: '#fff', borderRadius: 14, padding: Spacing.md, marginBottom: 12, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  cardTop:       { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  method:        { fontSize: FontSize.base, fontWeight: '700', color: Colors.textDark },
  orderRef:      { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 3 },
  statusBadge:   { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  statusText:    { fontSize: FontSize.xs, fontWeight: '700' },
  cardBottom:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  amount:        { fontSize: FontSize.lg, fontWeight: '800', color: Colors.primary },
  date:          { fontSize: FontSize.xs, color: Colors.textLight },
  ref:           { fontSize: FontSize.xs, color: Colors.textLight, marginTop: 8 },
});
