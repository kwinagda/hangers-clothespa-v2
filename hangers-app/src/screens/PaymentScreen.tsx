// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT SCREEN  — Razorpay integration
//   Dev mode:  Shows "Simulate Payment" card (no real keys needed)
//   Prod mode: Opens Razorpay checkout in a WebView
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../utils/theme';
import { paymentsAPI } from '../services/api';

// ─────────────────────────────────────────────────────────────────────────────
export default function PaymentScreen({ route, navigation }: any) {
  const { orderId, orderNumber, totalAmount } = route.params || {};

  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [rzpOrder,     setRzpOrder]     = useState<any>(null);
  const [isDevMode,    setIsDevMode]    = useState(false);
  const [simulating,   setSimulating]   = useState(false);
  const [webviewHtml,  setWebviewHtml]  = useState<string | null>(null);
  const webviewRef = useRef<any>(null);

  // ── Step 1: create Razorpay order on mount ──────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const result: any = await paymentsAPI.createRazorpayOrder(orderId);
        setRzpOrder(result);
        setIsDevMode(result?.devMode === true);
        if (!result?.devMode && result?.razorpayOrderId && result?.keyId) {
          // Build Razorpay checkout HTML for WebView
          setWebviewHtml(buildCheckoutHtml(result, orderNumber, totalAmount));
        }
      } catch (e: any) {
        setError(e?.message || 'Could not initiate payment');
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  // ── Dev mode: simulate a successful payment ──────────────────────────────
  const handleSimulate = async () => {
    setSimulating(true);
    try {
      await paymentsAPI.verifyRazorpayPayment({
        orderId,
        razorpayOrderId:   'dev_order_' + Date.now(),
        razorpayPaymentId: 'dev_pay_'   + Date.now(),
        razorpaySignature: 'dev_sig',
        amount:            totalAmount,
      });
      Alert.alert('Payment Successful', 'Your order has been marked as paid!', [
        { text: 'View Order', onPress: () => navigation.navigate('MyOrders') },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Simulation failed');
    } finally {
      setSimulating(false);
    }
  };

  // ── WebView message handler (Razorpay JS posts result back) ─────────────
  const handleWebViewMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.success) {
        await paymentsAPI.verifyRazorpayPayment({
          orderId,
          razorpayOrderId:   data.razorpay_order_id,
          razorpayPaymentId: data.razorpay_payment_id,
          razorpaySignature: data.razorpay_signature,
          amount:            totalAmount,
        });
        Alert.alert('Payment Successful', 'Your order has been marked as paid!', [
          { text: 'View Order', onPress: () => navigation.navigate('MyOrders') },
        ]);
      } else if (data.dismissed) {
        Alert.alert('Payment Cancelled', 'You cancelled the payment.');
      } else if (data.error) {
        Alert.alert('Payment Failed', data.error);
      }
    } catch {}
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: Colors.offWhite }}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Header */}
      <LinearGradient colors={['#023c62', '#035a8f']} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.back}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Payment</Text>
        <View style={{ width: 36 }} />
      </LinearGradient>

      {/* Loading */}
      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ color: Colors.textMuted, marginTop: 12 }}>Setting up payment...</Text>
        </View>
      )}

      {/* Error */}
      {!loading && error && (
        <View style={styles.center}>
          <Text style={{ color: Colors.error, fontWeight: '700', marginBottom: 8 }}>
            Payment Unavailable
          </Text>
          <Text style={{ color: Colors.textMuted, textAlign: 'center', marginBottom: 20 }}>{error}</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.outlineBtn}>
            <Text style={{ color: Colors.primary, fontWeight: '700' }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Dev Mode UI */}
      {!loading && !error && isDevMode && (
        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
          <View style={styles.devCard}>
            <View style={styles.devBadge}>
              <Text style={styles.devBadgeText}>TEST MODE</Text>
            </View>
            <Text style={styles.devTitle}>Payment Gateway</Text>
            <Text style={styles.devSub}>
              Razorpay is configured in development mode.{'\n'}
              Tap below to simulate a successful payment.
            </Text>

            <View style={styles.divider} />

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Order</Text>
              <Text style={styles.summaryValue}>{orderNumber}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Amount</Text>
              <Text style={styles.summaryAmountBig}>
                Rs.{(totalAmount || 0).toLocaleString('en-IN')}
              </Text>
            </View>

            <View style={styles.divider} />

            <TouchableOpacity
              style={[styles.payBtn, simulating && { opacity: 0.6 }]}
              onPress={handleSimulate}
              disabled={simulating}
            >
              {simulating
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.payBtnText}>Simulate Successful Payment</Text>
              }
            </TouchableOpacity>

            <Text style={styles.devNote}>
              In production, real Razorpay keys will enable live payments.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Live Razorpay WebView */}
      {!loading && !error && !isDevMode && webviewHtml && (
        <WebView
          ref={webviewRef}
          style={{ flex: 1 }}
          originWhitelist={['*']}
          source={{ html: webviewHtml }}
          onMessage={handleWebViewMessage}
          javaScriptEnabled
          domStorageEnabled
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function buildCheckoutHtml(rzpOrder: any, orderNumber: string, totalAmount: number): string {
  const amountPaise = Math.round(totalAmount * 100);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f7f9fc;font-family:Arial}</style>
</head><body>
<script>
var options = {
  key: "${rzpOrder.keyId}",
  amount: "${amountPaise}",
  currency: "INR",
  name: "Hangers Clothes Spa",
  description: "Order ${orderNumber}",
  order_id: "${rzpOrder.razorpayOrderId}",
  handler: function(response) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      success: true,
      razorpay_order_id:   response.razorpay_order_id,
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_signature:  response.razorpay_signature,
    }));
  },
  modal: { ondismiss: function() {
    window.ReactNativeWebView.postMessage(JSON.stringify({ dismissed: true }));
  }},
  theme: { color: "#023c62" }
};
var rzp = new Razorpay(options);
rzp.on("payment.failed", function(resp) {
  window.ReactNativeWebView.postMessage(JSON.stringify({ error: resp.error.description }));
});
rzp.open();
</script>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header:        { paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 20, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  back:          { fontSize: 22, color: '#fff' },
  title:         { fontSize: FontSize.lg, fontWeight: '700', color: '#fff' },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  outlineBtn:    { borderWidth: 1.5, borderColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 24, paddingVertical: 12 },

  devCard:       { backgroundColor: '#fff', borderRadius: 20, padding: Spacing.lg, ...Shadow.md },
  devBadge:      { alignSelf: 'flex-start', backgroundColor: '#fef3c7', borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 14 },
  devBadgeText:  { fontSize: FontSize.xs, fontWeight: '800', color: '#92400e', letterSpacing: 1 },
  devTitle:      { fontSize: FontSize.xl, fontWeight: '800', color: Colors.primary, marginBottom: 6 },
  devSub:        { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 22, marginBottom: 16 },
  divider:       { height: 1, backgroundColor: Colors.border, marginVertical: 16 },
  summaryRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  summaryLabel:  { fontSize: FontSize.sm, color: Colors.textMuted },
  summaryValue:  { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textDark },
  summaryAmountBig: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.primary },
  payBtn:        { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  payBtnText:    { color: '#fff', fontWeight: '700', fontSize: FontSize.base },
  devNote:       { fontSize: FontSize.xs, color: Colors.textLight, textAlign: 'center', marginTop: 14, lineHeight: 18 },
});
