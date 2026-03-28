// ─────────────────────────────────────────────────────────────────────────────
// MY ORDERS SCREEN v3 — Filters + PDF Invoice + Re-order
//   ✅ Filter chips: All / Active / Completed
//   ✅ PDF invoice download via expo-print + expo-sharing
//   ✅ Re-order in 2 taps
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, RefreshControl, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../utils/theme';
import { ordersAPI } from '../services/api';

// ── Filter / status helpers ───────────────────────────────────────────────────
type FilterType = 'all' | 'active' | 'completed';
const ACTIVE_STATUSES = [
  'PENDING','PICKED_UP','PROCESSING','WASHING','DRYING',
  'IRONING','QC','READY_FOR_DELIVERY','OUT_FOR_DELIVERY',
];

// ── PDF Invoice ───────────────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

const buildInvoiceHTML = (order: any): string => {
  const items = order.items || [];
  const rows  = items.map((it: any) =>
    `<tr>
      <td>${it.serviceName || it.garmentType || 'Item'}</td>
      <td style="text-align:center">${it.quantity || 1}</td>
      <td style="text-align:right">Rs.${it.unitPrice || 0}</td>
      <td style="text-align:right">Rs.${it.subtotal || (it.unitPrice || 0) * (it.quantity || 1)}</td>
    </tr>`
  ).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>body{font-family:Arial,sans-serif;padding:32px;color:#1a1a2e}h1{color:#023c62}
.meta{display:flex;justify-content:space-between;margin:20px 0}.lbl{color:#888;font-size:12px}
table{width:100%;border-collapse:collapse}th{background:#023c62;color:#fff;padding:10px;text-align:left;font-size:13px}
td{border-bottom:1px solid #e8f0f7;padding:10px;font-size:13px}.tot td{font-weight:700;border-top:2px solid #023c62;color:#023c62}
.foot{margin-top:28px;text-align:center;color:#888;font-size:12px}</style></head>
<body><h1>Hangers Clothes Spa</h1><p style="color:#666;margin-top:4px">Care in Every Clean</p>
<div class="meta">
  <div><div class="lbl">Order</div><b>${order.orderNumber}</b></div>
  <div><div class="lbl">Date</div>${formatDate(order.createdAt)}</div>
  <div><div class="lbl">Status</div>${order.status}</div>
</div>
<table><thead><tr><th>Service</th><th style="text-align:center">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Total</th></tr></thead>
<tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:#888">Items confirmed at pickup</td></tr>'}</tbody>
<tfoot><tr class="tot"><td colspan="3">Total</td><td style="text-align:right">Rs.${(order.totalAmount||0).toLocaleString('en-IN')}</td></tr></tfoot>
</table>
<div class="foot">Invoice by Hangers App — Thank you for choosing Hangers Clothes Spa!</div>
</body></html>`;
};

async function downloadInvoice(order: any) {
  try {
    const { uri } = await Print.printToFileAsync({ html: buildInvoiceHTML(order), base64: false });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: `Invoice ${order.orderNumber}` });
    } else {
      Alert.alert('Saved', `Invoice saved to:\n${uri}`);
    }
  } catch (e: any) { Alert.alert('Error', e?.message || 'Could not generate invoice'); }
}

const STATUS_LABEL: Record<string, string> = {
  PENDING:             'Pending',
  PICKED_UP:           'Picked Up',
  PROCESSING:          'At Plant',
  WASHING:             'Washing',
  DRYING:              'Drying',
  IRONING:             'Ironing',
  QC:                  'QC Check',
  READY_FOR_DELIVERY:  'Ready for Delivery',
  OUT_FOR_DELIVERY:    'Out for Delivery',
  DELIVERED:           'Delivered',
  CANCELLED:           'Cancelled',
};

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  PENDING:            { bg: '#f0f4f8',  text: '#6b7fa3' },
  PICKED_UP:          { bg: '#dbeafe',  text: '#1d4ed8' },
  PROCESSING:         { bg: '#ede9fe',  text: '#6d28d9' },
  WASHING:            { bg: '#cffafe',  text: '#0e7490' },
  DRYING:             { bg: '#fef3c7',  text: '#92400e' },
  IRONING:            { bg: '#fed7aa',  text: '#9a3412' },
  QC:                 { bg: '#d1fae5',  text: '#065f46' },
  READY_FOR_DELIVERY: { bg: '#bbf7d0',  text: '#14532d' },
  OUT_FOR_DELIVERY:   { bg: '#bfdbfe',  text: '#1e3a8a' },
  DELIVERED:          { bg: '#d1fae5',  text: '#065f46' },
  CANCELLED:          { bg: '#fee2e2',  text: '#991b1b' },
};



// ─────────────────────────────────────────────────────────────────────────────
export default function MyOrdersScreen({ navigation }: any) {
  const [orders,     setOrders]     = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [filter,     setFilter]     = useState<FilterType>('all');
  const [invoicing,  setInvoicing]  = useState<string | null>(null);

  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result: any = await ordersAPI.getMyOrders();
      setOrders(result?.data?.orders || result?.orders || []);
    } catch (e: any) {
      setError(e?.message || 'Could not load orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  useFocusEffect(useCallback(() => { loadOrders(true); }, [loadOrders]));
  const onRefresh = () => { setRefreshing(true); loadOrders(); };

  const activeOrders    = orders.filter(o => ACTIVE_STATUSES.includes(o.status));
  const completedOrders = orders.filter(o => ['DELIVERED','CANCELLED'].includes(o.status));
  const visibleOrders   = filter === 'active'
    ? activeOrders
    : filter === 'completed'
    ? completedOrders
    : orders;

  const handleInvoice = async (order: any) => {
    setInvoicing(order.id);
    await downloadInvoice(order);
    setInvoicing(null);
  };

  const handleReorder = (order: any) => {
    const serviceTypes   = order.serviceTypes || order.items?.map((i: any) => i.category) || [];
    const uniqueServices = [...new Set(serviceTypes)] as string[];
    navigation.navigate('BookPickup', { preselectedServices: uniqueServices });
  };

  const renderOrder = (order: any) => {
    const sc        = STATUS_COLOR[order.status] || { bg: '#f0f4f8', text: '#6b7fa3' };
    const itemCount = order.items?.length || 0;
    const isActive  = ACTIVE_STATUSES.includes(order.status);
    const isDone    = ['DELIVERED','CANCELLED'].includes(order.status);

    return (
      <TouchableOpacity
        key={order.id}
        onPress={() => navigation.navigate('OrderTracking', { orderId: order.id, orderNumber: order.orderNumber })}
        style={[styles.orderCard, isActive && styles.orderCardActive]}
        activeOpacity={0.85}
      >
        {/* Top row */}
        <View style={styles.orderTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderNum}>{order.orderNumber}</Text>
            <Text style={styles.orderDate}>{formatDate(order.createdAt)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.statusText, { color: sc.text }]}>
              {STATUS_LABEL[order.status] || order.status}
            </Text>
          </View>
        </View>

        {/* Meta chips */}
        <View style={styles.orderMeta}>
          <View style={styles.metaChip}>
            <Text style={styles.metaText}>
              {itemCount > 0 ? `${itemCount} item${itemCount !== 1 ? 's' : ''}` : 'Items TBC'}
            </Text>
          </View>
          {order.totalAmount > 0 && (
            <View style={styles.metaChip}>
              <Text style={styles.metaText}>Rs.{order.totalAmount.toLocaleString('en-IN')}</Text>
            </View>
          )}
          {order.paymentStatus && (
            <View style={[styles.metaChip, { backgroundColor: order.paymentStatus === 'PAID' ? '#d1fae5' : '#fef3c7' }]}>
              <Text style={[styles.metaText, { color: order.paymentStatus === 'PAID' ? '#065f46' : '#92400e' }]}>
                {order.paymentStatus === 'PAID' ? 'Paid' : 'COD'}
              </Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.orderFooter}>
          <Text style={[styles.trackLink, isActive && { color: Colors.primary, fontWeight: '700' }]}>
            {isActive ? 'Track Order  >' : 'View Details  >'}
          </Text>

          {isDone && (
            <View style={styles.actionBtns}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleInvoice(order)}
                disabled={invoicing === order.id}
              >
                {invoicing === order.id
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Text style={styles.actionBtnText}>Invoice</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.reorderBtn]}
                onPress={() => handleReorder(order)}
              >
                <Text style={[styles.actionBtnText, { color: Colors.white }]}>Re-order</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
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
        <Text style={styles.title}>My Orders</Text>
        <TouchableOpacity onPress={() => loadOrders(true)} style={styles.refreshBtn}>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 20 }}>{'O'}</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Filter chips */}
      {!loading && orders.length > 0 && (
        <View style={styles.filterRow}>
          {([
            { key: 'all',       label: `All (${orders.length})` },
            { key: 'active',    label: `Active (${activeOrders.length})` },
            { key: 'completed', label: `Done (${completedOrders.length})` },
          ] as { key: FilterType; label: string }[]).map(f => (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Loading */}
      {loading && (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ color: Colors.textMuted, marginTop: 12 }}>Loading your orders...</Text>
        </View>
      )}

      {/* Error */}
      {!loading && error && (
        <View style={styles.centerBox}>
          <Text style={{ color: Colors.textDark, fontWeight: '700', marginBottom: 6 }}>
            Couldn't load orders
          </Text>
          <Text style={{ color: Colors.textMuted, textAlign: 'center', marginBottom: 20 }}>{error}</Text>
          <TouchableOpacity onPress={() => loadOrders()} style={styles.retryBtn}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Empty */}
      {!loading && !error && orders.length === 0 && (
        <View style={styles.centerBox}>
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.emptySub}>
            Your order history will appear here once you book a pickup.
          </Text>
          <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('BookPickup')}>
            <Text style={styles.ctaText}>Book a Pickup</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Order list */}
      {!loading && !error && orders.length > 0 && (
        <ScrollView
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
        >
          {visibleOrders.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 40 }}>
              <Text style={{ color: Colors.textMuted }}>No {filter} orders</Text>
            </View>
          ) : (
            visibleOrders.map(renderOrder)
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header:           { paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 20, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:          { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  back:             { fontSize: 22, color: '#fff' },
  title:            { fontSize: FontSize.lg, fontWeight: '700', color: '#fff' },
  refreshBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },

  filterRow:        { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.lg, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterChip:       { borderRadius: Spacing.lg, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: Colors.offWhite, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText:       { fontSize: FontSize.sm, color: Colors.textMid, fontWeight: '500' },
  filterTextActive: { color: Colors.white },

  centerBox:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle:       { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textDark, marginBottom: 8 },
  emptySub:         { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginBottom: 28, lineHeight: 22 },
  cta:              { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 28, paddingVertical: 14 },
  ctaText:          { fontSize: FontSize.base, fontWeight: '700', color: '#fff' },
  retryBtn:         { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },

  orderCard:        { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: '#e8f0f7', ...Shadow.md },
  orderCardActive:  { borderColor: Colors.primaryMid, borderWidth: 1.5 },
  orderTop:         { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  orderNum:         { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 15, fontWeight: '700', color: Colors.primary },
  orderDate:        { fontSize: 11, color: Colors.textLight, marginTop: 3 },
  statusBadge:      { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText:       { fontSize: 11, fontWeight: '700' },

  orderMeta:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  metaChip:         { backgroundColor: '#f7f9fc', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#e8f0f7' },
  metaText:         { fontSize: 12, color: Colors.textMid, fontWeight: '500' },

  orderFooter:      { borderTopWidth: 1, borderTopColor: '#f0f4f8', paddingTop: 10 },
  trackLink:        { fontSize: 13, color: Colors.textMuted },

  actionBtns:       { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn:        { flex: 1, borderRadius: Radius.sm, paddingVertical: 9, alignItems: 'center', backgroundColor: Colors.offWhite, borderWidth: 1, borderColor: Colors.border },
  reorderBtn:       { backgroundColor: Colors.primary, borderColor: Colors.primary },
  actionBtnText:    { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '500' },
});
