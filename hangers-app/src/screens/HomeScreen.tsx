// ─────────────────────────────────────────────────────────────────────────────
// HOME SCREEN v2 — Live active order banner, promo banners carousel, shop info
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, Dimensions, RefreshControl, FlatList, Linking, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../utils/theme';
import { ordersAPI } from '../services/api';

const { width } = Dimensions.get('window');
const CARD_W    = (width - Spacing.lg * 2 - 12) / 2;
const BANNER_W  = width - Spacing.lg * 2;

// ── Services ──────────────────────────────────────────────────────────────────
const SERVICES = [
  { id: 'dry_clean',   icon: '🧺', label: 'Dry Clean',     color: '#023c62', lightColor: '#E8F0F7' },
  { id: 'steam_iron',  icon: '♨️', label: 'Steam Ironing', color: '#035a8f', lightColor: '#EBF4FF' },
  { id: 'normal_iron', icon: '👔', label: 'Normal Ironing',color: '#046a9e', lightColor: '#E8F2F8' },
  { id: 'laundry',     icon: '⚖️', label: 'Laundry / KG', color: '#02304f', lightColor: '#E6EFF5' },
  { id: 'shoe_clean',  icon: '👟', label: 'Shoe Cleaning', color: '#014e80', lightColor: '#EAF3FA' },
  { id: 'sofa_clean',  icon: '🛋️', label: 'Sofa Cleaning', color: '#023c62', lightColor: '#E8F0F7' },
  { id: 'roll_press',  icon: '📰', label: 'Roll Press',    color: '#035a8f', lightColor: '#EBF4FF' },
  { id: 'accessories', icon: '🎒', label: 'Accessories',   color: '#046a9e', lightColor: '#E8F2F8' },
];

// ── Promotional banners ───────────────────────────────────────────────────────
const PROMOS = [
  { id: '1', gradient: ['#023c62', '#035a8f'] as const, emoji: '🚚', title: 'Free Pickup & Delivery', subtitle: 'On all orders above ₹499', cta: 'Book Now' },
  { id: '2', gradient: ['#065f46', '#047857'] as const, emoji: '⚡', title: 'Express 24h Service',    subtitle: 'Same-day cleaning available', cta: 'Book Now' },
  { id: '3', gradient: ['#5b21b6', '#7c3aed'] as const, emoji: '🎁', title: 'Refer & Earn ₹100',     subtitle: 'Share your code, earn credits',cta: 'Share Now' },
  { id: '4', gradient: ['#9a3412', '#c2410c'] as const, emoji: '🌿', title: 'Eco-Friendly Process',  subtitle: 'Safe for your clothes & planet',cta: 'Know More' },
];

const STATUS_LABEL: Record<string, string> = {
  PENDING:            'Pickup Pending',
  PICKED_UP:          'Picked Up',
  PROCESSING:         'At Plant',
  WASHING:            'Washing',
  DRYING:             'Drying',
  IRONING:            'Ironing',
  QC:                 'QC Check',
  READY_FOR_DELIVERY: 'Ready for Delivery',
  OUT_FOR_DELIVERY:   'Out for Delivery',
};

const STATUS_ICON: Record<string, string> = {
  PENDING:            '⏳',
  PICKED_UP:          '🚗',
  PROCESSING:         '🏭',
  WASHING:            '💧',
  DRYING:             '💨',
  IRONING:            '♨️',
  QC:                 '🔍',
  READY_FOR_DELIVERY: '📦',
  OUT_FOR_DELIVERY:   '🛵',
};

const ACTIVE_STATUSES = ['PENDING','PICKED_UP','PROCESSING','WASHING','DRYING','IRONING','QC','READY_FOR_DELIVERY','OUT_FOR_DELIVERY'];

export default function HomeScreen({ navigation }: any) {
  const { customer } = useAuth();
  const [refreshing,     setRefreshing]    = useState(false);
  const [activeOrder,    setActiveOrder]   = useState<any>(null);
  const [loadingOrders,  setLoadingOrders] = useState(true);
  const [promptoBannerIdx, setPromoBannerIdx] = useState(0);
  const bannerScrollRef = useRef<FlatList<typeof PROMOS[0]>>(null);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const firstName = customer?.name?.split(' ')[0] || 'there';

  const fetchActiveOrder = useCallback(async (silent = false) => {
    if (!silent) setLoadingOrders(true);
    try {
      const result: any = await ordersAPI.getMyOrders(1, 20);
      const orders = result?.data?.orders || result?.orders || [];
      const active = orders.find((o: any) => ACTIVE_STATUSES.includes(o.status)) || null;
      setActiveOrder(active);
    } catch {
      setActiveOrder(null);
    } finally {
      setLoadingOrders(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchActiveOrder(); }, [fetchActiveOrder]);

  useFocusEffect(useCallback(() => {
    fetchActiveOrder(true);
  }, [fetchActiveOrder]));

  // Auto-scroll promo banners every 3.5s
  useEffect(() => {
    autoScrollTimer.current = setInterval(() => {
      setPromoBannerIdx(prev => {
        const next = (prev + 1) % PROMOS.length;
        try { bannerScrollRef.current?.scrollToIndex({ index: next, animated: true }); } catch {}
        return next;
      });
    }, 3500);
    return () => { if (autoScrollTimer.current) clearInterval(autoScrollTimer.current); };
  }, []);

  const onRefresh = () => { setRefreshing(true); fetchActiveOrder(); };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      <ScrollView showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryLight} />}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <LinearGradient colors={['#023c62', '#035a8f']} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={styles.bgCircle} />

          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>Good day, {firstName} 👋</Text>
              <Text style={styles.shopTag}>Hangers Clothes Spa</Text>
            </View>
            <TouchableOpacity style={styles.avatar} onPress={() => navigation.navigate('Profile')}>
              <Text style={styles.avatarText}>{customer?.name ? customer.name[0].toUpperCase() : '👤'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.quickActions}>
            {[
              { icon: '📦', label: 'Book Pickup', screen: 'BookPickup', primary: true  },
              { icon: '📋', label: 'My Orders',   screen: 'MyOrders',   primary: false },
              { icon: '💰', label: 'Rate Chart',  screen: 'RateChart',  primary: false },
            ].map(a => (
              <TouchableOpacity key={a.screen} style={[styles.quickBtn, a.primary && styles.quickBtnPrimary]}
                onPress={() => navigation.navigate(a.screen)} activeOpacity={0.8}>
                <Text style={styles.quickIcon}>{a.icon}</Text>
                <Text style={[styles.quickLabel, a.primary && styles.quickLabelPrimary]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </LinearGradient>

        {/* ── Active Order Banner ──────────────────────────────────────── */}
        <View style={styles.section}>
          {!loadingOrders && activeOrder ? (
            <TouchableOpacity style={styles.activeOrderCard} onPress={() => navigation.navigate('MyOrders')} activeOpacity={0.85}>
              <View style={styles.activeOrderLeft}>
                <View style={styles.activeDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.activeOrderTitle}>
                    {STATUS_ICON[activeOrder.status] || '📦'} {STATUS_LABEL[activeOrder.status] || activeOrder.status}
                  </Text>
                  <Text style={styles.activeOrderNum}>{activeOrder.orderNumber}</Text>
                </View>
              </View>
              <View style={styles.trackBadge}>
                <Text style={styles.trackBadgeText}>Track →</Text>
              </View>
            </TouchableOpacity>
          ) : !loadingOrders ? (
            <View style={styles.noOrderBanner}>
              <View style={styles.noOrderLeft}>
                <View style={[styles.activeDot, { backgroundColor: Colors.textLight }]} />
                <View>
                  <Text style={styles.noOrderTitle}>No active orders</Text>
                  <Text style={styles.noOrderSub}>Book a pickup to get started</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.bookNowBtn} onPress={() => navigation.navigate('BookPickup')}>
                <Text style={styles.bookNowText}>Book Now</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* ── Promo Banners Carousel ───────────────────────────────────── */}
        <View style={styles.section}>
          <FlatList
            ref={bannerScrollRef}
            data={PROMOS}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={item => item.id}
            scrollEnabled
            onMomentumScrollEnd={e => {
              setPromoBannerIdx(Math.round(e.nativeEvent.contentOffset.x / BANNER_W));
            }}
            renderItem={({ item }) => (
              <LinearGradient colors={item.gradient} style={styles.promoBanner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Text style={styles.promoEmoji}>{item.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.promoTitle}>{item.title}</Text>
                  <Text style={styles.promoSub}>{item.subtitle}</Text>
                </View>
                <TouchableOpacity style={styles.promoCta} onPress={() => navigation.navigate('BookPickup')}>
                  <Text style={styles.promoCtaText}>{item.cta}</Text>
                </TouchableOpacity>
              </LinearGradient>
            )}
          />
          <View style={styles.promoDots}>
            {PROMOS.map((_, i) => <View key={i} style={[styles.promoDot, i === promptoBannerIdx && styles.promoDotActive]} />)}
          </View>
        </View>

        {/* ── Services Grid ────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Our Services</Text>
            <TouchableOpacity onPress={() => navigation.navigate('RateChart')}>
              <Text style={styles.sectionLink}>View Prices →</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.servicesGrid}>
            {SERVICES.map(s => (
              <TouchableOpacity key={s.id} style={[styles.serviceCard, { backgroundColor: s.lightColor }]}
                onPress={() => navigation.navigate('RateChart', { serviceId: s.id, serviceLabel: s.label })} activeOpacity={0.85}>
                <Text style={styles.serviceEmoji}>{s.icon}</Text>
                <Text style={[styles.serviceLabel, { color: s.color }]}>{s.label}</Text>
                <View style={[styles.serviceArrow, { backgroundColor: s.color }]}>
                  <Text style={styles.serviceArrowText}>→</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Why Hangers ──────────────────────────────────────────────── */}
        <View style={styles.section}>
          <LinearGradient colors={['#023c62', '#046a9e']} style={styles.whyCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Text style={styles.whyTitle}>Why Hangers?</Text>
            <View style={styles.whyRow}>
              {[
                { icon: '🚚', text: 'Free Pickup\n& Delivery' },
                { icon: '⚡', text: 'Express\nService' },
                { icon: '🌿', text: 'Eco-Friendly\nProcess' },
                { icon: '🔔', text: 'WhatsApp\nUpdates' },
              ].map(item => (
                <View key={item.text} style={styles.whyItem}>
                  <Text style={styles.whyIcon}>{item.icon}</Text>
                  <Text style={styles.whyText}>{item.text}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </View>

        {/* ── Shop Info Strip ──────────────────────────────────────────── */}
        <View style={[styles.section, { marginBottom: 100 }]}>
          <View style={styles.shopInfoCard}>
            <Text style={styles.shopInfoName}>Hangers Clothes Spa</Text>

            <View style={styles.shopInfoRow}>
              <Text style={styles.shopInfoIcon}>📍</Text>
              <Text style={styles.shopInfoText}>Near Juhu, Mumbai — Free pickup & delivery at your doorstep</Text>
            </View>
            <View style={styles.shopInfoRow}>
              <Text style={styles.shopInfoIcon}>🕐</Text>
              <Text style={styles.shopInfoText}>Mon – Sat: 8:00 AM – 9:00 PM  ·  Sun: 10:00 AM – 6:00 PM</Text>
            </View>
            <View style={styles.shopInfoRow}>
              <Text style={styles.shopInfoIcon}>📱</Text>
              <Text style={styles.shopInfoText}>+91 79774 17014</Text>
            </View>

            <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL('tel:+917977417014')}>
              <Text style={styles.callBtnText}>📞  Call Us Now</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.offWhite },

  header:            { paddingTop: Platform.OS === 'ios' ? 56 : 36, paddingHorizontal: Spacing.lg, paddingBottom: 28, overflow: 'hidden' },
  bgCircle:          { position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(3,90,143,0.4)' },
  headerTop:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  greeting:          { fontFamily: 'Syne_700Bold', fontSize: FontSize.lg, color: Colors.white },
  shopTag:           { fontFamily: 'DMSans_400Regular', fontSize: FontSize.xs, color: Colors.primaryLight, marginTop: 2, fontStyle: 'italic' },
  avatar:            { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1.5, borderColor: 'rgba(184,208,232,0.4)', alignItems: 'center', justifyContent: 'center' },
  avatarText:        { fontFamily: 'Syne_700Bold', fontSize: FontSize.md, color: Colors.white },
  quickActions:      { flexDirection: 'row', gap: 8 },
  quickBtn:          { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(184,208,232,0.2)' },
  quickBtnPrimary:   { backgroundColor: Colors.white },
  quickIcon:         { fontSize: 20, marginBottom: 4 },
  quickLabel:        { fontFamily: 'DMSans_500Medium', fontSize: 10, color: Colors.primaryLight, textAlign: 'center' },
  quickLabelPrimary: { color: Colors.primary },

  section:       { paddingHorizontal: Spacing.lg, marginTop: Spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle:  { fontFamily: 'Syne_700Bold', fontSize: FontSize.md, color: Colors.textDark },
  sectionLink:   { fontFamily: 'DMSans_500Medium', fontSize: FontSize.sm, color: Colors.primary },

  activeOrderCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...Shadow.sm, borderWidth: 1.5, borderColor: '#3b82f6' },
  activeOrderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  activeDot:       { width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e' },
  activeOrderTitle:{ fontFamily: 'DMSans_500Medium', fontSize: FontSize.base, color: Colors.textDark },
  activeOrderNum:  { fontFamily: 'DMSans_400Regular', fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  trackBadge:      { backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 7 },
  trackBadgeText:  { fontFamily: 'DMSans_500Medium', fontSize: FontSize.sm, color: Colors.white },

  noOrderBanner: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...Shadow.sm, borderWidth: 1, borderColor: Colors.border },
  noOrderLeft:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  noOrderTitle:  { fontFamily: 'DMSans_500Medium', fontSize: FontSize.base, color: Colors.textDark },
  noOrderSub:    { fontFamily: 'DMSans_400Regular', fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  bookNowBtn:    { backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingHorizontal: 14, paddingVertical: 8 },
  bookNowText:   { fontFamily: 'DMSans_500Medium', fontSize: FontSize.sm, color: Colors.white },

  promoBanner:   { width: BANNER_W, borderRadius: Radius.lg, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
  promoEmoji:    { fontSize: 34 },
  promoTitle:    { fontFamily: 'Syne_700Bold', fontSize: FontSize.base, color: Colors.white, marginBottom: 4 },
  promoSub:      { fontFamily: 'DMSans_400Regular', fontSize: FontSize.xs, color: 'rgba(255,255,255,0.7)' },
  promoCta:      { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  promoCtaText:  { fontFamily: 'DMSans_500Medium', fontSize: 11, color: Colors.white },
  promoDots:     { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
  promoDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border },
  promoDotActive:{ backgroundColor: Colors.primary, width: 18 },

  servicesGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  serviceCard:     { width: CARD_W, borderRadius: Radius.lg, padding: 16, ...Shadow.sm, borderWidth: 1, borderColor: 'rgba(2,60,98,0.06)' },
  serviceEmoji:    { fontSize: 28, marginBottom: 10 },
  serviceLabel:    { fontFamily: 'Syne_700Bold', fontSize: FontSize.sm, lineHeight: 19, marginBottom: 12, flex: 1 },
  serviceArrow:    { alignSelf: 'flex-end', width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  serviceArrowText:{ color: Colors.white, fontSize: 12, fontWeight: '700' },

  whyCard:  { borderRadius: Radius.lg, padding: 20 },
  whyTitle: { fontFamily: 'Syne_700Bold', fontSize: FontSize.md, color: Colors.white, marginBottom: 16 },
  whyRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  whyItem:  { alignItems: 'center', flex: 1 },
  whyIcon:  { fontSize: 22, marginBottom: 6 },
  whyText:  { fontFamily: 'DMSans_400Regular', fontSize: 10, color: Colors.primaryLight, textAlign: 'center', lineHeight: 14 },

  shopInfoCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 20, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  shopInfoName: { fontFamily: 'Syne_700Bold', fontSize: FontSize.md, color: Colors.textDark, marginBottom: 16 },
  shopInfoRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  shopInfoIcon: { fontSize: 16, width: 22, textAlign: 'center', marginTop: 2 },
  shopInfoText: { fontFamily: 'DMSans_400Regular', fontSize: FontSize.sm, color: Colors.textMid, flex: 1, lineHeight: 20 },
  callBtn:      { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  callBtnText:  { fontFamily: 'Syne_700Bold', fontSize: FontSize.base, color: Colors.white },
});
