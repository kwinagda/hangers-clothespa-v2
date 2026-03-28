// ─────────────────────────────────────────────────────────────────────────────
// WALLET SCREEN — Balance + transaction history
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../utils/theme';
import { walletAPI } from '../services/api';

const REASON_LABEL: Record<string, string> = {
  REFERRAL:      'Referral Bonus',
  ORDER_PAYMENT: 'Order Payment',
  BONUS:         'Bonus Credit',
};

export default function WalletScreen({ navigation }: any) {
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    walletAPI.getWallet().then((res: any) => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#023c62', '#035a8f']} style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Wallet</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 80 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 60 }}>

          {/* Balance card */}
          <LinearGradient colors={['#0d7a4e', '#16a34a']} style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Available Balance</Text>
            <Text style={styles.balanceValue}>₹{data?.balance?.toFixed(0) || '0'}</Text>
            <Text style={styles.balanceNote}>Use at checkout to get instant discount</Text>
          </LinearGradient>

          {/* Transaction history */}
          <Text style={styles.sectionTitle}>Transaction History</Text>
          {(!data?.transactions?.length) ? (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>💰</Text>
              <Text style={{ color: Colors.textMuted, fontSize: 14, textAlign: 'center' }}>
                No transactions yet.{'\n'}Refer friends to earn wallet credits!
              </Text>
            </View>
          ) : (
            <View style={styles.card}>
              {data.transactions.map((txn: any, i: number) => (
                <View key={txn.id} style={[styles.txnRow, i > 0 && styles.rowBorder]}>
                  <View style={[styles.txnIcon, { backgroundColor: txn.type === 'CREDIT' ? '#dcfce7' : '#fee2e2' }]}>
                    <Text style={{ fontSize: 16 }}>{txn.type === 'CREDIT' ? '📥' : '📤'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txnReason}>{REASON_LABEL[txn.reason] || txn.reason}</Text>
                    <Text style={styles.txnDate}>{new Date(txn.createdAt).toLocaleDateString('en-IN')}</Text>
                  </View>
                  <Text style={[styles.txnAmount, { color: txn.type === 'CREDIT' ? '#0d7a4e' : Colors.error }]}>
                    {txn.type === 'CREDIT' ? '+' : '-'}₹{txn.amount}
                  </Text>
                </View>
              ))}
            </View>
          )}

        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.offWhite },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 16, paddingHorizontal: Spacing.lg },
  backBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  backText:     { color: '#fff', fontSize: 22 },
  headerTitle:  { color: '#fff', fontSize: 17, fontWeight: '700' },

  balanceCard:  { borderRadius: Radius.lg, padding: 28, alignItems: 'center', marginBottom: 20, ...Shadow.sm },
  balanceLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  balanceValue: { color: '#fff', fontSize: 40, fontWeight: '800' },
  balanceNote:  { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 8, textAlign: 'center' },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },

  card:         { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  txnRow:       { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  rowBorder:    { borderTopWidth: 1, borderTopColor: Colors.borderLight },
  txnIcon:      { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  txnReason:    { fontSize: 14, fontWeight: '600', color: Colors.textDark },
  txnDate:      { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  txnAmount:    { fontSize: 15, fontWeight: '700' },

  emptyState:   { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
});
