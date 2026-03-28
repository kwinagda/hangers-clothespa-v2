// ─────────────────────────────────────────────────────────────────────────────
// APP NAVIGATOR — Handles auth state routing
// Unauthenticated → Auth stack (Phone → OTP)
// Authenticated   → Main stack (Home, RateChart, Profile, Orders...)
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer }   from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth }               from '../hooks/useAuth';
import { Colors }                from '../utils/theme';

// Screens
import PhoneEntryScreen  from '../screens/PhoneEntryScreen';
import OTPVerifyScreen   from '../screens/OTPVerifyScreen';
import HomeScreen        from '../screens/HomeScreen';
import RateChartScreen   from '../screens/RateChartScreen';
import ProfileScreen     from '../screens/ProfileScreen';
import MyOrdersScreen    from '../screens/MyOrdersScreen';

const AuthStack = createNativeStackNavigator();
const AppStack  = createNativeStackNavigator();

// ── Auth Flow ─────────────────────────────────────────────────────────────────
function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <AuthStack.Screen name="PhoneEntry" component={PhoneEntryScreen} />
      <AuthStack.Screen name="OTPVerify"  component={OTPVerifyScreen}  />
    </AuthStack.Navigator>
  );
}

// ── Main App Flow ─────────────────────────────────────────────────────────────
function MainNavigator() {
  return (
    <AppStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <AppStack.Screen name="Home"       component={HomeScreen}      />
      <AppStack.Screen name="RateChart"  component={RateChartScreen} />
      <AppStack.Screen name="Profile"    component={ProfileScreen}   />
      <AppStack.Screen name="MyOrders"   component={MyOrdersScreen}  />
      {/* Phase 3 screens added here: BookPickup, OrderTracking, Addresses */}
    </AppStack.Navigator>
  );
}

// ── Loading Screen ────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={Colors.primaryLight} />
    </View>
  );
}

// ── Root Navigator ────────────────────────────────────────────────────────────
export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex:            1,
    backgroundColor: Colors.primary,
    alignItems:      'center',
    justifyContent:  'center',
  },
});
