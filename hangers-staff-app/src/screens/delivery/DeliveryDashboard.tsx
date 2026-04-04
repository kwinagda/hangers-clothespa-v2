import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, RefreshControl, ActivityIndicator, Linking,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { deliveryAPI, metadataAPI } from '../../services/api';
import { Colors, Spacing } from '../../utils/theme';

export default function DeliveryDashboard({ navigation }: any) {
  const { staff, logout } = useAuth();
  const [dash,       setDash]       = useState<any>(null);
  const [orders,     setOrders]     = useState<any[]>([]);
  const [statusMeta, setStatusMeta] = useState<Record<string, { label: string }>>({});
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [dashR, ordersR]: [any, any] = await Promise.all([
        deliveryAPI.dashboard(),
        deliveryAPI.orders('active'),
      ]);
      setDash(dashR.data?.dashboard);
      setOrders(ordersR.data?.orders || []);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    metadataAPI.getAll().then((response: any) => {
      const metadata = response?.metadata || response?.data?.metadata || {};
      const labels = (metadata.orderStatuses || []).reduce((acc: Record<string, { label: string }>, item: any) => {
        acc[item.key] = { label: item.plantLabel || item.label || item.key };
        return acc;
      }, {});
      setStatusMeta(labels);
    }).catch(() => {});
  }, []);

  if (loading) return (
    <View style={{ flex:1, backgroundColor: Colors.delivery, justifyContent:'center', alignItems:'center' }}>
      <ActivityIndicator size="large" color="#fff" />
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hi, {staff?.name?.split(' ')[0]}</Text>
          <Text style={styles.role}>{staff?.role?.replace('_',' ')} · Delivery</Text>
        </View>
        <View style={{ flexDirection:'row', gap:8 }}>
          <TouchableOpacity style={styles.summaryBtn} onPress={() => navigation.navigate('DeliverySummary')}>
            <Feather name="bar-chart-2" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.summaryBtn} onPress={logout}>
            <Text style={{ color:'#fff', fontSize:13 }}>Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primaryLight} />}
      >
        <View style={styles.routeBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.routeEyebrow}>Today&apos;s Route</Text>
            <Text style={styles.routeTitle}>{orders.length ? `${orders.length} active stop${orders.length !== 1 ? 's' : ''}` : 'No active stops'}</Text>
            <Text style={styles.routeMeta}>{dash?.pendingPickups ?? 0} pickups pending · {dash?.outForDelivery ?? 0} out for delivery</Text>
          </View>
          <TouchableOpacity style={styles.routeAction} onPress={() => navigation.navigate('DeliverySummary')}>
            <Feather name="bar-chart-2" size={16} color="#fff" />
            <Text style={styles.routeActionText}>Summary</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { label:'Pickups', value: dash?.pendingPickups ?? 0, icon:'package-variant-closed', color: Colors.warning },
            { label:'Out',     value: dash?.outForDelivery ?? 0, icon:'motorbike', color: Colors.delivery },
            { label:'Done',    value: dash?.deliveredToday ?? 0, icon:'check-decagram-outline', color: Colors.success },
            { label:'Cash',    value: `₹${((dash?.cashCollectedToday||0)/1000).toFixed(1)}k`, icon:'cash-multiple', color: Colors.success, small: true },
          ].map(s => (
            <View key={s.label} style={[styles.statCard, { borderColor: s.color + '40' }]}>
              <MaterialCommunityIcons name={s.icon as any} size={20} color={s.color} />
              <Text style={[styles.statNum, { color: s.color, fontSize: s.small ? 18 : 22 }]}>{s.value}</Text>
              <Text style={styles.statLbl}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Active orders */}
        <Text style={styles.sectionTitle}>My Active Orders ({orders.length})</Text>
        {orders.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="check-circle-outline" size={42} color={Colors.success} style={{ marginBottom: 10 }} />
            <Text style={styles.emptyTitle}>All clear!</Text>
            <Text style={styles.emptySub}>No active orders right now.</Text>
          </View>
        ) : (
          orders.map(order => (
            <TouchableOpacity key={order.id} style={styles.orderCard}
              onPress={() => navigation.navigate('DeliveryOrderDetail', { orderId: order.id })}>
              <View style={styles.orderTop}>
                <Text style={styles.orderNum}>{order.orderNumber}</Text>
                <StatusPill status={order.status} statusMeta={statusMeta} />
              </View>
              <Text style={styles.orderCust}>{order.customer?.name}</Text>
              {order.pickupAddress ? (
                <Text style={styles.orderAddr} numberOfLines={1}>Address: {order.pickupAddress}</Text>
              ) : null}
              <View style={styles.orderBottom}>
                <Text style={styles.orderItems}>{order.itemCount} garment{order.itemCount !== 1 ? 's' : ''}</Text>
                <Text style={[styles.balanceDue, { color: order.balanceDue > 0 ? Colors.error : Colors.success }]}>
                  {order.balanceDue > 0 ? `₹${order.balanceDue.toLocaleString('en-IN')} due` : 'Paid'}
                </Text>
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${order.customer?.phone}`)}>
                  <View style={styles.callBtn}>
                    <Feather name="phone-call" size={13} color={Colors.delivery} />
                    <Text style={styles.callBtnText}>Call</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function StatusPill({ status, statusMeta }: { status: string; statusMeta: Record<string, { label: string }> }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    PENDING:           { label: statusMeta.PENDING?.label || 'Pickup', color: Colors.warning, bg: Colors.warningBg },
    OUT_FOR_DELIVERY:  { label: statusMeta.OUT_FOR_DELIVERY?.label || 'Out', color: Colors.delivery, bg: Colors.deliveryLight },
    READY_FOR_DELIVERY:{ label: statusMeta.READY_FOR_DELIVERY?.label || 'Ready', color: Colors.success, bg: Colors.successBg },
    DELIVERED:         { label: statusMeta.DELIVERED?.label || 'Done', color: Colors.success, bg: Colors.successBg },
  };
  const s = map[status] || { label: status, color: Colors.textMuted, bg: Colors.offWhite };
  return (
    <View style={{ backgroundColor: s.bg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color: s.color, fontWeight: '700', fontSize: 11 }}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.offWhite },
  header:      { flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor: Colors.delivery, paddingTop: Platform.OS === 'ios' ? 52 : 22, paddingHorizontal: Spacing.lg, paddingBottom: 18 },
  greeting:    { color:'#fff', fontSize:17, fontWeight:'700' },
  role:        { color:'rgba(255,255,255,0.65)', fontSize:12, marginTop:2 },
  summaryBtn:  { backgroundColor:'rgba(255,255,255,0.15)', width:38, height:38, borderRadius:19, alignItems:'center', justifyContent:'center' },
  routeBanner: { backgroundColor: '#fff', borderRadius: 18, padding: 18, marginBottom: 20, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', gap: 14 },
  routeEyebrow:{ fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  routeTitle:  { fontSize: 18, fontWeight: '800', color: Colors.textDark, marginBottom: 4 },
  routeMeta:   { fontSize: 12, color: Colors.textMuted },
  routeAction: { backgroundColor: Colors.delivery, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', gap: 4 },
  routeActionText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  statsRow:    { flexDirection:'row', gap:10, marginBottom:24 },
  statCard:    { flex:1, backgroundColor:'#fff', borderRadius:14, padding:12, alignItems:'center', borderWidth:1.5, gap:2 },
  statNum:     { fontWeight:'800' },
  statLbl:     { fontSize:10, color:Colors.textMuted },
  sectionTitle:{ fontSize:14, fontWeight:'700', color:Colors.primary, marginBottom:12 },
  emptyCard:   { backgroundColor:'#fff', borderRadius:16, padding:32, alignItems:'center', borderWidth:1, borderColor:Colors.border },
  emptyTitle:  { fontSize:18, fontWeight:'700', color:Colors.textDark, marginBottom:4 },
  emptySub:    { fontSize:14, color:Colors.textMuted },
  orderCard:   { backgroundColor:'#fff', borderRadius:16, padding:16, marginBottom:12, borderWidth:1, borderColor:Colors.border },
  orderTop:    { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:6 },
  orderNum:    { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontWeight:'700', fontSize:14, color:Colors.primary },
  orderCust:   { fontSize:16, fontWeight:'700', color:Colors.textDark, marginBottom:4 },
  orderAddr:   { fontSize:12, color:Colors.textMuted, marginBottom:8 },
  orderBottom: { flexDirection:'row', alignItems:'center', gap:12 },
  orderItems:  { fontSize:12, color:Colors.textMuted, flex:1 },
  balanceDue:  { fontSize:13, fontWeight:'700' },
  callBtn:     { flexDirection:'row', alignItems:'center', gap:6, backgroundColor:Colors.deliveryLight, paddingHorizontal:10, paddingVertical:5, borderRadius:20 },
  callBtnText: { fontSize:13, color:Colors.delivery, fontWeight:'600' },
});
