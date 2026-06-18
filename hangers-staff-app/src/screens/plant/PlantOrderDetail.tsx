import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator, Modal, TextInput, Alert, RefreshControl,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../utils/theme';
import { metadataAPI, plantAPI } from '../../services/api';

// QR code rendering (install: npx expo install react-native-qrcode-svg react-native-svg)
let QRCode: any = null;
try { QRCode = require('react-native-qrcode-svg').default; } catch { /* not installed yet */ }

export default function PlantOrderDetail({ route, navigation }: any) {
  const { orderId } = route.params || {};
  const [order,     setOrder]     = useState<any>(null);
  const [loadError, setLoadError] = useState('');
  const [stageFlow, setStageFlow] = useState<any[]>([]);
  const [plantStages, setPlantStages] = useState<string[]>([]);
  const [issueTypes, setIssueTypes] = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [stageModal,setStageModal]= useState(false);
  const [issueModal,setIssueModal]= useState(false);
  const [selectedStage, setSelectedStage] = useState('');
  const [selectedIssue, setSelectedIssue] = useState('');
  const [notes,         setNotes]         = useState('');
  const [bagCount,      setBagCount]      = useState('');
  const [saving,        setSaving]        = useState(false);
  const [tagsVisible,   setTagsVisible]   = useState(false);
  const [generatingTags,setGeneratingTags]= useState(false);

  const load = useCallback(async () => {
    try {
      const r: any = await plantAPI.order(orderId);
      setOrder(r.data?.order);
      setLoadError('');
    } catch (e: any) {
      setOrder(null);
      setLoadError(e?.message || 'Could not load this order right now.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    metadataAPI.getAll().then((response: any) => {
      const metadata = response?.metadata || response?.data?.metadata || {};
      const nextFlow = (metadata.orderStatuses || [])
        .filter((item: any) => item.plantTimeline)
        .map((item: any) => ({
          key: item.key,
          label: item.plantLabel || item.label || item.key,
          icon: item.icon || 'package-variant-closed',
        }));
      if (nextFlow.length) {
        setStageFlow(nextFlow);
        setPlantStages((metadata.orderStatuses || []).filter((item: any) => item.plantSelectable).map((item: any) => item.key));
      }
      if (metadata.plantIssueTypes?.length) {
        setIssueTypes(metadata.plantIssueTypes.map((item: any) => ({
          key: item.value,
          label: item.label,
          icon: item.icon || 'note-text-outline',
        })));
      }
    }).catch(() => {
      setStageFlow([]);
      setPlantStages([]);
      setIssueTypes([]);
    });
  }, []);

  const handleSetStage = async () => {
    if (!selectedStage) return;
    setSaving(true);
    try {
      const noteWithBags = [
        bagCount ? `Bags: ${bagCount}` : '',
        notes || '',
      ].filter(Boolean).join(' · ') || undefined;
      await plantAPI.setStage(orderId, selectedStage, noteWithBags);
      setStageModal(false); setSelectedStage(''); setNotes(''); setBagCount('');
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSaving(false); }
  };

  const handleFlagIssue = async () => {
    if (!selectedIssue) return;
    setSaving(true);
    try {
      await plantAPI.flagIssue(orderId, selectedIssue, notes || undefined);
      setIssueModal(false); setSelectedIssue(''); setNotes('');
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSaving(false); }
  };

  if (loading) return (
    <View style={{ flex:1, backgroundColor: Colors.plant, justifyContent:'center', alignItems:'center' }}>
      <ActivityIndicator size="large" color="#fff" />
    </View>
  );

  if (!order) return (
    <View style={styles.errorWrap}>
      <MaterialCommunityIcons name="alert-circle-outline" size={42} color={Colors.error} />
      <Text style={styles.errorTitle}>Could not load order</Text>
      <Text style={styles.errorBody}>{loadError || 'Please try again.'}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); load(); }}>
        <Text style={styles.retryBtnText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  const computedStageFlow = stageFlow.length
    ? stageFlow
    : (order?.status ? [{ key: order.status, label: order.status, icon: 'package-variant-closed' }] : []);
  const currentIdx = computedStageFlow.findIndex(s => s.key === order?.status);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{order?.orderNumber || 'Order'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.plant} />}
      >
        {/* Customer + status card */}
        <View style={styles.topCard}>
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' }}>
            <View>
              <Text style={styles.custName}>{order?.customer?.name || 'Customer'}</Text>
              <Text style={styles.custPhone}>{order?.customer?.phone}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: Colors.plant + '20' }]}>
              <Text style={[styles.statusText, { color: Colors.plant }]}>{order?.statusLabel || order?.status}</Text>
            </View>
          </View>
          {order?.notes ? (
            <View style={styles.notesBox}>
              <Text style={styles.notesText}>Notes: {order.notes}</Text>
            </View>
          ) : null}
        </View>

        {/* Items */}
        <Text style={styles.sectionTitle}>Garments ({order?.totalItems})</Text>
        <View style={styles.itemsCard}>
          {order?.items?.map((item: any, i: number) => (
            <View key={i} style={[styles.itemRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
              <MaterialCommunityIcons name="tshirt-crew-outline" size={18} color={Colors.plant} style={styles.itemIcon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.serviceName}</Text>
                {item.notes ? <Text style={styles.itemNotes}>{item.notes}</Text> : null}
              </View>
              <Text style={styles.itemQty}>× {item.quantity}</Text>
            </View>
          ))}
        </View>

        {/* Stage progress */}
        <Text style={styles.sectionTitle}>Stage Progress</Text>
        <View style={styles.stageCard}>
          {computedStageFlow.map((s, idx) => {
            const done    = idx < currentIdx;
            const current = idx === currentIdx;
            return (
              <View key={s.key} style={[styles.stageRow, idx > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                <View style={[styles.stageDot, done && styles.stageDotDone, current && styles.stageDotCurrent]}>
                  {done ? (
                    <Feather name="check" size={12} color="#fff" />
                  ) : (
                    <MaterialCommunityIcons name={s.icon as any} size={12} color={current ? Colors.plant : '#6b7fa3'} />
                  )}
                </View>
                <Text style={[styles.stageLabel, { color: current ? Colors.plant : done ? Colors.textDark : '#b8c8d8' }]}>
                  {s.label}
                </Text>
                {current && <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>Current</Text></View>}
              </View>
            );
          })}
        </View>

        {/* Garment Tags */}
        <Text style={styles.sectionTitle}>Garment Tags</Text>
        <View style={styles.itemsCard}>
          {order?.items?.some((item: any) => item.tagNumber) ? (
            <>
              {order.items.map((item: any, i: number) => (
                <View key={i} style={[styles.itemRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.serviceName} × {item.quantity}</Text>
                    {item.tagNumber ? (
                      <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>{item.tagNumber}</Text>
                    ) : (
                      <Text style={{ fontSize: 11, color: Colors.textLight }}>No tag yet</Text>
                    )}
                  </View>
                  {item.tagNumber && QRCode ? (
                    <QRCode value={item.tagNumber} size={72} />
                  ) : item.tagNumber ? (
                    <View style={{ width: 72, height: 72, backgroundColor: Colors.offWhite, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 9, color: Colors.textMuted, textAlign: 'center' }}>Install{'\n'}QR lib</Text>
                    </View>
                  ) : null}
                </View>
              ))}
              <TouchableOpacity
                style={{ margin: 12, padding: 12, backgroundColor: Colors.plant, borderRadius: 10, alignItems: 'center' }}
                onPress={() => setTagsVisible(true)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="printer" size={14} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>View All Tags</Text>
                </View>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={{ padding: 16, alignItems: 'center' }}
              disabled={generatingTags}
              onPress={async () => {
                setGeneratingTags(true);
                try {
                  await plantAPI.generateTags(orderId);
                  await load();
                } catch (e: any) {
                  Alert.alert('Error', e.message);
                } finally { setGeneratingTags(false); }
              }}>
              {generatingTags
                ? <ActivityIndicator color={Colors.plant} />
                : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="tag" size={14} color={Colors.plant} />
                    <Text style={{ color: Colors.plant, fontWeight: '700', fontSize: 14 }}>Generate Garment Tags</Text>
                  </View>
              }
            </TouchableOpacity>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.plant }]}
            onPress={() => setStageModal(true)}>
            <View style={styles.actionBtnInner}>
              <Feather name="arrow-up" size={14} color="#fff" />
              <Text style={styles.actionBtnText}>Update Stage</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.error }]}
            onPress={() => setIssueModal(true)}>
            <View style={styles.actionBtnInner}>
              <Feather name="alert-triangle" size={14} color="#fff" />
              <Text style={styles.actionBtnText}>Flag Issue</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Stage Modal */}
      <Modal visible={stageModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Update Stage</Text>
            {plantStages.map(s => (
              <TouchableOpacity key={s} style={[styles.modalOption, selectedStage === s && styles.modalOptionSelected]}
                onPress={() => setSelectedStage(s)}>
                <Text style={[styles.modalOptionText, selectedStage === s && { color: Colors.plant, fontWeight: '700' }]}>
                  {stageFlow.find(f => f.key === s)?.label}
                </Text>
              </TouchableOpacity>
            ))}
            <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginTop: 8, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Bag Count (optional)</Text>
            <TextInput style={[styles.notesInput, { minHeight: 44, marginBottom: 8 }]} value={bagCount} onChangeText={setBagCount}
              placeholder="e.g. 3 bags in" placeholderTextColor="#9dafc8" keyboardType="default" />
            <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Notes (optional)</Text>
            <TextInput style={styles.notesInput} value={notes} onChangeText={setNotes}
              placeholder="Any additional note..." placeholderTextColor="#9dafc8" multiline />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setStageModal(false); setSelectedStage(''); setNotes(''); }}>
                <Text style={{ color: Colors.textMuted, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, { backgroundColor: Colors.plant }]}
                onPress={handleSetStage} disabled={!selectedStage || saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalConfirmText}>Confirm</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* All Tags Modal */}
      <Modal visible={tagsVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { maxHeight: '90%' }]}>
            <Text style={styles.modalTitle}>Garment Tags — {order?.orderNumber}</Text>
            <ScrollView>
              {order?.items?.filter((item: any) => item.tagNumber).map((item: any, i: number) => (
                <View key={i} style={{ alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                  {QRCode
                    ? <QRCode value={item.tagNumber} size={140} />
                    : <View style={{ width: 140, height: 140, backgroundColor: Colors.offWhite, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: Colors.textMuted, textAlign: 'center' }}>Install react-native-qrcode-svg</Text>
                      </View>
                  }
                  <Text style={{ fontWeight: '700', fontSize: 15, marginTop: 8 }}>{item.serviceName}</Text>
                  <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>{item.tagNumber}</Text>
                  <Text style={{ fontSize: 12, color: Colors.textMuted }}>Qty: {item.quantity}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.modalConfirm, { backgroundColor: Colors.plant, margin: 16 }]}
              onPress={() => setTagsVisible(false)}>
              <Text style={styles.modalConfirmText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Issue Modal */}
      <Modal visible={issueModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Flag an Issue</Text>
            {issueTypes.map(it => (
              <TouchableOpacity key={it.key} style={[styles.modalOption, selectedIssue === it.key && styles.modalOptionErrSelected]}
                onPress={() => setSelectedIssue(it.key)}>
                <View style={styles.modalOptionInner}>
                  <MaterialCommunityIcons name={it.icon as any} size={16} color={selectedIssue === it.key ? Colors.error : Colors.textDark} />
                  <Text style={[styles.modalOptionText, selectedIssue === it.key && { color: Colors.error, fontWeight: '700' }]}>
                    {it.label}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            <TextInput style={styles.notesInput} value={notes} onChangeText={setNotes}
              placeholder="Describe the issue..." placeholderTextColor="#9dafc8" multiline />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setIssueModal(false); setSelectedIssue(''); setNotes(''); }}>
                <Text style={{ color: Colors.textMuted, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, { backgroundColor: Colors.error }]}
                onPress={handleFlagIssue} disabled={!selectedIssue || saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalConfirmText}>Flag Issue</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: Colors.offWhite },
  errorWrap:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: Colors.offWhite },
  errorTitle:        { fontSize: 18, fontWeight: '800', color: Colors.textDark, marginTop: 12, marginBottom: 6 },
  errorBody:         { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginBottom: 16 },
  retryBtn:          { backgroundColor: Colors.plant, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  retryBtnText:      { color: '#fff', fontSize: 14, fontWeight: '700' },
  header:            { flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor: Colors.plant, paddingTop: Platform.OS === 'ios' ? 52 : 22, paddingHorizontal: Spacing.lg, paddingBottom: 16 },
  backBtn:           { width:40, height:40, borderRadius:20, backgroundColor:'rgba(255,255,255,0.15)', alignItems:'center', justifyContent:'center' },
  backText:          { color:'#fff', fontSize:22 },
  headerTitle:       { color:'#fff', fontSize:17, fontWeight:'700' },
  topCard:           { backgroundColor:'#fff', borderRadius:16, padding:20, marginBottom:16, borderWidth:1, borderColor:Colors.border },
  custName:          { fontSize:17, fontWeight:'700', color:Colors.textDark },
  custPhone:         { fontSize:13, color:Colors.textMuted, marginTop:2 },
  statusBadge:       { borderRadius:20, paddingHorizontal:12, paddingVertical:5 },
  statusText:        { fontSize:12, fontWeight:'700' },
  notesBox:          { backgroundColor:Colors.warningBg, borderRadius:10, padding:10, marginTop:12 },
  notesText:         { fontSize:13, color:Colors.warning },
  sectionTitle:      { fontSize:14, fontWeight:'700', color:Colors.primary, marginBottom:10, marginTop:4 },
  itemsCard:         { backgroundColor:'#fff', borderRadius:16, borderWidth:1, borderColor:Colors.border, overflow:'hidden', marginBottom:20 },
  itemRow:           { flexDirection:'row', alignItems:'center', padding:14, gap:12 },
  itemIcon:          {},
  itemName:          { fontSize:14, fontWeight:'600', color:Colors.textDark },
  itemNotes:         { fontSize:12, color:Colors.textMuted, marginTop:2 },
  itemQty:           { fontSize:14, color:Colors.textMuted },
  stageCard:         { backgroundColor:'#fff', borderRadius:16, borderWidth:1, borderColor:Colors.border, overflow:'hidden', marginBottom:20 },
  stageRow:          { flexDirection:'row', alignItems:'center', padding:14, gap:12 },
  stageDot:          { width:34, height:34, borderRadius:17, backgroundColor:Colors.offWhite, alignItems:'center', justifyContent:'center', borderWidth:1.5, borderColor:Colors.border },
  stageDotDone:      { backgroundColor:Colors.primary, borderColor:Colors.primary },
  stageDotCurrent:   { backgroundColor:'#fff', borderColor:Colors.plant, borderWidth:2.5 },
  stageLabel:        { flex:1, fontSize:14, fontWeight:'600' },
  currentBadge:      { backgroundColor:Colors.plantLight, borderRadius:20, paddingHorizontal:10, paddingVertical:3 },
  currentBadgeText:  { color:Colors.plant, fontSize:11, fontWeight:'700' },
  actionRow:         { flexDirection:'row', gap:12 },
  actionBtn:         { flex:1, borderRadius:14, padding:16, alignItems:'center' },
  actionBtnInner:    { flexDirection:'row', alignItems:'center', gap:8 },
  actionBtnText:     { color:'#fff', fontWeight:'800', fontSize:15 },
  modalOverlay:      { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' },
  modal:             { backgroundColor:'#fff', borderRadius:24, borderBottomLeftRadius:0, borderBottomRightRadius:0, padding:24, paddingBottom:40 },
  modalTitle:        { fontSize:18, fontWeight:'800', color:Colors.primary, marginBottom:16 },
  modalOption:       { padding:14, borderRadius:12, borderWidth:1.5, borderColor:Colors.border, marginBottom:8 },
  modalOptionSelected:  { borderColor:Colors.plant, backgroundColor:Colors.plantLight },
  modalOptionErrSelected:{ borderColor:Colors.error, backgroundColor:Colors.errorBg },
  modalOptionInner:  { flexDirection:'row', alignItems:'center', gap:10 },
  modalOptionText:   { fontSize:15, color:Colors.textDark },
  notesInput:        { backgroundColor:Colors.offWhite, borderRadius:12, padding:12, fontSize:14, color:Colors.textDark, borderWidth:1, borderColor:Colors.border, minHeight:70, marginTop:4, marginBottom:16 },
  modalBtns:         { flexDirection:'row', gap:12 },
  modalCancel:       { flex:1, padding:14, borderRadius:12, borderWidth:1.5, borderColor:Colors.border, alignItems:'center' },
  modalConfirm:      { flex:1, padding:14, borderRadius:12, alignItems:'center' },
  modalConfirmText:  { color:'#fff', fontWeight:'700', fontSize:15 },
});
