import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, FontSize, Fonts, Radius, Shadow, Spacing } from '../utils/theme';
import { walletAPI } from '../services/api';

const REASON_LABEL: Record<string, string> = {
  REFERRAL: 'Referral Bonus',
  ORDER_PAYMENT: 'Order Payment',
  BONUS: 'Bonus Credit',
};

const formatCurrency = (value?: number) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function WalletScreen({ navigation }: any) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    walletAPI
      .getWallet()
      .then((res: any) => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const balance = Number(data?.balance || 0);
  const transactions = data?.transactions || [];

  const stats = useMemo(() => {
    return transactions.reduce(
      (acc: { credited: number; debited: number }, txn: any) => {
        if (txn.type === 'CREDIT') acc.credited += Number(txn.amount || 0);
        else acc.debited += Number(txn.amount || 0);
        return acc;
      },
      { credited: 0, debited: 0 }
    );
  }, [transactions]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#022b46', '#035a8f', '#1d7eb7']} style={styles.hero}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.heroEyebrow}>Customer Wallet</Text>
          <Text style={styles.heroTitle}>Your balance travels with every order.</Text>
          <Text style={styles.heroBody}>
            Use wallet credits at checkout, earn more through referrals, and keep track of every
            adjustment in one place.
          </Text>

          <View style={styles.balanceShell}>
            <Text style={styles.balanceLabel}>Available now</Text>
            <Text style={styles.balanceValue}>{formatCurrency(balance)}</Text>
            <Text style={styles.balanceHint}>Applied instantly on eligible orders</Text>
          </View>
        </LinearGradient>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.centerText}>Loading wallet details...</Text>
          </View>
        ) : (
          <>
            <View style={styles.statsRow}>
              <View style={[styles.statCard, styles.statCardLight]}>
                <Text style={styles.statLabel}>Total Credits</Text>
                <Text style={[styles.statValue, { color: Colors.success }]}>{formatCurrency(stats.credited)}</Text>
              </View>
              <View style={[styles.statCard, styles.statCardWarm]}>
                <Text style={styles.statLabel}>Used So Far</Text>
                <Text style={[styles.statValue, { color: Colors.warning }]}>{formatCurrency(stats.debited)}</Text>
              </View>
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoIcon}>
                <MaterialCommunityIcons name="wallet-giftcard" size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoTitle}>How credits work</Text>
                <Text style={styles.infoText}>
                  Referral bonuses and adjustments appear here automatically. Wallet money reduces
                  your payable amount during checkout.
                </Text>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Refer')}>
                <Text style={styles.sectionAction}>Earn more</Text>
              </TouchableOpacity>
            </View>

            {!transactions.length ? (
              <View style={styles.emptyCard}>
                <MaterialCommunityIcons name="wallet-plus-outline" size={36} color={Colors.primary} />
                <Text style={styles.emptyTitle}>No wallet activity yet</Text>
                <Text style={styles.emptyText}>
                  Once you earn a referral bonus or use credits on an order, the movement will
                  show up here.
                </Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('Refer')}>
                  <Text style={styles.emptyBtnText}>Open Refer & Earn</Text>
                </TouchableOpacity>
              </View>
            ) : (
              transactions.map((txn: any) => {
                const isCredit = txn.type === 'CREDIT';
                return (
                  <View key={txn.id} style={styles.txnCard}>
                    <View
                      style={[
                        styles.txnIconWrap,
                        { backgroundColor: isCredit ? Colors.successBg : Colors.warningBg },
                      ]}
                    >
                      <Feather
                        name={isCredit ? 'arrow-down-left' : 'arrow-up-right'}
                        size={18}
                        color={isCredit ? Colors.success : Colors.warning}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txnTitle}>{REASON_LABEL[txn.reason] || txn.reason || 'Wallet Update'}</Text>
                      <Text style={styles.txnMeta}>
                        {new Date(txn.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.txnAmount, { color: isCredit ? Colors.success : Colors.warning }]}>
                        {isCredit ? '+' : '-'}
                        {formatCurrency(txn.amount)}
                      </Text>
                      <Text style={styles.txnBalance}>Wallet entry</Text>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef4f8' },
  scrollContent: { paddingBottom: 40 },
  hero: {
    paddingTop: 58,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
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
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  heroTitle: { color: '#fff', fontFamily: Fonts.displayBold, fontSize: 32, lineHeight: 36, marginBottom: 10 },
  heroBody: {
    color: 'rgba(255,255,255,0.82)',
    fontFamily: Fonts.body,
    fontSize: FontSize.base,
    lineHeight: 22,
    maxWidth: '92%',
  },
  balanceShell: {
    marginTop: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  balanceLabel: { color: 'rgba(255,255,255,0.72)', fontFamily: Fonts.medium, fontSize: FontSize.sm },
  balanceValue: { color: '#fff', fontFamily: Fonts.displayBold, fontSize: 40, marginTop: 6 },
  balanceHint: { color: 'rgba(255,255,255,0.7)', fontFamily: Fonts.body, fontSize: FontSize.sm, marginTop: 6 },
  centerState: { paddingTop: 72, alignItems: 'center', justifyContent: 'center' },
  centerText: { marginTop: 12, color: Colors.textMuted, fontFamily: Fonts.body, fontSize: FontSize.base },
  statsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: Spacing.lg, marginTop: 18 },
  statCard: {
    flex: 1,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    ...Shadow.sm,
  },
  statCardLight: { backgroundColor: '#ffffff', borderColor: '#d8efe4' },
  statCardWarm: { backgroundColor: '#fff8ef', borderColor: '#f6dfc2' },
  statLabel: { color: Colors.textMuted, fontFamily: Fonts.medium, fontSize: FontSize.sm, marginBottom: 10 },
  statValue: { fontFamily: Fonts.display, fontSize: 26 },
  infoCard: {
    flexDirection: 'row',
    gap: 14,
    marginHorizontal: Spacing.lg,
    marginTop: 18,
    padding: 18,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: { color: Colors.textDark, fontFamily: Fonts.bold, fontSize: FontSize.base, marginBottom: 4 },
  infoText: { color: Colors.textMuted, fontFamily: Fonts.body, fontSize: FontSize.sm, lineHeight: 20 },
  sectionHeader: {
    marginTop: 24,
    marginBottom: 12,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: Colors.textDark, fontFamily: Fonts.display, fontSize: 22 },
  sectionAction: { color: Colors.primary, fontFamily: Fonts.bold, fontSize: FontSize.sm },
  emptyCard: {
    marginHorizontal: Spacing.lg,
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
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
  emptyBtn: {
    marginTop: 18,
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: Radius.full,
  },
  emptyBtnText: { color: '#fff', fontFamily: Fonts.bold, fontSize: FontSize.sm },
  txnCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: 12,
    padding: 18,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    ...Shadow.sm,
  },
  txnIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  txnTitle: { color: Colors.textDark, fontFamily: Fonts.bold, fontSize: FontSize.base, marginBottom: 3 },
  txnMeta: { color: Colors.textMuted, fontFamily: Fonts.body, fontSize: FontSize.sm },
  txnAmount: { fontFamily: Fonts.display, fontSize: 20 },
  txnBalance: { color: Colors.textLight, fontFamily: Fonts.body, fontSize: FontSize.xs, marginTop: 2 },
});
