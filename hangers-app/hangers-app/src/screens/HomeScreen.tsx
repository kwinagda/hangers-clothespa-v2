// ─────────────────────────────────────────────────────────────────────────────
// HOME SCREEN — Customer dashboard with services, quick actions, order status
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, Dimensions, RefreshControl
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../hooks/useAuth';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../utils/theme';

const { width } = Dimensions.get('window');
const CARD_W = (width - Spacing.lg * 2 - 12) / 2;

// ── Service cards data ────────────────────────────────────────────────────────
const SERVICES = [
  { id: 'dry_clean',     icon: '🧺', label: 'Dry Clean',      color: '#023c62', lightColor: '#E8F0F7' },
  { id: 'steam_iron',    icon: '♨️', label: 'Steam Ironing',  color: '#035a8f', lightColor: '#EBF4FF' },
  { id: 'normal_iron',   icon: '👔', label: 'Normal Ironing', color: '#046a9e', lightColor: '#E8F2F8' },
  { id: 'laundry',       icon: '⚖️', label: 'Laundry / KG',  color: '#02304f', lightColor: '#E6EFF5' },
  { id: 'shoe_clean',    icon: '👟', label: 'Shoe Cleaning',  color: '#014e80', lightColor: '#EAF3FA' },
  { id: 'sofa_clean',    icon: '🛋️', label: 'Sofa Cleaning',  color: '#023c62', lightColor: '#E8F0F7' },
  { id: 'roll_press',    icon: '📰', label: 'Roll Press',     color: '#035a8f', lightColor: '#EBF4FF' },
  { id: 'accessories',   icon: '🎒', label: 'Accessories',    color: '#046a9e', lightColor: '#E8F2F8' },
];

const QUICK_ACTIONS = [
  { icon: '📦', label: 'Book Pickup',  screen: 'BookPickup',  primary: true },
  { icon: '📋', label: 'My Orders',    screen: 'MyOrders',    primary: false },
  { icon: '💰', label: 'Rate Chart',   screen: 'RateChart',   primary: false },
  { icon: '👤', label: 'Profile',      screen: 'Profile',     primary: false },
];

export default function HomeScreen({ navigation }: any) {
  const { customer, logout } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const firstName = customer?.name?.split(' ')[0] || 'there';

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleServicePress = (service: typeof SERVICES[0]) => {
    navigation.navigate('RateChart', { serviceId: service.id, serviceLabel: service.label });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryLight} />}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <LinearGradient
          colors={['#023c62', '#035a8f']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.bgCircle} />

          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>Good day, {firstName} 👋</Text>
              <Text style={styles.shopTag}>Hangers Clothes Spa</Text>
            </View>
            <TouchableOpacity style={styles.avatar} onPress={() => navigation.navigate('Profile')}>
              <Text style={styles.avatarText}>
                {customer?.name ? customer.name[0].toUpperCase() : '👤'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Quick actions */}
          <View style={styles.quickActions}>
            {QUICK_ACTIONS.map(action => (
              <TouchableOpacity
                key={action.screen}
                style={[styles.quickBtn, action.primary && styles.quickBtnPrimary]}
                onPress={() => navigation.navigate(action.screen)}
                activeOpacity={0.8}
              >
                <Text style={styles.quickIcon}>{action.icon}</Text>
                <Text style={[styles.quickLabel, action.primary && styles.quickLabelPrimary]}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </LinearGradient>

        {/* ── Active Order Banner (placeholder) ─────────────── */}
        <View style={styles.section}>
          <View style={styles.orderBanner}>
            <View style={styles.orderBannerLeft}>
              <View style={styles.orderDot} />
              <View>
                <Text style={styles.orderBannerTitle}>No active orders</Text>
                <Text style={styles.orderBannerSub}>Book a pickup to get started</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.orderBannerBtn}
              onPress={() => navigation.navigate('BookPickup')}
            >
              <Text style={styles.orderBannerBtnText}>Book Now</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Services Grid ──────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Our Services</Text>
            <TouchableOpacity onPress={() => navigation.navigate('RateChart')}>
              <Text style={styles.sectionLink}>View Prices →</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.servicesGrid}>
            {SERVICES.map(service => (
              <TouchableOpacity
                key={service.id}
                style={[styles.serviceCard, { backgroundColor: service.lightColor }]}
                onPress={() => handleServicePress(service)}
                activeOpacity={0.85}
              >
                <Text style={styles.serviceEmoji}>{service.icon}</Text>
                <Text style={[styles.serviceLabel, { color: service.color }]}>
                  {service.label}
                </Text>
                <View style={[styles.serviceArrow, { backgroundColor: service.color }]}>
                  <Text style={styles.serviceArrowText}>→</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Why Hangers strip ──────────────────────────────── */}
        <View style={styles.section}>
          <LinearGradient
            colors={['#023c62', '#046a9e']}
            style={styles.whyCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
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

        {/* ── Contact strip ──────────────────────────────────── */}
        <View style={[styles.section, { marginBottom: 100 }]}>
          <View style={styles.contactCard}>
            <Text style={styles.contactTitle}>Need Help?</Text>
            <Text style={styles.contactSub}>Call or WhatsApp us anytime</Text>
            <Text style={styles.contactPhone}>+91 7977417014</Text>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.offWhite },

  // Header
  header:      { paddingTop: 56, paddingHorizontal: Spacing.lg, paddingBottom: 28, overflow: 'hidden' },
  bgCircle:    { position:'absolute', top:-60, right:-60, width:200, height:200, borderRadius:100, backgroundColor:'rgba(3,90,143,0.4)' },
  headerTop:   { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom: 24 },
  greeting:    { fontFamily:'Syne_700Bold', fontSize: FontSize.lg, color: Colors.white },
  shopTag:     { fontFamily:'DMSans_400Regular', fontSize: FontSize.xs, color: Colors.primaryLight, marginTop: 2, fontStyle: 'italic' },
  avatar:      { width:44, height:44, borderRadius:22, backgroundColor:'rgba(255,255,255,0.15)', borderWidth:1.5, borderColor:'rgba(184,208,232,0.4)', alignItems:'center', justifyContent:'center' },
  avatarText:  { fontFamily:'Syne_700Bold', fontSize:FontSize.md, color:Colors.white },

  // Quick Actions
  quickActions:      { flexDirection:'row', gap:8 },
  quickBtn:          { flex:1, backgroundColor:'rgba(255,255,255,0.12)', borderRadius:Radius.md, paddingVertical:12, alignItems:'center', borderWidth:1, borderColor:'rgba(184,208,232,0.2)' },
  quickBtnPrimary:   { backgroundColor: Colors.white },
  quickIcon:         { fontSize:20, marginBottom:4 },
  quickLabel:        { fontFamily:'DMSans_500Medium', fontSize:10, color:Colors.primaryLight, textAlign:'center' },
  quickLabelPrimary: { color:Colors.primary },

  // Section
  section:       { paddingHorizontal: Spacing.lg, marginTop: Spacing.lg },
  sectionHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:14 },
  sectionTitle:  { fontFamily:'Syne_700Bold', fontSize:FontSize.md, color:Colors.textDark },
  sectionLink:   { fontFamily:'DMSans_500Medium', fontSize:FontSize.sm, color:Colors.primary },

  // Order banner
  orderBanner:     { backgroundColor:Colors.white, borderRadius:Radius.lg, padding:16, flexDirection:'row', alignItems:'center', justifyContent:'space-between', ...Shadow.sm, borderWidth:1, borderColor:Colors.border },
  orderBannerLeft: { flexDirection:'row', alignItems:'center', gap:12 },
  orderDot:        { width:10, height:10, borderRadius:5, backgroundColor:Colors.textLight },
  orderBannerTitle:{ fontFamily:'DMSans_500Medium', fontSize:FontSize.base, color:Colors.textDark },
  orderBannerSub:  { fontFamily:'DMSans_400Regular', fontSize:FontSize.xs, color:Colors.textMuted, marginTop:2 },
  orderBannerBtn:  { backgroundColor:Colors.primary, borderRadius:Radius.sm, paddingHorizontal:14, paddingVertical:8 },
  orderBannerBtnText: { fontFamily:'DMSans_500Medium', fontSize:FontSize.sm, color:Colors.white },

  // Services
  servicesGrid:  { flexDirection:'row', flexWrap:'wrap', gap:12 },
  serviceCard:   { width:CARD_W, borderRadius:Radius.lg, padding:16, ...Shadow.sm, borderWidth:1, borderColor:'rgba(2,60,98,0.06)' },
  serviceEmoji:  { fontSize:28, marginBottom:10 },
  serviceLabel:  { fontFamily:'Syne_700Bold', fontSize:FontSize.sm, lineHeight:19, marginBottom:12, flex:1 },
  serviceArrow:  { alignSelf:'flex-end', width:26, height:26, borderRadius:13, alignItems:'center', justifyContent:'center' },
  serviceArrowText: { color:Colors.white, fontSize:12, fontWeight:'700' },

  // Why card
  whyCard:   { borderRadius:Radius.lg, padding:20 },
  whyTitle:  { fontFamily:'Syne_700Bold', fontSize:FontSize.md, color:Colors.white, marginBottom:16 },
  whyRow:    { flexDirection:'row', justifyContent:'space-between' },
  whyItem:   { alignItems:'center', flex:1 },
  whyIcon:   { fontSize:22, marginBottom:6 },
  whyText:   { fontFamily:'DMSans_400Regular', fontSize:10, color:Colors.primaryLight, textAlign:'center', lineHeight:14 },

  // Contact
  contactCard:  { backgroundColor:Colors.white, borderRadius:Radius.lg, padding:20, alignItems:'center', borderWidth:1, borderColor:Colors.border, ...Shadow.sm },
  contactTitle: { fontFamily:'Syne_700Bold', fontSize:FontSize.md, color:Colors.textDark, marginBottom:4 },
  contactSub:   { fontFamily:'DMSans_400Regular', fontSize:FontSize.sm, color:Colors.textMuted, marginBottom:10 },
  contactPhone: { fontFamily:'Syne_700Bold', fontSize:FontSize.lg, color:Colors.primary },
});
