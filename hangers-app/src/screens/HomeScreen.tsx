// ─────────────────────────────────────────────────────────────────────────────
// HOME SCREEN — Customer app landing experience
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, Dimensions, RefreshControl, FlatList, Linking, Platform, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { Colors, Spacing, Radius, FontSize, Shadow, Fonts } from '../utils/theme';
import { metadataAPI, ordersAPI } from '../services/api';
import { LOGO_BLUE_URL, LOGO_WHITE_URL } from '../lib/branding';
import AnimatedButton from '../components/AnimatedButton';
import StaggerItem from '../components/StaggerItem';

const { width } = Dimensions.get('window');
const CONTENT_W = width - Spacing.lg * 2;
const PROMO_W = width - Spacing.lg * 2 - 8;

type HomeIconName =
  | 'hanger'
  | 'iron'
  | 'tshirt-crew'
  | 'magic-staff'
  | 'scale-bathroom'
  | 'shoe-sneaker'
  | 'sofa'
  | 'newspaper-variant-outline'
  | 'bag-personal-outline'
  | 'truck-delivery-outline'
  | 'lightning-bolt-outline'
  | 'gift-outline'
  | 'leaf'
  | 'clipboard-text-outline'
  | 'car-outline'
  | 'factory'
  | 'water-outline'
  | 'weather-windy'
  | 'magnify'
  | 'package-variant-closed'
  | 'motorbike'
  | 'phone-outline'
  | 'map-marker-outline'
  | 'clock-outline'
  | 'bell-outline';

const QUICK_ACTIONS: Array<{ icon: HomeIconName; label: string; screen: string; accent: string }> = [
  { icon: 'package-variant-closed', label: 'Book Pickup', screen: 'BookPickup', accent: '#023c62' },
  { icon: 'clipboard-text-outline', label: 'Orders', screen: 'MyOrders', accent: '#065f46' },
  { icon: 'hanger', label: 'Rate Card', screen: 'RateChart', accent: '#9a3412' },
];

const TRUST_POINTS: Array<{ icon: HomeIconName; title: string; text: string }> = [
  { icon: 'truck-delivery-outline', title: 'Doorstep Flow', text: 'Pickup and drop without chasing updates.' },
  { icon: 'lightning-bolt-outline', title: 'Fast Turnaround', text: 'Express-ready workflows for urgent loads.' },
  { icon: 'leaf', title: 'Fabric Care', text: 'Process-led handling instead of rough batch treatment.' },
];

export default function HomeScreen({ navigation }: any) {
  const { customer } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [promoBannerIdx, setPromoBannerIdx] = useState(0);
  const [serviceTiles, setServiceTiles] = useState<any[]>([]);
  const [promoBanners, setPromoBanners] = useState<any[]>([]);
  const [statusMeta, setStatusMeta] = useState<Record<string, { label: string; icon: HomeIconName }>>({});
  const [activeStatuses, setActiveStatuses] = useState<string[]>([]);
  const [languageLabels, setLanguageLabels] = useState<Record<string, string>>({ ENGLISH: 'English' });
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const bannerScrollRef = useRef<FlatList<any>>(null);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const firstName = customer?.name?.split(' ')[0] || 'there';
  const activeOrderMeta = activeOrder ? statusMeta[activeOrder.status] : null;
  const walletBalance = customer?.walletBalance || 0;
  const referralCode = customer?.referralCode || null;
  const languageLabel = languageLabels[customer?.preferredLanguage || 'ENGLISH'] || 'English';

  const fetchActiveOrder = useCallback(async (silent = false) => {
    if (!silent) setLoadingOrders(true);
    try {
      const result: any = await ordersAPI.getMyOrders(1, 20);
      const orders = result?.data?.orders || result?.orders || [];
      const active = orders.find((o: any) => activeStatuses.includes(o.status)) || null;
      setActiveOrder(active);
    } catch {
      setActiveOrder(null);
    } finally {
      setLoadingOrders(false);
      setRefreshing(false);
    }
  }, [activeStatuses]);

  useEffect(() => { fetchActiveOrder(); }, [fetchActiveOrder]);

  useFocusEffect(useCallback(() => {
    fetchActiveOrder(true);
  }, [fetchActiveOrder]));

  useEffect(() => {
    metadataAPI.getAll()
      .then((result: any) => {
        const metadata = result?.metadata || result?.data?.metadata || {};
        setMetadataError(null);
        setServiceTiles(metadata.serviceCategories || []);
        setPromoBanners((metadata.promoBanners || []).map((banner: any, index: number) => ({
          ...banner,
          gradient: [
            ['#023c62', '#035a8f'],
            ['#0f766e', '#115e59'],
            ['#7c2d12', '#c2410c'],
            ['#5b21b6', '#7c3aed'],
          ][index % 4],
          icon: (['truck-delivery-outline', 'leaf', 'gift-outline', 'lightning-bolt-outline'][index % 4]) as HomeIconName,
        })));
        setStatusMeta(Object.fromEntries(
          (metadata.orderStatuses || []).map((item: any) => [
            item.key,
            { label: item.customerLabel || item.label || item.key, icon: (item.icon || 'package-variant-closed') as HomeIconName },
          ])
        ));
        setActiveStatuses(
          (metadata.orderStatuses || [])
            .filter((item: any) => item.customerBucket === 'active')
            .map((item: any) => item.key)
        );
        setLanguageLabels(Object.fromEntries(
          (metadata.languages || []).map((item: any) => [item.value, item.label || item.value])
        ));
      })
      .catch((e: any) => {
        setMetadataError(e?.message || 'Could not load home metadata.');
      });
  }, []);

  useEffect(() => {
    if (promoBanners.length <= 1) return;
    autoScrollTimer.current = setInterval(() => {
      setPromoBannerIdx((prev) => {
        const next = (prev + 1) % promoBanners.length;
        try { bannerScrollRef.current?.scrollToIndex({ index: next, animated: true }); } catch {}
        return next;
      });
    }, 3600);
    return () => {
      if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
    };
  }, [promoBanners.length]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchActiveOrder();
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryLight} />}
      >
        <LinearGradient
          colors={['#022f4e', '#023c62', '#0a5d8d']}
          style={styles.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.heroGlowOne} />
          <View style={styles.heroGlowTwo} />

          <View style={styles.heroTop}>
            <Image source={{ uri: LOGO_WHITE_URL }} style={styles.heroLogo} resizeMode="contain" />
            <TouchableOpacity style={styles.avatar} onPress={() => navigation.navigate('Profile')} activeOpacity={0.85}>
              {customer?.name ? (
                <Text style={styles.avatarText}>{customer.name[0].toUpperCase()}</Text>
              ) : (
                <Ionicons name="person-outline" size={20} color={Colors.white} />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.heroCopyBlock}>
            <Text style={styles.heroEyebrow}>Laundry concierge</Text>
            <Text style={styles.heroTitle}>Good day, {firstName}</Text>
            <Text style={styles.heroSubtitle}>
              Pickup, care, tracking, and delivery in one clean flow.
            </Text>
          </View>

          <View style={styles.quickRail}>
            {QUICK_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.screen}
                style={styles.quickCard}
                onPress={() => navigation.navigate(action.screen)}
                activeOpacity={0.88}
              >
                <View style={[styles.quickIconBadge, { backgroundColor: action.accent }]}>
                  <MaterialCommunityIcons name={action.icon} size={18} color={Colors.white} />
                </View>
                <Text style={styles.quickCardLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.heroStatusCard}>
            {loadingOrders ? (
              <Text style={styles.heroStatusLoading}>Checking your latest order…</Text>
            ) : activeOrder ? (
              <>
                <View style={styles.heroStatusTop}>
                  <View style={styles.heroStatusTitleWrap}>
                    <View style={styles.liveDot} />
                    <Text style={styles.heroStatusLabel}>Active order</Text>
                  </View>
                  <TouchableOpacity onPress={() => navigation.navigate('MyOrders')}>
                    <Text style={styles.heroStatusLink}>All orders</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.heroStatusRow}>
                  <View style={styles.heroStatusMain}>
                    <View style={styles.heroStatusIcon}>
                      <MaterialCommunityIcons name={activeOrderMeta?.icon || 'package-variant-closed'} size={18} color={Colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.heroStatusName}>{activeOrderMeta?.label || activeOrder.status}</Text>
                      <Text style={styles.heroStatusOrderNo}>{activeOrder.orderNumber}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.trackButton}
                    onPress={() => navigation.navigate('OrderTracking', { orderId: activeOrder.id })}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.trackButtonText}>Track</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.emptyHeroTitle}>Nothing active right now</Text>
                <Text style={styles.emptyHeroText}>
                  Schedule a pickup and we will take it from doorstep to delivery.
                </Text>
                <AnimatedButton style={styles.primaryHeroCta} onPress={() => navigation.navigate('BookPickup')} activeOpacity={0.88}>
                  <Text style={styles.primaryHeroCtaText}>Book a Pickup</Text>
                </AnimatedButton>
              </>
            )}
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {metadataError ? (
            <View style={styles.metadataNotice}>
              <Text style={styles.metadataNoticeText}>{metadataError}</Text>
            </View>
          ) : null}
          <StaggerItem index={0}>
          <View style={styles.section}>
            <View style={styles.accountStrip}>
              <AnimatedButton style={[styles.accountCard, styles.accountCardPrimary]} onPress={() => navigation.navigate('Wallet')} activeOpacity={0.9}>
                <View style={styles.accountCardTop}>
                  <Text style={styles.accountLabelLight}>Wallet balance</Text>
                  <MaterialCommunityIcons name="gift-outline" size={18} color={Colors.white} />
                </View>
                <Text style={styles.accountValueLight}>₹{walletBalance.toLocaleString('en-IN')}</Text>
                <Text style={styles.accountMetaLight}>Credits auto-apply where eligible.</Text>
              </AnimatedButton>

              <View style={styles.accountColumn}>
                <AnimatedButton style={styles.accountCard} onPress={() => navigation.navigate('Refer')} activeOpacity={0.9}>
                  <View style={styles.accountMiniTop}>
                    <Text style={styles.accountLabel}>Referral</Text>
                    <Feather name="arrow-up-right" size={14} color={Colors.primary} />
                  </View>
                  <Text style={styles.accountValueSmall}>{referralCode || 'Unlock code'}</Text>
                  <Text style={styles.accountMeta}>{referralCode ? 'Share and earn wallet credits.' : 'Open Refer & Earn to generate.'}</Text>
                </AnimatedButton>

                <AnimatedButton style={styles.accountCard} onPress={() => navigation.navigate('Profile')} activeOpacity={0.9}>
                  <View style={styles.accountMiniTop}>
                    <Text style={styles.accountLabel}>Preferences</Text>
                    <MaterialCommunityIcons name="bell-outline" size={14} color={Colors.primary} />
                  </View>
                  <Text style={styles.accountValueSmall}>{languageLabel}</Text>
                  <Text style={styles.accountMeta}>Notifications and profile settings.</Text>
                </AnimatedButton>
              </View>
            </View>
          </View>
          </StaggerItem>

          <StaggerItem index={1}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Services</Text>
              <TouchableOpacity onPress={() => navigation.navigate('RateChart')}>
                <Text style={styles.sectionLink}>See rates</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.servicesGrid}>
              {serviceTiles.map((service: any, index: number) => {
                const featured = index === 0;
                const cardStyle = featured ? styles.serviceCardFeatured : styles.serviceCard;
                return (
                  <AnimatedButton
                    key={service.id}
                    style={[cardStyle, { backgroundColor: service.lightColor || '#eef4fa' }]}
                    onPress={() => service.value === 'DAILY_IRON'
                      ? navigation.navigate('IronService')
                      : navigation.navigate('RateChart', { serviceId: service.id, serviceLabel: service.value || service.label })}
                    activeOpacity={0.9}
                  >
                    <View style={styles.serviceCardTop}>
                      <View style={[styles.serviceIconWrap, { backgroundColor: service.color || Colors.primary }]}>
                        <MaterialCommunityIcons name={service.icon as HomeIconName} size={featured ? 24 : 20} color={Colors.white} />
                      </View>
                      <View style={[styles.serviceArrowBadge, { backgroundColor: service.color || Colors.primary }]}>
                        <Feather name="arrow-up-right" size={14} color={Colors.white} />
                      </View>
                    </View>

                    <Text style={[styles.serviceLabel, { color: service.color || Colors.primary }]}>{service.label}</Text>
                    <Text style={styles.serviceSub}>
                      {featured ? 'Most requested doorstep care service.' : 'Tap to explore pricing and booking.'}
                    </Text>
                  </AnimatedButton>
                );
              })}
            </View>
          </View>
          </StaggerItem>

          {!!promoBanners.length && (
            <StaggerItem index={2}>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Right Now</Text>
                <Text style={styles.sectionHint}>Auto-updated</Text>
              </View>

              <FlatList
                ref={bannerScrollRef}
                data={promoBanners}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.id}
                onMomentumScrollEnd={(e) => {
                  setPromoBannerIdx(Math.round(e.nativeEvent.contentOffset.x / PROMO_W));
                }}
                renderItem={({ item }) => (
                  <LinearGradient colors={item.gradient} style={styles.promoCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <View style={styles.promoCardTop}>
                      <View style={styles.promoIconWrap}>
                        <MaterialCommunityIcons name={item.icon} size={22} color={Colors.white} />
                      </View>
                      <AnimatedButton style={styles.promoCta} onPress={() => navigation.navigate('BookPickup')} activeOpacity={0.85}>
                        <Text style={styles.promoCtaText}>{item.cta}</Text>
                      </AnimatedButton>
                    </View>
                    <Text style={styles.promoTitle}>{item.title}</Text>
                    <Text style={styles.promoSub}>{item.subtitle}</Text>
                  </LinearGradient>
                )}
              />

              <View style={styles.promoDots}>
                {promoBanners.map((_: any, index: number) => (
                  <View key={index} style={[styles.promoDot, index === promoBannerIdx && styles.promoDotActive]} />
                ))}
              </View>
            </View>
            </StaggerItem>
          )}

          <StaggerItem index={3}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Why Customers Stay</Text>
            <View style={styles.trustStack}>
              {TRUST_POINTS.map((point, index) => (
                <StaggerItem key={point.title} index={index}>
                <View style={styles.trustCard}>
                  <View style={styles.trustIcon}>
                    <MaterialCommunityIcons name={point.icon} size={18} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.trustTitle}>{point.title}</Text>
                    <Text style={styles.trustText}>{point.text}</Text>
                  </View>
                </View>
                </StaggerItem>
              ))}
            </View>
          </View>
          </StaggerItem>

          <StaggerItem index={4}>
          <View style={[styles.section, styles.conciergeSection]}>
            <View style={styles.conciergeCard}>
              <View style={styles.conciergeTop}>
                <Image source={{ uri: LOGO_BLUE_URL }} style={styles.conciergeLogo} resizeMode="contain" />
                <View style={styles.conciergeBadge}>
                  <Text style={styles.conciergeBadgeText}>Mumbai</Text>
                </View>
              </View>

              <Text style={styles.conciergeTitle}>Need help with a custom request?</Text>
              <Text style={styles.conciergeText}>
                Speak with the store team for timings, pickup questions, or special garment handling.
              </Text>

              <View style={styles.conciergeMeta}>
                <View style={styles.conciergeMetaRow}>
                  <MaterialCommunityIcons name="map-marker-outline" size={16} color={Colors.primary} />
                  <Text style={styles.conciergeMetaText}>Near Juhu, Mumbai</Text>
                </View>
                <View style={styles.conciergeMetaRow}>
                  <MaterialCommunityIcons name="clock-outline" size={16} color={Colors.primary} />
                  <Text style={styles.conciergeMetaText}>Mon - Sat 8:00 AM - 9:00 PM</Text>
                </View>
              </View>

              <View style={styles.conciergeActions}>
                <AnimatedButton style={styles.conciergeCallBtn} onPress={() => Linking.openURL('tel:+917977417014')} activeOpacity={0.88}>
                  <Feather name="phone-call" size={16} color={Colors.white} />
                  <Text style={styles.conciergeCallText}>Call Store</Text>
                </AnimatedButton>
                <AnimatedButton style={styles.conciergeGhostBtn} onPress={() => navigation.navigate('RateChart')} activeOpacity={0.88}>
                  <Text style={styles.conciergeGhostText}>Browse Prices</Text>
                </AnimatedButton>
              </View>
            </View>
          </View>
          </StaggerItem>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#edf3f8' },

  hero: {
    paddingTop: Platform.OS === 'ios' ? 58 : 36,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 30,
    overflow: 'hidden',
  },
  heroGlowOne: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -90,
    right: -40,
  },
  heroGlowTwo: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(184,208,232,0.12)',
    bottom: 20,
    left: -50,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLogo: {
    width: 156,
    height: 32,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: Fonts.display,
    fontSize: FontSize.md,
    color: Colors.white,
  },
  heroCopyBlock: {
    marginTop: 26,
    marginBottom: 22,
  },
  heroEyebrow: {
    fontFamily: Fonts.medium,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.72)',
    textTransform: 'uppercase',
    letterSpacing: 1.3,
    marginBottom: 10,
  },
  heroTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 34,
    lineHeight: 38,
    color: Colors.white,
    marginBottom: 10,
  },
  heroSubtitle: {
    fontFamily: Fonts.body,
    fontSize: FontSize.base,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.76)',
    maxWidth: CONTENT_W - 30,
  },
  quickRail: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  quickCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 18,
    padding: 14,
    minHeight: 84,
    justifyContent: 'space-between',
  },
  quickIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickCardLabel: {
    fontFamily: Fonts.display,
    fontSize: FontSize.sm,
    color: Colors.textDark,
  },
  heroStatusCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 24,
    padding: 18,
    ...Shadow.md,
  },
  heroStatusLoading: {
    fontFamily: Fonts.body,
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
  heroStatusTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heroStatusTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#16a34a',
  },
  heroStatusLabel: {
    fontFamily: Fonts.medium,
    fontSize: FontSize.sm,
    color: Colors.textMid,
  },
  heroStatusLink: {
    fontFamily: Fonts.medium,
    fontSize: FontSize.sm,
    color: Colors.primary,
  },
  heroStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroStatusMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroStatusIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStatusName: {
    fontFamily: Fonts.display,
    fontSize: FontSize.base,
    color: Colors.textDark,
  },
  heroStatusOrderNo: {
    fontFamily: Fonts.body,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 3,
  },
  trackButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  trackButtonText: {
    fontFamily: Fonts.display,
    fontSize: FontSize.sm,
    color: Colors.white,
  },
  emptyHeroTitle: {
    fontFamily: Fonts.display,
    fontSize: FontSize.lg,
    color: Colors.textDark,
    marginBottom: 6,
  },
  emptyHeroText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.sm,
    lineHeight: 20,
    color: Colors.textMuted,
    marginBottom: 16,
  },
  primaryHeroCta: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryHeroCtaText: {
    fontFamily: Fonts.display,
    fontSize: FontSize.sm,
    color: Colors.white,
  },

  content: {
    paddingTop: 16,
    paddingBottom: 104,
  },
  metadataNotice: {
    marginHorizontal: Spacing.lg,
    marginBottom: 16,
    backgroundColor: '#fff4e5',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f5d7a1',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  metadataNoticeText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.sm,
    lineHeight: 20,
    color: '#9a3412',
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: Fonts.display,
    fontSize: FontSize.lg,
    color: Colors.textDark,
  },
  sectionLink: {
    fontFamily: Fonts.medium,
    fontSize: FontSize.sm,
    color: Colors.primary,
  },
  sectionHint: {
    fontFamily: Fonts.body,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  accountStrip: {
    flexDirection: 'row',
    gap: 12,
  },
  accountCardPrimary: {
    flex: 1.08,
    backgroundColor: Colors.primary,
    borderColor: 'rgba(2,60,98,0.08)',
  },
  accountColumn: {
    flex: 0.92,
    gap: 12,
  },
  accountCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  accountCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  accountMiniTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  accountLabelLight: {
    fontFamily: Fonts.medium,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.76)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  accountValueLight: {
    fontFamily: Fonts.displayBold,
    fontSize: 30,
    color: Colors.white,
    marginBottom: 8,
  },
  accountMetaLight: {
    fontFamily: Fonts.body,
    fontSize: FontSize.sm,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.76)',
  },
  accountLabel: {
    fontFamily: Fonts.medium,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  accountValueSmall: {
    fontFamily: Fonts.display,
    fontSize: FontSize.base,
    color: Colors.textDark,
    marginBottom: 4,
  },
  accountMeta: {
    fontFamily: Fonts.body,
    fontSize: FontSize.xs,
    lineHeight: 17,
    color: Colors.textMuted,
  },

  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  serviceCardFeatured: {
    width: CONTENT_W,
    borderRadius: 24,
    padding: 18,
    minHeight: 158,
    borderWidth: 1,
    borderColor: 'rgba(2,60,98,0.08)',
    ...Shadow.sm,
  },
  serviceCard: {
    width: (CONTENT_W - 12) / 2,
    borderRadius: 20,
    padding: 16,
    minHeight: 150,
    borderWidth: 1,
    borderColor: 'rgba(2,60,98,0.08)',
    ...Shadow.sm,
  },
  serviceCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  serviceIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceArrowBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceLabel: {
    fontFamily: Fonts.display,
    fontSize: FontSize.base,
    lineHeight: 20,
    marginBottom: 8,
  },
  serviceSub: {
    fontFamily: Fonts.body,
    fontSize: FontSize.xs,
    lineHeight: 18,
    color: Colors.textMid,
  },

  promoCard: {
    width: PROMO_W,
    borderRadius: 24,
    padding: 20,
    minHeight: 164,
    marginRight: 8,
  },
  promoCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  promoIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoCta: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  promoCtaText: {
    fontFamily: Fonts.medium,
    fontSize: FontSize.xs,
    color: Colors.white,
  },
  promoTitle: {
    fontFamily: Fonts.display,
    fontSize: FontSize.lg,
    lineHeight: 24,
    color: Colors.white,
    marginBottom: 8,
    maxWidth: '86%',
  },
  promoSub: {
    fontFamily: Fonts.body,
    fontSize: FontSize.sm,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.78)',
    maxWidth: '88%',
  },
  promoDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  promoDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#c8d7e5',
  },
  promoDotActive: {
    width: 22,
    backgroundColor: Colors.primary,
  },

  trustStack: {
    gap: 12,
    marginTop: 14,
  },
  trustCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  trustIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustTitle: {
    fontFamily: Fonts.display,
    fontSize: FontSize.base,
    color: Colors.textDark,
    marginBottom: 4,
  },
  trustText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.sm,
    lineHeight: 19,
    color: Colors.textMuted,
  },

  conciergeSection: {
    marginBottom: 0,
  },
  conciergeCard: {
    backgroundColor: Colors.white,
    borderRadius: 26,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.md,
  },
  conciergeTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  conciergeLogo: {
    width: 148,
    height: 30,
  },
  conciergeBadge: {
    backgroundColor: Colors.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  conciergeBadgeText: {
    fontFamily: Fonts.medium,
    fontSize: FontSize.xs,
    color: Colors.primary,
  },
  conciergeTitle: {
    fontFamily: Fonts.display,
    fontSize: FontSize.lg,
    lineHeight: 24,
    color: Colors.textDark,
    marginBottom: 8,
  },
  conciergeText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.sm,
    lineHeight: 20,
    color: Colors.textMid,
    marginBottom: 16,
  },
  conciergeMeta: {
    gap: 10,
    marginBottom: 18,
  },
  conciergeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  conciergeMetaText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.sm,
    color: Colors.textMid,
  },
  conciergeActions: {
    flexDirection: 'row',
    gap: 10,
  },
  conciergeCallBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  conciergeCallText: {
    fontFamily: Fonts.display,
    fontSize: FontSize.sm,
    color: Colors.white,
  },
  conciergeGhostBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conciergeGhostText: {
    fontFamily: Fonts.medium,
    fontSize: FontSize.sm,
    color: Colors.primary,
  },
});
