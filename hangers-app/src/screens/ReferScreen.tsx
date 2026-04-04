import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { referralAPI } from '../services/api';
import { Colors, FontSize, Fonts, Radius, Shadow, Spacing } from '../utils/theme';

export default function ReferScreen({ navigation }: any) {
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    referralAPI
      .getInfo()
      .then((res: any) => setInfo(res))
      .catch(() => Alert.alert('Error', 'Could not load referral info'))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(
    () => [
      { label: 'Friends Joined', value: String(info?.referralCount || 0) },
      { label: 'Earned So Far', value: `₹${info?.totalEarned || 0}` },
      { label: 'Wallet Balance', value: `₹${info?.walletBalance || 0}` },
    ],
    [info]
  );

  const copyCode = () => {
    if (!info?.referralCode) return;
    Clipboard.setString(info.referralCode);
    Alert.alert('Copied', `Referral code ${info.referralCode} copied.`);
  };

  const shareCode = async () => {
    if (!info?.referralCode) return;
    try {
      await Share.share({
        message: `Use my referral code ${info.referralCode} when signing up on Hangers Clothes Spa and we both get wallet credits. Download now: https://hangers.in`,
      });
    } catch {}
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <LinearGradient colors={['#041f34', '#023c62', '#0f6c9c']} style={styles.hero}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.heroEyebrow}>Refer & Earn</Text>
          <Text style={styles.heroTitle}>Turn your happy customers into your next credits.</Text>
          <Text style={styles.heroBody}>
            Invite friends with one code. When they sign up and place their first order, both of
            you earn wallet credit.
          </Text>

          <View style={styles.heroBadge}>
            <MaterialCommunityIcons name="gift-outline" size={18} color="#fff" />
            <Text style={styles.heroBadgeText}>₹100 reward for you and your friend</Text>
          </View>
        </LinearGradient>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.centerText}>Loading referral program...</Text>
          </View>
        ) : (
          <>
            <View style={styles.codeCard}>
              <Text style={styles.cardEyebrow}>Your code</Text>
              <TouchableOpacity style={styles.codePill} activeOpacity={0.85} onPress={copyCode}>
                <Text style={styles.codeText}>{info?.referralCode || '—'}</Text>
                <Feather name="copy" size={18} color={Colors.primary} />
              </TouchableOpacity>
              <View style={styles.ctaRow}>
                <TouchableOpacity style={styles.primaryBtn} onPress={shareCode}>
                  <Feather name="send" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>Share Code</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={copyCode}>
                  <Text style={styles.secondaryBtnText}>Copy</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.statsRow}>
              {stats.map((stat) => (
                <View key={stat.label} style={styles.statCard}>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.stepsCard}>
              <Text style={styles.sectionTitle}>How it works</Text>
              {[
                'Share your referral code with friends.',
                'They sign up using your code.',
                'After their first order, both accounts receive wallet credits.',
              ].map((step, index) => (
                <View key={step} style={styles.stepRow}>
                  <View style={styles.stepIndex}>
                    <Text style={styles.stepIndexText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Referred Friends</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Wallet')}>
                <Text style={styles.sectionAction}>Open wallet</Text>
              </TouchableOpacity>
            </View>

            {info?.referrals?.length ? (
              info.referrals.map((referral: any, index: number) => (
                <View key={`${referral.name}-${index}`} style={styles.friendCard}>
                  <View style={styles.friendAvatar}>
                    <Text style={styles.friendAvatarText}>
                      {(referral.name?.[0] || '?').toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.friendName}>{referral.name || 'New Referral'}</Text>
                    <Text style={styles.friendMeta}>
                      Joined{' '}
                      {referral.joinedAt
                        ? new Date(referral.joinedAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'recently'}
                    </Text>
                  </View>
                  <Text style={styles.friendCredit}>+₹{referral.creditEarned || 0}</Text>
                </View>
              ))
            ) : (
              <View style={styles.emptyCard}>
                <MaterialCommunityIcons name="account-multiple-plus-outline" size={34} color={Colors.primary} />
                <Text style={styles.emptyTitle}>No referrals yet</Text>
                <Text style={styles.emptyText}>
                  Share your code with a few regular customers and your first bonus can land in the
                  wallet quickly.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef4f8' },
  scrollContent: { paddingBottom: 42 },
  hero: {
    paddingTop: 58,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  backText: { color: '#fff', fontSize: 22, fontFamily: Fonts.medium },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: Fonts.medium,
    fontSize: FontSize.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  heroTitle: { color: '#fff', fontFamily: Fonts.displayBold, fontSize: 31, lineHeight: 35, marginBottom: 10 },
  heroBody: { color: 'rgba(255,255,255,0.82)', fontFamily: Fonts.body, fontSize: FontSize.base, lineHeight: 22 },
  heroBadge: {
    marginTop: 18,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.full,
  },
  heroBadgeText: { color: '#fff', fontFamily: Fonts.bold, fontSize: FontSize.sm },
  centerState: { paddingTop: 72, alignItems: 'center' },
  centerText: { marginTop: 12, color: Colors.textMuted, fontFamily: Fonts.body, fontSize: FontSize.base },
  codeCard: {
    marginHorizontal: Spacing.lg,
    marginTop: 18,
    padding: 22,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.md,
  },
  cardEyebrow: {
    color: Colors.textMuted,
    fontFamily: Fonts.medium,
    fontSize: FontSize.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  codePill: {
    borderRadius: 20,
    backgroundColor: '#f5f9fd',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  codeText: { color: Colors.primary, fontFamily: Fonts.displayBold, fontSize: 28, letterSpacing: 3 },
  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primaryBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 14,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontFamily: Fonts.bold, fontSize: FontSize.base },
  secondaryBtn: {
    paddingHorizontal: 20,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fbfd',
  },
  secondaryBtnText: { color: Colors.primary, fontFamily: Fonts.bold, fontSize: FontSize.sm },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: Spacing.lg, marginTop: 16 },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    ...Shadow.sm,
  },
  statValue: { color: Colors.primary, fontFamily: Fonts.display, fontSize: 21, marginBottom: 4 },
  statLabel: { color: Colors.textMuted, fontFamily: Fonts.body, fontSize: FontSize.xs, textAlign: 'center' },
  stepsCard: {
    marginHorizontal: Spacing.lg,
    marginTop: 18,
    padding: 22,
    borderRadius: 24,
    backgroundColor: '#fff6ea',
    borderWidth: 1,
    borderColor: '#f3dcc0',
  },
  sectionTitle: { color: Colors.textDark, fontFamily: Fonts.display, fontSize: 22 },
  stepRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 16 },
  stepIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIndexText: { color: '#fff', fontFamily: Fonts.bold, fontSize: FontSize.sm },
  stepText: { flex: 1, color: Colors.textMid, fontFamily: Fonts.body, fontSize: FontSize.base, lineHeight: 21 },
  sectionHeader: {
    marginTop: 22,
    marginBottom: 12,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionAction: { color: Colors.primary, fontFamily: Fonts.bold, fontSize: FontSize.sm },
  friendCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: 12,
    padding: 18,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    ...Shadow.sm,
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendAvatarText: { color: '#fff', fontFamily: Fonts.bold, fontSize: FontSize.base },
  friendName: { color: Colors.textDark, fontFamily: Fonts.bold, fontSize: FontSize.base },
  friendMeta: { color: Colors.textMuted, fontFamily: Fonts.body, fontSize: FontSize.sm, marginTop: 3 },
  friendCredit: { color: Colors.success, fontFamily: Fonts.display, fontSize: 22 },
  emptyCard: {
    marginHorizontal: Spacing.lg,
    padding: 24,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    ...Shadow.sm,
  },
  emptyTitle: { marginTop: 12, color: Colors.textDark, fontFamily: Fonts.bold, fontSize: FontSize.md },
  emptyText: {
    marginTop: 8,
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: FontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
});
