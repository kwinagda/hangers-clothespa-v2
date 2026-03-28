// ─────────────────────────────────────────────────────────────────────────────
// RATE CHART SCREEN — Full price list with search, filter by service category
// Prices seeded from your exportProducts.csv
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, StatusBar, SectionList
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../utils/theme';

// ── Price data extracted from your exportProducts.csv ────────────────────────
// Items with Rate=0 marked as TBD; will be replaced by API call in later phase
const PRICE_DATA: Record<string, { category: string; items: { name: string; variant?: string; pieces?: number; price: number }[] }[]> = {
  'Dry Clean': [
    { category: 'MEN', items: [
      { name: 'T-Shirt',         price: 100 },
      { name: 'Shirt',           variant: 'Normal',  price: 125 },
      { name: 'Shirt',           variant: 'Silk',    price: 150 },
      { name: 'Shirt',           variant: 'Woolen',  price: 150 },
      { name: 'Pants',           price: 125 },
      { name: 'Jeans',           price: 125 },
      { name: 'Track Pant',      price: 100 },
      { name: 'Shorts',          price: 80 },
      { name: 'Pyjama',          price: 100 },
      { name: 'Capri',           price: 100 },
      { name: 'Sweat Pants',     price: 125 },
      { name: 'Long Pullover',   price: 125 },
      { name: 'Under Wear',      price: 100 },
      { name: 'Vest',            price: 125 },
      { name: 'Kurta',           variant: 'Normal',   price: 150 },
      { name: 'Kurta',           variant: 'Heavy',    price: 200 },
      { name: 'Sherwani Set',    price: 350 },
      { name: 'Achkan',          price: 150 },
      { name: 'Dhoti',           variant: 'Normal',   price: 150 },
      { name: 'Dhoti',           variant: 'Silk',     price: 200 },
      { name: 'Tie',             price: 75 },
      { name: 'Blazer Vest',     price: 250 },
      { name: 'Suit',            variant: '3 Pcs (Blazer, Trouser & Shirt)', pieces: 3, price: 600 },
      { name: 'Suit',            variant: '2 Pcs (Blazer & Trouser)',        pieces: 2, price: 450 },
      { name: 'Suit',            variant: '1 Pc (Blazer)',                   pieces: 1, price: 300 },
      { name: 'Jacket',          variant: 'Full Sleeves',  price: 200 },
      { name: 'Jacket',          variant: 'Half Sleeves',  price: 150 },
      { name: 'Jacket',          variant: 'with Hood',     price: 200 },
      { name: 'Sweater',         variant: 'Full Sleeves Plain',  price: 150 },
      { name: 'Sweater',         variant: 'Full Sleeves Heavy',  price: 200 },
      { name: 'Sweater',         variant: 'Half Sleeves Plain',  price: 125 },
      { name: 'Sweater',         variant: 'Half Sleeves Heavy',  price: 175 },
      { name: 'Sweat Shirt',     variant: 'Normal',      price: 125 },
      { name: 'Sweat Shirt',     variant: 'with Hood',   price: 150 },
      { name: 'Safari',          variant: 'Pant',        price: 125 },
      { name: 'Safari',          variant: 'Coat',        price: 200 },
      { name: 'Long Coat',       variant: 'Normal',      price: 300 },
      { name: 'Long Coat',       variant: 'Heavy',       price: 350 },
    ]},
    { category: 'WOMEN', items: [
      { name: 'T-Shirt',         price: 125 },
      { name: 'Shirt',           price: 125 },
      { name: 'Pants',           price: 125 },
      { name: 'Jeans',           price: 125 },
      { name: 'Dangree',         price: 250 },
      { name: 'Jumper',          price: 150 },
      { name: 'Leggings',        price: 125 },
      { name: 'Track Pant',      price: 125 },
      { name: 'Brassieres',      price: 100 },
      { name: 'Long Pullover',   price: 150 },
      { name: 'Stockings',       price: 150 },
      { name: 'Scarf',           price: 100 },
      { name: 'Petticoat',       price: 125 },
      { name: 'Pajama',          price: 125 },
      { name: 'Top',             variant: 'Plain',      price: 125 },
      { name: 'Top',             variant: 'Heavy',      price: 150 },
      { name: 'Top',             variant: 'Very Heavy', price: 175 },
      { name: 'Top',             variant: 'Woolen',     price: 200 },
      { name: 'Saree',           variant: 'Plain',      price: 300 },
      { name: 'Saree',           variant: 'Heavy',      price: 400 },
      { name: 'Saree',           variant: 'Very Heavy', price: 500 },
      { name: 'Blouse',          variant: 'Normal',     price: 100 },
      { name: 'Blouse',          variant: 'Heavy',      price: 150 },
      { name: 'Blouse',          variant: 'Very Heavy', price: 200 },
      { name: 'Dupatta',         variant: 'Normal',     price: 100 },
      { name: 'Dupatta',         variant: 'Heavy',      price: 150 },
      { name: 'Dupatta',         variant: 'Very Heavy', price: 200 },
      { name: 'Kurti / Kameez',  variant: 'Plain',      price: 125 },
      { name: 'Kurti / Kameez',  variant: 'Heavy',      price: 150 },
      { name: 'Salwar',          variant: 'Plain',      price: 125 },
      { name: 'Salwar',          variant: 'Heavy',      price: 150 },
      { name: 'Salwar',          variant: 'Very Heavy', price: 200 },
      { name: 'Plazo',           variant: 'Plain',      price: 150 },
      { name: 'Plazo',           variant: 'Heavy',      price: 200 },
      { name: 'Plazo',           variant: 'Very Heavy', price: 250 },
      { name: 'Lehenga',         variant: 'Plain',      price: 200 },
      { name: 'Lehenga',         variant: 'Heavy',      price: 300 },
      { name: 'Lehenga',         variant: 'Very Heavy', price: 400 },
      { name: 'Gown',            variant: 'Normal',     price: 300 },
      { name: 'Gown',            variant: 'Heavy',      price: 500 },
      { name: 'Gown',            variant: 'Very Heavy', price: 800 },
      { name: 'Dress',           variant: 'Plain',      price: 125 },
      { name: 'Dress',           variant: 'Heavy',      price: 150 },
      { name: 'Dress Long',      variant: 'Plain',      price: 125 },
      { name: 'Dress Long',      variant: 'Heavy',      price: 150 },
      { name: 'Skirt Long',      variant: 'Plain',      price: 125 },
      { name: 'Skirt Long',      variant: 'Heavy',      price: 150 },
      { name: 'Skirt Long',      variant: 'Very Heavy', price: 200 },
      { name: 'Skirt Short',     variant: 'Plain',      price: 125 },
      { name: 'Skirt Short',     variant: 'Heavy',      price: 150 },
      { name: 'Skirt Short',     variant: 'Very Heavy', price: 175 },
      { name: 'Stole',           variant: 'Plain',      price: 125 },
      { name: 'Stole',           variant: 'Heavy',      price: 150 },
      { name: 'Stole',           variant: 'Very Heavy', price: 175 },
      { name: 'Shawl',           variant: 'Plain',      price: 125 },
      { name: 'Shawl',           variant: 'Heavy',      price: 150 },
      { name: 'Shawl',           variant: 'Very Heavy', price: 200 },
    ]},
    { category: 'KIDS', items: [
      { name: 'T-Shirt',         price: 125 },
      { name: 'Shirt',           variant: 'Normal',     price: 125 },
      { name: 'Shirt',           variant: 'Woolen',     price: 150 },
      { name: 'Pants',           price: 125 },
      { name: 'Jeans',           price: 125 },
      { name: 'Shorts',          price: 100 },
      { name: 'Capri',           price: 100 },
      { name: 'Jumper',          price: 150 },
      { name: 'Dangree',         price: 200 },
      { name: 'Long Pullover',   price: 150 },
      { name: 'Baby Blanket',    price: 150 },
      { name: 'Sherwani',        price: 150 },
      { name: 'Swimming Costume', price: 150 },
      { name: 'Frock',           variant: 'Plain',      price: 100 },
      { name: 'Frock',           variant: 'Heavy',      price: 150 },
      { name: 'Frock',           variant: 'Very Heavy', price: 200 },
      { name: 'Dress',           variant: 'Plain',      price: 100 },
      { name: 'Dress',           variant: 'Heavy',      price: 150 },
      { name: 'Dress',           variant: 'Very Heavy', price: 200 },
      { name: 'Top',             variant: 'Plain',      price: 150 },
      { name: 'Top',             variant: 'Heavy',      price: 200 },
      { name: 'Skirt',           variant: 'Plain',      price: 100 },
      { name: 'Skirt',           variant: 'Heavy',      price: 150 },
      { name: 'Skirt',           variant: 'Very Heavy', price: 200 },
      { name: 'Kutrta',          variant: 'Plain',      price: 100 },
      { name: 'Kutrta',          variant: 'Heavy',      price: 150 },
      { name: 'Salwar',          variant: 'Plain',      price: 150 },
      { name: 'Salwar',          variant: 'Heavy',      price: 200 },
      { name: 'Blouse',          variant: 'Normal',     price: 100 },
      { name: 'Blouse',          variant: 'Heavy',      price: 150 },
      { name: 'Lehenga',         variant: 'Plain',      price: 150 },
      { name: 'Lehenga',         variant: 'Heavy',      price: 200 },
      { name: 'Dupatta',         variant: 'Plain',      price: 100 },
      { name: 'Dupatta',         variant: 'Heavy',      price: 150 },
      { name: 'Dupatta',         variant: 'Very Heavy', price: 200 },
      { name: 'Sweater Full',    variant: 'Plain',      price: 100 },
      { name: 'Sweater Full',    variant: 'Heavy',      price: 150 },
    ]},
    { category: 'HOUSE HOLD', items: [
      { name: 'Blanket Single',    variant: 'Normal',  price: 300 },
      { name: 'Blanket Single',    variant: '2 Ply',   price: 500 },
      { name: 'Blanket Double',    variant: 'Normal',  price: 400 },
      { name: 'Blanket Double',    variant: '2 Ply',   price: 500 },
      { name: 'Quilt',             variant: 'Single',  price: 300 },
      { name: 'Quilt',             variant: 'Double',  price: 500 },
      { name: 'Quilt Cover',       variant: 'Single',  price: 200 },
      { name: 'Quilt Cover',       variant: 'Double',  price: 250 },
      { name: 'Duvet',             variant: 'Single',  price: 300 },
      { name: 'Duvet',             variant: 'Double',  price: 500 },
      { name: 'Bedspread',         variant: 'Single',  price: 200 },
      { name: 'Bedspread',         variant: 'Double',  price: 300 },
      { name: 'Curtain Door',      price: 500 },
      { name: 'Curtain Door',      variant: 'with Lining', price: 600 },
      { name: 'Curtain Window',    price: 700 },
      { name: 'Curtain Window',    variant: 'with Lining', price: 800 },
      { name: 'Blind',             variant: 'Door',    price: 350 },
      { name: 'Blind',             variant: 'Window',  price: 500 },
      { name: 'Bath Robe',         price: 250 },
      { name: 'Bath Towels',       price: 150 },
      { name: 'Hand Towels',       price: 75 },
      { name: 'Pillow Covers',     price: 100 },
      { name: 'Chair Covers',      price: 100 },
      { name: 'Cushion Covers',    variant: 'Small',   price: 75 },
      { name: 'Cushion Covers',    variant: 'Medium',  price: 100 },
      { name: 'Cushion Covers',    variant: 'Large',   price: 150 },
      { name: 'Sofa Cover',        variant: 'Small',   price: 150 },
      { name: 'Sofa Cover',        variant: 'Medium',  price: 200 },
      { name: 'Sofa Cover',        variant: 'Large',   price: 250 },
      { name: 'Table Runner',      price: 150 },
      { name: 'Table Mat',         price: 100 },
      { name: 'Table Napkin',      variant: 'Small',   price: 75 },
      { name: 'Table Napkin',      variant: 'Large',   price: 100 },
      { name: 'Foot Mat',          price: 100 },
    ]},
    { category: 'ACCESSORIES', items: [
      { name: 'Handbag',         price: 500 },
      { name: 'Socks',           price: 100, pieces: 2 },
      { name: 'Cap',             price: 100 },
      { name: 'Muffler',         price: 125 },
      { name: 'Hat',             price: 125 },
      { name: 'Rain Coat',       price: 125 },
      { name: 'Tie',             price: 125 },
      { name: 'Handkerchief',    price: 125 },
      { name: 'Gloves',          variant: 'Plain',    price: 100, pieces: 2 },
      { name: 'Gloves',          variant: 'Wool',     price: 125, pieces: 2 },
      { name: 'Gloves',          variant: 'Leather',  price: 150, pieces: 2 },
      { name: 'Soft Toy',        variant: 'Small',    price: 200 },
      { name: 'Soft Toy',        variant: 'Medium',   price: 300 },
      { name: 'Soft Toy',        variant: 'Large',    price: 500 },
    ]},
  ],
  'Steam Ironing': [
    { category: 'STEAM IRON', items: [
      { name: 'Shirt',           price: 100 },
      { name: 'T-Shirt',         price: 100 },
      { name: 'Pant / Trouser / Jeans', price: 100 },
      { name: 'Long Dress',      price: 200 },
      { name: 'Pillow Cover',    price: 50 },
      { name: 'Over Coat',       price: 200 },
      { name: 'Coat / Blazer',   price: 200 },
      { name: 'Lehenga',         price: 150 },
      { name: 'Plazo',           price: 100 },
      { name: 'Kurti',           variant: 'Long',     price: 125 },
      { name: 'Kurti',           variant: 'Short',    price: 100 },
      { name: 'Saree',           variant: 'Silk',     price: 150 },
      { name: 'Saree',           variant: 'Heavy',    price: 200 },
      { name: 'Saree',           variant: 'Designer', price: 250 },
      { name: 'Saree',           variant: 'Delicate', price: 200 },
      { name: 'Blouse',          variant: 'Plain',    price: 100 },
      { name: 'Blouse',          variant: 'Fancy',    price: 125 },
      { name: 'Kurta',           variant: 'Plain',    price: 100 },
      { name: 'Kurta',           variant: 'Silk/Designer', price: 150 },
      { name: 'Pyjama',          variant: 'Plain',    price: 100 },
      { name: 'Pyjama',          variant: 'Silk/Designer', price: 150 },
      { name: 'Dupatta',         variant: 'Plain',    price: 75 },
      { name: 'Dupatta',         variant: 'Designer', price: 100 },
      { name: 'Bed Sheet',       variant: 'Single',   price: 100 },
      { name: 'Bed Sheet',       variant: 'Double',   price: 150 },
      { name: 'Kids Frock',      variant: 'Plain',    price: 80 },
      { name: 'Kids Frock',      variant: 'Fancy',    price: 50 },
      { name: 'Kids Top / Tshirt / Shirt', price: 75 },
      { name: 'Kids Jeans / Skirt', price: 75 },
    ]},
  ],
  'Normal Ironing': [
    { category: 'NORMAL IRON', items: [
      { name: 'Normal Ironing', price: 15 },
    ]},
  ],
  'Roll Press': [
    { category: 'ROLL PRESS', items: [
      { name: 'Saree', price: 100 },
    ]},
  ],
  'Laundry / KG': [
    { category: 'LAUNDRY', items: [
      { name: 'Wash & Fold per KG',          price: 0 },
      { name: 'Wash & Iron Per KG',          price: 0 },
      { name: 'Wash & Fold Per KG — Express', price: 0 },
      { name: 'Wash & Iron Per KG — Express', price: 0 },
    ]},
  ],
  'Shoe Cleaning': [
    { category: 'SHOES', items: [
      { name: 'Sports Shoes',    price: 500, pieces: 2 },
      { name: 'Canvas Shoes',    price: 500, pieces: 2 },
      { name: 'Leather Shoes',   price: 500, pieces: 2 },
      { name: 'Suede Shoes',     price: 500, pieces: 2 },
      { name: 'Crocs / Sandals', price: 500, pieces: 2 },
      { name: 'Slippers',        price: 500, pieces: 2 },
    ]},
  ],
  'Sofa Cleaning': [
    { category: 'SOFA', items: [
      { name: 'Sofa Cleaning 1 Seater', price: 300 },
    ]},
  ],
};

const SERVICE_TABS = Object.keys(PRICE_DATA);
const SERVICE_ICONS: Record<string, string> = {
  'Dry Clean': '🧺', 'Steam Ironing': '♨️', 'Normal Ironing': '👔',
  'Roll Press': '📰', 'Laundry / KG': '⚖️', 'Shoe Cleaning': '👟',
  'Sofa Cleaning': '🛋️',
};

export default function RateChartScreen({ navigation, route }: any) {
  const initialService = route?.params?.serviceLabel || SERVICE_TABS[0];
  const [activeService, setActiveService] = useState(
    SERVICE_TABS.includes(initialService) ? initialService : SERVICE_TABS[0]
  );
  const [searchText, setSearchText] = useState('');

  const categories = PRICE_DATA[activeService] || [];

  const filteredCategories = useMemo(() => {
    if (!searchText.trim()) return categories;
    const q = searchText.toLowerCase();
    return categories
      .map(cat => ({
        ...cat,
        items: cat.items.filter(item =>
          item.name.toLowerCase().includes(q) ||
          (item.variant || '').toLowerCase().includes(q)
        ),
      }))
      .filter(cat => cat.items.length > 0);
  }, [categories, searchText]);

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

      {/* Service Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsContainer}
      >
        {SERVICE_TABS.map(svc => (
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
            <Text style={styles.emptyText}>No items found for "{searchText}"</Text>
          </View>
        ) : (
          filteredCategories.map(cat => (
            <View key={cat.category} style={styles.categorySection}>
              <View style={styles.categoryHeader}>
                <Text style={styles.categoryTitle}>{cat.category}</Text>
              </View>

              {cat.items.map((item, idx) => (
                <View
                  key={`${item.name}-${item.variant}-${idx}`}
                  style={[styles.priceRow, idx % 2 === 0 ? styles.priceRowEven : null]}
                >
                  <View style={styles.priceRowLeft}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {item.variant ? (
                      <Text style={styles.itemVariant}>{item.variant}</Text>
                    ) : null}
                    {(item.pieces || 1) > 1 ? (
                      <View style={styles.piecesBadge}>
                        <Text style={styles.piecesText}>{item.pieces} pcs</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.priceCol}>
                    {item.price > 0 ? (
                      <Text style={styles.priceText}>₹{item.price}</Text>
                    ) : (
                      <Text style={styles.priceTbd}>TBD</Text>
                    )}
                    {item.pieces && item.pieces > 1 && (
                      <Text style={styles.priceUnit}>per pair</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.offWhite },

  // Header
  header:     { paddingTop: 56, paddingBottom: 16, paddingHorizontal: Spacing.lg },
  headerTop:  { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:16 },
  backBtn:    { fontFamily:'DMSans_500Medium', fontSize:24, color:Colors.white, width:32 },
  headerTitle:{ fontFamily:'Syne_700Bold', fontSize:FontSize.lg, color:Colors.white },

  // Search
  searchBar:  { flexDirection:'row', alignItems:'center', backgroundColor:'rgba(255,255,255,0.12)', borderRadius:Radius.md, borderWidth:1, borderColor:'rgba(184,208,232,0.2)', paddingHorizontal:14, gap:10 },
  searchIcon: { fontSize:16 },
  searchInput:{ flex:1, fontFamily:'DMSans_400Regular', fontSize:FontSize.base, color:Colors.white, paddingVertical:14 },
  clearSearch:{ color:Colors.primaryLight, fontSize:16, padding:4 },

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

  categorySection: { marginTop: 12 },
  categoryHeader: { backgroundColor:Colors.primary, paddingHorizontal:Spacing.lg, paddingVertical:10 },
  categoryTitle:  { fontFamily:'Syne_700Bold', fontSize:FontSize.sm, color:Colors.white, letterSpacing:0.5 },

  priceRow:     { flexDirection:'row', alignItems:'center', paddingHorizontal:Spacing.lg, paddingVertical:13, backgroundColor:Colors.white, borderBottomWidth:1, borderColor:Colors.borderLight },
  priceRowEven: { backgroundColor:Colors.offWhite },
  priceRowLeft: { flex:1, flexDirection:'row', alignItems:'center', flexWrap:'wrap', gap:6 },
  itemName:     { fontFamily:'DMSans_500Medium', fontSize:FontSize.base, color:Colors.textDark },
  itemVariant:  { fontFamily:'DMSans_400Regular', fontSize:FontSize.sm, color:Colors.textMuted },
  piecesBadge:  { backgroundColor:Colors.accent, borderRadius:Radius.full, paddingHorizontal:8, paddingVertical:2, borderWidth:1, borderColor:Colors.border },
  piecesText:   { fontFamily:'DMSans_400Regular', fontSize:FontSize.xs, color:Colors.textMid },

  priceCol:  { alignItems:'flex-end' },
  priceText: { fontFamily:'Syne_700Bold', fontSize:FontSize.md, color:Colors.primary },
  priceTbd:  { fontFamily:'DMSans_400Regular', fontSize:FontSize.sm, color:Colors.error, fontStyle:'italic' },
  priceUnit: { fontFamily:'DMSans_400Regular', fontSize:FontSize.xs, color:Colors.textMuted },

  emptyState: { alignItems:'center', paddingTop:60 },
  emptyIcon:  { fontSize:40, marginBottom:12 },
  emptyText:  { fontFamily:'DMSans_400Regular', fontSize:FontSize.base, color:Colors.textMuted },

  footer:     { padding:Spacing.lg, marginBottom:40 },
  footerText: { fontFamily:'DMSans_400Regular', fontSize:FontSize.xs, color:Colors.textMuted, lineHeight:20, textAlign:'center' },
});
