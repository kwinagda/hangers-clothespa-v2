import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Platform, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { plantAPI } from '../../services/api';
import { Colors, Spacing } from '../../utils/theme';

const STAGE_CARDS = [
  { key: 'processing', label: 'At Plant',   icon: '🏭', color: '#7c3aed' },
  { key: 'washing',    label: 'Cleaning',   icon: '🫧', color: '#0891b2' },
  { key: 'drying',     label: 'Drying',     icon: '☀️', color: '#f59e0b' },
  { key: 'ironing',    label: 'Ironing',    icon: '♨️', color: '#d97706' },
  { key: 'qc',         label: 'QC',         icon: '🔍', color: '#059669' },
  { key: 'ready',      label: 'Ready',      icon: '📦', color: '#16a34a' },
];

export default function PlantDashboard({ navigation }: any) {
  const { staff, logout } = useAuth();
  const [dash,      setDash]      = useState<any>(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);

  const load = useCallback(async () => {
    try {
      const r: any = await plantAPI.dashboard();
      setDash(r.data?.dashboard);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

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
          <Text style={styles.greeting}>Good {getTimeGreeting()}, {staff?.name?.split(' ')[0]} 👋</Text>
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
          <Text style={styles.scanIcon}>📷</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.scanTitle}>Scan Garment Tag</Text>
            <Text style={styles.scanSub}>Point camera at QR code to pull up order</Text>
          </View>
          <Text style={{ color: '#fff', fontSize: 20 }}>→</Text>
        </TouchableOpacity>

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
          {STAGE_CARDS.map(s => (
            <TouchableOpacity
              key={s.key}
              style={[styles.stageCard, { borderColor: s.color + '40' }]}
              onPress={() => navigation.navigate('PlantOrders', { filterStatus: s.key.toUpperCase() })}
            >
              <Text style={{ fontSize: 26 }}>{s.icon}</Text>
              <Text style={[styles.stageNum, { color: s.color }]}>{dash?.[s.key] ?? 0}</Text>
              <Text style={styles.stageLbl}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Quick actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {[
            { label: 'All Orders',   icon: '📋', screen: 'PlantOrders', params: {} },
            { label: 'Ready Queue',  icon: '✅', screen: 'PlantOrders', params: { filterStatus: 'READY_FOR_DELIVERY' } },
          ].map(a => (
            <TouchableOpacity key={a.label} style={styles.actionCard}
              onPress={() => navigation.navigate(a.screen, a.params)}>
              <Text style={{ fontSize: 28 }}>{a.icon}</Text>
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
  scanIcon:    { fontSize: 32 },
  scanTitle:   { color: '#fff', fontWeight: '800', fontSize: 16 },
  scanSub:     { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
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
