// ─────────────────────────────────────────────────────────────────────────────
// PROFILE SCREEN — Customer account, name, addresses, logout
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, TextInput, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../hooks/useAuth';
import { authAPI } from '../services/api';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../utils/theme';

const MENU_ITEMS = [
  { icon: '📦', label: 'My Orders',             screen: 'MyOrders' },
  { icon: '📍', label: 'Saved Addresses',       screen: 'Addresses' },
  { icon: '🎁', label: 'Refer & Earn',          screen: 'Refer' },
  { icon: '💰', label: 'My Wallet',             screen: 'Wallet' },
  { icon: '📋', label: 'Rate Chart',            screen: 'RateChart' },
  { icon: '🔔', label: 'Notification Settings', screen: 'NotifPrefs' },
  { icon: '💳', label: 'Payment History',       screen: 'PaymentHistory' },
  { icon: '💬', label: 'Help & Support',        screen: 'Support' },
];

export default function ProfileScreen({ navigation }: any) {
  const { customer, logout, refreshProfile } = useAuth();
  const [isEditing,   setIsEditing]   = useState(false);
  const [editName,    setEditName]    = useState(customer?.name || '');
  const [editEmail,   setEditEmail]   = useState(customer?.email || '');
  const [isSaving,    setIsSaving]    = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Name Required', 'Please enter your full name.');
      return;
    }
    setIsSaving(true);
    try {
      await authAPI.updateProfile({ name: editName.trim(), email: editEmail.trim() || undefined });
      await refreshProfile();
      setIsEditing(false);
      Alert.alert('Saved', 'Profile updated successfully ✓');
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Header ──────────────────────────────────────────── */}
        <LinearGradient colors={['#023c62', '#035a8f']} style={styles.header}>
          <View style={styles.bgCircle} />
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>

          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <TouchableOpacity style={styles.editAvatarBtn}>
              <Text style={styles.editAvatarIcon}>📷</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.customerName}>
            {customer?.name || 'Set your name'}
          </Text>
          <Text style={styles.customerPhone}>+91 {customer?.phone}</Text>
          <View style={styles.memberBadge}>
            <Text style={styles.memberBadgeText}>✦ Hangers Member</Text>
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
                <Text style={styles.fieldLabel}>Email (optional)</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="your@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor={Colors.textLight}
                />
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSaveProfile}
                  disabled={isSaving}
                >
                  {isSaving
                    ? <ActivityIndicator color={Colors.white} size="small" />
                    : <Text style={styles.saveBtnText}>Save Changes</Text>
                  }
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.infoRows}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoIcon}>📱</Text>
                  <View>
                    <Text style={styles.infoLabel}>Mobile Number</Text>
                    <Text style={styles.infoValue}>+91 {customer?.phone}</Text>
                  </View>
                </View>
                <View style={[styles.infoRow, styles.infoRowBorder]}>
                  <Text style={styles.infoIcon}>👤</Text>
                  <View>
                    <Text style={styles.infoLabel}>Full Name</Text>
                    <Text style={styles.infoValue}>{customer?.name || '—  Tap Edit to add'}</Text>
                  </View>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoIcon}>✉️</Text>
                  <View>
                    <Text style={styles.infoLabel}>Email</Text>
                    <Text style={styles.infoValue}>{customer?.email || '—  Tap Edit to add'}</Text>
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
              <TouchableOpacity
                key={item.screen}
                style={[styles.menuRow, idx < MENU_ITEMS.length - 1 && styles.menuRowBorder]}
                onPress={() => {
                  if (item.screen === 'Support') {
                    Alert.alert('Help & Support', 'Call or WhatsApp us:', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: '📞 Call', onPress: () => Linking.openURL('tel:+917977417014') },
                      { text: '💬 WhatsApp', onPress: () => Linking.openURL('https://wa.me/917977417014') },
                    ]);
                  } else {
                    navigation.navigate(item.screen);
                  }
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.menuIcon}>{item.icon}</Text>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Logout ───────────────────────────────────────────── */}
        <View style={[styles.section, { marginBottom: 60 }]}>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={handleLogout}
            disabled={isLoggingOut}
            activeOpacity={0.8}
          >
            {isLoggingOut
              ? <ActivityIndicator color={Colors.error} size="small" />
              : <>
                  <Text style={styles.logoutIcon}>🚪</Text>
                  <Text style={styles.logoutText}>Log Out</Text>
                </>
            }
          </TouchableOpacity>

          <Text style={styles.versionText}>
            Hangers Clothes Spa  •  v1.0.0{'\n'}
            Care in Every Clean
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.offWhite },

  header:      { paddingTop: 56, paddingBottom: 32, alignItems:'center', overflow:'hidden' },
  bgCircle:    { position:'absolute', top:-50, right:-50, width:180, height:180, borderRadius:90, backgroundColor:'rgba(3,90,143,0.4)' },
  backBtn:     { position:'absolute', top:56, left:Spacing.lg },
  backText:    { fontFamily:'DMSans_500Medium', fontSize:24, color:Colors.white },

  avatarWrap:  { position:'relative', marginBottom:14 },
  avatar:      { width:90, height:90, borderRadius:45, backgroundColor:'rgba(255,255,255,0.18)', borderWidth:2, borderColor:'rgba(184,208,232,0.4)', alignItems:'center', justifyContent:'center' },
  avatarText:  { fontFamily:'Syne_800ExtraBold', fontSize:FontSize.xxl, color:Colors.white },
  editAvatarBtn:{ position:'absolute', bottom:0, right:0, width:30, height:30, borderRadius:15, backgroundColor:Colors.white, alignItems:'center', justifyContent:'center', ...Shadow.sm },
  editAvatarIcon:{ fontSize:14 },

  customerName: { fontFamily:'Syne_700Bold', fontSize:FontSize.lg, color:Colors.white, marginBottom:4 },
  customerPhone:{ fontFamily:'DMSans_400Regular', fontSize:FontSize.sm, color:Colors.primaryLight, marginBottom:12 },
  memberBadge:  { backgroundColor:'rgba(184,208,232,0.18)', borderRadius:Radius.full, borderWidth:1, borderColor:'rgba(184,208,232,0.3)', paddingHorizontal:14, paddingVertical:5 },
  memberBadgeText:{ fontFamily:'DMSans_500Medium', fontSize:FontSize.xs, color:Colors.primaryLight, letterSpacing:0.5 },

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
  saveBtn:     { backgroundColor:Colors.primary, borderRadius:Radius.md, paddingVertical:14, alignItems:'center', marginTop:16, ...Shadow.sm },
  saveBtnText: { fontFamily:'Syne_700Bold', fontSize:FontSize.base, color:Colors.white },

  // Info rows
  infoRows:      { padding:Spacing.md },
  infoRow:       { flexDirection:'row', alignItems:'center', gap:14, paddingVertical:10 },
  infoRowBorder: { borderTopWidth:1, borderBottomWidth:1, borderColor:Colors.borderLight },
  infoIcon:      { fontSize:20, width:26, textAlign:'center' },
  infoLabel:     { fontFamily:'DMSans_400Regular', fontSize:FontSize.xs, color:Colors.textMuted, marginBottom:2 },
  infoValue:     { fontFamily:'DMSans_500Medium', fontSize:FontSize.base, color:Colors.textDark },

  // Menu
  menuRow:       { flexDirection:'row', alignItems:'center', gap:14, padding:Spacing.md },
  menuRowBorder: { borderBottomWidth:1, borderColor:Colors.borderLight },
  menuIcon:      { fontSize:20, width:26, textAlign:'center' },
  menuLabel:     { flex:1, fontFamily:'DMSans_400Regular', fontSize:FontSize.base, color:Colors.textDark },
  menuArrow:     { fontFamily:'DMSans_400Regular', fontSize:22, color:Colors.textLight },

  // Logout
  logoutBtn:   { backgroundColor:Colors.white, borderRadius:Radius.lg, borderWidth:1, borderColor:Colors.border, padding:Spacing.md, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10, ...Shadow.sm },
  logoutIcon:  { fontSize:18 },
  logoutText:  { fontFamily:'Syne_700Bold', fontSize:FontSize.base, color:Colors.error },
  versionText: { textAlign:'center', fontFamily:'DMSans_400Regular', fontSize:FontSize.xs, color:Colors.textLight, marginTop:20, lineHeight:18 },
});
