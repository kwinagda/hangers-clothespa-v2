// ─────────────────────────────────────────────────────────────────────────────
// MY ORDERS SCREEN — Customer order archive
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, RefreshControl, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Colors, Spacing, Radius, FontSize, Shadow, Fonts } from '../utils/theme';
import { metadataAPI, ordersAPI } from '../services/api';
import AnimatedButton from '../components/AnimatedButton';
import StaggerItem from '../components/StaggerItem';
import { LOGO_BLUE_URL } from '../lib/branding';

type FilterType = 'all' | 'active' | 'completed';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

const buildInvoiceHTML = (order: any): string => {
  const items = order.items || [];
  const rows = items.map((it: any) =>
    `<tr>
      <td>${it.serviceName || it.garmentType || 'Item'}</td>
      <td style="text-align:center">${it.quantity || 1}</td>
      <td style="text-align:right">Rs.${it.unitPrice || 0}</td>
      <td style="text-align:right">Rs.${it.subtotal || (it.unitPrice || 0) * (it.quantity || 1)}</td>
    </tr>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=Space+Mono:wght@400;500&display=swap');body{font-family:'Inter',sans-serif;padding:32px;color:#1a1a2e}.brand{margin-bottom:8px}.brand-logo{width:260px;max-width:100%;height:auto;display:block}
.meta{display:flex;justify-content:space-between;margin:20px 0}.lbl{color:#888;font-size:12px}
table{width:100%;border-collapse:collapse}th{background:#023c62;color:#fff;padding:10px;text-align:left;font-size:13px;font-family:'Space Grotesk',sans-serif;letter-spacing:0.01em}
td{border-bottom:1px solid #e8f0f7;padding:10px;font-size:13px}.tot td{font-family:'Space Grotesk',sans-serif;font-weight:700;border-top:2px solid #023c62;color:#023c62}
.foot{margin-top:28px;text-align:center;color:#888;font-size:12px}</style></head>
<body><div class="brand"><img class="brand-logo" src="${LOGO_BLUE_URL}" alt="Hangers logo" /></div><p style="color:#666;margin-top:4px">Care in Every Clean</p>
<div class="meta">
  <div><div class="lbl">Order</div><b style="font-family:'Space Mono',monospace">${order.orderNumber}</b></div>
  <div><div class="lbl">Date</div>${formatDate(order.createdAt)}</div>
  <div><div class="lbl">Status</div>${order.status}</div>
</div>
<table><thead><tr><th>Service</th><th style="text-align:center">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Total</th></tr></thead>
<tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:#888">Items confirmed at pickup</td></tr>'}</tbody>
<tfoot><tr class="tot"><td colspan="3">Total</td><td style="text-align:right">Rs.${(order.totalAmount||0).toLocaleString('en-IN')}</td></tr></tfoot>
</table>
<div class="foot">Thank you for choosing us.</div>
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
  } catch (e: any) {
    Alert.alert('Error', e?.message || 'Could not generate invoice');
  }
}

export default function MyOrdersScreen({ navigation }: any) {
  const [orders, setOrders] = useState<any[]>([]);
  const [statusMeta, setStatusMeta] = useState<Record<string, string>>({});
  const [statusStyles, setStatusStyles] = useState<Record<string, { bg: string; text: string; glow: string }>>({});
  const [statusBuckets, setStatusBuckets] = useState<Record<string, FilterType | 'other'>>({});
  const [paymentStatusMeta, setPaymentStatusMeta] = useState<Record<string, string>>({});
  const [paymentStatusStyles, setPaymentStatusStyles] = useState<Record<string, { bg: string; text: string }>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [invoicing, setInvoicing] = useState<string | null>(null);

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

  useEffect(() => {
    metadataAPI.getAll().then((response: any) => {
      const metadata = response?.metadata || response?.data?.metadata || {};
      const labels = (metadata.orderStatuses || []).reduce((acc: Record<string, string>, item: any) => {
        acc[item.key] = item.customerLabel || item.label || item.key;
        return acc;
      }, {});
      const buckets = (metadata.orderStatuses || []).reduce((acc: Record<string, FilterType | 'other'>, item: any) => {
        acc[item.key] = item.customerBucket || 'other';
        return acc;
      }, {});
      const paymentLabels = (metadata.paymentStatuses || []).reduce((acc: Record<string, string>, item: any) => {
        acc[item.value] = item.label || item.value;
        return acc;
      }, {});
      const nextStatusStyles = (metadata.orderStatuses || []).reduce((acc: Record<string, { bg: string; text: string; glow: string }>, item: any) => {
        acc[item.key] = {
          bg: item.bg || '#eef2f7',
          text: item.color || '#60758f',
          glow: item.border || item.bg || '#d7e1ec',
        };
        return acc;
      }, {});
      const nextPaymentStyles = (metadata.paymentStatuses || []).reduce((acc: Record<string, { bg: string; text: string }>, item: any) => {
        acc[item.value] = {
          bg: item.bg || '#f3f4f6',
          text: item.color || Colors.textMid,
        };
        return acc;
      }, {});
      setStatusMeta(labels);
      setStatusStyles(nextStatusStyles);
      setStatusBuckets(buckets);
      setPaymentStatusMeta(paymentLabels);
      setPaymentStatusStyles(nextPaymentStyles);
    }).catch(() => {
      setStatusMeta({});
      setStatusStyles({});
      setStatusBuckets({});
      setPaymentStatusMeta({});
      setPaymentStatusStyles({});
    });
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const activeOrders = orders.filter((o) => statusBuckets[o.status] === 'active');
  const completedOrders = orders.filter((o) => statusBuckets[o.status] === 'completed');
  const visibleOrders = filter === 'active'
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
    const serviceTypes = order.serviceTypes || order.items?.map((i: any) => i.category) || [];
    const uniqueServices = [...new Set(serviceTypes)] as string[];
    navigation.navigate('BookPickup', { preselectedServices: uniqueServices });
  };

  const renderOrderCard = (order: any) => {
    const bucket = statusBuckets[order.status] || 'other';
    const isActive = bucket === 'active';
    const isCompleted = bucket === 'completed';
    const statusStyle = statusStyles[order.status] || { bg: '#eef2f7', text: '#60758f', glow: '#d7e1ec' };
    const paymentStyle = paymentStatusStyles[order.paymentStatus] || { bg: '#f3f4f6', text: Colors.textMid };
    const itemCount = order.items?.length || 0;
    const stageLabel = statusMeta[order.status] || order.status;

    return (
      <TouchableOpacity
        key={order.id}
        onPress={() => navigation.navigate('OrderTracking', { orderId: order.id, orderNumber: order.orderNumber })}
        activeOpacity={0.9}
        style={[styles.orderCard, isActive && styles.orderCardActive]}
      >
        <View style={styles.cardAccentWrap}>
          <View style={[styles.cardAccent, { backgroundColor: statusStyle.glow }]} />
        </View>

        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.orderNoRow}>
              <Text style={styles.orderNo}>{order.orderNumber}</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>{stageLabel}</Text>
              </View>
            </View>
            <Text style={styles.orderDate}>{formatDate(order.createdAt)}</Text>
          </View>
        </View>

        <View style={styles.orderBody}>
          <View style={styles.metricTile}>
            <Text style={styles.metricLabel}>Amount</Text>
            <Text style={styles.metricValue}>₹{Number(order.totalAmount || 0).toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.metricTile}>
            <Text style={styles.metricLabel}>Items</Text>
            <Text style={styles.metricValue}>{itemCount || 'TBC'}</Text>
          </View>
          <View style={styles.metricTile}>
            <Text style={styles.metricLabel}>Payment</Text>
            <View style={[styles.paymentBadge, { backgroundColor: paymentStyle.bg }]}>
              <Text style={[styles.paymentBadgeText, { color: paymentStyle.text }]}>
                {paymentStatusMeta[order.paymentStatus] || order.paymentStatus || 'UNPAID'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.cardBottom}>
          <View style={styles.trackRow}>
            <MaterialCommunityIcons
              name={isActive ? 'progress-clock' : isCompleted ? 'check-decagram-outline' : 'package-variant-closed'}
              size={16}
              color={isActive ? Colors.primary : Colors.textMuted}
            />
            <Text style={[styles.trackText, isActive && styles.trackTextActive]}>
              {isActive ? 'Track live progress' : isCompleted ? 'View completed order' : 'View details'}
            </Text>
          </View>

          {isCompleted && (
            <View style={styles.actionsRow}>
              <AnimatedButton style={styles.secondaryBtn} onPress={() => handleInvoice(order)} disabled={invoicing === order.id} activeOpacity={0.88}>
                {invoicing === order.id
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Text style={styles.secondaryBtnText}>Invoice</Text>}
              </AnimatedButton>
              <AnimatedButton style={styles.primaryBtn} onPress={() => handleReorder(order)} activeOpacity={0.88}>
                <Text style={styles.primaryBtnText}>Reorder</Text>
              </AnimatedButton>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      <LinearGradient colors={['#022f4e', '#023c62', '#0a5d8d']} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={styles.headerGlow} />
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} activeOpacity={0.85}>
            <Feather name="arrow-left" size={18} color={Colors.white} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => loadOrders(true)} style={styles.iconBtn} activeOpacity={0.85}>
            <Feather name="rotate-cw" size={17} color={Colors.white} />
          </TouchableOpacity>
        </View>

        <Text style={styles.headerEyebrow}>Order archive</Text>
        <Text style={styles.headerTitle}>My Orders</Text>
        <Text style={styles.headerSub}>Track active loads and revisit completed orders without digging.</Text>
      </LinearGradient>

      {!loading && orders.length > 0 && (
        <View style={styles.filtersWrap}>
          {([
            { key: 'all', label: 'All Orders' },
            { key: 'active', label: 'Active' },
            { key: 'completed', label: 'Completed' },
          ] as Array<{ key: FilterType; label: string }>).map((item) => (
            <AnimatedButton
              key={item.key}
              onPress={() => setFilter(item.key)}
              activeOpacity={0.88}
              style={[styles.filterTab, filter === item.key && styles.filterTabActive]}
            >
              <Text style={[styles.filterTabText, filter === item.key && styles.filterTabTextActive]}>
                {item.label}
              </Text>
            </AnimatedButton>
          ))}
        </View>
      )}

      {loading && (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.stateText}>Loading your orders…</Text>
        </View>
      )}

      {!loading && error && (
        <View style={styles.centerBox}>
          <Text style={styles.errorTitle}>Could not load orders</Text>
          <Text style={styles.errorSub}>{error}</Text>
          <TouchableOpacity onPress={() => loadOrders()} style={styles.retryBtn} activeOpacity={0.88}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && orders.length === 0 && (
        <View style={styles.centerBox}>
          <MaterialCommunityIcons name="package-variant-closed" size={44} color={Colors.primary} />
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.emptySub}>Your order archive will appear here once you book your first pickup.</Text>
          <TouchableOpacity style={styles.emptyCta} onPress={() => navigation.navigate('BookPickup')} activeOpacity={0.88}>
            <Text style={styles.emptyCtaText}>Book a Pickup</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && orders.length > 0 && (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          <View style={styles.summaryStrip}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>All</Text>
              <Text style={styles.summaryValue}>{orders.length}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Active</Text>
              <Text style={styles.summaryValue}>{activeOrders.length}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Completed</Text>
              <Text style={styles.summaryValue}>{completedOrders.length}</Text>
            </View>
          </View>

          {visibleOrders.length === 0 ? (
            <View style={styles.emptyFilterState}>
              <Text style={styles.emptyFilterTitle}>Nothing here yet</Text>
              <Text style={styles.emptyFilterSub}>There are no {filter} orders in this view right now.</Text>
            </View>
          ) : (
            visibleOrders.map((order, index) => (
              <StaggerItem key={order.id} index={index}>
                {renderOrderCard(order)}
              </StaggerItem>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#edf3f8',
  },

  header: {
    paddingTop: Platform.OS === 'ios' ? 48 : 24,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  headerGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -110,
    right: -30,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyebrow: {
    fontFamily: Fonts.medium,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.74)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  headerTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 28,
    color: Colors.white,
    marginBottom: 6,
  },
  headerSub: {
    fontFamily: Fonts.body,
    fontSize: FontSize.xs,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.78)',
    maxWidth: '88%',
  },
  summaryStrip: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryLabel: {
    fontFamily: Fonts.medium,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: 6,
  },
  summaryValue: {
    fontFamily: Fonts.display,
    fontSize: FontSize.lg,
    color: Colors.textDark,
  },

  filtersWrap: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
  },
  filterTab: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterTabText: {
    fontFamily: Fonts.medium,
    fontSize: FontSize.sm,
    color: Colors.textMid,
  },
  filterTabTextActive: {
    color: Colors.white,
  },

  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 14,
    paddingBottom: 40,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  stateText: {
    marginTop: 12,
    fontFamily: Fonts.body,
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  errorTitle: {
    fontFamily: Fonts.display,
    fontSize: FontSize.lg,
    color: Colors.textDark,
    marginBottom: 6,
  },
  errorSub: {
    fontFamily: Fonts.body,
    fontSize: FontSize.sm,
    lineHeight: 20,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryBtnText: {
    fontFamily: Fonts.display,
    fontSize: FontSize.sm,
    color: Colors.white,
  },
  emptyTitle: {
    fontFamily: Fonts.display,
    fontSize: FontSize.lg,
    color: Colors.textDark,
    marginTop: 14,
    marginBottom: 8,
  },
  emptySub: {
    fontFamily: Fonts.body,
    fontSize: FontSize.sm,
    lineHeight: 21,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 22,
  },
  emptyCta: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 13,
  },
  emptyCtaText: {
    fontFamily: Fonts.display,
    fontSize: FontSize.sm,
    color: Colors.white,
  },
  emptyFilterState: {
    backgroundColor: Colors.white,
    borderRadius: 22,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  emptyFilterTitle: {
    fontFamily: Fonts.display,
    fontSize: FontSize.base,
    color: Colors.textDark,
    marginBottom: 6,
  },
  emptyFilterSub: {
    fontFamily: Fonts.body,
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },

  orderCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.md,
  },
  orderCardActive: {
    borderColor: '#b7d3eb',
    shadowOpacity: 0.18,
  },
  cardAccentWrap: {
    marginBottom: 14,
  },
  cardAccent: {
    width: 68,
    height: 6,
    borderRadius: 999,
  },
  cardTop: {
    marginBottom: 14,
  },
  orderNoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  orderNo: {
    flex: 1,
    fontFamily: Fonts.mono,
    fontSize: FontSize.base,
    color: Colors.primary,
  },
  orderDate: {
    fontFamily: Fonts.body,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusBadgeText: {
    fontFamily: Fonts.medium,
    fontSize: 11,
  },
  orderBody: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  metricTile: {
    flex: 1,
    backgroundColor: '#f7fafc',
    borderRadius: 16,
    padding: 12,
    minHeight: 76,
  },
  metricLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: 7,
  },
  metricValue: {
    fontFamily: Fonts.display,
    fontSize: FontSize.base,
    color: Colors.textDark,
  },
  paymentBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  paymentBadgeText: {
    fontFamily: Fonts.medium,
    fontSize: 11,
  },
  cardBottom: {
    borderTopWidth: 1,
    borderTopColor: '#edf2f7',
    paddingTop: 14,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trackText: {
    fontFamily: Fonts.medium,
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  trackTextActive: {
    color: Colors.primary,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f7fafc',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryBtnText: {
    fontFamily: Fonts.medium,
    fontSize: FontSize.sm,
    color: Colors.primary,
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  primaryBtnText: {
    fontFamily: Fonts.display,
    fontSize: FontSize.sm,
    color: Colors.white,
  },
});
