import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, ActivityIndicator, Vibration,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors, Spacing } from '../../utils/theme';
import { plantAPI } from '../../services/api';

export default function PlantScanScreen({ navigation }: any) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned,  setScanned]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, []);

  const handleScan = async ({ data }: { data: string }) => {
    if (scanned || loading) return;
    setScanned(true);
    setLoading(true);
    setError('');
    Vibration.vibrate(80);

    try {
      const r: any = await plantAPI.scan(data);
      const order = r.data?.order;
      if (order) {
        navigation.replace('PlantOrderDetail', { orderId: order.id, fromScan: true, scannedItem: order.scannedItem });
      } else {
        setError('Order not found for this tag');
        setTimeout(() => { setScanned(false); setLoading(false); setError(''); }, 2000);
      }
    } catch (e: any) {
      setError(e.message || 'Scan failed. Try again.');
      setTimeout(() => { setScanned(false); setLoading(false); setError(''); }, 2000);
    }
  };

  if (!permission) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={Colors.plant} />
    </View>
  );

  if (!permission.granted) return (
    <View style={styles.center}>
      <View style={styles.permRow}>
        <Feather name="camera" size={16} color={Colors.textDark} />
        <Text style={styles.permText}>Camera permission needed to scan garment tags</Text>
      </View>
      <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
        <Text style={styles.permBtnText}>Allow Camera</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Scan Garment Tag</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Camera */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleScan}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        <View style={styles.topDim} />
        <View style={styles.middleRow}>
          <View style={styles.sideDim} />
          <View style={styles.scanWindow}>
            {/* Corner marks */}
            {['tl','tr','bl','br'].map(c => (
              <View key={c} style={[styles.corner,
                c.includes('r') && { right: 0, left: undefined },
                c.includes('b') && { bottom: 0, top: undefined },
              ]} />
            ))}
          </View>
          <View style={styles.sideDim} />
        </View>
        <View style={styles.bottomDim}>
          {loading ? (
            <ActivityIndicator size="large" color="#fff" style={{ marginBottom: 16 }} />
          ) : error ? (
            <View style={styles.errorBadge}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : (
            <Text style={styles.hint}>Align the QR code inside the frame</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const DIM = 'rgba(0,0,0,0.65)';
const WINDOW = 260;

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#000' },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: Colors.offWhite },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: Platform.OS === 'ios' ? 52 : 22, paddingHorizontal: Spacing.lg, paddingBottom: 14, backgroundColor: 'rgba(0,0,0,0.4)' },
  backBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  backText:   { color: '#fff', fontSize: 22 },
  title:      { color: '#fff', fontSize: 17, fontWeight: '700' },
  overlay:    { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
  topDim:     { flex: 1, backgroundColor: DIM },
  middleRow:  { flexDirection: 'row', height: WINDOW },
  sideDim:    { flex: 1, backgroundColor: DIM },
  scanWindow: { width: WINDOW, height: WINDOW, position: 'relative' },
  bottomDim:  { flex: 1, backgroundColor: DIM, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 24 },
  corner:     { position: 'absolute', top: 0, left: 0, width: 28, height: 28, borderColor: Colors.plant, borderTopWidth: 3, borderLeftWidth: 3 },
  hint:       { color: 'rgba(255,255,255,0.75)', fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
  errorBadge: { backgroundColor: 'rgba(220,38,38,0.85)', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  errorText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
  permRow:    { flexDirection:'row', alignItems:'center', gap:8, marginBottom:20 },
  permText:   { fontSize: 16, textAlign: 'center', color: Colors.textDark },
  permBtn:    { backgroundColor: Colors.plant, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  permBtnText:{ color: '#fff', fontWeight: '700', fontSize: 15 },
});
