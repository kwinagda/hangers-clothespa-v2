// ─────────────────────────────────────────────────────────────────────────────
// APP NAVIGATOR — Bottom tabs (Home | My Orders | Book | Profile)
//   + modal stack screens (OrderTracking, BookingConfirmed, Payment, etc.)
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { NavigationContainer }            from '@react-navigation/native';
import { createNativeStackNavigator }      from '@react-navigation/native-stack';
import { createBottomTabNavigator }        from '@react-navigation/bottom-tabs';
import { useAuth }                         from '../hooks/useAuth';
import { Colors }                          from '../utils/theme';

import PhoneEntryScreen                from '../screens/PhoneEntryScreen';
import OTPVerifyScreen                 from '../screens/OTPVerifyScreen';
import HomeScreen                      from '../screens/HomeScreen';
import RateChartScreen                 from '../screens/RateChartScreen';
import ProfileScreen                   from '../screens/ProfileScreen';
import MyOrdersScreen                  from '../screens/MyOrdersScreen';
import BookPickupScreen                from '../screens/BookPickupScreen';
import OrderTrackingScreen             from '../screens/OrderTrackingScreen';
import BookingConfirmedScreen          from '../screens/BookingConfirmedScreen';
import SavedAddressesScreen            from '../screens/SavedAddressesScreen';
import PaymentScreen                   from '../screens/PaymentScreen';
import NotificationPreferencesScreen   from '../screens/NotificationPreferencesScreen';
import PaymentHistoryScreen            from '../screens/PaymentHistoryScreen';
import ReferScreen                    from '../screens/ReferScreen';
import WalletScreen                   from '../screens/WalletScreen';

// ─────────────────────────────────────────────────────────────────────────────
const AuthStack = createNativeStackNavigator();
const AppStack  = createNativeStackNavigator();
const Tab       = createBottomTabNavigator();

// ── Tab icons (text-based, no vector-icon dependency) ────────────────────────
function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home:     'H',
    Orders:   'O',
    Book:     '+',
    Profile:  'P',
  };
  const glyphs: Record<string, string> = {
    Home:     focused ? '[H]' : ' H ',
    Orders:   focused ? '[O]' : ' O ',
    Book:     focused ? '[+]' : ' + ',
    Profile:  focused ? '[P]' : ' P ',
  };
  return (
    <View style={tabStyles.iconWrap}>
      <Text style={[tabStyles.iconText, focused && tabStyles.iconFocused]}>
        {glyphs[label] || icons[label]}
      </Text>
    </View>
  );
}

// ── Placeholder for action tab (Book) ──────────────────────────────────────
function BookTabPlaceholder() { return null; }

// ── Bottom tab navigator ─────────────────────────────────────────────────────
function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => <TabIcon label={route.name} focused={focused} />,
        tabBarLabel: ({ focused }) => (
          <Text style={[tabStyles.label, focused && tabStyles.labelFocused]}>
            {route.name === 'Orders' ? 'My Orders' : route.name}
          </Text>
        ),
        tabBarStyle:            tabStyles.bar,
        tabBarShowLabel:        true,
        tabBarActiveTintColor:  Colors.primary,
        tabBarInactiveTintColor:'#9dafc8',
      })}
    >
      <Tab.Screen name="Home"    component={HomeScreen}          />
      <Tab.Screen name="Orders"  component={MyOrdersScreen}      />
      <Tab.Screen
        name="Book"
        component={BookTabPlaceholder}
        listeners={({ navigation }: any) => ({
          tabPress: (e: any) => {
            e.preventDefault();
            // Push BookPickup onto the parent AppStack (full-screen, no tab bar)
            navigation.getParent()?.navigate('BookPickup');
          },
        })}
      />
      <Tab.Screen name="Profile" component={ProfileScreen}       />
    </Tab.Navigator>
  );
}

// ── Auth navigator ───────────────────────────────────────────────────────────
function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <AuthStack.Screen name="PhoneEntry" component={PhoneEntryScreen} />
      <AuthStack.Screen name="OTPVerify"  component={OTPVerifyScreen}  />
    </AuthStack.Navigator>
  );
}

// ── Main app navigator (tabs + modal stack screens) ──────────────────────────
function MainNavigator() {
  return (
    <AppStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      {/* Tab root — always first */}
      <AppStack.Screen name="Tabs" component={TabNavigator} />

      {/* Full-screen push screens (no tab bar) */}
      <AppStack.Screen name="BookPickup"       component={BookPickupScreen}              />
      <AppStack.Screen name="RateChart"        component={RateChartScreen}               />
      <AppStack.Screen name="OrderTracking"    component={OrderTrackingScreen}           />
      <AppStack.Screen name="BookingConfirmed" component={BookingConfirmedScreen}        options={{ gestureEnabled: false }} />
      <AppStack.Screen name="Addresses"        component={SavedAddressesScreen}          />
      <AppStack.Screen name="Payment"          component={PaymentScreen}                 />
      <AppStack.Screen name="NotifPrefs"       component={NotificationPreferencesScreen} />
      <AppStack.Screen name="PaymentHistory"   component={PaymentHistoryScreen}          />
      <AppStack.Screen name="MyOrders"         component={MyOrdersScreen}               />
      <AppStack.Screen name="Refer"            component={ReferScreen}                  />
      <AppStack.Screen name="Wallet"           component={WalletScreen}                 />
    </AppStack.Navigator>
  );
}

// ── Loading splash ───────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={Colors.primaryLight} />
    </View>
  );
}

// ── Root export ──────────────────────────────────────────────────────────────
export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  return (
    <NavigationContainer>
      {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
});

const tabStyles = StyleSheet.create({
  bar: {
    backgroundColor:  '#fff',
    borderTopWidth:   1,
    borderTopColor:   '#e8f0f7',
    height:           Platform.OS === 'ios' ? 84 : 62,
    paddingBottom:    Platform.OS === 'ios' ? 28 : 8,
    paddingTop:       8,
    elevation:        8,
    shadowColor:      'rgba(2,60,98,0.12)',
    shadowOffset:     { width: 0, height: -2 },
    shadowOpacity:    0.08,
    shadowRadius:     8,
  },
  iconWrap:    { alignItems: 'center', justifyContent: 'center' },
  iconText:    { fontSize: 15, color: '#9dafc8', fontWeight: '500' },
  iconFocused: { color: Colors.primary, fontWeight: '700' },
  label:       { fontSize: 10, color: '#9dafc8', marginTop: 2 },
  labelFocused:{ color: Colors.primary, fontWeight: '700' },
});
