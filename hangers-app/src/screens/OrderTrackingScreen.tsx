import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import api, { metadataAPI } from '../services/api';
import { Colors, FontSize, Fonts, Radius, Shadow, Spacing } from '../utils/theme';

const formatDate = (iso?: string) => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function OrderTrackingScreen({ route, navigation }: any) {
  const { orderId, orderNumber } = route.params || {};
  const [order, setOrder] = useState<any>(null);
  const [loadError, setLoadError] = useState('');
  const [stages, setStages] = useState<any[]>([]);
  const [paymentStatusMeta, setPaymentStatusMeta] = useState<Record<string, string>>({});
  const [statusStyles, setStatusStyles] = useState<Record<string, { bg: string; text: string; border: string }>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const response: any = await api.get(`/customer/orders/${orderId}`);
      setOrder(response?.order || response?.data?.order || null);
      setLoadError('');
    } catch {
      try {
        const fallback: any = await api.get(`/orders/${orderId}`);
        setOrder(fallback?.order || fallback?.data?.order || null);
        setLoadError('');
      } catch (e: any) {
        setOrder(null);
        setLoadError(e?.message || 'Could not load order tracking right now.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    metadataAPI
      .getAll()
      .then((response: any) => {
        const metadata = response?.metadata || response?.data?.metadata || {};
        const nextStages = (metadata.orderStatuses || [])
          .filter((item: any) => item.customerTrackVisible !== false)
          .map((item: any) => ({
            key: item.key,
            label: item.customerLabel || item.label || item.key,
            icon: item.icon || 'package-variant-closed',
            desc: item.customerLabel || item.label || item.key,
          }));
        const nextPaymentMeta = (metadata.paymentStatuses || []).reduce((acc: Record<string, string>, item: any) => {
          acc[item.value] = item.label || item.value;
          return acc;
        }, {});
        const nextStatusStyles = (metadata.orderStatuses || []).reduce((acc: Record<string, { bg: string; text: string; border: string }>, item: any) => {
          acc[item.key] = {
            bg: item.bg || '#eef4f8',
            text: item.color || Colors.primary,
            border: item.border || item.bg || '#d9e4ee',
          };
          return acc;
        }, {});
        if (nextStages.length) setStages(nextStages);
        setPaymentStatusMeta(nextPaymentMeta);
        setStatusStyles(nextStatusStyles);
      })
      .catch(() => {
        setStages([]);
        setPaymentStatusMeta({});
        setStatusStyles({});
      });
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Loading order tracking...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.errorWrap}>
        <MaterialCommunityIcons name="alert-circle-outline" size={42} color={Colors.error} />
        <Text style={styles.errorTitle}>Tracking unavailable</Text>
        <Text style={styles.errorBody}>{loadError || 'Please try again.'}</Text>
        <TouchableOpacity style={styles.errorBtn} onPress={() => { setLoading(true); load(); }}>
          <Text style={styles.errorBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const computedStages =
    stages.length > 0
      ? stages
      : order?.status
        ? [{ key: order.status, label: order.status, icon: 'package-variant-closed', desc: order.status }]
        : [];
  const currentIdx = Math.max(
    computedStages.findIndex((stage) => stage.key === order?.status),
    0
  );
  const statusColor = statusStyles[order?.status]?.text || Colors.primary;
  const isCancelled = order?.status === 'CANCELLED';

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#fff" />}
      >
        <View style={[styles.hero, { backgroundColor: statusColor }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.heroEyebrow}>Track Order</Text>
          <Text style={styles.heroTitle}>{order?.orderNumber || orderNumber}</Text>
          <Text style={styles.heroBody}>
            {isCancelled
              ? 'This order was cancelled before completion.'
              : computedStages[currentIdx]?.desc || order?.status || 'Order in progress'}
          </Text>

          {!isCancelled && (
            <View style={styles.progressBlock}>
              <Text style={styles.progressLabel}>
                Step {currentIdx + 1} of {Math.max(computedStages.length, 1)}
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${((currentIdx + 1) / Math.max(computedStages.length, 1)) * 100}%` },
                  ]}
                />
              </View>
            </View>
          )}
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Items</Text>
            <Text style={styles.summaryValue}>{order?.items?.length || 0} garments</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Placed</Text>
            <Text style={styles.summaryValue}>{formatDate(order?.createdAt) || '—'}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total</Text>
            <Text style={styles.summaryValue}>₹{Number(order?.totalAmount || 0).toLocaleString('en-IN')}</Text>
          </View>
          {!!order?.paymentStatus && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Payment</Text>
              <Text style={styles.summaryValue}>{paymentStatusMeta[order.paymentStatus] || order.paymentStatus}</Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>Journey</Text>
        <View style={styles.timelineCard}>
          {computedStages.map((stage, index) => {
            const done = index < currentIdx && !isCancelled;
            const current = index === currentIdx && !isCancelled;
            const future = index > currentIdx || isCancelled;
            const stageLog = order?.stages?.find((item: any) => item.stage === stage.key);
            return (
              <View key={stage.key} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View
                    style={[
                      styles.dot,
                      done && { backgroundColor: statusColor, borderColor: statusColor },
                      current && { borderColor: statusColor, backgroundColor: '#fff' },
                      future && { borderColor: statusStyles[stage.key]?.border || '#d9e4ee', backgroundColor: '#f7fafc' },
                    ]}
                  >
                    {done ? (
                      <Feather name="check" size={12} color="#fff" />
                    ) : (
                      <MaterialCommunityIcons
                        name={stage.icon as any}
                        size={14}
                        color={current ? statusColor : '#93a8bf'}
                      />
                    )}
                  </View>
                  {index < computedStages.length - 1 && (
                    <View style={[styles.railLine, done && { backgroundColor: statusColor }]} />
                  )}
                </View>
                <View style={styles.timelineContent}>
                  <Text style={[styles.stageLabel, future && { color: Colors.textMuted }]}>{stage.label}</Text>
                  <Text style={styles.stageMeta}>
                    {stageLog?.createdAt ? formatDate(stageLog.createdAt) : current ? 'Currently in progress' : 'Waiting'}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {!!order?.items?.length && (
          <>
            <Text style={styles.sectionTitle}>Garments</Text>
            <View style={styles.itemsCard}>
              {order.items.map((item: any, index: number) => (
                <View
                  key={`${item.serviceName}-${index}`}
                  style={[styles.itemRow, index < order.items.length - 1 && styles.itemBorder]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.serviceName}</Text>
                    <Text style={styles.itemMeta}>Qty {item.quantity}</Text>
                  </View>
                  <Text style={styles.itemPrice}>₹{Number(item.unitPrice || 0).toLocaleString('en-IN')}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <TouchableOpacity style={styles.helpBtn} onPress={() => navigation.navigate('Home')}>
          <Text style={styles.helpBtnText}>Back to home</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef4f8' },
  loadingWrap: { flex: 1, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, color: '#fff', fontFamily: Fonts.body, fontSize: FontSize.base },
  errorWrap: { flex: 1, backgroundColor: Colors.offWhite, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  errorTitle: { marginTop: 12, marginBottom: 6, fontSize: FontSize.xl, fontFamily: Fonts.displayBold, color: Colors.textDark },
  errorBody: { textAlign: 'center', color: Colors.textMuted, fontSize: FontSize.base, marginBottom: 16 },
  errorBtn: { backgroundColor: Colors.primary, paddingHorizontal: 18, paddingVertical: 12, borderRadius: Radius.lg },
  errorBtnText: { color: '#fff', fontFamily: Fonts.bold, fontSize: FontSize.base },
  scrollContent: { paddingBottom: 40 },
  hero: {
    paddingTop: 58,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  backText: { color: '#fff', fontSize: 22, fontFamily: Fonts.medium },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.74)',
    fontFamily: Fonts.medium,
    fontSize: FontSize.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  heroTitle: { color: '#fff', fontFamily: Fonts.displayBold, fontSize: 32, marginBottom: 8 },
  heroBody: { color: 'rgba(255,255,255,0.82)', fontFamily: Fonts.body, fontSize: FontSize.base, lineHeight: 22 },
  progressBlock: { marginTop: 18 },
  progressLabel: { color: '#fff', fontFamily: Fonts.medium, fontSize: FontSize.sm, marginBottom: 8 },
  progressTrack: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: Radius.full },
  summaryCard: {
    marginHorizontal: Spacing.lg,
    marginTop: 18,
    padding: 20,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  summaryLabel: { color: Colors.textMuted, fontFamily: Fonts.medium, fontSize: FontSize.sm },
  summaryValue: { color: Colors.textDark, fontFamily: Fonts.bold, fontSize: FontSize.base },
  sectionTitle: {
    marginTop: 22,
    marginBottom: 12,
    marginHorizontal: Spacing.lg,
    color: Colors.textDark,
    fontFamily: Fonts.display,
    fontSize: 22,
  },
  timelineCard: {
    marginHorizontal: Spacing.lg,
    padding: 20,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  timelineRow: { flexDirection: 'row' },
  timelineRail: { width: 34, alignItems: 'center' },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: '#d9e4ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  railLine: { width: 2, flex: 1, minHeight: 28, backgroundColor: '#d9e4ee', marginVertical: 3 },
  timelineContent: { flex: 1, paddingLeft: 14, paddingBottom: 20 },
  stageLabel: { color: Colors.textDark, fontFamily: Fonts.bold, fontSize: FontSize.base, marginBottom: 3 },
  stageMeta: { color: Colors.textMuted, fontFamily: Fonts.body, fontSize: FontSize.sm },
  itemsCard: {
    marginHorizontal: Spacing.lg,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 12 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  itemName: { color: Colors.textDark, fontFamily: Fonts.bold, fontSize: FontSize.base },
  itemMeta: { color: Colors.textMuted, fontFamily: Fonts.body, fontSize: FontSize.sm, marginTop: 4 },
  itemPrice: { color: Colors.primary, fontFamily: Fonts.display, fontSize: 20 },
  helpBtn: {
    marginHorizontal: Spacing.lg,
    marginTop: 20,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 16,
    alignItems: 'center',
  },
  helpBtnText: { color: '#fff', fontFamily: Fonts.bold, fontSize: FontSize.base },
});
