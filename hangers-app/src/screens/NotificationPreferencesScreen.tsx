import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { authAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { Colors, FontSize, Fonts, Radius, Shadow, Spacing } from '../utils/theme';

export default function NotificationPreferencesScreen({ navigation }: any) {
  const { customer, refreshProfile } = useAuth();
  const [notifWhatsApp, setNotifWhatsApp] = useState(customer?.notifWhatsApp !== false);
  const [notifPush, setNotifPush] = useState(customer?.notifPush !== false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!customer) return;
    setNotifWhatsApp(customer.notifWhatsApp !== false);
    setNotifPush(customer.notifPush !== false);
  }, [customer]);

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
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#02253b', '#023c62', '#0b709f']} style={styles.hero}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.heroEyebrow}>Notifications</Text>
          <Text style={styles.heroTitle}>Choose how Hangers should reach you.</Text>
          <Text style={styles.heroBody}>
            Keep critical order updates on. You can always turn off channels you do not want while
            still checking order status inside the app.
          </Text>
        </LinearGradient>

        <View style={styles.infoCard}>
          <MaterialCommunityIcons name="message-processing-outline" size={20} color={Colors.primary} />
          <Text style={styles.infoText}>We only send service-related communication. No spam campaigns.</Text>
        </View>

        <View style={styles.prefCard}>
          <PreferenceRow
            title="WhatsApp Updates"
            subtitle="Pickup reminders, order progress, and delivery alerts on WhatsApp."
            icon="whatsapp"
            value={notifWhatsApp}
            onChange={(value) => {
              setNotifWhatsApp(value);
              setDirty(true);
            }}
          />
          <View style={styles.divider} />
          <PreferenceRow
            title="Push Notifications"
            subtitle="In-app alerts when your order status changes or payment needs attention."
            icon="bell-outline"
            value={notifPush}
            onChange={(value) => {
              setNotifPush(value);
              setDirty(true);
            }}
          />
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Recommended setup</Text>
          <Text style={styles.noteText}>
            Keep both channels enabled if you do not want to miss pickup confirmations and ready-for-delivery updates.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, (!dirty || saving) && styles.saveBtnDisabled]}
          disabled={!dirty || saving}
          onPress={handleSave}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Preferences</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function PreferenceRow({
  title,
  subtitle,
  icon,
  value,
  onChange,
}: {
  title: string;
  subtitle: string;
  icon: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <MaterialCommunityIcons name={icon as any} size={18} color={Colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#d7e5f0', true: '#6aa7cb' }}
        thumbColor="#fff"
      />
    </View>
  );
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
  infoCard: {
    marginHorizontal: Spacing.lg,
    marginTop: 18,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#fff6ea',
    borderWidth: 1,
    borderColor: '#efd9b9',
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  infoText: { flex: 1, color: Colors.textMid, fontFamily: Fonts.body, fontSize: FontSize.sm, lineHeight: 20 },
  prefCard: {
    marginHorizontal: Spacing.lg,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  row: { flexDirection: 'row', gap: 14, alignItems: 'center', padding: 18 },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { color: Colors.textDark, fontFamily: Fonts.bold, fontSize: FontSize.base, marginBottom: 4 },
  rowSubtitle: { color: Colors.textMuted, fontFamily: Fonts.body, fontSize: FontSize.sm, lineHeight: 19 },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginHorizontal: 18 },
  noteCard: {
    marginHorizontal: Spacing.lg,
    marginTop: 18,
    padding: 18,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  noteTitle: { color: Colors.textDark, fontFamily: Fonts.bold, fontSize: FontSize.base, marginBottom: 6 },
  noteText: { color: Colors.textMuted, fontFamily: Fonts.body, fontSize: FontSize.sm, lineHeight: 20 },
  saveBtn: {
    marginHorizontal: Spacing.lg,
    marginTop: 20,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    ...Shadow.sm,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontFamily: Fonts.bold, fontSize: FontSize.base },
});
