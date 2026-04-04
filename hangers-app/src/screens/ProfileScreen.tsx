// ─────────────────────────────────────────────────────────────────────────────
// PROFILE SCREEN — Customer account, name, addresses, logout
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, TextInput, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { addressAPI, authAPI, metadataAPI } from '../services/api';
import { Colors, Spacing, Radius, FontSize, Shadow, Fonts } from '../utils/theme';
import PageMotion from '../components/PageMotion';
import AnimatedButton from '../components/AnimatedButton';

const MENU_ITEMS = [
  { icon: 'iron', label: 'Daily Iron',            screen: 'IronService' },
  { icon: 'package-variant-closed', label: 'My Orders',             screen: 'MyOrders' },
  { icon: 'map-marker-outline', label: 'Saved Addresses',       screen: 'Addresses' },
  { icon: 'gift-outline', label: 'Refer & Earn',          screen: 'Refer' },
  { icon: 'wallet-outline', label: 'My Wallet',             screen: 'Wallet' },
  { icon: 'clipboard-text-outline', label: 'Rate Chart',            screen: 'RateChart' },
  { icon: 'bell-outline', label: 'Notification Settings', screen: 'NotifPrefs' },
  { icon: 'credit-card-outline', label: 'Payment History',       screen: 'PaymentHistory' },
  { icon: 'headset', label: 'Help & Support',        screen: 'Support' },
];

export default function ProfileScreen({ navigation }: any) {
  const { customer, logout, refreshProfile } = useAuth();
  const [isEditing,   setIsEditing]   = useState(false);
  const [editName,    setEditName]    = useState(customer?.name || '');
  const [editLanguage,setEditLanguage]= useState<string>(customer?.preferredLanguage || 'ENGLISH');
  const [isSaving,    setIsSaving]    = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [languageOptions, setLanguageOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [addresses, setAddresses] = useState<any[]>(customer?.addresses || []);

  React.useEffect(() => {
    setEditName(customer?.name || '');
    setEditLanguage(customer?.preferredLanguage || 'ENGLISH');
    setAddresses(customer?.addresses || []);
  }, [customer?.name, customer?.preferredLanguage, customer?.addresses]);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;

      const loadProfileData = async () => {
        await refreshProfile();
        try {
          const response: any = await addressAPI.getAll();
          if (active) setAddresses(response?.addresses || response?.data?.addresses || []);
        } catch {
          if (active) setAddresses(customer?.addresses || []);
        }
      };

      loadProfileData();

      return () => {
        active = false;
      };
    }, [refreshProfile, customer?.addresses])
  );

  React.useEffect(() => {
    metadataAPI.getAll()
      .then((response: any) => {
        const metadata = response?.metadata || response?.data?.metadata || {};
        setLanguageOptions(metadata.languages || []);
      })
      .catch(() => {});
  }, []);

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Name Required', 'Please enter your full name.');
      return;
    }
    setIsSaving(true);
    try {
      await authAPI.updateProfile({
        name: editName.trim(),
        preferredLanguage: editLanguage as 'ENGLISH' | 'HINDI' | 'MARATHI',
      });
      await refreshProfile();
      setIsEditing(false);
      Alert.alert('Saved', 'Profile updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            setIsLoggingOut(true);
            await logout();
          },
        },
      ]
    );
  };

  const initials = customer?.name
    ? customer.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  const ironStatus = customer?.ironSubscription?.applicationStatus || customer?.ironSubStatus || null;
  const profileAddresses = addresses.length ? addresses : (customer?.addresses || []);
  const defaultAddress = profileAddresses.find((address) => address.isDefault) || profileAddresses[0] || null;
  const addressText = defaultAddress
    ? [
        defaultAddress.addressLine1,
        defaultAddress.addressLine2,
        defaultAddress.landmark,
        defaultAddress.city,
        defaultAddress.pincode,
      ].filter(Boolean).join(', ')
    : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      <PageMotion style={{ flex: 1 }}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Header ──────────────────────────────────────────── */}
        <LinearGradient colors={['#023c62', '#035a8f']} style={styles.header}>
          <View style={styles.bgCircle} />
          <View style={styles.headerTop}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Profile</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <TouchableOpacity style={styles.editAvatarBtn}>
              <Feather name="camera" size={14} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.customerName}>
            {customer?.name || 'Set your name'}
          </Text>
          <Text style={styles.customerPhone}>+91 {customer?.phone}</Text>
          <View style={styles.memberBadge}>
            <View style={styles.memberBadgeInner}>
              <Ionicons name="sparkles-outline" size={12} color={Colors.primaryLight} />
              <Text style={styles.memberBadgeText}>Hangers Member</Text>
            </View>
          </View>

          <View style={styles.profileStats}>
            <View style={styles.profileStatCard}>
              <Text style={styles.profileStatValue}>{languageOptions.find((option) => option.value === customer?.preferredLanguage)?.label || 'English'}</Text>
              <Text style={styles.profileStatLabel}>Language</Text>
            </View>
            <View style={styles.profileStatCard}>
              <Text style={styles.profileStatValue}>{profileAddresses.length}</Text>
              <Text style={styles.profileStatLabel}>Addresses</Text>
            </View>
            <View style={styles.profileStatCard}>
              <Text style={styles.profileStatValue}>{ironStatus || 'None'}</Text>
              <Text style={styles.profileStatLabel}>Daily Iron</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── Profile Info Card ────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Personal Details</Text>
              {!isEditing ? (
                <TouchableOpacity onPress={() => setIsEditing(true)}>
                  <Text style={styles.editBtn}>Edit</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => setIsEditing(false)}>
                  <Text style={styles.cancelBtn}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>

            {isEditing ? (
              <View style={styles.editForm}>
                <Text style={styles.fieldLabel}>Full Name</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Your full name"
                  placeholderTextColor={Colors.textLight}
                />
                <Text style={styles.fieldLabel}>WhatsApp Language</Text>
                <View style={styles.langRow}>
                  {languageOptions.map((option) => {
                    const active = editLanguage === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[styles.langChip, active && styles.langChipActive]}
                        onPress={() => setEditLanguage(option.value)}
                      >
                        <Text style={[styles.langChipText, active && styles.langChipTextActive]}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <AnimatedButton
                  style={styles.saveBtn}
                  onPress={handleSaveProfile}
                  disabled={isSaving}
                >
                  {isSaving
                    ? <ActivityIndicator color={Colors.white} size="small" />
                    : <Text style={styles.saveBtnText}>Save Changes</Text>
                  }
                </AnimatedButton>
              </View>
            ) : (
              <View style={styles.infoRows}>
                <View style={styles.infoRow}>
                  <Feather name="smartphone" size={20} color={Colors.primary} style={styles.infoIcon} />
                  <View>
                    <Text style={styles.infoLabel}>Mobile Number</Text>
                    <Text style={styles.infoValue}>+91 {customer?.phone}</Text>
                  </View>
                </View>
                <View style={[styles.infoRow, styles.infoRowBorder]}>
                  <Feather name="user" size={20} color={Colors.primary} style={styles.infoIcon} />
                  <View>
                    <Text style={styles.infoLabel}>Full Name</Text>
                    <Text style={styles.infoValue}>{customer?.name || '—  Tap Edit to add'}</Text>
                  </View>
                </View>
                <View style={styles.infoRow}>
                  <Feather name="globe" size={20} color={Colors.primary} style={styles.infoIcon} />
                  <View>
                    <Text style={styles.infoLabel}>WhatsApp Language</Text>
                    <Text style={styles.infoValue}>{languageOptions.find((option) => option.value === customer?.preferredLanguage)?.label || 'English'}</Text>
                  </View>
                </View>
                <View style={[styles.infoRow, styles.infoRowBorder]}>
                  <MaterialCommunityIcons name="iron" size={20} color={Colors.primary} style={styles.infoIcon} />
                  <View>
                    <Text style={styles.infoLabel}>Daily Iron</Text>
                    <Text style={styles.infoValue}>{ironStatus || '—'}</Text>
                  </View>
                </View>
                <View style={styles.infoRow}>
                  <MaterialCommunityIcons name="map-marker-outline" size={20} color={Colors.primary} style={styles.infoIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Default Address</Text>
                    <Text style={styles.infoValue}>{addressText || '—'}</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* ── Menu Items ───────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.card}>
            {MENU_ITEMS.map((item, idx) => (
              <AnimatedButton
                key={item.screen}
                style={[styles.menuRow, idx < MENU_ITEMS.length - 1 && styles.menuRowBorder]}
                onPress={() => {
                  if (item.screen === 'Support') {
                    Alert.alert('Help & Support', 'Call or WhatsApp us:', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Call', onPress: () => Linking.openURL('tel:+917977417014') },
                      { text: 'WhatsApp', onPress: () => Linking.openURL('https://wa.me/917977417014') },
                    ]);
                  } else {
                    navigation.navigate(item.screen);
                  }
                }}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name={item.icon as any} size={20} color={Colors.primary} style={styles.menuIcon} />
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuArrow}>›</Text>
              </AnimatedButton>
            ))}
          </View>
        </View>

        {/* ── Logout ───────────────────────────────────────────── */}
        <View style={[styles.section, { marginBottom: 60 }]}>
          <AnimatedButton
            style={styles.logoutBtn}
            onPress={handleLogout}
            disabled={isLoggingOut}
            activeOpacity={0.8}
          >
            {isLoggingOut
              ? <ActivityIndicator color={Colors.error} size="small" />
              : <>
                  <MaterialCommunityIcons name="logout" size={18} color={Colors.error} style={styles.logoutIcon} />
                  <Text style={styles.logoutText}>Log Out</Text>
                </>
            }
          </AnimatedButton>

          <Text style={styles.versionText}>
            Hangers Clothes Spa  •  v1.0.0{'\n'}
            Care in Every Clean
          </Text>
        </View>

      </ScrollView>
      </PageMotion>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.offWhite },

  header:      { paddingTop: 44, paddingBottom: 20, alignItems:'center', overflow:'hidden', paddingHorizontal: Spacing.lg },
  bgCircle:    { position:'absolute', top:-50, right:-50, width:180, height:180, borderRadius:90, backgroundColor:'rgba(3,90,143,0.4)' },
  headerTop:   { width:'100%', flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:14 },
  backBtn:     { width:38, height:38, borderRadius:19, backgroundColor:'rgba(255,255,255,0.14)', alignItems:'center', justifyContent:'center' },
  backText:    { fontFamily:'DMSans_500Medium', fontSize:22, color:Colors.white },
  headerTitle: { fontFamily: Fonts.bold, fontSize: FontSize.base, color: Colors.white },
  headerSpacer:{ width:38, height:38 },

  avatarWrap:  { position:'relative', marginBottom:10 },
  avatar:      { width:74, height:74, borderRadius:37, backgroundColor:'rgba(255,255,255,0.18)', borderWidth:2, borderColor:'rgba(184,208,232,0.4)', alignItems:'center', justifyContent:'center' },
  avatarText:  { fontFamily:'Syne_800ExtraBold', fontSize:26, color:Colors.white },
  editAvatarBtn:{ position:'absolute', bottom:0, right:0, width:30, height:30, borderRadius:15, backgroundColor:Colors.white, alignItems:'center', justifyContent:'center', ...Shadow.sm },
  customerName: { fontFamily:'Syne_700Bold', fontSize:18, color:Colors.white, marginBottom:2 },
  customerPhone:{ fontFamily:'DMSans_400Regular', fontSize:12, color:Colors.primaryLight, marginBottom:10 },
  memberBadge:  { backgroundColor:'rgba(184,208,232,0.18)', borderRadius:Radius.full, borderWidth:1, borderColor:'rgba(184,208,232,0.3)', paddingHorizontal:14, paddingVertical:5 },
  memberBadgeInner:{ flexDirection:'row', alignItems:'center', gap:6 },
  memberBadgeText:{ fontFamily:'DMSans_500Medium', fontSize:FontSize.xs, color:Colors.primaryLight, letterSpacing:0.5 },
  profileStats:{ width:'100%', flexDirection:'row', gap:8, marginTop:14 },
  profileStatCard:{ flex:1, backgroundColor:'rgba(255,255,255,0.12)', borderWidth:1, borderColor:'rgba(255,255,255,0.14)', borderRadius:16, paddingVertical:10, paddingHorizontal:10, alignItems:'center' },
  profileStatValue:{ fontFamily: Fonts.medium, fontSize:12, color:Colors.white, textAlign:'center' },
  profileStatLabel:{ fontFamily: Fonts.body, fontSize:10, color:'rgba(255,255,255,0.72)', marginTop:4 },

  section: { paddingHorizontal:Spacing.lg, marginTop:Spacing.lg },
  card:    { backgroundColor:Colors.white, borderRadius:Radius.lg, ...Shadow.sm, borderWidth:1, borderColor:Colors.border, overflow:'hidden' },
  cardHeader:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:Spacing.md, borderBottomWidth:1, borderColor:Colors.borderLight },
  cardTitle: { fontFamily:'Syne_700Bold', fontSize:FontSize.base, color:Colors.textDark },
  editBtn:   { fontFamily:'DMSans_500Medium', fontSize:FontSize.sm, color:Colors.primary },
  cancelBtn: { fontFamily:'DMSans_500Medium', fontSize:FontSize.sm, color:Colors.error },

  // Edit form
  editForm:    { padding:Spacing.md },
  fieldLabel:  { fontFamily:'DMSans_500Medium', fontSize:FontSize.xs, color:Colors.textMuted, marginBottom:6, marginTop:8, textTransform:'uppercase', letterSpacing:0.5 },
  fieldInput:  { backgroundColor:Colors.accent, borderRadius:Radius.sm, borderWidth:1, borderColor:Colors.border, paddingHorizontal:14, paddingVertical:13, fontFamily:'DMSans_400Regular', fontSize:FontSize.base, color:Colors.textDark, marginBottom:4 },
  langRow:     { flexDirection:'row', gap:8, marginTop:2, marginBottom:4 },
  langChip:    { flex:1, borderRadius:Radius.sm, borderWidth:1, borderColor:Colors.border, backgroundColor:Colors.white, paddingVertical:12, alignItems:'center' },
  langChipActive:{ backgroundColor:Colors.primary, borderColor:Colors.primary },
  langChipText:{ fontFamily:'DMSans_500Medium', fontSize:FontSize.sm, color:Colors.textMid },
  langChipTextActive:{ color:Colors.white },
  saveBtn:     { backgroundColor:Colors.primary, borderRadius:Radius.md, paddingVertical:14, alignItems:'center', marginTop:16, ...Shadow.sm },
  saveBtnText: { fontFamily:'Syne_700Bold', fontSize:FontSize.base, color:Colors.white },

  // Info rows
  infoRows:      { padding:Spacing.md },
  infoRow:       { flexDirection:'row', alignItems:'center', gap:14, paddingVertical:10 },
  infoRowBorder: { borderTopWidth:1, borderBottomWidth:1, borderColor:Colors.borderLight },
  infoIcon:      { width:26, textAlign:'center' },
  infoLabel:     { fontFamily:'DMSans_400Regular', fontSize:FontSize.xs, color:Colors.textMuted, marginBottom:2 },
  infoValue:     { fontFamily:'DMSans_500Medium', fontSize:FontSize.base, color:Colors.textDark },

  // Menu
  menuRow:       { flexDirection:'row', alignItems:'center', gap:14, padding:Spacing.md },
  menuRowBorder: { borderBottomWidth:1, borderColor:Colors.borderLight },
  menuIcon:      { width:26, textAlign:'center' },
  menuLabel:     { flex:1, fontFamily:'DMSans_400Regular', fontSize:FontSize.base, color:Colors.textDark },
  menuArrow:     { fontFamily:'DMSans_400Regular', fontSize:22, color:Colors.textLight },

  // Logout
  logoutBtn:   { backgroundColor:Colors.white, borderRadius:Radius.lg, borderWidth:1, borderColor:Colors.border, padding:Spacing.md, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10, ...Shadow.sm },
  logoutIcon:  {},
  logoutText:  { fontFamily:'Syne_700Bold', fontSize:FontSize.base, color:Colors.error },
  versionText: { textAlign:'center', fontFamily:'DMSans_400Regular', fontSize:FontSize.xs, color:Colors.textLight, marginTop:20, lineHeight:18 },
});
