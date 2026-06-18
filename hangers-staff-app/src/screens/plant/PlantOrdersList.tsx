import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Platform, TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors, Spacing } from '../../utils/theme';
import { metadataAPI, plantAPI } from '../../services/api';

export default function PlantOrdersList({ route, navigation }: any) {
  const initialFilter = route.params?.filterStatus || '';
  const [statusFilters, setStatusFilters] = useState<Array<{ key: string; label: string }>>([{ key: '', label: 'All' }]);
  const [statusLabels, setStatusLabels] = useState<Record<string, string>>({});
  const [statusStyles, setStatusStyles] = useState<Record<string, { bg: string; text: string }>>({});
  const [orders,     setOrders]     = useState<any[]>([]);
  const [loadError,  setLoadError]  = useState('');
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState(initialFilter);
  const [search,     setSearch]     = useState('');

  const load = useCallback(async (status = filter) => {
    try {
      const r: any = await plantAPI.orders({ status: status || undefined, limit: 100 });
      setOrders(r.data?.orders || []);
      setLoadError('');
    } catch (e: any) {
      setOrders([]);
      setLoadError(e?.message || 'Could not load plant orders.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => { load(filter); }, [filter]);
  useEffect(() => {
    metadataAPI.getAll()
      .then((r: any) => {
        const metadata = r?.metadata || r?.data?.metadata || {};
        const filters = (metadata.orderStatuses || [])
          .filter((item: any) => item.plantQueue)
          .map((item: any) => ({ key: item.key, label: item.plantLabel || item.label }));
        setStatusFilters([{ key: '', label: 'All' }, ...filters]);
        setStatusLabels(Object.fromEntries((metadata.orderStatuses || []).map((item: any) => [item.key, item.plantLabel || item.label])));
        setStatusStyles(Object.fromEntries((metadata.orderStatuses || []).map((item: any) => [item.key, {
          bg: item.bg || '#eef4f8',
          text: item.color || '#6b7fa3',
        }])));
      })
      .catch(() => {
        setStatusFilters([{ key: '', label: 'All' }]);
      });
  }, []);

  const handleFilterChange = (key: string) => {
    setFilter(key);
    setLoading(true);
  };

  const filtered = search
    ? orders.filter(o =>
        o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        o.customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
        o.customer?.phone?.includes(search)
      )
    : orders;

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: Colors.plant, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#fff" />
    </View>
  );

  if (loadError && !orders.length) {
    return (
      <View style={styles.errorWrap}>
        <Feather name="alert-circle" size={38} color={Colors.error} />
        <Text style={styles.errorTitle}>Orders unavailable</Text>
        <Text style={styles.errorBody}>{loadError}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); load(filter); }}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Orders</Text>
        <Text style={styles.countBadge}>{filtered.length}</Text>
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Feather name="search" size={16} color={Colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Order #, name, phone..."
          placeholderTextColor="#9dafc8"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Feather name="x" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {statusFilters.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => handleFilterChange(f.key)}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 48 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.plant} />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Feather name="inbox" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No orders found</Text>
          </View>
        }
        renderItem={({ item }) => {
          const statusStyle = statusStyles[item.status] || { bg: '#eef4f8', text: '#6b7fa3' }
          return (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('PlantOrderDetail', { orderId: item.id })}
          >
            <View style={styles.cardTop}>
              <Text style={styles.orderNum}>{item.orderNumber}</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                <Text style={[styles.statusText, { color: statusStyle.text }]}>
                  {statusLabels[item.status] || item.status}
                </Text>
              </View>
            </View>
            <Text style={styles.custName}>{item.customer?.name || 'Unknown'}</Text>
            <View style={styles.cardBottom}>
              <Text style={styles.itemCount}>{item.totalItems} garment{item.totalItems !== 1 ? 's' : ''}</Text>
              {item.notes ? <Text style={styles.hasNotes}>Notes</Text> : null}
              <Text style={styles.timestamp}>
                {new Date(item.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </TouchableOpacity>
          )
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.offWhite },
  errorWrap:    { flex:1, alignItems:'center', justifyContent:'center', padding:24, backgroundColor:Colors.offWhite },
  errorTitle:   { fontSize:18, fontWeight:'800', color:Colors.textDark, marginTop:12, marginBottom:6 },
  errorBody:    { fontSize:14, color:Colors.textMuted, textAlign:'center', marginBottom:16 },
  retryBtn:     { backgroundColor:Colors.plant, borderRadius:12, paddingHorizontal:18, paddingVertical:12 },
  retryBtnText: { color:'#fff', fontSize:14, fontWeight:'700' },
  header:       { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.plant, paddingTop: Platform.OS === 'ios' ? 52 : 22, paddingHorizontal: Spacing.lg, paddingBottom: 16 },
  backBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  backText:     { color: '#fff', fontSize: 22 },
  title:        { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700' },
  countBadge:   { backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  searchBar:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 16, marginBottom: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border },
  searchInput:  { flex: 1, fontSize: 15, color: Colors.textDark },
  filterRow:    { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 8, flexWrap: 'nowrap' },
  chip:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: Colors.border },
  chipActive:   { backgroundColor: Colors.plant, borderColor: Colors.plant },
  chipText:     { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  chipTextActive:{ color: '#fff' },
  card:         { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  cardTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  orderNum:     { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontWeight: '700', fontSize: 14, color: Colors.primary },
  statusBadge:  { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText:   { fontSize: 11, fontWeight: '700' },
  custName:     { fontSize: 15, fontWeight: '600', color: Colors.textDark, marginBottom: 8 },
  cardBottom:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemCount:    { fontSize: 12, color: Colors.textMuted, flex: 1 },
  hasNotes:     { fontSize: 11, color: Colors.warning, backgroundColor: Colors.warningBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  timestamp:    { fontSize: 11, color: Colors.textMuted },
  emptyBox:     { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText:    { fontSize: 16, color: Colors.textMuted, fontWeight: '600' },
});
