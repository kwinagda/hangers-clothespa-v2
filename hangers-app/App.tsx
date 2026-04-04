// ─────────────────────────────────────────────────────────────────────────────
// APP.TSX — Fixed for Expo SDK 54
// SDK 54 changed how SplashScreen works — this version is compatible
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { SpaceMono_400Regular } from '@expo-google-fonts/space-mono';

import { AuthProvider }  from './src/hooks/useAuth';
import AppNavigator      from './src/navigation/AppNavigator';
import CustomSplash      from './src/screens/SplashScreen';
import { Colors }        from './src/utils/theme';

// Keep native splash visible while loading
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [showCustomSplash, setShowCustomSplash] = useState(true);

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
    SpaceGrotesk_700Bold,
    SpaceMono_400Regular,
    DMSans_400Regular: Inter_400Regular,
    DMSans_500Medium: Inter_500Medium,
    DMSans_700Bold: Inter_700Bold,
    Syne_400Regular: SpaceGrotesk_700Bold,
    Syne_600SemiBold: SpaceGrotesk_700Bold,
    Syne_700Bold: SpaceGrotesk_700Bold,
    Syne_800ExtraBold: SpaceGrotesk_700Bold,
    SpaceMono_700Bold: SpaceMono_400Regular,
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
