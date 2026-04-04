import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { addressAPI, ordersAPI, servicesAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { Colors, Fonts, Radius, Shadow, Spacing } from '../utils/theme';
import PageMotion from '../components/PageMotion';

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

interface ApiCatalogGroup {
  category: string;
  items: Array<{
    id: string;
    name: string;
    price: number;
  }>;
}

interface SelectedItem {
  serviceId: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
}

interface SavedAddress {
  id: string;
  label: string;
  address: string;
  addressLine1?: string;
  addressLine2?: string | null;
  landmark?: string | null;
  city?: string;
  pincode?: string;
  isDefault: boolean;
}

const BOOK_PICKUP_DRAFT_KEY = 'customer:book-pickup-draft:v1';

const TIME_SLOTS = [
  { key: '9 AM - 12 PM', title: 'Morning', subtitle: 'Best for same-day planning' },
  { key: '12 PM - 4 PM', title: 'Afternoon', subtitle: 'Pickup during the day' },
  { key: '4 PM - 9 PM', title: 'Evening', subtitle: 'After work convenience' },
];

const buildAddressLine = (address: SavedAddress) =>
  address.address ||
  [
    address.addressLine1,
    address.addressLine2,
    address.landmark,
    address.city,
    address.pincode,
  ].filter(Boolean).join(', ');

const buildDateOptions = () => {
  const formatter = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  return Array.from({ length: 6 }, (_, index) => {
    const value = new Date();
    value.setDate(value.getDate() + index);
    value.setHours(0, 0, 0, 0);
    return {
      value: value.toISOString(),
      label: index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : formatter.format(value),
      helper: formatter.format(value),
    };
  });
};

const normalizeCatalog = (data: ApiCatalogGroup[]) => {
  const groupMap: Record<string, CatalogGroup> = {};

  data.forEach((group) => {
    const parts = String(group.category || '').split(' — ');
    const catalogName = parts[0]?.trim() || 'Services';
    const subCategory = parts[1]?.trim() || catalogName;
    const key = `${catalogName}__${subCategory}`;

    if (!groupMap[key]) {
      groupMap[key] = {
        key,
        label: `${catalogName} - ${subCategory}`,
        items: [],
      };
    }

    (group.items || []).forEach((item) => {
      const mappedItem: ServiceItem = {
        id: item.id,
        name: item.name,
        basePrice: Number(item.price) || 0,
        category: subCategory,
        catalogName,
      };
      if (!mappedItem.basePrice || mappedItem.basePrice <= 0) return;
      groupMap[key].items.push(mappedItem);
    });
  });

  return Object.values(groupMap).filter((group) => group.items.length > 0);
};

export default function BookPickupScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  const [catalog, setCatalog] = useState<CatalogGroup[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('');
  const [currentStep, setCurrentStep] = useState<'garments' | 'details'>('garments');

  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [useManualAddress, setUseManualAddress] = useState(false);
  const [manualAddress, setManualAddress] = useState('');

  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [pickupDate, setPickupDate] = useState('');
  const [pickupTime, setPickupTime] = useState(TIME_SLOTS[0].key);
  const [notes, setNotes] = useState('');
  const [draftReady, setDraftReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const dateOptions = buildDateOptions();

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const response: any = await servicesAPI.getPriceList();
      const data: ApiCatalogGroup[] = response?.data?.catalog ?? response?.catalog ?? [];
      const groups = normalizeCatalog(data);
      if (!groups.length) {
        setCatalogError('Price list is empty. Please contact the shop.');
        return;
      }
      setCatalog(groups);
      setActiveTab((current) => (current && groups.some((group) => group.key === current) ? current : groups[0].key));
    } catch (error) {
      console.error('BookPickupScreen catalog error:', error);
      setCatalogError('Could not load services. Please try again.');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const loadAddresses = useCallback(async () => {
    if (!user?.id) return;
    setAddressesLoading(true);
    try {
      const response: any = await addressAPI.list();
      const nextAddresses: SavedAddress[] = response?.addresses ?? response?.data?.addresses ?? [];
      setSavedAddresses(nextAddresses);
      setSelectedAddressId((current) => {
        if (current && nextAddresses.some((address) => address.id === current)) return current;
        const fallback = nextAddresses.find((address) => address.isDefault) || nextAddresses[0];
        return fallback?.id || '';
      });
      if (!nextAddresses.length) setUseManualAddress(true);
    } catch (error) {
      console.error('BookPickupScreen addresses error:', error);
      setSavedAddresses([]);
    } finally {
      setAddressesLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    let alive = true;

    SecureStore.getItemAsync(BOOK_PICKUP_DRAFT_KEY)
      .then((raw) => {
        if (!raw || !alive) return;
        const draft = JSON.parse(raw);
        if (Array.isArray(draft.selectedItems)) setSelectedItems(draft.selectedItems);
        if (typeof draft.selectedAddressId === 'string') setSelectedAddressId(draft.selectedAddressId);
        if (typeof draft.useManualAddress === 'boolean') setUseManualAddress(draft.useManualAddress);
        if (typeof draft.manualAddress === 'string') setManualAddress(draft.manualAddress);
        if (typeof draft.pickupDate === 'string') setPickupDate(draft.pickupDate);
        if (typeof draft.pickupTime === 'string') setPickupTime(draft.pickupTime);
        if (typeof draft.notes === 'string') setNotes(draft.notes);
        if (typeof draft.activeTab === 'string') setActiveTab(draft.activeTab);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setDraftReady(true);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useFocusEffect(
    useCallback(() => {
      loadAddresses();
    }, [loadAddresses])
  );

  useEffect(() => {
    if (!draftReady) return;
    const draft = {
      selectedItems,
      selectedAddressId,
      useManualAddress,
      manualAddress,
      pickupDate,
      pickupTime,
      notes,
      activeTab,
    };

    const hasContent =
      selectedItems.length > 0 ||
      selectedAddressId ||
      manualAddress.trim() ||
      pickupDate ||
      notes.trim();

    if (!hasContent) {
      SecureStore.deleteItemAsync(BOOK_PICKUP_DRAFT_KEY).catch(() => {});
      return;
    }

    SecureStore.setItemAsync(BOOK_PICKUP_DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
  }, [activeTab, draftReady, manualAddress, notes, pickupDate, pickupTime, selectedAddressId, selectedItems, useManualAddress]);

  const activeItems = catalog.find((group) => group.key === activeTab)?.items ?? [];
  const totalPieces = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
  const estimatedTotal = selectedItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const selectedAddress = savedAddresses.find((address) => address.id === selectedAddressId) || null;
  const selectedAddressLine = selectedAddress ? buildAddressLine(selectedAddress) : '';

  const resetDraft = useCallback(async () => {
    await SecureStore.deleteItemAsync(BOOK_PICKUP_DRAFT_KEY).catch(() => {});
    setSelectedItems([]);
    setManualAddress('');
    setNotes('');
    setPickupDate('');
    setPickupTime(TIME_SLOTS[0].key);
    setCurrentStep('garments');
    setUseManualAddress(savedAddresses.length === 0);
    const fallback = savedAddresses.find((address) => address.isDefault) || savedAddresses[0];
    setSelectedAddressId(fallback?.id || '');
  }, [savedAddresses]);

  const toggleItem = (item: ServiceItem) => {
    setSelectedItems((current) => {
      const existing = current.find((entry) => entry.serviceId === item.id);
      if (existing) return current.filter((entry) => entry.serviceId !== item.id);
      return [
        ...current,
        {
          serviceId: item.id,
          name: item.name,
          price: item.basePrice,
          quantity: 1,
          category: item.category,
        },
      ];
    });
  };

  const updateQty = (serviceId: string, delta: number) => {
    setSelectedItems((current) =>
      current
        .map((entry) =>
          entry.serviceId === serviceId ? { ...entry, quantity: Math.max(1, entry.quantity + delta) } : entry
        )
        .filter(Boolean)
    );
  };

  const handleBookPickup = async () => {
    if (!selectedItems.length) {
      Alert.alert('Add garments', 'Please select at least one garment.');
      return;
    }

    const resolvedAddress = useManualAddress ? manualAddress.trim() : buildAddressLine(selectedAddress as SavedAddress);
    if (!resolvedAddress) {
      Alert.alert('Pickup address missing', 'Select a saved address or enter a pickup address.');
      return;
    }

    if (!pickupDate) {
      Alert.alert('Pickup date missing', 'Choose the date you want us to pick up your clothes.');
      return;
    }

    setSubmitting(true);
    try {
      const response: any = await ordersAPI.bookPickup({
        address: resolvedAddress,
        savedAddressId: useManualAddress ? undefined : selectedAddressId,
        pickupDate,
        timeSlot: pickupTime,
        serviceTypes: [...new Set(selectedItems.map((item) => item.category))],
        notes: notes.trim() || undefined,
        subtotal: estimatedTotal,
        totalAmount: estimatedTotal,
        items: selectedItems.map((item) => ({
          serviceId: item.serviceId,
          serviceName: item.name,
          garmentType: item.category,
          quantity: item.quantity,
          unitPrice: item.price,
          price: item.price,
        })),
      });

      await SecureStore.deleteItemAsync(BOOK_PICKUP_DRAFT_KEY).catch(() => {});
      const order = response?.order || response?.data?.order;
      const orderNumber = order?.orderNumber;

      setSelectedItems([]);
      setManualAddress('');
      setNotes('');
      setPickupDate('');
      setPickupTime(TIME_SLOTS[0].key);
      setUseManualAddress(savedAddresses.length === 0);

      navigation.navigate('BookingConfirmed', {
        orderNumber,
        orderId: order?.id,
        date: order?.pickupDate || pickupDate,
        slot: order?.pickupSlot || pickupTime,
        services: [...new Set(selectedItems.map((item) => item.name))],
        itemCount: totalPieces,
        totalAmount: order?.totalAmount ?? estimatedTotal,
        walletApplied: response?.walletApplied || response?.data?.walletApplied || 0,
      });
    } catch (error: any) {
      Alert.alert('Booking failed', error?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <PageMotion style={{ flex: 1 }}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#023c62', '#0b5f92']} style={styles.hero}>
          <View style={styles.heroTop}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
              <MaterialCommunityIcons name="arrow-left" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={resetDraft} style={styles.ghostBtn}>
              <Text style={styles.ghostBtnText}>Reset</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.heroEyebrow}>Doorstep pickup</Text>
          <Text style={styles.heroTitle}>Book in two steps</Text>
          <Text style={styles.heroSub}>Choose garments, confirm address, and lock a pickup slot.</Text>

          <View style={styles.heroStats}>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>{totalPieces}</Text>
              <Text style={styles.heroStatLabel}>Pieces</Text>
            </View>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>₹{estimatedTotal}</Text>
              <Text style={styles.heroStatLabel}>Estimate</Text>
            </View>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>{savedAddresses.length}</Text>
              <Text style={styles.heroStatLabel}>Saved addresses</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.stepSwitcherWrap}>
          <TouchableOpacity
            onPress={() => setCurrentStep('garments')}
            style={[styles.stepSwitcherBtn, currentStep === 'garments' && styles.stepSwitcherBtnActive]}
            activeOpacity={0.9}
          >
            <Text style={[styles.stepSwitcherTitle, currentStep === 'garments' && styles.stepSwitcherTitleActive]}>
              Garments
            </Text>
            <Text style={[styles.stepSwitcherMeta, currentStep === 'garments' && styles.stepSwitcherMetaActive]}>
              {totalPieces ? `${totalPieces} selected` : 'Choose items'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setCurrentStep('details')}
            style={[styles.stepSwitcherBtn, currentStep === 'details' && styles.stepSwitcherBtnActive]}
            activeOpacity={0.9}
          >
            <Text style={[styles.stepSwitcherTitle, currentStep === 'details' && styles.stepSwitcherTitleActive]}>
              Pickup
            </Text>
            <Text style={[styles.stepSwitcherMeta, currentStep === 'details' && styles.stepSwitcherMetaActive]}>
              {pickupDate ? 'Scheduled' : 'Address and slot'}
            </Text>
          </TouchableOpacity>
        </View>

        {currentStep === 'garments' && (
        <PageMotion key="garments-step">
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Select garments</Text>
            <Text style={styles.sectionSub}>Keep this step focused on what you are sending.</Text>
          </View>

          {catalogLoading && (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.stateText}>Loading services...</Text>
            </View>
          )}

          {!catalogLoading && !!catalogError && (
            <View style={styles.inlineState}>
              <Text style={styles.errorText}>{catalogError}</Text>
              <TouchableOpacity onPress={loadCatalog} style={styles.inlineBtn}>
                <Text style={styles.inlineBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {!catalogLoading && !catalogError && !!catalog.length && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
                {catalog.map((group) => (
              <TouchableOpacity
                key={group.key}
                onPress={() => setActiveTab(group.key)}
                style={[styles.tab, activeTab === group.key && styles.tabActive]}
                activeOpacity={0.9}
              >
                    <Text
                      numberOfLines={2}
                      style={[styles.tabText, activeTab === group.key && styles.tabTextActive]}
                    >
                      {group.label}
                    </Text>
              </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.serviceGrid}>
                {activeItems.map((item) => {
                  const selected = selectedItems.find((entry) => entry.serviceId === item.id);
                  return (
                    <View key={item.id} style={[styles.serviceCard, !!selected && styles.serviceCardSelected]}>
                      <TouchableOpacity style={styles.serviceCardBody} onPress={() => toggleItem(item)}>
                        <Text style={styles.serviceName}>{item.name}</Text>
                        <Text style={styles.serviceMeta}>{item.category}</Text>
                        <Text style={styles.servicePrice}>₹{item.basePrice}</Text>
                      </TouchableOpacity>
                      <View style={styles.serviceCardFooter}>
                        {selected ? (
                          <View style={styles.qtyControl}>
                            <TouchableOpacity
                              onPress={() => {
                                if (selected.quantity <= 1) toggleItem(item);
                                else updateQty(item.id, -1);
                              }}
                              style={styles.qtyBtn}
                            >
                              <Text style={styles.qtyBtnText}>-</Text>
                            </TouchableOpacity>
                            <Text style={styles.qtyValue}>{selected.quantity}</Text>
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
                    </View>
                  );
                })}
              </View>
            </>
          )}

          <View style={styles.inlineSummary}>
            <View>
              <Text style={styles.inlineSummaryTitle}>Current selection</Text>
              <Text style={styles.inlineSummarySub}>
                {totalPieces ? `${totalPieces} pieces, estimated ₹${estimatedTotal}` : 'No garments selected yet'}
              </Text>
            </View>
              <TouchableOpacity
                onPress={() => setCurrentStep('details')}
                style={[styles.nextBtn, selectedItems.length === 0 && styles.nextBtnDisabled]}
                disabled={selectedItems.length === 0}
                activeOpacity={0.9}
              >
                <Text style={styles.nextBtnText}>Next: Pickup details</Text>
              </TouchableOpacity>
            </View>
        </View>
        </PageMotion>
        )}

        {currentStep === 'details' && (
        <PageMotion key="details-step">
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Pickup details</Text>
            <Text style={styles.sectionSub}>Address, date, and slot in one compact step.</Text>
          </View>

          <View style={styles.compactSummaryCard}>
            <View style={styles.compactSummaryRow}>
              <Text style={styles.compactSummaryLabel}>Garments</Text>
              <TouchableOpacity onPress={() => setCurrentStep('garments')}>
                <Text style={styles.linkText}>Edit</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.compactSummaryValue}>
              {totalPieces ? `${totalPieces} pieces selected · ₹${estimatedTotal}` : 'No garments selected'}
            </Text>
          </View>

          <Text style={styles.fieldTitle}>Pickup address</Text>
          {addressesLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.stateText}>Loading saved addresses...</Text>
            </View>
          ) : null}

          {!addressesLoading && !!savedAddresses.length && !useManualAddress && (
            <View style={styles.addressList}>
              {savedAddresses.map((address, index) => {
                const active = selectedAddressId === address.id;
                return (
                  <TouchableOpacity
                    key={address.id}
                    onPress={() => setSelectedAddressId(address.id)}
                    style={[styles.addressCard, active && styles.addressCardActive]}
                    activeOpacity={0.9}
                  >
                    <View style={styles.addressCardTop}>
                      <View style={styles.addressLabelWrap}>
                        <MaterialCommunityIcons
                          name={address.label === 'Work' ? 'briefcase-outline' : 'home-city-outline'}
                          size={18}
                          color={active ? Colors.primary : Colors.textMid}
                        />
                        <Text style={styles.addressLabel}>{address.label}</Text>
                        {address.isDefault ? <Text style={styles.defaultBadge}>Default</Text> : null}
                      </View>
                      <View style={[styles.radio, active && styles.radioActive]} />
                    </View>
                    <Text style={styles.addressText}>{buildAddressLine(address)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {(!savedAddresses.length || useManualAddress) && (
            <View style={styles.manualWrap}>
              <TextInput
                style={styles.textArea}
                placeholder="Enter full pickup address"
                placeholderTextColor={Colors.textLight}
                multiline
                numberOfLines={4}
                value={manualAddress}
                onChangeText={setManualAddress}
              />
            </View>
          )}

          <View style={styles.addressActions}>
            {!!savedAddresses.length && (
              <TouchableOpacity onPress={() => setUseManualAddress((current) => !current)}>
                <Text style={styles.linkText}>{useManualAddress ? 'Use saved address instead' : 'Enter a different address'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => navigation.navigate('Addresses')}>
              <Text style={styles.linkText}>Manage saved addresses</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.fieldTitle, styles.fieldSpacing]}>Pickup date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
            {dateOptions.map((option) => {
              const active = pickupDate === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setPickupDate(option.value)}
                  style={[styles.dateChip, active && styles.dateChipActive]}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.dateChipLabel, active && styles.dateChipLabelActive]}>{option.label}</Text>
                  <Text style={[styles.dateChipHelper, active && styles.dateChipHelperActive]}>{option.helper}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={[styles.fieldTitle, styles.fieldSpacing]}>Time slot</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slotRowCompact}>
            {TIME_SLOTS.map((slot) => {
              const active = pickupTime === slot.key;
              return (
                <TouchableOpacity
                  key={slot.key}
                  onPress={() => setPickupTime(slot.key)}
                  style={[styles.slotCard, active && styles.slotCardActive]}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.slotTitle, active && styles.slotTitleActive]}>{slot.title}</Text>
                  <Text style={[styles.slotSubtitle, active && styles.slotSubtitleActive]}>{slot.key}</Text>
                  <Text style={[styles.slotHint, active && styles.slotHintActive]}>{slot.subtitle}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={[styles.fieldTitle, styles.fieldSpacing]}>Instructions</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Gate code, landmark, fabric care note..."
            placeholderTextColor={Colors.textLight}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>
        </PageMotion>
        )}

        <View style={styles.footerCard}>
          <View>
            <Text style={styles.footerTitle}>Pickup estimate</Text>
            <Text style={styles.footerSub}>
              {totalPieces} piece{totalPieces === 1 ? '' : 's'} selected
            </Text>
            {currentStep === 'details' && !!pickupDate ? (
              <Text style={styles.footerMeta}>
                {selectedAddressLine ? `${selectedAddress?.label || 'Saved'} address selected` : 'Manual address'}
              </Text>
            ) : null}
          </View>
          <Text style={styles.footerAmount}>₹{estimatedTotal}</Text>
        </View>

        <TouchableOpacity
          style={[
            styles.bookBtn,
            currentStep !== 'details' && styles.bookBtnSecondary,
            (!selectedItems.length || submitting) && styles.bookBtnDisabled,
          ]}
          onPress={handleBookPickup}
          disabled={!selectedItems.length || submitting || currentStep !== 'details'}
          activeOpacity={0.92}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.bookBtnText, currentStep !== 'details' && styles.bookBtnTextSecondary]}>
              {currentStep === 'details' ? 'Confirm Pickup' : 'Complete pickup details to continue'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
      </PageMotion>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { paddingBottom: 28 },

  hero: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  ghostBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  ghostBtnText: { color: '#fff', fontFamily: Fonts.medium, fontSize: 13 },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontFamily: Fonts.medium,
  },
  heroTitle: { color: '#fff', fontSize: 26, marginTop: 6, fontFamily: Fonts.display },
  heroSub: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    maxWidth: 300,
    fontFamily: Fonts.body,
  },
  heroStats: { flexDirection: 'row', gap: 8, marginTop: 12 },
  heroStatCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  heroStatValue: { color: '#fff', fontSize: 17, fontFamily: Fonts.display },
  heroStatLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 10, marginTop: 2, fontFamily: Fonts.medium },

  stepSwitcherWrap: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginTop: -10,
    marginBottom: 0,
    padding: 5,
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.md,
  },
  stepSwitcherBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  stepSwitcherBtnActive: {
    backgroundColor: '#eef5fb',
  },
  stepSwitcherTitle: {
    color: Colors.textDark,
    fontSize: 14,
    fontFamily: Fonts.medium,
  },
  stepSwitcherTitleActive: {
    color: Colors.primary,
  },
  stepSwitcherMeta: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 4,
    fontFamily: Fonts.body,
  },
  stepSwitcherMetaActive: {
    color: Colors.primaryMid,
  },

  card: {
    marginHorizontal: Spacing.md,
    marginTop: 12,
    padding: 14,
    backgroundColor: Colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.md,
  },
  footerCard: {
    marginHorizontal: Spacing.md,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: '#102235',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerTitle: { color: '#fff', fontSize: 15, fontFamily: Fonts.medium },
  footerSub: { color: 'rgba(255,255,255,0.64)', fontSize: 12, marginTop: 4, fontFamily: Fonts.body },
  footerMeta: { color: 'rgba(255,255,255,0.78)', fontSize: 11, marginTop: 6, fontFamily: Fonts.medium },
  footerAmount: { color: '#fff', fontSize: 24, fontFamily: Fonts.display },

  sectionHeader: { marginBottom: 12 },
  sectionTitle: { color: Colors.textDark, fontSize: 20, fontFamily: Fonts.display },
  sectionSub: { color: Colors.textMuted, fontSize: 13, marginTop: 4, fontFamily: Fonts.body },
  fieldTitle: { color: Colors.textDark, fontSize: 13, marginBottom: 10, fontFamily: Fonts.medium },
  fieldSpacing: { marginTop: 14 },

  centerState: { alignItems: 'center', paddingVertical: 26 },
  inlineState: {
    padding: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.errorBg,
    borderWidth: 1,
    borderColor: '#f6b9b2',
  },
  stateText: { color: Colors.textMuted, marginTop: 10, fontFamily: Fonts.body },
  errorText: { color: Colors.error, fontFamily: Fonts.medium, lineHeight: 20 },
  inlineBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
  },
  inlineBtnText: { color: '#fff', fontFamily: Fonts.medium, fontSize: 13 },
  inlineSummary: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inlineSummaryTitle: { color: Colors.textDark, fontSize: 13, fontFamily: Fonts.medium },
  inlineSummarySub: { color: Colors.textMuted, fontSize: 12, marginTop: 4, fontFamily: Fonts.body },
  nextBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radius.full,
  },
  nextBtnDisabled: {
    backgroundColor: '#9fb7c9',
  },
  nextBtnText: { color: '#fff', fontSize: 13, fontFamily: Fonts.medium },

  tabRow: { gap: 8, paddingBottom: 4 },
  tab: {
    width: 124,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.offWhite,
  },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText: { color: Colors.textMid, fontFamily: Fonts.medium, fontSize: 10, lineHeight: 13 },
  tabTextActive: { color: '#fff' },

  serviceGrid: {
    marginTop: 8,
    gap: 8,
  },
  serviceCard: {
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    backgroundColor: Colors.offWhite,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  serviceCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#eef5fb',
  },
  serviceCardBody: {
    flex: 1,
  },
  serviceName: { color: Colors.textDark, fontSize: 13, fontFamily: Fonts.medium },
  serviceMeta: { color: Colors.textMuted, fontSize: 10, marginTop: 2, fontFamily: Fonts.body },
  servicePrice: { color: Colors.primary, fontSize: 13, marginTop: 4, fontFamily: Fonts.bold },
  serviceCardFooter: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addBtnText: { color: '#fff', fontFamily: Fonts.medium, fontSize: 11 },
  qtyControl: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { color: Colors.primary, fontSize: 14, fontFamily: Fonts.bold },
  qtyValue: { minWidth: 14, textAlign: 'center', color: Colors.textDark, fontSize: 12, fontFamily: Fonts.bold },

  addressList: { gap: 8 },
  compactSummaryCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#f4f8fc',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 18,
  },
  compactSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compactSummaryLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.medium,
    textTransform: 'uppercase',
  },
  compactSummaryValue: {
    color: Colors.textDark,
    fontSize: 14,
    marginTop: 8,
    fontFamily: Fonts.medium,
  },
  addressCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.offWhite,
    borderRadius: Radius.lg,
    padding: 12,
  },
  addressCardActive: { borderColor: Colors.primary, backgroundColor: '#eef5fb' },
  addressCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addressLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  addressLabel: { color: Colors.textDark, fontSize: 14, fontFamily: Fonts.medium },
  defaultBadge: {
    color: Colors.primary,
    backgroundColor: '#dcecf8',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    overflow: 'hidden',
    fontSize: 11,
    fontFamily: Fonts.medium,
  },
  addressText: { color: Colors.textMid, lineHeight: 18, marginTop: 8, fontFamily: Fonts.body, fontSize: 12 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.border },
  radioActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  manualWrap: { marginTop: 2 },
  addressActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  linkText: { color: Colors.primary, fontSize: 13, fontFamily: Fonts.medium },

  dateRow: { gap: 8 },
  dateChip: {
    width: 82,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.offWhite,
  },
  dateChipActive: { borderColor: Colors.primary, backgroundColor: '#eef5fb' },
  dateChipLabel: { color: Colors.textDark, fontSize: 12, fontFamily: Fonts.medium },
  dateChipLabelActive: { color: Colors.primary },
  dateChipHelper: { color: Colors.textMuted, fontSize: 10, marginTop: 2, fontFamily: Fonts.body },
  dateChipHelperActive: { color: Colors.primaryMid },

  slotList: { gap: 10 },
  slotRowCompact: { gap: 8, paddingBottom: 2 },
  slotCard: {
    width: 148,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 12,
    backgroundColor: Colors.offWhite,
  },
  slotCardActive: { borderColor: Colors.primary, backgroundColor: '#eef5fb' },
  slotTitle: { color: Colors.textDark, fontSize: 13, fontFamily: Fonts.medium },
  slotTitleActive: { color: Colors.primary },
  slotSubtitle: { color: Colors.textMid, fontSize: 12, marginTop: 3, fontFamily: Fonts.medium },
  slotSubtitleActive: { color: Colors.primaryMid },
  slotHint: { color: Colors.textMuted, fontSize: 10, marginTop: 3, fontFamily: Fonts.body, lineHeight: 14 },
  slotHintActive: { color: Colors.primaryMid },

  textArea: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.textDark,
    backgroundColor: Colors.offWhite,
    fontFamily: Fonts.body,
    fontSize: 14,
  },

  bookBtn: {
    marginHorizontal: Spacing.md,
    marginTop: 12,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 16,
    ...Shadow.lg,
  },
  bookBtnSecondary: {
    backgroundColor: '#d8e4ee',
    ...Shadow.sm,
  },
  bookBtnDisabled: { backgroundColor: '#9fb7c9' },
  bookBtnText: { color: '#fff', fontSize: 15, fontFamily: Fonts.display },
  bookBtnTextSecondary: { color: Colors.textMid, fontFamily: Fonts.medium, fontSize: 13 },
});
