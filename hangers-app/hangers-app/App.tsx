// ─────────────────────────────────────────────────────────────────────────────
// APP.TSX — Root entry point
// Loads fonts, shows splash, mounts AuthProvider + AppNavigator
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback } from 'react';
import { View } from 'react-native';
import * as SplashScreen    from 'expo-splash-screen';
import { useFonts }         from 'expo-font';
import {
  Syne_400Regular, Syne_600SemiBold, Syne_700Bold, Syne_800ExtraBold
} from '@expo-google-fonts/syne';
import {
  DMSans_400Regular, DMSans_500Medium, DMSans_700Bold
} from '@expo-google-fonts/dm-sans';

import { AuthProvider }     from './src/hooks/useAuth';
import AppNavigator         from './src/navigation/AppNavigator';
import CustomSplash         from './src/screens/SplashScreen';
import { Colors }           from './src/utils/theme';

// Prevent native splash from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [showCustomSplash, setShowCustomSplash] = useState(true);
  const [appReady,         setAppReady]         = useState(false);

  const [fontsLoaded] = useFonts({
    Syne_400Regular,
    Syne_600SemiBold,
    Syne_700Bold,
    Syne_800ExtraBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
      setAppReady(true);
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.primary }} onLayout={onLayoutRootView}>
      {showCustomSplash ? (
        // Show animated brand splash, then mount the app
        <CustomSplash onFinish={() => setShowCustomSplash(false)} />
      ) : (
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      )}
    </View>
  );
}
