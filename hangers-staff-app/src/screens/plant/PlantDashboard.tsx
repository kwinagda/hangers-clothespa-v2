import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Platform, ActivityIndicator,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { metadataAPI, plantAPI } from '../../services/api';
import { Colors, Spacing } from '../../utils/theme';
const STAGE_COLORS: Record<string, string> = {
  PROCESSING: '#7c3aed',
  WASHING: '#0891b2',
  DRYING: '#f59e0b',
  IRONING: '#d97706',
  QC: '#059669',
  READY_FOR_DELIVERY: '#16a34a',
};

export default function PlantDashboard({ navigation }: any) {
  const { staff, logout } = useAuth();
  const [dash,      setDash]      = useState<any>(null);
  const [stageCards, setStageCards] = useState<Array<{ key: string; dashKey: string; label: string; icon: string; color: string }>>([]);
  const [defaultPlantStage, setDefaultPlantStage] = useState('PROCESSING');
  const [readyStageKey, setReadyStageKey] = useState('READY_FOR_DELIVERY');
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);

  const load = useCallback(async () => {
    try {
      const r: any = await plantAPI.dashboard();
      setDash(r.data?.dashboard);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    metadataAPI.getAll().then((response: any) => {
      const metadata = response?.metadata || response?.data?.metadata || {};
      const nextCards = (metadata.orderStatuses || [])
        .filter((item: any) => item.plantQueue)
        .map((item: any) => ({
          key: item.key,
          dashKey: item.plantDashKey || item.key.toLowerCase(),
          label: item.plantLabel || item.label || item.key,
          icon: item.icon || 'package-variant-closed',
          color: STAGE_COLORS[item.key] || Colors.plant,
        }));
      setStageCards(nextCards);
      setDefaultPlantStage(nextCards[0]?.key || 'PROCESSING');
      setReadyStageKey(nextCards.find((item: any) => item.dashKey === 'ready')?.key || 'READY_FOR_DELIVERY');
    }).catch(() => {});
  }, []);

  if (loading) return (
    <View style={{ flex:1, backgroundColor: Colors.primary, justifyContent:'center', alignItems:'center' }}>
      <ActivityIndicator size="large" color="#fff" />
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good {getTimeGreeting()}, {staff?.name?.split(' ')[0]}</Text>
          <Text style={styles.role}>{staff?.role?.replace('_',' ')} · Plant</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primaryLight} />}
      >
        {/* Scan CTA */}
        <TouchableOpacity style={styles.scanBtn} onPress={() => navigation.navigate('PlantScan')}>
          <Feather name="camera" size={32} color="#fff" style={styles.scanIcon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.scanTitle}>Scan Garment Tag</Text>
            <Text style={styles.scanSub}>Point camera at QR code to pull up order</Text>
          </View>
          <Text style={{ color: '#fff', fontSize: 20 }}>→</Text>
        </TouchableOpacity>

        <View style={styles.primaryActions}>
          <TouchableOpacity style={styles.primaryActionCard} onPress={() => navigation.navigate('PlantOrders', { filterStatus: defaultPlantStage })}>
            <Text style={styles.primaryActionEyebrow}>Focus Queue</Text>
            <Text style={styles.primaryActionTitle}>Open At-Plant Orders</Text>
            <Text style={styles.primaryActionMeta}>{dash?.processing ?? 0} active garments waiting for progress</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.primaryActionCard, styles.primaryActionSecondary]} onPress={() => navigation.navigate('PlantOrders', { filterStatus: readyStageKey })}>
            <Text style={styles.primaryActionEyebrow}>Dispatch</Text>
            <Text style={styles.primaryActionTitle}>Ready Queue</Text>
            <Text style={styles.primaryActionMeta}>{dash?.ready ?? 0} orders ready to hand back</Text>
          </TouchableOpacity>
        </View>

        {/* Summary */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { borderColor: Colors.plant }]}>
            <Text style={[styles.summaryNum, { color: Colors.plant }]}>{dash?.atPlant ?? '—'}</Text>
            <Text style={styles.summaryLbl}>At Plant</Text>
          </View>
          <View style={[styles.summaryCard, { borderColor: Colors.warning }]}>
            <Text style={[styles.summaryNum, { color: Colors.warning }]}>{dash?.pending ?? '—'}</Text>
            <Text style={styles.summaryLbl}>Pending</Text>
          </View>
          <View style={[styles.summaryCard, { borderColor: Colors.success }]}>
            <Text style={[styles.summaryNum, { color: Colors.success }]}>{dash?.ready ?? '—'}</Text>
            <Text style={styles.summaryLbl}>Ready</Text>
          </View>
          <View style={[styles.summaryCard, { borderColor: '#9dafc8' }]}>
            <Text style={[styles.summaryNum, { color: Colors.primary }]}>{dash?.todayDone ?? '—'}</Text>
            <Text style={styles.summaryLbl}>Done Today</Text>
          </View>
        </View>

        {/* Stage cards — tap to filter orders */}
        <Text style={styles.sectionTitle}>Orders by Stage</Text>
        <View style={styles.stageGrid}>
          {stageCards.map(s => (
            <TouchableOpacity
              key={s.key}
              style={[styles.stageCard, { borderColor: s.color + '40' }]}
              onPress={() => navigation.navigate('PlantOrders', { filterStatus: s.key })}
            >
              <MaterialCommunityIcons name={s.icon as any} size={26} color={s.color} />
              <Text style={[styles.stageNum, { color: s.color }]}>{dash?.[s.dashKey] ?? 0}</Text>
              <Text style={styles.stageLbl}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Quick actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {[
            { label: 'All Orders',   icon: 'clipboard-text-outline', screen: 'PlantOrders', params: {} },
            { label: 'Ready Queue',  icon: 'check-decagram-outline', screen: 'PlantOrders', params: { filterStatus: readyStageKey } },
          ].map(a => (
            <TouchableOpacity key={a.label} style={styles.actionCard}
              onPress={() => navigation.navigate(a.screen, a.params)}>
              <MaterialCommunityIcons name={a.icon as any} size={28} color={Colors.primary} />
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.offWhite },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.primary, paddingTop: Platform.OS === 'ios' ? 52 : 22, paddingHorizontal: Spacing.lg, paddingBottom: 20 },
  greeting:    { color: '#fff', fontSize: 17, fontWeight: '700' },
  role:        { color: Colors.primaryLight, fontSize: 12, marginTop: 2 },
  logoutBtn:   { backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  logoutText:  { color: '#fff', fontSize: 13 },
  scanBtn:     { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.plant, borderRadius: 18, padding: 20, marginBottom: 20, gap: 14 },
  scanIcon:    {},
  scanTitle:   { color: '#fff', fontWeight: '800', fontSize: 16 },
  scanSub:     { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  primaryActions: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  primaryActionCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border, shadowColor: 'rgba(2,60,98,0.1)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  primaryActionSecondary: { backgroundColor: Colors.plantLight, borderColor: '#dcc7ff' },
  primaryActionEyebrow: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  primaryActionTitle: { fontSize: 15, fontWeight: '800', color: Colors.textDark, marginBottom: 4 },
  primaryActionMeta: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
  summaryRow:  { flexDirection: 'row', gap: 10, marginBottom: 24 },
  summaryCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1.5 },
  summaryNum:  { fontSize: 24, fontWeight: '800' },
  summaryLbl:  { fontSize: 10, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },
  sectionTitle:{ fontSize: 14, fontWeight: '700', color: Colors.primary, marginBottom: 12 },
  stageGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  stageCard:   { width: '30.5%', backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1.5 },
  stageNum:    { fontSize: 22, fontWeight: '800', marginTop: 6 },
  stageLbl:    { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  actionsGrid: { flexDirection: 'row', gap: 12 },
  actionCard:  { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: Colors.border },
  actionLabel: { fontSize: 13, fontWeight: '600', color: Colors.textDark, textAlign: 'center' },
});
