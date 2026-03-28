import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Platform, TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Colors, Spacing } from '../../utils/theme';
import { plantAPI } from '../../services/api';

const STATUS_FILTERS = [
  { key: '',                   label: 'All'     },
  { key: 'PROCESSING',         label: 'At Plant' },
  { key: 'WASHING',            label: 'Cleaning' },
  { key: 'DRYING',             label: 'Drying'   },
  { key: 'IRONING',            label: 'Ironing'  },
  { key: 'QC',                 label: 'QC'       },
  { key: 'READY_FOR_DELIVERY', label: 'Ready'    },
];

const STATUS_COLOR: Record<string, string> = {
  PROCESSING: '#7c3aed', WASHING: '#0891b2', DRYING: '#f59e0b',
  IRONING: '#d97706', QC: '#059669', READY_FOR_DELIVERY: '#16a34a',
  PICKED_UP: '#0284c7', PENDING: '#6b7fa3',
};

const STATUS_LABEL: Record<string, string> = {
  PROCESSING: 'At Plant', WASHING: 'Cleaning', DRYING: 'Drying',
  IRONING: 'Ironing', QC: 'Quality Check', READY_FOR_DELIVERY: 'Ready',
  PICKED_UP: 'Picked Up', PENDING: 'Pending',
};

export default function PlantOrdersList({ route, navigation }: any) {
  const initialFilter = route.params?.filterStatus || '';
  const [orders,     setOrders]     = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState(initialFilter);
  const [search,     setSearch]     = useState('');

  const load = useCallback(async (status = filter) => {
    try {
      const r: any = await plantAPI.orders({ status: status || undefined, limit: 100 });
      setOrders(r.data?.orders || []);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => { load(filter); }, [filter]);

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
        <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Order #, name, phone..."
          placeholderTextColor="#9dafc8"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={{ color: Colors.textMuted, fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map(f => (
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
            <Text style={{ fontSize: 40 }}>📭</Text>
            <Text style={styles.emptyText}>No orders found</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('PlantOrderDetail', { orderId: item.id })}
          >
            <View style={styles.cardTop}>
              <Text style={styles.orderNum}>{item.orderNumber}</Text>
              <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLOR[item.status] || '#6b7fa3') + '20' }]}>
                <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] || '#6b7fa3' }]}>
                  {STATUS_LABEL[item.status] || item.status}
                </Text>
              </View>
            </View>
            <Text style={styles.custName}>{item.customer?.name || 'Unknown'}</Text>
            <View style={styles.cardBottom}>
              <Text style={styles.itemCount}>{item.totalItems} garment{item.totalItems !== 1 ? 's' : ''}</Text>
              {item.notes ? <Text style={styles.hasNotes}>📝 Notes</Text> : null}
              <Text style={styles.timestamp}>
                {new Date(item.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.offWhite },
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
