import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../utils/theme';
import { deliveryAPI, metadataAPI } from '../../services/api';

export default function DeliverySummary({ navigation }: any) {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paymentStatusMeta, setPaymentStatusMeta] = useState<Record<string, { label: string; color: string; bg: string }>>({});

  useEffect(() => {
    deliveryAPI.summary()
      .then((r: any) => {
        setSummary(r.data?.summary);
        setLoadError(null);
      })
      .catch((e: any) => {
        setSummary(null);
        setLoadError(e?.message || 'Could not load delivery summary.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    metadataAPI.getAll().then((response: any) => {
      const metadata = response?.metadata || response?.data?.metadata || {};
      setPaymentStatusMeta((metadata.paymentStatuses || []).reduce((acc: Record<string, { label: string; color: string; bg: string }>, item: any) => {
        acc[item.value] = {
          label: item.label || item.value,
          color: item.color || Colors.textDark,
          bg: item.bg || '#f3f4f6',
        };
        return acc;
      }, {}));
    }).catch(() => {
      setPaymentStatusMeta({});
    });
  }, []);

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: Colors.delivery, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#fff" />
    </View>
  );

  if (loadError) return (
    <View style={{ flex: 1, backgroundColor: Colors.offWhite, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.lg }}>
      <MaterialCommunityIcons name="alert-circle-outline" size={44} color={Colors.delivery} />
      <Text style={{ marginTop: 12, fontSize: 18, fontWeight: '700', color: Colors.textDark }}>Could not load summary</Text>
      <Text style={{ marginTop: 6, fontSize: 14, color: Colors.textMuted, textAlign: 'center' }}>{loadError}</Text>
      <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 18, backgroundColor: Colors.delivery, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 }}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>Go back</Text>
      </TouchableOpacity>
    </View>
  );

  const today = summary?.date
    ? new Date(summary.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
    : 'Today';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Daily Summary</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 48 }}>
        <Text style={styles.dateLabel}>{today}</Text>

        {/* Top stats */}
        <View style={styles.statsGrid}>
          {[
            { icon: 'check-decagram-outline', label: 'Delivered',   value: summary?.deliveriesCompleted ?? 0, color: Colors.success },
            { icon: 'package-variant-closed', label: 'Picked Up',   value: summary?.pickupsCompleted   ?? 0, color: Colors.delivery },
            { icon: 'cash-multiple', label: 'Cash Collected', value: `₹${(summary?.cashCollected || 0).toLocaleString('en-IN')}`, color: Colors.success, wide: true },
          ].map(s => (
            <View key={s.label} style={[styles.statCard, s.wide && styles.statCardWide, { borderColor: s.color + '40' }]}>
              <MaterialCommunityIcons name={s.icon as any} size={28} color={s.color} />
              <Text style={[styles.statNum, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLbl}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Deliveries list */}
        {summary?.delivered?.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Deliveries Completed</Text>
            {summary.delivered.map((o: any) => (
              (() => {
                const paymentStatusStyle = paymentStatusMeta[o.paymentStatus] || {
                  label: o.paymentStatus || 'UNPAID',
                  color: Colors.error,
                  bg: '#fee2e2',
                };
                return (
              <View key={o.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowOrder}>{o.orderNumber}</Text>
                  <Text style={styles.rowCust}>{o.customer?.name}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.rowAmount}>₹{o.totalAmount?.toLocaleString('en-IN')}</Text>
                  <Text style={[styles.rowStatus, { color: paymentStatusStyle.color, backgroundColor: paymentStatusStyle.bg }]}>
                    {paymentStatusStyle.label}
                  </Text>
                </View>
              </View>
                )
              })()
            ))}
          </>
        )}

        {/* Pickups list */}
        {summary?.pickups?.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Pickups Completed</Text>
            {summary.pickups.map((o: any) => (
              <View key={o.id} style={styles.row}>
                <Text style={styles.rowOrder}>{o.orderNumber}</Text>
                <Text style={styles.rowCust}>{o.customer?.name}</Text>
              </View>
            ))}
          </>
        )}

        {(!summary?.delivered?.length && !summary?.pickups?.length) && (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="motorbike" size={44} color={Colors.delivery} />
            <Text style={styles.emptyTitle}>No activity yet today</Text>
            <Text style={styles.emptySub}>Completed deliveries will appear here.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.offWhite },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.delivery, paddingTop: Platform.OS === 'ios' ? 52 : 22, paddingHorizontal: Spacing.lg, paddingBottom: 16 },
  backBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  backText:     { color: '#fff', fontSize: 22 },
  title:        { color: '#fff', fontSize: 18, fontWeight: '700' },
  dateLabel:    { fontSize: 13, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 },
  statsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28 },
  statCard:     { flex: 1, minWidth: '45%', backgroundColor: '#fff', borderRadius: 16, padding: 18, alignItems: 'center', borderWidth: 1.5, gap: 4 },
  statCardWide: { minWidth: '100%' },
  statNum:      { fontSize: 26, fontWeight: '800' },
  statLbl:      { fontSize: 12, color: Colors.textMuted },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.primary, marginBottom: 10 },
  row:          { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  rowOrder:     { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 13, fontWeight: '700', color: Colors.primary },
  rowCust:      { fontSize: 14, color: Colors.textDark, marginTop: 2 },
  rowAmount:    { fontSize: 15, fontWeight: '700', color: Colors.textDark },
  rowStatus:    { fontSize: 11, fontWeight: '700', marginTop: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  emptyBox:     { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle:   { fontSize: 18, fontWeight: '700', color: Colors.textDark },
  emptySub:     { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
});
