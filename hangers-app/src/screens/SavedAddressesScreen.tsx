// ─────────────────────────────────────────────────────────────────────────────
// SAVED ADDRESSES SCREEN — Manage all saved pickup addresses
// Accessible from Profile → Saved Addresses
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Platform, StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing } from '../utils/theme';
import { addressAPI, metadataAPI } from '../services/api';
import PageMotion from '../components/PageMotion';
import AnimatedButton from '../components/AnimatedButton';

interface SavedAddress { id: string; label: string; address: string; isDefault: boolean; }

const LABEL_ICON: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = { Home: 'home-outline', Work: 'office-building-outline', Other: 'map-marker-outline' };

export default function SavedAddressesScreen({ navigation }: any) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState('');
  const [adding,    setAdding]    = useState(false);      // show add form
  const [editId,    setEditId]    = useState<string|null>(null); // which card is editing

  // Add form state
  const [newText,  setNewText]  = useState('');
  const [newLabel, setNewLabel] = useState('Home');
  const [saving,   setSaving]   = useState(false);

  // Edit form state (inline)
  const [editText,  setEditText]  = useState('');
  const [editLabel, setEditLabel] = useState('Home');
  const [labelOptions, setLabelOptions] = useState<Array<{ value: string; label: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const r: any = await addressAPI.getAll();
      setAddresses(r?.addresses || []);
    } catch (e: any) {
      setAddresses([]);
      setLoadError(e?.message || 'Could not load saved addresses.');
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    metadataAPI.getAll()
      .then((response: any) => {
        const metadata = response?.metadata || response?.data?.metadata || {};
        const labels = metadata.addressLabels || [];
        setLabelOptions(labels);
        if (labels.length) {
          setNewLabel((prev) => labels.some((item: any) => item.value === prev) ? prev : labels[0].value);
          setEditLabel((prev) => labels.some((item: any) => item.value === prev) ? prev : labels[0].value);
        }
      })
      .catch(() => {
        setLabelOptions([
          { value: 'Home', label: 'Home' },
          { value: 'Work', label: 'Work' },
          { value: 'Other', label: 'Other' },
        ]);
      });
  }, []);

  const saveNew = async () => {
    if (!newText.trim()) { Alert.alert('Enter an address'); return; }
    setSaving(true);
    try {
      await addressAPI.create({ label: newLabel, address: newText.trim(), setAsDefault: addresses.length === 0 });
      setNewText(''); setNewLabel(labelOptions[0]?.value || 'Home'); setAdding(false);
      await load();
    } catch (e: any) { Alert.alert('Error', e?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const startEdit = (addr: SavedAddress) => {
    setEditId(addr.id); setEditText(addr.address); setEditLabel(addr.label);
  };

  const saveEdit = async (id: string) => {
    if (!editText.trim()) return;
    setSaving(true);
    try {
      await addressAPI.update(id, { label: editLabel, address: editText.trim() });
      setEditId(null); await load();
    } catch (e: any) { Alert.alert('Error', e?.message || 'Failed to update'); }
    finally { setSaving(false); }
  };

  const setDefault = async (id: string) => {
    try {
      await addressAPI.setDefault(id);
      setAddresses(prev => prev.map(a => ({ ...a, isDefault: a.id === id })));
    } catch (e: any) { Alert.alert('Error', e?.message || 'Failed'); }
  };

  const remove = (id: string, label: string) => {
    Alert.alert(
      'Delete Address',
      `Delete "${label}" address?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try { await addressAPI.delete(id); await load(); }
            catch (e: any) { Alert.alert('Error', e?.message || 'Failed'); }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Header */}
      <LinearGradient colors={['#023c62', '#035a8f']} style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setAdding(true); setEditId(null); }} style={styles.addBtn}>
            <Text style={styles.addBtnText}>＋ Add</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>Saved Addresses</Text>
        <Text style={styles.headerSub}>Keep your pickup places ready so booking stays one-tap fast.</Text>
      </LinearGradient>

      <PageMotion style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ── Add new address form ──────────────────────────────────────── */}
        {adding && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Add New Address</Text>

            {/* Label picker */}
            <Text style={styles.fieldLabel}>Label</Text>
            <View style={styles.labelRow}>
              {labelOptions.map((label) => (
                <TouchableOpacity key={label.value} onPress={() => setNewLabel(label.value)} style={[styles.labelChip, newLabel === label.value && styles.labelChipSel]}>
                  <MaterialCommunityIcons name={LABEL_ICON[label.value] || 'map-marker-outline'} size={15} color={newLabel === label.value ? Colors.primary : '#6b7fa3'} style={styles.labelChipIcon} />
                  <Text style={[styles.labelChipText, newLabel === label.value && { color: Colors.primary, fontWeight: '700' }]}>{label.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Address input */}
            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Address</Text>
            <TextInput
              value={newText}
              onChangeText={setNewText}
              placeholder="Building, floor, street, landmark, city..."
              placeholderTextColor="#9dafc8"
              multiline
              numberOfLines={4}
              autoFocus
              style={styles.textArea}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <AnimatedButton onPress={() => { setAdding(false); setNewText(''); }} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </AnimatedButton>
              <AnimatedButton onPress={saveNew} disabled={saving || !newText.trim()} style={[styles.saveBtn, (!newText.trim() || saving) && { opacity: 0.5 }]}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save Address</Text>}
              </AnimatedButton>
            </View>
          </View>
        )}

        {/* ── Loading ───────────────────────────────────────────────────── */}
        {loading && (
          <View style={styles.centerBox}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        )}

        {!loading && !!loadError && (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="alert-circle-outline" size={56} color={Colors.primary} style={styles.emptyIcon} />
            <Text style={styles.emptyTitle}>Could not load addresses</Text>
            <Text style={styles.emptySub}>{loadError}</Text>
            <AnimatedButton onPress={load} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnText}>Retry</Text>
            </AnimatedButton>
          </View>
        )}

        {/* ── Empty state ───────────────────────────────────────────────── */}
        {!loading && !loadError && addresses.length === 0 && !adding && (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="map-marker-outline" size={56} color={Colors.primary} style={styles.emptyIcon} />
            <Text style={styles.emptyTitle}>No saved addresses yet</Text>
            <Text style={styles.emptySub}>Save your home or work address so you don't have to type it every time you book a pickup.</Text>
            <AnimatedButton onPress={() => setAdding(true)} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnText}>＋ Add Your First Address</Text>
            </AnimatedButton>
          </View>
        )}

        {/* ── Address cards ─────────────────────────────────────────────── */}
        {!loading && !loadError && addresses.map((addr, idx) => {
          const isEditing = editId === addr.id;
          return (
            <View key={addr.id} style={[styles.addrCard, addr.isDefault && styles.addrCardDefault]}>

              {/* ── View mode ───────────────────────────────────────────── */}
              {!isEditing && (
                <>
                  <View style={styles.addrTop}>
                    <View style={styles.addrLabelRow}>
                      <MaterialCommunityIcons name={LABEL_ICON[addr.label] || 'map-marker-outline'} size={18} color={Colors.primary} style={styles.addrLabelIcon} />
                      <Text style={styles.addrLabel}>{labelOptions.find((label) => label.value === addr.label)?.label || addr.label}</Text>
                      {addr.isDefault && (
                        <View style={styles.defaultBadge}>
                          <View style={styles.defaultBadgeInner}>
                            <Feather name="check" size={11} color={Colors.primary} />
                            <Text style={styles.defaultBadgeText}>Default</Text>
                          </View>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 14 }}>
                      <TouchableOpacity onPress={() => startEdit(addr)}>
                        <Text style={styles.actionText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => remove(addr.id, addr.label)}>
                        <Text style={[styles.actionText, { color: '#dc2626' }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={styles.addrText}>{addr.address}</Text>

                  {!addr.isDefault && (
                    <TouchableOpacity onPress={() => setDefault(addr.id)} style={styles.setDefaultBtn}>
                      <Text style={styles.setDefaultText}>Set as default</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              {/* ── Edit mode ───────────────────────────────────────────── */}
              {isEditing && (
                <>
                  <Text style={styles.formTitle}>Edit Address</Text>
                  <Text style={styles.fieldLabel}>Label</Text>
                  <View style={styles.labelRow}>
                    {labelOptions.map((label) => (
                      <TouchableOpacity key={label.value} onPress={() => setEditLabel(label.value)} style={[styles.labelChip, editLabel === label.value && styles.labelChipSel]}>
                        <MaterialCommunityIcons name={LABEL_ICON[label.value] || 'map-marker-outline'} size={15} color={editLabel === label.value ? Colors.primary : '#6b7fa3'} style={styles.labelChipIcon} />
                        <Text style={[styles.labelChipText, editLabel === label.value && { color: Colors.primary, fontWeight: '700' }]}>{label.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Address</Text>
                  <TextInput value={editText} onChangeText={setEditText} multiline numberOfLines={4} autoFocus style={styles.textArea} />
                  <View style={{ flexDirection:'row', gap:10, marginTop:12 }}>
                    <AnimatedButton onPress={() => setEditId(null)} style={styles.cancelBtn}>
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </AnimatedButton>
                    <AnimatedButton onPress={() => saveEdit(addr.id)} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
                      {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
                    </AnimatedButton>
                  </View>
                </>
              )}
            </View>
          );
        })}

        {/* ── Tip ───────────────────────────────────────────────────────── */}
        {!loading && addresses.length > 0 && (
          <View style={styles.tip}>
            <View style={styles.tipInner}>
              <Feather name="info" size={14} color={Colors.primary} />
              <Text style={styles.tipText}>Your default address is pre-selected every time you book a pickup.</Text>
            </View>
          </View>
        )}
      </ScrollView>
      </PageMotion>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex:1, backgroundColor:'#f4f7fb' },
  header:          { paddingTop: Platform.OS === 'ios' ? 48 : 24, paddingBottom:16, paddingHorizontal: Spacing.lg },
  headerTop:       { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:12 },
  backBtn:         { width:38, height:38, borderRadius:19, backgroundColor:'rgba(255,255,255,0.15)', alignItems:'center', justifyContent:'center' },
  backText:        { color:'#fff', fontSize:20 },
  headerTitle:     { color:'#fff', fontSize:24, fontWeight:'700' },
  headerSub:       { color:'rgba(255,255,255,0.76)', fontSize:12, lineHeight:18, marginTop:6, maxWidth:'82%' },
  addBtn:          { backgroundColor:'rgba(255,255,255,0.15)', borderRadius:20, paddingHorizontal:14, paddingVertical:7, borderWidth:1, borderColor:'rgba(255,255,255,0.25)' },
  addBtnText:      { color:'#fff', fontSize:13, fontWeight:'700' },
  centerBox:       { paddingTop:60, alignItems:'center' },
  emptyBox:        { paddingTop:48, alignItems:'center', paddingHorizontal:20 },
  emptyIcon:       { marginBottom:16 },
  emptyTitle:      { fontSize:18, fontWeight:'700', color:'#1a2332', marginBottom:8, textAlign:'center' },
  emptySub:        { fontSize:14, color:'#6b7fa3', textAlign:'center', lineHeight:22, marginBottom:28 },
  emptyBtn:        { backgroundColor: Colors.primary, borderRadius:12, paddingHorizontal:24, paddingVertical:14 },
  emptyBtnText:    { color:'#fff', fontWeight:'700', fontSize:14 },

  // Add / edit form card
  formCard:        { backgroundColor:'#fff', borderRadius:16, padding:20, marginBottom:16, borderWidth:1.5, borderColor: Colors.primaryLight },
  formTitle:       { fontWeight:'700', fontSize:16, color: Colors.primary, marginBottom:14 },
  fieldLabel:      { fontSize:11, fontWeight:'700', color:'#6b7fa3', textTransform:'uppercase', letterSpacing:0.7, marginBottom:8 },
  labelRow:        { flexDirection:'row', gap:8 },
  labelChip:       { flexDirection:'row', alignItems:'center', gap:5, paddingHorizontal:12, paddingVertical:8, borderRadius:20, borderWidth:1.5, borderColor:'#dce8f0', backgroundColor:'#f7f9fc' },
  labelChipSel:    { borderColor: Colors.primary, backgroundColor:'#f0f5fa' },
  labelChipIcon:   {},
  labelChipText:   { fontSize:13, color:'#6b7fa3' },
  textArea:        { backgroundColor:'#f7f9fc', borderRadius:12, padding:14, fontSize:14, color:'#1a2332', borderWidth:1.5, borderColor:'#dce8f0', minHeight:100, textAlignVertical:'top', marginTop:4 },
  cancelBtn:       { flex:1, backgroundColor:'#f0f4f8', borderRadius:10, paddingVertical:12, alignItems:'center' },
  cancelBtnText:   { color:'#6b7fa3', fontWeight:'700', fontSize:14 },
  saveBtn:         { flex:2, backgroundColor: Colors.primary, borderRadius:10, paddingVertical:12, alignItems:'center' },
  saveBtnText:     { color:'#fff', fontWeight:'700', fontSize:14 },

  // Address cards
  addrCard:        { backgroundColor:'#fff', borderRadius:16, padding:18, marginBottom:12, borderWidth:1.5, borderColor:'#e8f0f7' },
  addrCardDefault: { borderColor: Colors.primary },
  addrTop:         { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 },
  addrLabelRow:    { flexDirection:'row', alignItems:'center', gap:8 },
  addrLabelIcon:   {},
  addrLabel:       { fontSize:15, fontWeight:'700', color:'#1a2332' },
  defaultBadge:    { backgroundColor:'#e8f0f7', borderRadius:20, paddingHorizontal:10, paddingVertical:3 },
  defaultBadgeInner:{ flexDirection:'row', alignItems:'center', gap:4 },
  defaultBadgeText:{ fontSize:11, fontWeight:'700', color: Colors.primary },
  addrText:        { fontSize:14, color:'#6b7fa3', lineHeight:22 },
  actionText:      { fontSize:13, fontWeight:'600', color: Colors.primaryMid },
  setDefaultBtn:   { marginTop:12, borderTopWidth:1, borderTopColor:'#f0f4f8', paddingTop:10 },
  setDefaultText:  { fontSize:13, color: Colors.primaryMid, fontWeight:'600' },

  // Tip
  tip:             { backgroundColor:'#e8f0f7', borderRadius:12, padding:14, marginTop:4 },
  tipInner:        { flexDirection:'row', alignItems:'flex-start', gap:8 },
  tipText:         { fontSize:13, color: Colors.primary, lineHeight:20 },
});
