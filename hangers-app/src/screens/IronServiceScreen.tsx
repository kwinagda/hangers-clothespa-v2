import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, Radius, FontSize, Shadow, Fonts } from '../utils/theme';
import { ironAPI, metadataAPI, servicesAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import PageMotion from '../components/PageMotion';
import AnimatedButton from '../components/AnimatedButton';
import StaggerItem from '../components/StaggerItem';

const BILL_STATUS: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: '#fef3c7', text: '#92400e' },
  SENT: { bg: '#dbeafe', text: '#1d4ed8' },
  PARTIAL: { bg: '#ede9fe', text: '#6d28d9' },
  PAID: { bg: '#dcfce7', text: '#166534' },
};

const fmtCurrency = (value: number) => `₹${(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtDate = (value: string) => new Date(value).toLocaleDateString('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export default function IronServiceScreen({ navigation }: any) {
  const { customer, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [statusStyles, setStatusStyles] = useState<Record<string, { bg: string; text: string; label: string }>>({});
  const [rates, setRates] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [monthSummary, setMonthSummary] = useState<{ pieces: number; amount: number }>({ pieces: 0, amount: 0 });
  const [logs, setLogs] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [showAllLogs, setShowAllLogs] = useState(false);

  const loadIronData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const now = new Date();
      const [ratesRes, subRes, logsRes, monthRes, billsRes] = await Promise.all([
        servicesAPI.getDailyIronRates(),
        ironAPI.getSubscription(),
        ironAPI.getLogs().catch(() => ({ data: { logs: [] } })),
        ironAPI.getLogsByMonth(now.getMonth() + 1, now.getFullYear()).catch(() => ({ data: { totals: { pieces: 0, amount: 0 } } })),
        ironAPI.getBills().catch(() => ({ data: { bills: [] } })),
      ]);

      const catalog = ratesRes?.data?.catalog || [];
      setRates(catalog[0]?.items || []);
      setSubscription(subRes?.data?.subscription || null);
      setLogs(logsRes?.data?.logs || []);
      setMonthSummary(monthRes?.data?.totals || { pieces: 0, amount: 0 });
      setBills(billsRes?.data?.bills || []);
    } catch {
      Alert.alert('Error', 'Could not load Daily Iron details right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadIronData(); }, [loadIronData]);
  useFocusEffect(useCallback(() => { loadIronData(true); }, [loadIronData]));
  useEffect(() => {
    metadataAPI.getAll().then((response: any) => {
      const metadata = response?.metadata || response?.data?.metadata || {};
      const nextMap = (metadata.ironSubscriptionStatuses || []).reduce((acc: Record<string, { bg: string; text: string; label: string }>, item: any) => {
        acc[item.value] = { bg: item.bg, text: item.text, label: item.label };
        return acc;
      }, {});
      setStatusStyles(nextMap);
    }).catch(() => {});
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadIronData(true);
  };

  const handleApply = async () => {
    setSubmitting(true);
    try {
      await ironAPI.apply();
      await Promise.all([refreshProfile(), loadIronData(true)]);
      Alert.alert('Application Sent', 'Your Daily Iron subscription request has been submitted for review.');
    } catch (e: any) {
      Alert.alert('Could Not Apply', e?.message || 'Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePause = () => {
    Alert.alert('Pause Subscription', 'Do you want to pause your Daily Iron subscription for now?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Pause',
        style: 'destructive',
        onPress: async () => {
          setPausing(true);
          try {
            await ironAPI.pauseSubscription();
            await Promise.all([refreshProfile(), loadIronData(true)]);
            Alert.alert('Paused', 'Your subscription has been paused.');
          } catch (e: any) {
            Alert.alert('Could Not Pause', e?.message || 'Please try again.');
          } finally {
            setPausing(false);
          }
        },
      },
    ]);
  };

  const currentStatus = subscription?.applicationStatus || customer?.ironSubStatus || null;
  const statusMeta = currentStatus ? statusStyles[currentStatus] || statusStyles.PENDING_REVIEW : null;

  const monthOptions = useMemo(() => {
    const now = new Date();
    const keys = new Set<string>([
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    ]);
    logs.forEach((log) => {
      if (!log?.date) return;
      const d = new Date(log.date);
      keys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    });
    bills.forEach((bill) => {
      if (!bill?.billingPeriodStart) return;
      const d = new Date(bill.billingPeriodStart);
      keys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    });
    return Array.from(keys)
      .sort((a, b) => b.localeCompare(a))
      .map((key) => {
        const [year, month] = key.split('-').map(Number);
        return {
          key,
          label: new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
        };
      });
  }, [logs, bills]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (!log?.date) return false;
      const d = new Date(log.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return key === selectedMonthKey;
    });
  }, [logs, selectedMonthKey]);

  const displayedLogs = useMemo(
    () => showAllLogs ? filteredLogs : filteredLogs.slice(0, 8),
    [filteredLogs, showAllLogs]
  );

  const filteredBills = useMemo(() => {
    return bills.filter((bill) => {
      if (!bill?.billingPeriodStart) return false;
      const d = new Date(bill.billingPeriodStart);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return key === selectedMonthKey;
    });
  }, [bills, selectedMonthKey]);

  const selectedMonthSummary = useMemo(() => {
    const pieces = filteredLogs.reduce((sum, log) => sum + (log.pieces || 0), 0);
    const amount = filteredLogs.reduce((sum, log) => sum + (log.amount || 0), 0);
    return { pieces, amount };
  }, [filteredLogs]);

  useEffect(() => {
    setShowAllLogs(false);
  }, [selectedMonthKey]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      <LinearGradient colors={['#023c62', '#035a8f']} style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>Monthly plan</Text>
          </View>
        </View>
        <Text style={styles.headerTitle}>Daily Iron</Text>
        <Text style={styles.headerSub}>Monthly billing, garment logs, and bills without hunting through multiple screens.</Text>
      </LinearGradient>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.centerText}>Loading Daily Iron…</Text>
        </View>
      ) : (
        <PageMotion style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          contentContainerStyle={styles.scrollContent}
        >
          {statusMeta ? (
            <StaggerItem index={0}>
            <View style={styles.section}>
              <View style={styles.statusCard}>
                <View style={styles.statusRow}>
                  <View>
                    <Text style={styles.sectionTitle}>Subscription Status</Text>
                    <Text style={styles.sectionSub}>Your ironing account is linked to your mobile number.</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
                    <Text style={[styles.statusText, { color: statusMeta.text }]}>{statusMeta.label}</Text>
                  </View>
                </View>

                {currentStatus === 'PENDING_REVIEW' && (
                  <Text style={styles.helperText}>
                    Our team will review your request and activate your plan from the store side.
                  </Text>
                )}

                {(currentStatus === 'ACTIVE' || currentStatus === 'PAUSED') && (
                  <View style={styles.summaryGrid}>
                    <View style={styles.summaryCard}>
                      <Text style={styles.summaryLabel}>Selected Month</Text>
                      <Text style={styles.summaryValue}>{selectedMonthSummary.pieces}</Text>
                      <Text style={styles.summarySub}>pieces logged</Text>
                    </View>
                    <View style={styles.summaryCard}>
                      <Text style={styles.summaryLabel}>Month Value</Text>
                      <Text style={styles.summaryValue}>{fmtCurrency(selectedMonthSummary.amount)}</Text>
                      <Text style={styles.summarySub}>for {monthOptions.find((m) => m.key === selectedMonthKey)?.label || 'this month'}</Text>
                    </View>
                  </View>
                )}

                {currentStatus === 'ACTIVE' && (
                  <AnimatedButton style={styles.secondaryBtn} onPress={handlePause} disabled={pausing}>
                    {pausing ? <ActivityIndicator color={Colors.primary} size="small" /> : <Text style={styles.secondaryBtnText}>Pause Subscription</Text>}
                  </AnimatedButton>
                )}
              </View>
            </View>
            </StaggerItem>
          ) : null}

          {!currentStatus || currentStatus === 'CANCELLED' ? (
            <StaggerItem index={1}>
            <View style={styles.section}>
              <View style={styles.applyCard}>
                <Text style={styles.applyTitle}>Need ironing every day?</Text>
                <Text style={styles.applyText}>
                  Join Daily Iron to get daily garment logging and one monthly bill at the end of the month.
                </Text>
                <AnimatedButton style={styles.primaryBtn} onPress={handleApply} disabled={submitting}>
                  {submitting ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.primaryBtnText}>Apply For Daily Iron</Text>}
                </AnimatedButton>
              </View>
            </View>
            </StaggerItem>
          ) : null}

          {(currentStatus === 'ACTIVE' || currentStatus === 'PAUSED') && (
            <>
              <StaggerItem index={1}>
              <View style={styles.section}>
                <View style={styles.block}>
                  <View style={styles.blockHeader}>
                    <Text style={styles.sectionTitle}>Log History</Text>
                    <Text style={styles.sectionSub}>{filteredLogs.length} entries in {monthOptions.find((m) => m.key === selectedMonthKey)?.label || 'selected month'}</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthChipRow}>
                    {monthOptions.map((month) => {
                      const active = month.key === selectedMonthKey;
                      return (
                        <AnimatedButton
                          key={month.key}
                          onPress={() => setSelectedMonthKey(month.key)}
                          style={[styles.monthChip, active && styles.monthChipActive]}
                        >
                          <Text style={[styles.monthChipText, active && styles.monthChipTextActive]}>{month.label}</Text>
                        </AnimatedButton>
                      );
                    })}
                  </ScrollView>
                  {!displayedLogs.length ? (
                    <Text style={styles.emptyText}>No garment logs yet.</Text>
                  ) : (
                    displayedLogs.map((log) => (
                      <View key={log.id} style={styles.listRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle}>{log.serviceName}</Text>
                          <Text style={styles.rowMeta}>{fmtDate(log.date)} · {log.pieces} pieces</Text>
                        </View>
                        <Text style={styles.rowAmount}>{fmtCurrency(log.amount)}</Text>
                      </View>
                    ))
                  )}
                  {filteredLogs.length > 8 && (
                    <AnimatedButton style={styles.expandBtn} onPress={() => setShowAllLogs((prev) => !prev)}>
                      <Text style={styles.expandBtnText}>{showAllLogs ? 'Show less' : `Show all ${filteredLogs.length} logs`}</Text>
                    </AnimatedButton>
                  )}
                </View>
              </View>
              </StaggerItem>

              <StaggerItem index={2}>
              <View style={styles.section}>
                <View style={styles.block}>
                  <View style={styles.blockHeader}>
                    <Text style={styles.sectionTitle}>Monthly Bills</Text>
                    <Text style={styles.sectionSub}>Statements for {monthOptions.find((m) => m.key === selectedMonthKey)?.label || 'selected month'}</Text>
                  </View>
                  {!filteredBills.length ? (
                    <Text style={styles.emptyText}>No bills generated yet.</Text>
                  ) : (
                    filteredBills.map((bill) => {
                      const billStyle = BILL_STATUS[bill.status] || BILL_STATUS.DRAFT;
                      return (
                        <View key={bill.id} style={styles.billRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rowTitle}>{bill.billNumber}</Text>
                            <Text style={styles.rowMeta}>
                              {fmtDate(bill.billingPeriodStart)} to {fmtDate(bill.billingPeriodEnd)}
                            </Text>
                          </View>
                          <View style={styles.billRight}>
                            <Text style={styles.rowAmount}>{fmtCurrency(bill.totalAmount)}</Text>
                            <View style={[styles.inlineBadge, { backgroundColor: billStyle.bg }]}>
                              <Text style={[styles.inlineBadgeText, { color: billStyle.text }]}>{bill.status}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </View>
              </StaggerItem>
            </>
          )}

          <StaggerItem index={3}>
          <View style={styles.section}>
            <View style={styles.block}>
              <View style={styles.blockHeader}>
                <Text style={styles.sectionTitle}>Current Rate Card</Text>
                <Text style={styles.sectionSub}>Fetched from the live service catalog</Text>
              </View>
              {!rates.length ? (
                <Text style={styles.emptyText}>Rates will appear here once the store updates them.</Text>
              ) : (
                rates.map((rate: any) => (
                  <View key={rate.id || rate.name} style={styles.listRow}>
                    <Text style={styles.rowTitle}>{rate.name}</Text>
                    <Text style={styles.rowAmount}>{rate.price > 0 ? fmtCurrency(rate.price) : 'TBD'}</Text>
                  </View>
                ))
              )}
            </View>
          </View>
          </StaggerItem>
        </ScrollView>
        </PageMotion>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.offWhite },
  header: { paddingTop: 44, paddingBottom: 16, paddingHorizontal: Spacing.lg },
  headerTop: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:10 },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems:'center', justifyContent:'center', backgroundColor:'rgba(255,255,255,0.14)' },
  backText: { fontFamily: 'DMSans_500Medium', fontSize: 22, color: Colors.white },
  headerBadge:{ backgroundColor:'rgba(255,255,255,0.14)', borderWidth:1, borderColor:'rgba(255,255,255,0.14)', borderRadius:Radius.full, paddingHorizontal:12, paddingVertical:7 },
  headerBadgeText:{ fontFamily: Fonts.medium, fontSize: FontSize.xs, color: Colors.white },
  headerTitle: { fontFamily: 'Syne_700Bold', fontSize: 26, color: Colors.white, marginBottom: 4 },
  headerSub: { fontFamily: 'DMSans_400Regular', fontSize: FontSize.xs, color: Colors.primaryLight, lineHeight: 18, maxWidth:'88%' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerText: { marginTop: 12, color: Colors.textMuted, fontFamily: 'DMSans_400Regular' },
  scrollContent: { paddingBottom: 40 },
  section: { paddingHorizontal: Spacing.lg, marginTop: Spacing.lg },
  statusCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 18, ...Shadow.sm },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 7 },
  statusText: { fontFamily: 'DMSans_700Bold', fontSize: FontSize.xs },
  sectionTitle: { fontFamily: 'Syne_700Bold', fontSize: FontSize.base, color: Colors.textDark },
  sectionSub: { fontFamily: 'DMSans_400Regular', fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },
  helperText: { marginTop: 14, fontFamily: 'DMSans_400Regular', fontSize: FontSize.sm, color: Colors.textMid, lineHeight: 20 },
  summaryGrid: { flexDirection: 'row', gap: 10, marginTop: 18 },
  summaryCard: { flex: 1, backgroundColor: Colors.accent, borderRadius: Radius.md, padding: 14 },
  summaryLabel: { fontFamily: 'DMSans_500Medium', fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase' },
  summaryValue: { fontFamily: 'Syne_700Bold', fontSize: FontSize.lg, color: Colors.primary, marginTop: 4 },
  summarySub: { fontFamily: 'DMSans_400Regular', fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  primaryBtn: { marginTop: 18, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { fontFamily: 'Syne_700Bold', fontSize: FontSize.base, color: Colors.white },
  secondaryBtn: { marginTop: 18, borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center' },
  secondaryBtnText: { fontFamily: 'DMSans_700Bold', fontSize: FontSize.base, color: Colors.primary },
  applyCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 20, ...Shadow.sm },
  applyTitle: { fontFamily: 'Syne_700Bold', fontSize: FontSize.lg, color: Colors.textDark, marginBottom: 8 },
  applyText: { fontFamily: 'DMSans_400Regular', fontSize: FontSize.sm, color: Colors.textMid, lineHeight: 21 },
  block: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  blockHeader: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 8 },
  monthChipRow: { paddingHorizontal: 18, paddingBottom: 10, gap: 8 },
  monthChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.offWhite, borderWidth: 1, borderColor: Colors.border },
  monthChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  monthChipText: { fontFamily: 'DMSans_500Medium', fontSize: FontSize.xs, color: Colors.textMid },
  monthChipTextActive: { color: Colors.white },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  billRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  rowTitle: { fontFamily: 'DMSans_500Medium', fontSize: FontSize.base, color: Colors.textDark },
  rowMeta: { fontFamily: 'DMSans_400Regular', fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  rowAmount: { fontFamily: 'Syne_700Bold', fontSize: FontSize.base, color: Colors.primary },
  emptyText: { paddingHorizontal: 18, paddingBottom: 18, paddingTop: 10, fontFamily: 'DMSans_400Regular', fontSize: FontSize.sm, color: Colors.textMuted },
  expandBtn: { marginHorizontal: 18, marginTop: 6, marginBottom: 18, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.offWhite },
  expandBtnText: { fontFamily: 'DMSans_500Medium', fontSize: FontSize.sm, color: Colors.primary },
  billRight: { alignItems: 'flex-end' },
  inlineBadge: { marginTop: 6, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  inlineBadgeText: { fontFamily: 'DMSans_700Bold', fontSize: 10 },
});
