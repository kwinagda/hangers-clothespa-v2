// ─────────────────────────────────────────────────────────────────────────────
// APP NAVIGATOR — Bottom tabs (Home | My Orders | Book | Profile)
//   + modal stack screens (OrderTracking, BookingConfirmed, Payment, etc.)
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { NavigationContainer }            from '@react-navigation/native';
import { createNativeStackNavigator }      from '@react-navigation/native-stack';
import { createBottomTabNavigator }        from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons }          from '@expo/vector-icons';
import { useAuth }                         from '../hooks/useAuth';
import { Colors, Fonts }                   from '../utils/theme';

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
import IronServiceScreen              from '../screens/IronServiceScreen';

// ─────────────────────────────────────────────────────────────────────────────
const AuthStack = createNativeStackNavigator();
const AppStack  = createNativeStackNavigator();
const Tab       = createBottomTabNavigator();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
    Home: 'home-variant-outline',
    Orders: 'clipboard-text-outline',
    Book: 'plus',
    Profile: 'account-circle-outline',
  };
  const activeIcons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
    Home: 'home-variant',
    Orders: 'clipboard-text',
    Book: 'plus',
    Profile: 'account-circle',
  };
  const isBook = label === 'Book';
  return (
    <View style={[tabStyles.iconWrap, isBook && tabStyles.bookIconWrap]}>
      <View style={[tabStyles.iconBadge, focused && tabStyles.iconBadgeFocused, isBook && tabStyles.bookIconBadge]}>
        <MaterialCommunityIcons
          name={(focused ? activeIcons[label] : icons[label]) || 'circle-outline'}
          size={isBook ? 22 : 20}
          color={isBook ? '#fff' : focused ? Colors.primary : '#8ea6bf'}
        />
      </View>
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
          <Text style={[tabStyles.label, route.name === 'Book' && tabStyles.bookLabel, focused && tabStyles.labelFocused]}>
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
      <AppStack.Screen name="IronService"      component={IronServiceScreen}            />
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
    borderTopWidth:   0,
    height:           Platform.OS === 'ios' ? 88 : 68,
    paddingBottom:    Platform.OS === 'ios' ? 28 : 8,
    paddingTop:       8,
    elevation:        14,
    shadowColor:      'rgba(2,60,98,0.12)',
    shadowOffset:     { width: 0, height: -2 },
    shadowOpacity:    0.12,
    shadowRadius:     12,
  },
  iconWrap:    { alignItems: 'center', justifyContent: 'center' },
  iconBadge:   { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  iconBadgeFocused: { backgroundColor: '#eef4fa' },
  bookIconWrap: { marginTop: Platform.OS === 'ios' ? -20 : -16 },
  bookIconBadge: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.primary,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 10,
  },
  label:       { fontSize: 10, color: '#8ea6bf', marginTop: 2, fontFamily: Fonts.medium },
  bookLabel:   { marginTop: 6 },
  labelFocused:{ color: Colors.primary, fontWeight: '700' },
});
