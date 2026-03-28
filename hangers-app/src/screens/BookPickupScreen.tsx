import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { servicesAPI, addressAPI, ordersAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';

// ── Types ──────────────────────────────────────────────────
interface ServiceItem {
  id: string;
  name: string;
  basePrice: number;
  category: string;
  catalogName: string;
}

interface CatalogGroup {
  key: string;
  label: string;
  items: ServiceItem[];
}

interface SelectedItem {
  serviceId: string;
  name: string;
  price: number;
  quantity: number;
}

interface SavedAddress {
  id: string;
  label: string;
  addressLine: string;
  city: string;
}

// ── Component ──────────────────────────────────────────────
export default function BookPickupScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  // Catalog
  const [catalog, setCatalog] = useState<CatalogGroup[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('');

  // Selections
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);

  // Address
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [manualAddress, setManualAddress] = useState('');
  const [useManualAddress, setUseManualAddress] = useState(false);

  // Schedule
  const [pickupDate, setPickupDate] = useState('');
  const [pickupTime, setPickupTime] = useState('morning');
  const [notes, setNotes] = useState('');

  // Submission
  const [submitting, setSubmitting] = useState(false);

  // ── Load catalog from API — no fallback ─────────────────
  useEffect(() => {
    setCatalogLoading(true);
    setCatalogError(null);

    servicesAPI.getPriceList()
      .then((response: any) => {
        const data: ServiceItem[] = response?.data?.catalog ?? response?.data ?? [];

        if (!data || data.length === 0) {
          setCatalogError('Price list is empty. Please contact the shop.');
          return;
        }

        // Group by catalogName — category
        const groupMap: Record<string, CatalogGroup> = {};
        data.forEach((item: ServiceItem) => {
          if (!item.basePrice || item.basePrice <= 0) return; // skip ₹0 TBD items
          const key = `${item.catalogName}__${item.category}`;
          if (!groupMap[key]) {
            groupMap[key] = {
              key,
              label: `${item.catalogName} — ${item.category}`,
              items: [],
            };
          }
          groupMap[key].items.push(item);
        });

        const groups = Object.values(groupMap).filter(g => g.items.length > 0);
        setCatalog(groups);
        if (groups.length > 0) setActiveTab(groups[0].key);
      })
      .catch((err: Error) => {
        console.error('BookPickupScreen: failed to load catalog', err);
        setCatalogError('Could not load services. Please check your connection and try again.');
      })
      .finally(() => setCatalogLoading(false));
  }, []);

  // ── Load saved addresses ──────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    addressAPI.list()
      .then((res: any) => {
        const addrs: SavedAddress[] = res?.data?.addresses ?? [];
        setSavedAddresses(addrs);
        if (addrs.length > 0) setSelectedAddressId(addrs[0].id);
      })
      .catch(() => {
        // Addresses are optional — silently skip if unavailable
      });
  }, [user?.id]);

  // ── Item selection helpers ────────────────────────────────
  function toggleItem(item: ServiceItem) {
    setSelectedItems(prev => {
      const existing = prev.find(i => i.serviceId === item.id);
      if (existing) {
        return prev.filter(i => i.serviceId !== item.id);
      }
      return [...prev, { serviceId: item.id, name: item.name, price: item.basePrice, quantity: 1 }];
    });
  }

  function updateQty(serviceId: string, delta: number) {
    setSelectedItems(prev =>
      prev
        .map(i => i.serviceId === serviceId ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i)
    );
  }

  const isSelected = (id: string) => selectedItems.some(i => i.serviceId === id);
  const getQty = (id: string) => selectedItems.find(i => i.serviceId === id)?.quantity ?? 0;

  // ── Totals ────────────────────────────────────────────────
  const estimatedTotal = selectedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const totalPieces = selectedItems.reduce((sum, i) => sum + i.quantity, 0);

  // ── Active tab items ──────────────────────────────────────
  const activeItems = catalog.find(g => g.key === activeTab)?.items ?? [];

  // ── Submit pickup booking ─────────────────────────────────
  async function handleBookPickup() {
    if (selectedItems.length === 0) {
      Alert.alert('Add items', 'Please select at least one garment.');
      return;
    }

    const resolvedAddress = useManualAddress
      ? manualAddress.trim()
      : savedAddresses.find(a => a.id === selectedAddressId)?.addressLine ?? '';

    if (!resolvedAddress) {
      Alert.alert('Add address', 'Please enter or select a pickup address.');
      return;
    }

    if (!pickupDate) {
      Alert.alert('Pick a date', 'Please enter your preferred pickup date.');
      return;
    }

    setSubmitting(true);
    try {
      await ordersAPI.bookPickup({
        customerId: user?.id,
        items: selectedItems.map(i => ({
          serviceId: i.serviceId,
          quantity: i.quantity,
          price: i.price,
        })),
        pickupAddress: resolvedAddress,
        savedAddressId: useManualAddress ? undefined : selectedAddressId,
        pickupDate,
        pickupTimeSlot: pickupTime,
        estimatedAmount: estimatedTotal,
        notes,
        source: 'customer-app',
      });

      Alert.alert(
        'Pickup Booked! 🎉',
        `Your pickup is scheduled. We'll WhatsApp you to confirm.\n\nEstimated: ₹${estimatedTotal}`,
        [{ text: 'View Orders', onPress: () => navigation.navigate('MyOrders') }]
      );

      // Reset form
      setSelectedItems([]);
      setPickupDate('');
      setNotes('');
    } catch (err: any) {
      Alert.alert('Booking failed', err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Book a Pickup</Text>
          <Text style={styles.headerSub}>Select your garments and schedule a pickup</Text>
        </View>

        {/* Catalog loading */}
        {catalogLoading && (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#E8440A" />
            <Text style={styles.loadingText}>Loading services…</Text>
          </View>
        )}

        {/* Catalog error — no fallback, show error */}
        {catalogError && !catalogLoading && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠ {catalogError}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => {
                setCatalogError(null);
                setCatalogLoading(true);
                servicesAPI.getPriceList()
                  .then((response: any) => {
                    const data: ServiceItem[] = response?.data?.catalog ?? response?.data ?? [];
                    const groupMap: Record<string, CatalogGroup> = {};
                    data.forEach((item: ServiceItem) => {
                      if (!item.basePrice || item.basePrice <= 0) return;
                      const key = `${item.catalogName}__${item.category}`;
                      if (!groupMap[key]) groupMap[key] = { key, label: `${item.catalogName} — ${item.category}`, items: [] };
                      groupMap[key].items.push(item);
                    });
                    const groups = Object.values(groupMap).filter(g => g.items.length > 0);
                    setCatalog(groups);
                    if (groups.length > 0) setActiveTab(groups[0].key);
                  })
                  .catch(() => setCatalogError('Still unavailable. Check your connection.'))
                  .finally(() => setCatalogLoading(false));
              }}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Catalog loaded */}
        {!catalogLoading && !catalogError && catalog.length > 0 && (
          <>
            {/* ── Category tabs ── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow}>
              {catalog.map(g => (
                <TouchableOpacity
                  key={g.key}
                  onPress={() => setActiveTab(g.key)}
                  style={[styles.tab, activeTab === g.key && styles.tabActive]}
                >
                  <Text style={[styles.tabText, activeTab === g.key && styles.tabTextActive]}>
                    {g.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* ── Item list ── */}
            <View style={styles.section}>
              {activeItems.map(item => {
                const selected = isSelected(item.id);
                const qty = getQty(item.id);
                return (
                  <View key={item.id} style={[styles.itemRow, selected && styles.itemRowSelected]}>
                    <TouchableOpacity style={styles.itemInfo} onPress={() => toggleItem(item)}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemPrice}>₹{item.basePrice}</Text>
                    </TouchableOpacity>
                    {selected ? (
                      <View style={styles.qtyControl}>
                        <TouchableOpacity onPress={() => {
                          if (qty <= 1) {
                            setSelectedItems(prev => prev.filter(i => i.serviceId !== item.id));
                          } else {
                            updateQty(item.id, -1);
                          }
                        }} style={styles.qtyBtn}>
                          <Text style={styles.qtyBtnText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.qtyNum}>{qty}</Text>
                        <TouchableOpacity onPress={() => updateQty(item.id, 1)} style={styles.qtyBtn}>
                          <Text style={styles.qtyBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity onPress={() => toggleItem(item)} style={styles.addBtn}>
                        <Text style={styles.addBtnText}>Add</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── Estimate bar ── */}
        {selectedItems.length > 0 && (
          <View style={styles.estimateBar}>
            <Text style={styles.estimateLabel}>{totalPieces} piece{totalPieces !== 1 ? 's' : ''} selected</Text>
            <Text style={styles.estimateAmount}>Est. ₹{estimatedTotal}</Text>
          </View>
        )}

        {/* ── Pickup address ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pickup Address</Text>

          {savedAddresses.length > 0 && !useManualAddress && (
            <>
              {savedAddresses.map(addr => (
                <TouchableOpacity
                  key={addr.id}
                  onPress={() => setSelectedAddressId(addr.id)}
                  style={[styles.addressRow, selectedAddressId === addr.id && styles.addressRowSelected]}
                >
                  <View style={[styles.radio, selectedAddressId === addr.id && styles.radioSelected]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.addrLabel}>{addr.label}</Text>
                    <Text style={styles.addrLine}>{addr.addressLine}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setUseManualAddress(true)} style={styles.linkBtn}>
                <Text style={styles.linkText}>+ Enter a different address</Text>
              </TouchableOpacity>
            </>
          )}

          {(savedAddresses.length === 0 || useManualAddress) && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Enter full pickup address"
                value={manualAddress}
                onChangeText={setManualAddress}
                multiline
                numberOfLines={2}
              />
              {savedAddresses.length > 0 && (
                <TouchableOpacity onPress={() => setUseManualAddress(false)} style={styles.linkBtn}>
                  <Text style={styles.linkText}>Use saved address instead</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* ── Pickup date & slot ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>When should we pick up?</Text>
          <TextInput
            style={styles.input}
            placeholder="Date — e.g. 15 Mar 2026"
            value={pickupDate}
            onChangeText={setPickupDate}
          />
          <Text style={[styles.sectionTitle, { marginTop: 14, marginBottom: 8 }]}>Preferred time</Text>
          <View style={styles.slotRow}>
            {['morning', 'afternoon', 'evening'].map(slot => (
              <TouchableOpacity
                key={slot}
                onPress={() => setPickupTime(slot)}
                style={[styles.slot, pickupTime === slot && styles.slotActive]}
              >
                <Text style={[styles.slotText, pickupTime === slot && styles.slotTextActive]}>
                  {slot === 'morning' ? '9–12 AM' : slot === 'afternoon' ? '12–4 PM' : '4–9 PM'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Notes ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Special instructions (optional)</Text>
          <TextInput
            style={[styles.input, { height: 80 }]}
            placeholder="e.g. ring bell twice, handle silk with care…"
            value={notes}
            onChangeText={setNotes}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* ── Book button ── */}
        <TouchableOpacity
          style={[styles.bookBtn, (submitting || selectedItems.length === 0) && styles.bookBtnDisabled]}
          onPress={handleBookPickup}
          disabled={submitting || selectedItems.length === 0}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.bookBtnText}>
              {selectedItems.length === 0
                ? 'Select garments to continue'
                : `Book Pickup — Est. ₹${estimatedTotal}`}
            </Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: '#f7f5f0' },
  scroll:            { flex: 1 },
  header:            { padding: 24, paddingBottom: 12 },
  headerTitle:       { fontSize: 24, fontWeight: '700', color: '#0f0f1a' },
  headerSub:         { fontSize: 14, color: '#6b6b7a', marginTop: 4 },

  centerBox:         { alignItems: 'center', paddingVertical: 48 },
  loadingText:       { color: '#6b6b7a', marginTop: 12, fontSize: 14 },

  errorBox:          { margin: 16, padding: 16, backgroundColor: '#fff0eb', borderRadius: 10, borderWidth: 1, borderColor: '#ffb399', alignItems: 'center' },
  errorText:         { color: '#7a1e00', fontSize: 14, textAlign: 'center', marginBottom: 12 },
  retryBtn:          { backgroundColor: '#E8440A', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 },
  retryText:         { color: '#fff', fontWeight: '600', fontSize: 14 },

  tabRow:            { paddingHorizontal: 16, marginBottom: 4, flexGrow: 0 },
  tab:               { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0ddd6', marginRight: 8 },
  tabActive:         { backgroundColor: '#E8440A', borderColor: '#E8440A' },
  tabText:           { fontSize: 12, color: '#444' },
  tabTextActive:     { color: '#fff', fontWeight: '600' },

  section:           { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 12, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e0ddd6' },
  sectionTitle:      { fontSize: 13, fontWeight: '600', color: '#6b6b7a', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 },

  itemRow:           { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0ede8' },
  itemRowSelected:   { backgroundColor: '#fff8f5' },
  itemInfo:          { flex: 1 },
  itemName:          { fontSize: 14, fontWeight: '500', color: '#0f0f1a' },
  itemPrice:         { fontSize: 13, color: '#E8440A', fontWeight: '700', marginTop: 2 },

  qtyControl:        { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtn:            { width: 28, height: 28, borderRadius: 6, backgroundColor: '#f0ede8', alignItems: 'center', justifyContent: 'center' },
  qtyBtnText:        { fontSize: 16, color: '#0f0f1a', fontWeight: '600' },
  qtyNum:            { fontSize: 15, fontWeight: '700', color: '#0f0f1a', minWidth: 20, textAlign: 'center' },

  addBtn:            { backgroundColor: '#E8440A', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  addBtnText:        { color: '#fff', fontSize: 13, fontWeight: '600' },

  estimateBar:       { marginHorizontal: 16, marginTop: 12, backgroundColor: '#0f0f1a', borderRadius: 10, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  estimateLabel:     { color: 'rgba(255,255,255,0.65)', fontSize: 13 },
  estimateAmount:    { color: '#fff', fontSize: 18, fontWeight: '700' },

  addressRow:        { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0ede8', gap: 10 },
  addressRowSelected:{ backgroundColor: '#fff8f5' },
  radio:             { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#ccc', marginTop: 2 },
  radioSelected:     { borderColor: '#E8440A', backgroundColor: '#E8440A' },
  addrLabel:         { fontSize: 13, fontWeight: '600', color: '#0f0f1a' },
  addrLine:          { fontSize: 12, color: '#6b6b7a', marginTop: 2 },

  input:             { borderWidth: 1, borderColor: '#e0ddd6', borderRadius: 8, padding: 12, fontSize: 14, backgroundColor: '#fff', color: '#0f0f1a' },
  linkBtn:           { marginTop: 10 },
  linkText:          { color: '#E8440A', fontSize: 13, fontWeight: '500' },

  slotRow:           { flexDirection: 'row', gap: 10 },
  slot:              { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e0ddd6', backgroundColor: '#fff', alignItems: 'center' },
  slotActive:        { borderColor: '#E8440A', backgroundColor: '#fff5f2' },
  slotText:          { fontSize: 12, color: '#444' },
  slotTextActive:    { color: '#E8440A', fontWeight: '600' },

  bookBtn:           { margin: 16, backgroundColor: '#E8440A', borderRadius: 12, padding: 16, alignItems: 'center' },
  bookBtnDisabled:   { backgroundColor: '#ccc' },
  bookBtnText:       { color: '#fff', fontSize: 16, fontWeight: '700' },
});
