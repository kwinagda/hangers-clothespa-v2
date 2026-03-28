// ─────────────────────────────────────────────────────────────────────────────
// REFER & EARN SCREEN
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Share, Clipboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../utils/theme';
import { referralAPI } from '../services/api';

export default function ReferScreen({ navigation }: any) {
  const [info, setInfo]       = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    referralAPI.getInfo().then((res: any) => {
      setInfo(res);
    }).catch(() => {
      Alert.alert('Error', 'Could not load referral info');
    }).finally(() => setLoading(false));
  }, []);

  const copyCode = () => {
    if (!info?.referralCode) return;
    Clipboard.setString(info.referralCode);
    Alert.alert('Copied!', `Referral code ${info.referralCode} copied to clipboard.`);
  };

  const shareCode = async () => {
    if (!info?.referralCode) return;
    try {
      await Share.share({
        message: `Use my referral code *${info.referralCode}* when signing up on Hangers Clothes Spa and we both get ₹100 wallet credits! Download now: https://hangers.in`,
      });
    } catch {}
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 100 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#023c62', '#035a8f']} style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Refer & Earn</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 60 }}>

        {/* Hero card */}
        <View style={styles.heroCard}>
          <Text style={styles.heroEmoji}>🎁</Text>
          <Text style={styles.heroTitle}>Invite friends, earn ₹100 each!</Text>
          <Text style={styles.heroBody}>
            Share your code. When a friend signs up and places their first order,
            you both get ₹100 Hangers wallet credits.
          </Text>
        </View>

        {/* Referral code */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>YOUR REFERRAL CODE</Text>
          <TouchableOpacity style={styles.codeBox} onPress={copyCode} activeOpacity={0.7}>
            <Text style={styles.codeText}>{info?.referralCode || '—'}</Text>
            <Text style={styles.copyHint}>Tap to copy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareBtn} onPress={shareCode}>
            <Text style={styles.shareBtnText}>💬  Share via WhatsApp</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{info?.referralCount || 0}</Text>
            <Text style={styles.statLabel}>Friends Referred</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>₹{info?.totalEarned || 0}</Text>
            <Text style={styles.statLabel}>Total Earned</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>₹{info?.walletBalance || 0}</Text>
            <Text style={styles.statLabel}>Wallet Balance</Text>
          </View>
        </View>

        {/* Referrals list */}
        {(info?.referrals?.length > 0) && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>REFERRED FRIENDS</Text>
            {info.referrals.map((r: any, i: number) => (
              <View key={i} style={[styles.referralRow, i > 0 && styles.rowBorder]}>
                <View style={styles.referralAvatar}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{(r.name?.[0] || '?').toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.referralName}>{r.name}</Text>
                  <Text style={styles.referralDate}>{new Date(r.joinedAt).toLocaleDateString('en-IN')}</Text>
                </View>
                <Text style={styles.referralCredit}>+₹{r.creditEarned}</Text>
              </View>
            ))}
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.offWhite },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 16, paddingHorizontal: Spacing.lg },
  backBtn:        { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  backText:       { color: '#fff', fontSize: 22 },
  headerTitle:    { color: '#fff', fontSize: 17, fontWeight: '700' },

  heroCard:       { backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: 24, alignItems: 'center', marginBottom: 16, ...Shadow.sm },
  heroEmoji:      { fontSize: 40, marginBottom: 10 },
  heroTitle:      { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  heroBody:       { color: 'rgba(184,208,232,0.9)', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  card:           { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  cardLabel:      { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.6, marginBottom: 12, textTransform: 'uppercase' },

  codeBox:        { backgroundColor: Colors.offWhite, borderRadius: Radius.md, padding: 18, alignItems: 'center', marginBottom: 12, borderWidth: 1.5, borderColor: Colors.primary, borderStyle: 'dashed' },
  codeText:       { fontSize: 28, fontWeight: '800', color: Colors.primary, letterSpacing: 4 },
  copyHint:       { fontSize: 11, color: Colors.textMuted, marginTop: 4 },

  shareBtn:       { backgroundColor: '#25D366', borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center' },
  shareBtnText:   { color: '#fff', fontSize: 15, fontWeight: '700' },

  statsRow:       { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard:       { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.md, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  statValue:      { fontSize: 20, fontWeight: '800', color: Colors.primary },
  statLabel:      { fontSize: 11, color: Colors.textMuted, marginTop: 4, textAlign: 'center' },

  referralRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  rowBorder:      { borderTopWidth: 1, borderTopColor: Colors.borderLight },
  referralAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  referralName:   { fontSize: 14, fontWeight: '600', color: Colors.textDark },
  referralDate:   { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  referralCredit: { fontSize: 14, fontWeight: '700', color: '#0d7a4e' },
});
