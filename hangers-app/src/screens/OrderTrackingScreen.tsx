// ─────────────────────────────────────────────────────────────────────────────
// ORDER TRACKING SCREEN — Live status timeline for a specific order
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Platform, ActivityIndicator,
} from 'react-native';
import { Colors, Spacing } from '../utils/theme';
import api from '../services/api';

const STAGES = [
  { key: 'PENDING',              label: 'Order Placed',      icon: '📋', desc: 'We received your order' },
  { key: 'PICKED_UP',           label: 'Picked Up',         icon: '🚗', desc: 'Your clothes are on the way to us' },
  { key: 'PROCESSING',          label: 'At Plant',          icon: '🏭', desc: 'Garments checked and sorted' },
  { key: 'WASHING',             label: 'Being Cleaned',     icon: '🫧', desc: 'Your clothes are being cleaned' },
  { key: 'DRYING',              label: 'Drying',            icon: '☀️', desc: 'Drying in progress' },
  { key: 'IRONING',             label: 'Ironing',           icon: '♨️', desc: 'Pressed and perfected' },
  { key: 'QC',                  label: 'Quality Check',     icon: '✅', desc: 'Inspected and approved' },
  { key: 'READY_FOR_DELIVERY',  label: 'Ready',             icon: '📦', desc: 'Packed and ready for delivery' },
  { key: 'OUT_FOR_DELIVERY',    label: 'Out for Delivery',  icon: '🛵', desc: 'On the way to you!' },
  { key: 'DELIVERED',           label: 'Delivered',         icon: '🎉', desc: 'All done! Enjoy fresh clothes.' },
];

const STATUS_COLOR: Record<string, string> = {
  PENDING: '#6b7fa3', PICKED_UP: '#0284c7', PROCESSING: '#7c3aed',
  WASHING: '#0891b2', DRYING: '#f59e0b', IRONING: '#d97706',
  QC: '#16a34a', READY_FOR_DELIVERY: '#059669', OUT_FOR_DELIVERY: '#0284c7', DELIVERED: '#16a34a',
  CANCELLED: '#dc2626',
};

export default function OrderTrackingScreen({ route, navigation }: any) {
  const { orderId, orderNumber } = route.params || {};
  const [order, setOrder]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/customer/orders/${orderId}`);
      setOrder(r.data.order);
    } catch (e) {
      // Fallback: try generic order endpoint
      try {
        const r2 = await api.get(`/orders/${orderId}`);
        setOrder(r2.data.order);
      } catch { /* ignore */ }
    } finally { setLoading(false); setRefreshing(false); }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#fff" />
    </View>
  );

  const currentIdx = STAGES.findIndex(s => s.key === order?.status) ?? 0;
  const isCancelled = order?.status === 'CANCELLED';

  const formatDate = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Track Order</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryLight} />}
      >
        {/* Order card */}
        <View style={styles.orderCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={styles.orderNum}>{order?.orderNumber || orderNumber}</Text>
              <Text style={styles.orderSub}>{order?.items?.length || 0} garments · Placed {order?.createdAt ? formatDate(order.createdAt).split(',')[0] : ''}</Text>
            </View>
            <Text style={styles.orderAmount}>₹{order?.totalAmount?.toLocaleString('en-IN') || '—'}</Text>
          </View>
          {isCancelled && (
            <View style={{ marginTop: 12, backgroundColor: '#fee2e2', borderRadius: 10, padding: 12 }}>
              <Text style={{ color: '#dc2626', fontWeight: '700', textAlign: 'center' }}>This order has been cancelled</Text>
            </View>
          )}
        </View>

        {/* Current status hero */}
        {!isCancelled && (
          <View style={[styles.statusHero, { backgroundColor: STATUS_COLOR[order?.status] || Colors.primary }]}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>{STAGES[currentIdx]?.icon || '📦'}</Text>
            <Text style={styles.statusHeroLabel}>{STAGES[currentIdx]?.label || order?.status}</Text>
            <Text style={styles.statusHeroDesc}>{STAGES[currentIdx]?.desc}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${((currentIdx+1)/STAGES.length)*100}%` }]} />
            </View>
            <Text style={styles.progressLabel}>Step {currentIdx+1} of {STAGES.length}</Text>
          </View>
        )}

        {/* Timeline */}
        <Text style={styles.sectionTitle}>Order Journey</Text>
        <View style={styles.timeline}>
          {STAGES.map((stage, idx) => {
            const done    = idx < currentIdx;
            const current = idx === currentIdx && !isCancelled;
            const future  = idx > currentIdx;
            const stageLog = order?.stages?.find((s: any) => s.stage === stage.key);

            return (
              <View key={stage.key} style={styles.timelineRow}>
                {/* Line */}
                <View style={styles.timelineLeft}>
                  <View style={[
                    styles.dot,
                    done    && styles.dotDone,
                    current && styles.dotCurrent,
                    future  && styles.dotFuture,
                  ]}>
                    <Text style={{ fontSize: done ? 10 : 14 }}>{done ? '✓' : stage.icon}</Text>
                  </View>
                  {idx < STAGES.length - 1 && (
                    <View style={[styles.line, done && styles.lineDone]} />
                  )}
                </View>
                {/* Content */}
                <View style={styles.timelineContent}>
                  <Text style={[styles.stageName, future && { color: '#c4cfe0' }]}>{stage.label}</Text>
                  {stageLog?.createdAt && (
                    <Text style={styles.stageTime}>{formatDate(stageLog.createdAt)}</Text>
                  )}
                  {current && !stageLog && (
                    <View style={styles.inProgressBadge}>
                      <Text style={styles.inProgressText}>● In Progress</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Items summary */}
        {order?.items?.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Garments ({order.items.length})</Text>
            <View style={styles.itemsCard}>
              {order.items.map((item: any, i: number) => (
                <View key={i} style={[styles.itemRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#f0f4f8' }]}>
                  <Text style={styles.itemName}>{item.serviceName}</Text>
                  <Text style={styles.itemQty}>× {item.quantity}</Text>
                  <Text style={styles.itemPrice}>₹{item.unitPrice}</Text>
                </View>
              ))}
              <View style={[styles.itemRow, { borderTopWidth: 2, borderTopColor: '#e8f0f7' }]}>
                <Text style={[styles.itemName, { fontWeight: '700', color: Colors.primary }]}>Total</Text>
                <Text style={{ flex: 1 }} />
                <Text style={[styles.itemPrice, { fontWeight: '800', color: Colors.primary, fontSize: 16 }]}>₹{order.totalAmount?.toLocaleString('en-IN')}</Text>
              </View>
            </View>
          </>
        )}

        {/* Help */}
        <TouchableOpacity style={styles.helpBtn} onPress={() => navigation.navigate('Home')}>
          <Text style={styles.helpBtnText}>Need help? Contact Us</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f4f7fb' },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'ios' ? 52 : 20, paddingHorizontal: Spacing.lg, paddingBottom: 14, backgroundColor: Colors.primary },
  backBtn:         { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  backText:        { color: '#fff', fontSize: 22 },
  headerTitle:     { color: '#fff', fontSize: 18, fontWeight: '700' },
  orderCard:       { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#e8f0f7', shadowColor: '#023c62', shadowOffset: {width:0,height:2}, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  orderNum:        { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontWeight: '700', fontSize: 16, color: Colors.primary },
  orderSub:        { fontSize: 12, color: '#9dafc8', marginTop: 4 },
  orderAmount:     { fontWeight: '800', fontSize: 18, color: Colors.primary },
  statusHero:      { borderRadius: 20, padding: 28, alignItems: 'center', marginBottom: 24 },
  statusHeroLabel: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  statusHeroDesc:  { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginBottom: 16, textAlign: 'center' },
  progressTrack:   { width: '80%', height: 6, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 3, marginBottom: 8 },
  progressFill:    { height: 6, backgroundColor: '#fff', borderRadius: 3 },
  progressLabel:   { color: 'rgba(255,255,255,0.65)', fontSize: 12 },
  sectionTitle:    { fontSize: 15, fontWeight: '700', color: Colors.primary, marginBottom: 14, marginTop: 4 },
  timeline:        { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#e8f0f7' },
  timelineRow:     { flexDirection: 'row', alignItems: 'flex-start' },
  timelineLeft:    { alignItems: 'center', width: 40 },
  dot:             { width: 34, height: 34, borderRadius: 17, backgroundColor: '#f0f4f8', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#dce8f0' },
  dotDone:         { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dotCurrent:      { backgroundColor: '#fff', borderColor: Colors.primary, shadowColor: Colors.primary, shadowOffset:{width:0,height:0}, shadowOpacity:0.4, shadowRadius:6, elevation:4 },
  dotFuture:       { backgroundColor: '#f7f9fc', borderColor: '#e8f0f7' },
  line:            { width: 2, flex: 1, minHeight: 28, backgroundColor: '#e8f0f7', marginVertical: 3 },
  lineDone:        { backgroundColor: Colors.primary },
  timelineContent: { flex: 1, paddingLeft: 14, paddingBottom: 20 },
  stageName:       { fontSize: 14, fontWeight: '600', color: '#1a2332' },
  stageTime:       { fontSize: 11, color: '#9dafc8', marginTop: 2 },
  inProgressBadge: { marginTop: 5, backgroundColor: '#f0f5fa', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  inProgressText:  { color: Colors.primary, fontSize: 11, fontWeight: '700' },
  itemsCard:       { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e8f0f7', overflow: 'hidden', marginBottom: 24 },
  itemRow:         { flexDirection: 'row', alignItems: 'center', padding: 14, paddingHorizontal: 16 },
  itemName:        { flex: 1, fontSize: 14, color: '#1a2332' },
  itemQty:         { fontSize: 13, color: '#9dafc8', marginRight: 16 },
  itemPrice:       { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  helpBtn:         { borderWidth: 1.5, borderColor: '#dce8f0', borderRadius: 12, padding: 14, alignItems: 'center', backgroundColor: '#fff' },
  helpBtnText:     { color: Colors.primaryMid, fontSize: 14, fontWeight: '600' },
});
