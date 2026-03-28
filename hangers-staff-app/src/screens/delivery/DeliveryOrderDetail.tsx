import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator, Modal, TextInput, Alert, Linking, RefreshControl,
} from 'react-native';
import { Colors, Spacing } from '../../utils/theme';
import { deliveryAPI } from '../../services/api';

const FAIL_REASONS = [
  { key:'NOT_HOME',          label:'Customer not home'   },
  { key:'REFUSED',           label:'Customer refused'    },
  { key:'WRONG_ADDRESS',     label:'Wrong address'       },
  { key:'CUSTOMER_CANCELLED',label:'Customer cancelled'  },
  { key:'OTHER',             label:'Other reason'        },
];

export default function DeliveryOrderDetail({ route, navigation }: any) {
  const { orderId } = route.params || {};
  const [order,     setOrder]     = useState<any>(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [saving,    setSaving]    = useState(false);
  const [cashModal, setCashModal] = useState(false);
  const [failModal, setFailModal] = useState(false);
  const [otpModal,  setOtpModal]  = useState(false);
  const [cashAmount,setCashAmount]= useState('');
  const [failReason,setFailReason]= useState('');
  const [otpCode,   setOtpCode]   = useState('');
  const [sentTo,    setSentTo]    = useState('');
  const [notes,     setNotes]     = useState('');

  const load = useCallback(async () => {
    try {
      const r: any = await deliveryAPI.order(orderId);
      setOrder(r.data?.order);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const handlePickup = async () => {
    Alert.alert('Confirm Pickup', `Mark ${order?.orderNumber} as Picked Up?`, [
      { text:'Cancel', style:'cancel' },
      {
        text:'Confirm Pickup', onPress: async () => {
          setSaving(true);
          try {
            await deliveryAPI.pickup(orderId);
            await load();
          } catch (e: any) { Alert.alert('Error', e.message); }
          finally { setSaving(false); }
        },
      },
    ]);
  };

  const handleDeliver = async () => {
    // Step 1 — send OTP to customer via WhatsApp
    setSaving(true);
    try {
      const r: any = await deliveryAPI.sendOtp(orderId);
      setSentTo(r.data?.sentTo || '');
      setOtpModal(true);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to send OTP. Check WhatsApp connection.');
    } finally { setSaving(false); }
  };

  const confirmDeliver = async () => {
    if (!otpCode || otpCode.length < 4) {
      Alert.alert('Enter OTP', 'Please enter the 4-digit OTP the customer received on WhatsApp.');
      return;
    }
    setSaving(true);
    try {
      await deliveryAPI.verifyOtp(orderId, otpCode);
      setOtpModal(false); setOtpCode('');
      await load();
    } catch (e: any) { Alert.alert('Wrong OTP', e.message); }
    finally { setSaving(false); }
  };

  const handleCash = async () => {
    const amt = parseFloat(cashAmount);
    if (!amt || amt <= 0) return;
    setSaving(true);
    try {
      await deliveryAPI.collectCash(orderId, amt);
      setCashModal(false); setCashAmount('');
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const handleFailed = async () => {
    if (!failReason) return;
    setSaving(true);
    try {
      await deliveryAPI.failed(orderId, failReason);
      setFailModal(false); setFailReason('');
      navigation.goBack();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <View style={{ flex:1, backgroundColor: Colors.delivery, justifyContent:'center', alignItems:'center' }}>
      <ActivityIndicator size="large" color="#fff" />
    </View>
  );

  const isPending  = order?.status === 'PENDING';
  const isOut      = order?.status === 'OUT_FOR_DELIVERY';
  const isReady    = order?.status === 'READY_FOR_DELIVERY';
  const isDone     = order?.status === 'DELIVERED';
  const canDeliver = isOut || isReady;
  const balanceDue = Math.max(0, (order?.totalAmount || 0) - (order?.paidAmount || 0));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{order?.orderNumber}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primaryLight} />}
      >
        {/* Customer card */}
        <View style={styles.custCard}>
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.custName}>{order?.customer?.name}</Text>
              <Text style={styles.custPhone}>{order?.customer?.phone}</Text>
              {order?.pickupAddress ? <Text style={styles.custAddr}>📍 {order.pickupAddress}</Text> : null}
            </View>
            <TouchableOpacity style={styles.callBig} onPress={() => Linking.openURL(`tel:${order?.customer?.phone}`)}>
              <Text style={{ fontSize: 22 }}>📞</Text>
              <Text style={{ color: Colors.delivery, fontSize: 11, fontWeight:'700' }}>Call</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Payment */}
        <View style={[styles.payCard, { borderColor: balanceDue > 0 ? Colors.error : Colors.success }]}>
          <View style={{ flexDirection:'row', justifyContent:'space-between' }}>
            <View>
              <Text style={styles.payLabel}>Total Order</Text>
              <Text style={styles.payAmount}>₹{order?.totalAmount?.toLocaleString('en-IN')}</Text>
            </View>
            <View>
              <Text style={[styles.payLabel, { textAlign:'right' }]}>Paid</Text>
              <Text style={[styles.payAmount, { color: Colors.success }]}>₹{order?.paidAmount?.toLocaleString('en-IN') || '0'}</Text>
            </View>
            <View>
              <Text style={[styles.payLabel, { textAlign:'right' }]}>Due</Text>
              <Text style={[styles.payAmount, { color: balanceDue > 0 ? Colors.error : Colors.success }]}>
                {balanceDue > 0 ? `₹${balanceDue.toLocaleString('en-IN')}` : '✓ Clear'}
              </Text>
            </View>
          </View>
          <Text style={[styles.payStatus, { color: order?.paymentStatus === 'PAID' ? Colors.success : Colors.error }]}>
            {order?.paymentStatus}
          </Text>
        </View>

        {/* Garments */}
        <Text style={styles.sectionTitle}>Garments ({order?.itemCount})</Text>
        <View style={styles.itemsCard}>
          {order?.items?.map((item: any, i: number) => (
            <View key={i} style={[styles.itemRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
              <Text style={styles.itemName}>{item.serviceName}</Text>
              <Text style={styles.itemQty}>× {item.quantity}</Text>
            </View>
          ))}
        </View>

        {/* Notes */}
        {order?.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesText}>📝  {order.notes}</Text>
          </View>
        ) : null}

        {isDone ? (
          <View style={styles.doneBox}>
            <Text style={{ fontSize:36, marginBottom:8 }}>✅</Text>
            <Text style={styles.doneTitle}>Order Delivered</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Bottom action bar */}
      {!isDone && (
        <View style={styles.bottomBar}>
          {isPending && (
            <TouchableOpacity style={[styles.mainBtn, { backgroundColor: Colors.delivery }]} onPress={handlePickup} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.mainBtnText}>📦  Mark Picked Up</Text>}
            </TouchableOpacity>
          )}
          {canDeliver && (
            <>
              {balanceDue > 0 && (
                <TouchableOpacity style={[styles.secBtn, { borderColor: Colors.success }]} onPress={() => setCashModal(true)}>
                  <Text style={[styles.secBtnText, { color: Colors.success }]}>💵  Collect ₹{balanceDue.toLocaleString('en-IN')}</Text>
                </TouchableOpacity>
              )}
              <View style={{ flexDirection:'row', gap: 10 }}>
                <TouchableOpacity style={[styles.failBtn]} onPress={() => setFailModal(true)}>
                  <Text style={styles.failBtnText}>✗ Failed</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.mainBtn, { flex: 1, backgroundColor: Colors.success }]} onPress={handleDeliver} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.mainBtnText}>✓  Mark Delivered</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}

      {/* OTP Confirmation Modal — WhatsApp */}
      <Modal visible={otpModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Confirm Delivery</Text>
            <Text style={styles.modalSub}>{order?.orderNumber} · {order?.customer?.name}</Text>

            <View style={{ backgroundColor: '#e7f8ef', borderRadius: 12, padding: 14, marginBottom: 18, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <Text style={{ fontSize: 22 }}>💬</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#16a34a', fontSize: 13, fontWeight: '700', marginBottom: 4 }}>
                  OTP sent via WhatsApp
                </Text>
                <Text style={{ color: '#15803d', fontSize: 12, lineHeight: 18 }}>
                  Customer received a 4-digit OTP on WhatsApp{sentTo ? ` (${sentTo})` : ''}.{'\n'}Ask them to read it out.
                </Text>
              </View>
            </View>

            <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
              Enter Customer OTP
            </Text>
            <TextInput
              style={[styles.cashInput, { letterSpacing: 10, fontSize: 28 }]}
              value={otpCode}
              onChangeText={t => setOtpCode(t.replace(/\D/g, '').slice(0, 4))}
              keyboardType="numeric"
              placeholder="· · · ·"
              placeholderTextColor="#9dafc8"
              autoFocus
              maxLength={4}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setOtpModal(false); setOtpCode(''); setSentTo(''); }}>
                <Text style={{ color: Colors.textMuted, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, { backgroundColor: Colors.success, opacity: otpCode.length < 4 ? 0.5 : 1 }]}
                onPress={confirmDeliver}
                disabled={saving || otpCode.length < 4}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalConfirmText}>✓ Verify & Deliver</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cash Modal */}
      <Modal visible={cashModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Collect Cash</Text>
            <Text style={styles.modalSub}>Balance due: ₹{balanceDue.toLocaleString('en-IN')}</Text>
            <TextInput
              style={styles.cashInput}
              value={cashAmount}
              onChangeText={setCashAmount}
              keyboardType="numeric"
              placeholder="Enter amount"
              placeholderTextColor="#9dafc8"
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setCashModal(false); setCashAmount(''); }}>
                <Text style={{ color: Colors.textMuted, fontWeight:'600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, { backgroundColor: Colors.success }]}
                onPress={handleCash} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalConfirmText}>Record Cash</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Fail Modal */}
      <Modal visible={failModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Delivery Failed</Text>
            <Text style={styles.modalSub}>Select the reason:</Text>
            {FAIL_REASONS.map(r => (
              <TouchableOpacity key={r.key} style={[styles.modalOption, failReason === r.key && styles.modalOptionErr]}
                onPress={() => setFailReason(r.key)}>
                <Text style={[styles.modalOptionText, failReason === r.key && { color: Colors.error, fontWeight:'700' }]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setFailModal(false); setFailReason(''); }}>
                <Text style={{ color: Colors.textMuted, fontWeight:'600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, { backgroundColor: Colors.error }]}
                onPress={handleFailed} disabled={!failReason || saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalConfirmText}>Confirm Failed</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex:1, backgroundColor:Colors.offWhite },
  header:          { flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor:Colors.delivery, paddingTop:Platform.OS==='ios'?52:22, paddingHorizontal:Spacing.lg, paddingBottom:16 },
  backBtn:         { width:40, height:40, borderRadius:20, backgroundColor:'rgba(255,255,255,0.15)', alignItems:'center', justifyContent:'center' },
  backText:        { color:'#fff', fontSize:22 },
  headerTitle:     { color:'#fff', fontSize:17, fontWeight:'700' },
  custCard:        { backgroundColor:'#fff', borderRadius:16, padding:18, marginBottom:14, borderWidth:1, borderColor:Colors.border },
  custName:        { fontSize:18, fontWeight:'800', color:Colors.textDark },
  custPhone:       { fontSize:14, color:Colors.textMuted, marginTop:2 },
  custAddr:        { fontSize:13, color:Colors.textMuted, marginTop:6 },
  callBig:         { backgroundColor:Colors.deliveryLight, borderRadius:14, padding:14, alignItems:'center', minWidth:56 },
  payCard:         { backgroundColor:'#fff', borderRadius:16, padding:16, marginBottom:14, borderWidth:2 },
  payLabel:        { fontSize:11, color:Colors.textMuted, textTransform:'uppercase', letterSpacing:0.5 },
  payAmount:       { fontSize:18, fontWeight:'800', color:Colors.textDark, marginTop:2 },
  payStatus:       { fontSize:11, fontWeight:'700', marginTop:10, textAlign:'right', textTransform:'uppercase' },
  sectionTitle:    { fontSize:14, fontWeight:'700', color:Colors.primary, marginBottom:10, marginTop:4 },
  itemsCard:       { backgroundColor:'#fff', borderRadius:16, borderWidth:1, borderColor:Colors.border, overflow:'hidden', marginBottom:14 },
  itemRow:         { flexDirection:'row', alignItems:'center', padding:14 },
  itemName:        { flex:1, fontSize:14, fontWeight:'600', color:Colors.textDark },
  itemQty:         { fontSize:14, color:Colors.textMuted },
  notesBox:        { backgroundColor:Colors.warningBg, borderRadius:12, padding:12, marginBottom:14 },
  notesText:       { fontSize:13, color:Colors.warning },
  doneBox:         { backgroundColor:Colors.successBg, borderRadius:16, padding:28, alignItems:'center', borderWidth:1.5, borderColor:Colors.success },
  doneTitle:       { fontSize:18, fontWeight:'700', color:Colors.success },
  bottomBar:       { position:'absolute', bottom:0, left:0, right:0, backgroundColor:'#fff', padding:16, paddingBottom:Platform.OS==='ios'?32:16, borderTopWidth:1, borderTopColor:Colors.border, gap:10 },
  mainBtn:         { borderRadius:14, padding:16, alignItems:'center' },
  mainBtnText:     { color:'#fff', fontWeight:'800', fontSize:15 },
  secBtn:          { borderRadius:14, padding:14, alignItems:'center', borderWidth:2 },
  secBtnText:      { fontWeight:'700', fontSize:14 },
  failBtn:         { backgroundColor:Colors.errorBg, borderRadius:14, padding:14, alignItems:'center', minWidth:100 },
  failBtnText:     { color:Colors.error, fontWeight:'700', fontSize:14 },
  modalOverlay:    { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' },
  modal:           { backgroundColor:'#fff', borderRadius:24, borderBottomLeftRadius:0, borderBottomRightRadius:0, padding:24, paddingBottom:40 },
  modalTitle:      { fontSize:18, fontWeight:'800', color:Colors.primary, marginBottom:4 },
  modalSub:        { fontSize:13, color:Colors.textMuted, marginBottom:16 },
  cashInput:       { backgroundColor:Colors.offWhite, borderRadius:12, padding:16, fontSize:24, fontWeight:'800', color:Colors.textDark, textAlign:'center', borderWidth:1.5, borderColor:Colors.border, marginBottom:16 },
  modalOption:     { padding:14, borderRadius:12, borderWidth:1.5, borderColor:Colors.border, marginBottom:8 },
  modalOptionErr:  { borderColor:Colors.error, backgroundColor:Colors.errorBg },
  modalOptionText: { fontSize:15, color:Colors.textDark },
  modalBtns:       { flexDirection:'row', gap:12 },
  modalCancel:     { flex:1, padding:14, borderRadius:12, borderWidth:1.5, borderColor:Colors.border, alignItems:'center' },
  modalConfirm:    { flex:1, padding:14, borderRadius:12, alignItems:'center' },
  modalConfirmText:{ color:'#fff', fontWeight:'700', fontSize:15 },
});
