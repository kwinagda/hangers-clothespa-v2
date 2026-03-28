// ─────────────────────────────────────────────────────────────────────────────
// APP.TSX — Fixed for Expo SDK 54
// SDK 54 changed how SplashScreen works — this version is compatible
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Syne_400Regular, Syne_600SemiBold, Syne_700Bold, Syne_800ExtraBold
} from '@expo-google-fonts/syne';
import {
  DMSans_400Regular, DMSans_500Medium, DMSans_700Bold
} from '@expo-google-fonts/dm-sans';

import { AuthProvider }  from './src/hooks/useAuth';
import AppNavigator      from './src/navigation/AppNavigator';
import CustomSplash      from './src/screens/SplashScreen';
import { Colors }        from './src/utils/theme';

// Keep native splash visible while loading
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [showCustomSplash, setShowCustomSplash] = useState(true);

  const [fontsLoaded, fontError] = useFonts({
    Syne_400Regular,
    Syne_600SemiBold,
    Syne_700Bold,
    Syne_800ExtraBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      // Hide native splash once fonts are ready
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  // Wait for fonts before rendering anything
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.primary }}>
      {showCustomSplash ? (
        <CustomSplash onFinish={() => setShowCustomSplash(false)} />
      ) : (
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      )}
    </View>
  );
}
