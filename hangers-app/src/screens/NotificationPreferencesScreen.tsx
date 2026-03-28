// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION PREFERENCES SCREEN
//   Toggle WhatsApp and push notification preferences
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch,
  ScrollView, StatusBar, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../utils/theme';
import { authAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';

// ─────────────────────────────────────────────────────────────────────────────
export default function NotificationPreferencesScreen({ navigation }: any) {
  const { customer, refreshProfile } = useAuth();

  const [notifWhatsApp, setNotifWhatsApp] = useState<boolean>(
    customer?.notifWhatsApp !== false
  );
  const [notifPush, setNotifPush] = useState<boolean>(
    customer?.notifPush !== false
  );
  const [saving, setSaving] = useState(false);
  const [dirty,  setDirty]  = useState(false);

  // Track original values so we know if anything changed
  useEffect(() => {
    if (customer) {
      setNotifWhatsApp(customer.notifWhatsApp !== false);
      setNotifPush(customer.notifPush !== false);
    }
  }, [customer]);

  const handleChange = (key: 'whatsapp' | 'push', val: boolean) => {
    if (key === 'whatsapp') setNotifWhatsApp(val);
    else setNotifPush(val);
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await authAPI.updateNotificationPrefs({ notifWhatsApp, notifPush });
      await refreshProfile();
      setDirty(false);
      Alert.alert('Saved', 'Your notification preferences have been updated.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.offWhite }}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Header */}
      <LinearGradient colors={['#023c62', '#035a8f']} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.back}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <View style={{ width: 36 }} />
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
        {/* Info card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            Control how Hangers reaches you. We only send important updates
            about your orders, no spam.
          </Text>
        </View>

        {/* Preferences card */}
        <View style={styles.card}>
          {/* WhatsApp */}
          <View style={styles.prefRow}>
            <View style={{ flex: 1, marginRight: Spacing.md }}>
              <Text style={styles.prefLabel}>WhatsApp Updates</Text>
              <Text style={styles.prefSub}>
                Order status, pickup reminders, and delivery alerts via WhatsApp
              </Text>
            </View>
            <Switch
              value={notifWhatsApp}
              onValueChange={(v) => handleChange('whatsapp', v)}
              trackColor={{ false: '#DCE8F0', true: Colors.primaryMid }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.separator} />

          {/* Push */}
          <View style={styles.prefRow}>
            <View style={{ flex: 1, marginRight: Spacing.md }}>
              <Text style={styles.prefLabel}>Push Notifications</Text>
              <Text style={styles.prefSub}>
                In-app alerts when your order status changes
              </Text>
            </View>
            <Switch
              value={notifPush}
              onValueChange={(v) => handleChange('push', v)}
              trackColor={{ false: '#DCE8F0', true: Colors.primaryMid }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Save button */}
        <TouchableOpacity
          style={[styles.saveBtn, (!dirty || saving) && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={!dirty || saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>Save Preferences</Text>
          }
        </TouchableOpacity>

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          Even if notifications are off, you can always check your order status
          in the My Orders tab.
        </Text>
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header:      { paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 20, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  back:        { fontSize: 22, color: '#fff' },
  title:       { fontSize: FontSize.lg, fontWeight: '700', color: '#fff' },

  infoCard:    { backgroundColor: Colors.accent, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.primaryLight },
  infoText:    { fontSize: FontSize.sm, color: Colors.primary, lineHeight: 22 },

  card:        { backgroundColor: '#fff', borderRadius: 16, padding: 4, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  prefRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: Spacing.md },
  prefLabel:   { fontSize: FontSize.base, fontWeight: '600', color: Colors.textDark, marginBottom: 4 },
  prefSub:     { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 18 },
  separator:   { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.md },

  saveBtn:     { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 16, alignItems: 'center', marginBottom: Spacing.md },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.base },
  disclaimer:  { fontSize: FontSize.xs, color: Colors.textLight, textAlign: 'center', lineHeight: 20 },
});
