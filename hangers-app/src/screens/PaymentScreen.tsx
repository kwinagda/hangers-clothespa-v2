import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { paymentsAPI } from '../services/api';
import { Colors, FontSize, Fonts, Radius, Shadow, Spacing } from '../utils/theme';

export default function PaymentScreen({ route, navigation }: any) {
  const { orderId, orderNumber, totalAmount } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rzpOrder, setRzpOrder] = useState<any>(null);
  const [isDevMode, setIsDevMode] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [webviewHtml, setWebviewHtml] = useState<string | null>(null);
  const webviewRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const result: any = await paymentsAPI.createRazorpayOrder(orderId);
        setRzpOrder(result);
        setIsDevMode(result?.devMode === true);
        if (!result?.devMode && result?.razorpayOrderId && result?.key) {
          setWebviewHtml(buildCheckoutHtml(result, orderNumber, totalAmount));
        }
      } catch (e: any) {
        setError(e?.message || 'Could not initiate payment');
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId, orderNumber, totalAmount]);

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      await paymentsAPI.verifyRazorpayPayment({
        orderId,
        razorpayOrderId: `dev_order_${Date.now()}`,
        razorpayPaymentId: `dev_pay_${Date.now()}`,
        razorpaySignature: 'dev_sig',
        amount: totalAmount,
      });
      Alert.alert('Payment Successful', 'Your order has been marked as paid.', [
        { text: 'View Orders', onPress: () => navigation.navigate('MyOrders') },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Simulation failed');
    } finally {
      setSimulating(false);
    }
  };

  const handleWebViewMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.success) {
        await paymentsAPI.verifyRazorpayPayment({
          orderId,
          razorpayOrderId: data.razorpay_order_id,
          razorpayPaymentId: data.razorpay_payment_id,
          razorpaySignature: data.razorpay_signature,
          amount: totalAmount,
        });
        Alert.alert('Payment Successful', 'Your order has been marked as paid.', [
          { text: 'View Orders', onPress: () => navigation.navigate('MyOrders') },
        ]);
      } else if (data.dismissed) {
        Alert.alert('Payment Cancelled', 'You cancelled the payment.');
      } else if (data.error) {
        Alert.alert('Payment Failed', data.error);
      }
    } catch {}
  };

  if (!loading && !error && !isDevMode && webviewHtml) {
    return (
      <View style={styles.webContainer}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
        <View style={styles.webHeader}>
          <TouchableOpacity style={styles.webBackBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.webBackText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.webHeaderTitle}>Secure Payment</Text>
          <View style={{ width: 42 }} />
        </View>
        <WebView
          ref={webviewRef}
          style={{ flex: 1 }}
          originWhitelist={['*']}
          source={{ html: webviewHtml }}
          onMessage={handleWebViewMessage}
          javaScriptEnabled
          domStorageEnabled
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <LinearGradient colors={['#02253b', '#023c62', '#0b709f']} style={styles.hero}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.heroEyebrow}>Payment</Text>
          <Text style={styles.heroTitle}>Finish your order with a clean, secure checkout.</Text>
          <Text style={styles.heroBody}>
            Review the order, confirm the amount, and complete payment through Razorpay.
          </Text>
        </LinearGradient>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Order</Text>
            <Text style={styles.summaryValue}>{orderNumber || '—'}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Amount</Text>
            <Text style={styles.summaryAmount}>₹{Number(totalAmount || 0).toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Gateway</Text>
            <Text style={styles.summaryValue}>Razorpay</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.centerText}>Setting up payment...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <MaterialCommunityIcons name="alert-circle-outline" size={36} color={Colors.error} />
            <Text style={styles.errorTitle}>Payment unavailable</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.outlineBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.outlineBtnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        ) : isDevMode ? (
          <View style={styles.devCard}>
            <View style={styles.devBadge}>
              <Text style={styles.devBadgeText}>Test Mode</Text>
            </View>
            <Text style={styles.devTitle}>Development checkout is active</Text>
            <Text style={styles.devText}>
              Live Razorpay checkout is bypassed in this environment. Use the simulation button to
              mark the order as paid for testing.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, simulating && { opacity: 0.6 }]}
              onPress={handleSimulate}
              disabled={simulating}
            >
              {simulating ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Simulate Successful Payment</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.liveCard}>
            <MaterialCommunityIcons name="shield-check-outline" size={34} color={Colors.primary} />
            <Text style={styles.liveTitle}>Opening secure checkout</Text>
            <Text style={styles.liveText}>
              Razorpay is ready. Tap below to continue to the payment window and complete the order.
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                if (webviewRef.current) return;
                setWebviewHtml(buildCheckoutHtml(rzpOrder, orderNumber, totalAmount));
              }}
            >
              <Text style={styles.primaryBtnText}>Continue to Payment</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function buildCheckoutHtml(rzpOrder: any, orderNumber: string, totalAmount: number): string {
  const amountPaise = Math.round(Number(totalAmount || 0) * 100);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f7f9fc;font-family:Arial}</style>
</head><body>
<script>
var options = {
  key: "${rzpOrder?.key || ''}",
  amount: "${amountPaise}",
  currency: "INR",
  name: "Hangers Clothes Spa",
  description: "Order ${orderNumber || ''}",
  order_id: "${rzpOrder?.razorpayOrderId || ''}",
  handler: function(response) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      success: true,
      razorpay_order_id: response.razorpay_order_id,
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_signature: response.razorpay_signature
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef4f8' },
  scrollContent: { paddingBottom: 40 },
  hero: {
    paddingTop: 56,
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
  summaryCard: {
    marginHorizontal: Spacing.lg,
    marginTop: 18,
    padding: 20,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: { color: Colors.textMuted, fontFamily: Fonts.medium, fontSize: FontSize.sm },
  summaryValue: { color: Colors.textDark, fontFamily: Fonts.bold, fontSize: FontSize.base },
  summaryAmount: { color: Colors.primary, fontFamily: Fonts.display, fontSize: 26 },
  centerState: { paddingTop: 72, alignItems: 'center' },
  centerText: { marginTop: 12, color: Colors.textMuted, fontFamily: Fonts.body, fontSize: FontSize.base },
  errorCard: {
    marginHorizontal: Spacing.lg,
    marginTop: 18,
    padding: 24,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  errorTitle: { marginTop: 14, color: Colors.textDark, fontFamily: Fonts.bold, fontSize: FontSize.md },
  errorText: { marginTop: 6, color: Colors.textMuted, fontFamily: Fonts.body, fontSize: FontSize.sm, lineHeight: 20, textAlign: 'center' },
  outlineBtn: {
    marginTop: 18,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  outlineBtnText: { color: Colors.primary, fontFamily: Fonts.bold, fontSize: FontSize.sm },
  devCard: {
    marginHorizontal: Spacing.lg,
    marginTop: 18,
    padding: 22,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f0d7af',
    ...Shadow.sm,
  },
  devBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff3d6',
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  devBadgeText: { color: '#9a6500', fontFamily: Fonts.bold, fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 1 },
  devTitle: { color: Colors.textDark, fontFamily: Fonts.display, fontSize: 22, marginBottom: 8 },
  devText: { color: Colors.textMuted, fontFamily: Fonts.body, fontSize: FontSize.base, lineHeight: 22, marginBottom: 18 },
  liveCard: {
    marginHorizontal: Spacing.lg,
    marginTop: 18,
    padding: 24,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    ...Shadow.sm,
  },
  liveTitle: { marginTop: 14, color: Colors.textDark, fontFamily: Fonts.display, fontSize: 22, marginBottom: 8 },
  liveText: { color: Colors.textMuted, fontFamily: Fonts.body, fontSize: FontSize.base, lineHeight: 22, textAlign: 'center', marginBottom: 18 },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontFamily: Fonts.bold, fontSize: FontSize.base },
  webContainer: { flex: 1, backgroundColor: '#fff' },
  webHeader: {
    paddingTop: 56,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 14,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  webBackBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webBackText: { color: '#fff', fontSize: 22, fontFamily: Fonts.medium },
  webHeaderTitle: { color: '#fff', fontFamily: Fonts.bold, fontSize: FontSize.md },
});
