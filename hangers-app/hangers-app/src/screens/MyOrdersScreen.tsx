// ─────────────────────────────────────────────────────────────────────────────
// MY ORDERS SCREEN — Order history (Phase 3 will fill real data)
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../utils/theme';

export default function MyOrdersScreen({ navigation }: any) {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.offWhite }}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
      <LinearGradient colors={['#023c62', '#035a8f']} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Orders</Text>
        <View style={{ width: 32 }} />
      </LinearGradient>

      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>📦</Text>
        <Text style={styles.emptyTitle}>No orders yet</Text>
        <Text style={styles.emptySub}>Your order history will appear here</Text>
        <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('Home')}>
          <Text style={styles.ctaText}>Book a Pickup</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header:     { paddingTop:56, paddingBottom:20, paddingHorizontal:Spacing.lg, flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  back:       { fontFamily:'DMSans_500Medium', fontSize:24, color:Colors.white, width:32 },
  title:      { fontFamily:'Syne_700Bold', fontSize:FontSize.lg, color:Colors.white },
  empty:      { flex:1, alignItems:'center', justifyContent:'center', padding:Spacing.xl },
  emptyIcon:  { fontSize:56, marginBottom:16 },
  emptyTitle: { fontFamily:'Syne_700Bold', fontSize:FontSize.lg, color:Colors.textDark, marginBottom:6 },
  emptySub:   { fontFamily:'DMSans_400Regular', fontSize:FontSize.base, color:Colors.textMuted, marginBottom:28, textAlign:'center' },
  cta:        { backgroundColor:Colors.primary, borderRadius:Radius.md, paddingHorizontal:28, paddingVertical:14, ...Shadow.md },
  ctaText:    { fontFamily:'Syne_700Bold', fontSize:FontSize.base, color:Colors.white },
});
