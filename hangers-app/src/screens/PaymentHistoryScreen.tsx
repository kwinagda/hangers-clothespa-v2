import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { metadataAPI, paymentsAPI } from '../services/api';
import { Colors, FontSize, Fonts, Radius, Shadow, Spacing } from '../utils/theme';
import StaggerItem from '../components/StaggerItem';
import AnimatedButton from '../components/AnimatedButton';

const formatCurrency = (value?: number) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const formatDate = (value?: string) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

export default function PaymentHistoryScreen({ navigation }: any) {
  const [payments, setPayments] = useState<any[]>([]);
  const [methodLabels, setMethodLabels] = useState<Record<string, string>>({});
  const [paymentStatusMeta, setPaymentStatusMeta] = useState<Record<string, { bg: string; text: string; label: string }>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    metadataAPI
      .getAll()
      .then((response: any) => {
        const metadata = response?.metadata || response?.data?.metadata || {};
        const labels = (metadata.paymentMethods || []).reduce((acc: Record<string, string>, method: any) => {
          acc[method.value] = method.label || method.value;
          return acc;
        }, {});
        labels.WALLET = labels.WALLET || 'Wallet';
        labels.ADJUSTMENT = labels.ADJUSTMENT || 'Adjustment';
        labels.SETTLEMENT = labels.SETTLEMENT || 'Settlement';
        setMethodLabels(labels);
        setPaymentStatusMeta((metadata.paymentStatuses || []).reduce((acc: Record<string, { bg: string; text: string; label: string }>, item: any) => {
          acc[item.value] = {
            bg: item.bg || '#f3f4f6',
            text: item.color || Colors.textMuted,
            label: item.label || item.value,
          };
          return acc;
        }, {}));
      })
      .catch(() => {
        setMethodLabels({
          WALLET: 'Wallet',
          ADJUSTMENT: 'Adjustment',
          SETTLEMENT: 'Settlement',
        });
        setPaymentStatusMeta({});
      });
  }, []);

  const totalPaid = useMemo(
    () =>
      payments
        .filter((item) => ['COMPLETED', 'SUCCESS', 'PAID', 'PARTIAL'].includes(item.order?.paymentStatus || item.status))
        .reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [payments]
  );

  const pendingCount = useMemo(
    () => payments.filter((item) => ['UNPAID', 'PENDING', 'FAILED'].includes(item.order?.paymentStatus || item.status)).length,
    [payments]
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      <LinearGradient colors={['#021f34', '#023c62', '#0a6794']} style={styles.hero}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.heroEyebrow}>Payments</Text>
        <Text style={styles.heroTitle}>Payment History</Text>
        <Text style={styles.heroBody}>
          Order-linked payment truth, wallet usage, and settlements in one place.
        </Text>
      </LinearGradient>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.centerText}>Loading payment history...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <MaterialCommunityIcons name="alert-circle-outline" size={34} color={Colors.error} />
          <Text style={styles.errorTitle}>Could not load payments</Text>
          <Text style={styles.errorText}>{error}</Text>
          <AnimatedButton style={styles.retryBtn} onPress={() => loadPayments()}>
            <Text style={styles.retryText}>Try Again</Text>
          </AnimatedButton>
        </View>
      ) : payments.length === 0 ? (
        <View style={styles.centerState}>
          <MaterialCommunityIcons name="credit-card-clock-outline" size={38} color={Colors.primary} />
          <Text style={styles.emptyTitle}>No payment history yet</Text>
          <Text style={styles.emptyText}>
            Once you pay online, settle a bill, or use wallet balance, the entry will show up here.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadPayments(true); }} tintColor={Colors.primary} />}
        >
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, styles.summaryBlue]}>
              <Text style={styles.summaryLabel}>Recorded Amount</Text>
              <Text style={styles.summaryValue}>{formatCurrency(totalPaid)}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabelDark}>Transactions</Text>
              <Text style={styles.summaryValueDark}>{payments.length}</Text>
              <Text style={styles.summarySub}>{pendingCount} need attention</Text>
            </View>
          </View>

          {payments.map((payment, index) => {
            const statusKey = payment.order?.paymentStatus || payment.status;
            const status = paymentStatusMeta[statusKey] || ({
              COMPLETED: { bg: '#dcfce7', text: '#166534', label: 'Paid' },
              SUCCESS: { bg: '#dcfce7', text: '#166534', label: 'Paid' },
              PENDING: { bg: '#fff0d8', text: '#9a5d00', label: 'Pending' },
              FAILED: { bg: '#fde8e8', text: '#b9382a', label: 'Failed' },
              REFUNDED: { bg: '#ece7ff', text: '#6941c6', label: 'Refunded' },
            } as Record<string, { bg: string; text: string; label: string }>)[statusKey] || {
              bg: '#edf3f8',
              text: Colors.textMuted,
              label: statusKey || 'Unknown',
            };
            return (
              <StaggerItem key={payment.id} index={index}>
              <View key={payment.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.methodIcon}>
                    <MaterialCommunityIcons name="credit-card-outline" size={18} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.methodName}>{methodLabels[payment.method] || payment.method || 'Payment'}</Text>
                    <Text style={styles.methodMeta}>
                      {payment.order?.orderNumber ? `Order ${payment.order.orderNumber}` : 'General payment'} • {formatDate(payment.createdAt)}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: status.bg }]}>
                    <Text style={[styles.badgeText, { color: status.text }]}>{status.label}</Text>
                  </View>
                </View>

                <View style={styles.cardBottom}>
                  <Text style={styles.amount}>{formatCurrency(payment.amount)}</Text>
                  {!!payment.razorpayPaymentId && (
                    <Text style={styles.reference} numberOfLines={1}>
                      Ref {payment.razorpayPaymentId}
                    </Text>
                  )}
                </View>
              </View>
              </StaggerItem>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef4f8' },
  hero: {
    paddingTop: 44,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 18,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  backText: { color: '#fff', fontSize: 22, fontFamily: Fonts.medium },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: Fonts.medium,
    fontSize: FontSize.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  heroTitle: { color: '#fff', fontFamily: Fonts.displayBold, fontSize: 26, lineHeight: 30, marginBottom: 6 },
  heroBody: { color: 'rgba(255,255,255,0.82)', fontFamily: Fonts.body, fontSize: FontSize.sm, lineHeight: 20 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  summaryCard: {
    flex: 1,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  summaryBlue: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  summaryLabel: { color: '#dbe8f5', fontFamily: Fonts.medium, fontSize: FontSize.sm, marginBottom: 8 },
  summaryLabelDark: { color: Colors.textMuted, fontFamily: Fonts.medium, fontSize: FontSize.sm, marginBottom: 8 },
  summaryValue: { color: '#fff', fontFamily: Fonts.display, fontSize: 26 },
  summaryValueDark: { color: Colors.textDark, fontFamily: Fonts.display, fontSize: 26 },
  summarySub: { marginTop: 4, color: Colors.textMuted, fontFamily: Fonts.body, fontSize: FontSize.xs },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  centerText: { marginTop: 12, color: Colors.textMuted, fontFamily: Fonts.body, fontSize: FontSize.base },
  errorTitle: { marginTop: 14, color: Colors.textDark, fontFamily: Fonts.bold, fontSize: FontSize.md },
  errorText: { marginTop: 6, color: Colors.textMuted, fontFamily: Fonts.body, fontSize: FontSize.sm, lineHeight: 20, textAlign: 'center' },
  retryBtn: { marginTop: 18, backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 18, paddingVertical: 12 },
  retryText: { color: '#fff', fontFamily: Fonts.bold, fontSize: FontSize.sm },
  emptyTitle: { marginTop: 14, color: Colors.textDark, fontFamily: Fonts.bold, fontSize: FontSize.md },
  emptyText: { marginTop: 8, color: Colors.textMuted, fontFamily: Fonts.body, fontSize: FontSize.sm, lineHeight: 20, textAlign: 'center' },
  listContent: { paddingHorizontal: Spacing.lg, paddingTop: 14, paddingBottom: 40 },
  card: {
    marginBottom: 12,
    padding: 18,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  methodIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodName: { color: Colors.textDark, fontFamily: Fonts.bold, fontSize: FontSize.base },
  methodMeta: { color: Colors.textMuted, fontFamily: Fonts.body, fontSize: FontSize.sm, marginTop: 3 },
  badge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { fontFamily: Fonts.bold, fontSize: FontSize.xs },
  cardBottom: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  amount: { color: Colors.primary, fontFamily: Fonts.display, fontSize: 24 },
  reference: { color: Colors.textLight, fontFamily: Fonts.body, fontSize: FontSize.xs, flex: 1, textAlign: 'right', marginLeft: 12 },
});
