// ─────────────────────────────────────────────────────────────────────────────
// RATE CHART SCREEN — Full price list with search, filter by service category
// ✅ Fetched from API — single source of truth — no hardcoded prices
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, StatusBar, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../utils/theme';
import { servicesAPI } from '../services/api';

// ── Types ─────────────────────────────────────────────────────────────────────
interface PriceItem  { name: string; price: number }
interface CatSection { category: string; items: PriceItem[] }
// Grouped by top-level service tab e.g. "DRY CLEAN" → [{ category:"MEN", items:[...] }]
type PriceData = Record<string, CatSection[]>

// ── Icons per catalog ─────────────────────────────────────────────────────────
const SERVICE_ICONS: Record<string, string> = {
  'DRY CLEAN':      '🧺',
  'STEAM IRONING':  '♨️',
  'NORMAL IRONING': '👔',
  'ROLL PRESS':     '📰',
  'LAUNDRY BY KG':  '⚖️',
  'SHOE CLEANING':  '👟',
  'SOFA CLEANING':  '🛋️',
}

// ── Transform API response → PriceData ───────────────────────────────────────
// API returns: [{ category: "DRY CLEAN — MEN", items: [{name, price}] }]
// We want:     { "DRY CLEAN": [{ category: "MEN", items: [...] }] }
function buildPriceData(catalog: { category: string; items: PriceItem[] }[]): PriceData {
  const result: PriceData = {}
  for (const cat of catalog) {
    // Split "DRY CLEAN — MEN" into ["DRY CLEAN", "MEN"]
    const parts    = cat.category.split(' — ')
    const topLevel = parts[0].trim()          // e.g. "DRY CLEAN"
    const subCat   = parts[1]?.trim() || topLevel // e.g. "MEN"
    if (!result[topLevel]) result[topLevel] = []
    result[topLevel].push({ category: subCat, items: cat.items })
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
export default function RateChartScreen({ navigation, route }: any) {
  const [priceData,     setPriceData]     = useState<PriceData>({})
  const [serviceTabs,   setServiceTabs]   = useState<string[]>([])
  const [activeService, setActiveService] = useState('')
  const [searchText,    setSearchText]    = useState('')
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState('')

  useEffect(() => {
    servicesAPI.getPriceList()
      .then((res: any) => {
        const catalog = res?.data?.catalog || []
        const data    = buildPriceData(catalog)
        const tabs    = Object.keys(data)
        setPriceData(data)
        setServiceTabs(tabs)

        // Respect navigation param if provided
        const initial = route?.params?.serviceLabel
        if (initial && tabs.includes(initial)) {
          setActiveService(initial)
        } else {
          setActiveService(tabs[0] || '')
        }
      })
      .catch(() => setError('Failed to load rate chart. Please check your connection.'))
      .finally(() => setLoading(false))
  }, [])

  const categories = priceData[activeService] || []

  const filteredCategories = useMemo(() => {
    if (!searchText.trim()) return categories
    const q = searchText.toLowerCase()
    return categories
      .map(cat => ({
        ...cat,
        items: cat.items.filter(item => item.name.toLowerCase().includes(q)),
      }))
      .filter(cat => cat.items.length > 0)
  }, [categories, searchText])

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Header */}
      <LinearGradient colors={['#023c62', '#035a8f']} style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backBtn}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Rate Chart</Text>
          <View style={{ width: 32 }} />
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search item e.g. Shirt, Saree..."
            placeholderTextColor={Colors.textLight}
            value={searchText}
            onChangeText={setSearchText}
          />
          {searchText ? (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Text style={styles.clearSearch}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </LinearGradient>

      {/* Loading */}
      {loading && (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading prices…</Text>
        </View>
      )}

      {/* Error */}
      {!loading && error ? (
        <View style={styles.centeredState}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Content */}
      {!loading && !error && (
        <>
          {/* Service Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsScroll}
            contentContainerStyle={styles.tabsContainer}
          >
            {serviceTabs.map(svc => (
              <TouchableOpacity
                key={svc}
                style={[styles.tab, activeService === svc && styles.tabActive]}
                onPress={() => { setActiveService(svc); setSearchText(''); }}
              >
                <Text style={styles.tabIcon}>{SERVICE_ICONS[svc] || '📋'}</Text>
                <Text style={[styles.tabLabel, activeService === svc && styles.tabLabelActive]}>
                  {svc}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Price List */}
          <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
            {filteredCategories.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyText}>
                  {searchText ? `No items found for "${searchText}"` : 'No items in this category'}
                </Text>
              </View>
            ) : (
              filteredCategories.map(cat => (
                <View key={cat.category} style={styles.categorySection}>
                  <View style={styles.categoryHeader}>
                    <Text style={styles.categoryTitle}>{cat.category}</Text>
                  </View>

                  {cat.items.map((item, idx) => (
                    <View
                      key={`${item.name}-${idx}`}
                      style={[styles.priceRow, idx % 2 === 0 ? styles.priceRowEven : null]}
                    >
                      <View style={styles.priceRowLeft}>
                        <Text style={styles.itemName}>{item.name}</Text>
                      </View>
                      <View style={styles.priceCol}>
                        {item.price > 0 ? (
                          <Text style={styles.priceText}>₹{item.price}</Text>
                        ) : (
                          <Text style={styles.priceTbd}>TBD</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              ))
            )}

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                * Prices are per piece unless stated otherwise{'\n'}
                * TBD = Price to be confirmed at store{'\n'}
                * For bulk orders, please call +91 7977417014
              </Text>
            </View>
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.offWhite },

  // Header
  header:      { paddingTop: 56, paddingBottom: 16, paddingHorizontal: Spacing.lg },
  headerTop:   { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:16 },
  backBtn:     { fontFamily:'DMSans_500Medium', fontSize:24, color:Colors.white, width:32 },
  headerTitle: { fontFamily:'Syne_700Bold', fontSize:FontSize.lg, color:Colors.white },

  // Search
  searchBar:   { flexDirection:'row', alignItems:'center', backgroundColor:'rgba(255,255,255,0.12)', borderRadius:Radius.md, borderWidth:1, borderColor:'rgba(184,208,232,0.2)', paddingHorizontal:14, gap:10 },
  searchIcon:  { fontSize:16 },
  searchInput: { flex:1, fontFamily:'DMSans_400Regular', fontSize:FontSize.base, color:Colors.white, paddingVertical:14 },
  clearSearch: { color:Colors.primaryLight, fontSize:16, padding:4 },

  // Loading / error
  centeredState: { flex:1, alignItems:'center', justifyContent:'center', paddingTop:60 },
  loadingText:   { fontFamily:'DMSans_400Regular', fontSize:FontSize.base, color:Colors.textMuted, marginTop:14 },
  errorIcon:     { fontSize:40, marginBottom:12 },
  errorText:     { fontFamily:'DMSans_400Regular', fontSize:FontSize.base, color:Colors.error, textAlign:'center', paddingHorizontal:32 },

  // Tabs
  tabsScroll:     { flexGrow:0, backgroundColor:Colors.white, borderBottomWidth:1, borderColor:Colors.border },
  tabsContainer:  { paddingHorizontal:Spacing.md, paddingVertical:10, gap:8 },
  tab:            { flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:14, paddingVertical:8, borderRadius:Radius.full, backgroundColor:Colors.accent, borderWidth:1, borderColor:Colors.border },
  tabActive:      { backgroundColor:Colors.primary, borderColor:Colors.primary },
  tabIcon:        { fontSize:15 },
  tabLabel:       { fontFamily:'DMSans_500Medium', fontSize:FontSize.sm, color:Colors.textMid },
  tabLabelActive: { color:Colors.white },

  // List
  listScroll: { flex:1 },

  categorySection: { marginTop:12 },
  categoryHeader:  { backgroundColor:Colors.primary, paddingHorizontal:Spacing.lg, paddingVertical:10 },
  categoryTitle:   { fontFamily:'Syne_700Bold', fontSize:FontSize.sm, color:Colors.white, letterSpacing:0.5 },

  priceRow:     { flexDirection:'row', alignItems:'center', paddingHorizontal:Spacing.lg, paddingVertical:13, backgroundColor:Colors.white, borderBottomWidth:1, borderColor:Colors.borderLight },
  priceRowEven: { backgroundColor:Colors.offWhite },
  priceRowLeft: { flex:1 },
  itemName:     { fontFamily:'DMSans_500Medium', fontSize:FontSize.base, color:Colors.textDark },

  priceCol:  { alignItems:'flex-end' },
  priceText: { fontFamily:'Syne_700Bold', fontSize:FontSize.md, color:Colors.primary },
  priceTbd:  { fontFamily:'DMSans_400Regular', fontSize:FontSize.sm, color:Colors.error, fontStyle:'italic' },

  emptyState: { alignItems:'center', paddingTop:60 },
  emptyIcon:  { fontSize:40, marginBottom:12 },
  emptyText:  { fontFamily:'DMSans_400Regular', fontSize:FontSize.base, color:Colors.textMuted },

  footer:     { padding:Spacing.lg, marginBottom:40 },
  footerText: { fontFamily:'DMSans_400Regular', fontSize:FontSize.xs, color:Colors.textMuted, lineHeight:20, textAlign:'center' },
});
