// ─────────────────────────────────────────────────────────────────────────────
// SPLASH SCREEN — Animated brand intro with Hangers logo
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Dimensions, StatusBar, Image
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize, Fonts } from '../utils/theme';
import { LOGO_WHITE_URL } from '../lib/branding';

const { width, height } = Dimensions.get('window');

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const logoScale   = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const tagOpacity  = useRef(new Animated.Value(0)).current;
  const ringScale   = useRef(new Animated.Value(0.5)).current;
  const ringOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    // Ring pulse
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ringScale,   { toValue: 1.3, duration: 1500, useNativeDriver: true }),
          Animated.timing(ringOpacity, { toValue: 0,   duration: 1500, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(ringScale,   { toValue: 0.5, duration: 0,    useNativeDriver: true }),
          Animated.timing(ringOpacity, { toValue: 0.6, duration: 0,    useNativeDriver: true }),
        ]),
      ])
    ).start();

    // Entrance animation sequence
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue:       1,
          tension:       60,
          friction:      8,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue:  1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(textOpacity, {
        toValue:  1,
        duration: 400,
        delay:    100,
        useNativeDriver: true,
      }),
      Animated.timing(tagOpacity, {
        toValue:  1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Hold, then fade out and call onFinish
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(logoOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
          Animated.timing(textOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
          Animated.timing(tagOpacity,  { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => onFinish());
      }, 1400);
    });
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      <LinearGradient
        colors={['#023c62', '#035a8f', '#023c62']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Decorative background circles */}
      <View style={styles.bgCircle1} />
      <View style={styles.bgCircle2} />

      {/* Animated ring behind logo */}
      <Animated.View style={[
        styles.ring,
        { transform: [{ scale: ringScale }], opacity: ringOpacity }
      ]} />

      <Animated.View style={[
        styles.logoWrap,
        { transform: [{ scale: logoScale }], opacity: logoOpacity }
      ]}>
        <Image source={{ uri: LOGO_WHITE_URL }} style={styles.logo} resizeMode="contain" />
      </Animated.View>

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, { opacity: Animated.multiply(textOpacity, tagOpacity) }]}>
        Care in Every Clean
      </Animated.Text>

      {/* Bottom dots */}
      <Animated.View style={[styles.dotsRow, { opacity: tagOpacity }]}>
        {[0, 1, 2].map(i => (
          <View key={i} style={[styles.dot, i === 1 && styles.dotActive]} />
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  bgCircle1: {
    position:    'absolute',
    top:         -80,
    right:       -80,
    width:       300,
    height:      300,
    borderRadius:150,
    backgroundColor: 'rgba(3, 90, 143, 0.4)',
  },
  bgCircle2: {
    position:    'absolute',
    bottom:      -60,
    left:        -40,
    width:       220,
    height:      220,
    borderRadius:110,
    backgroundColor: 'rgba(184, 208, 232, 0.08)',
  },
  ring: {
    position:      'absolute',
    width:         160,
    height:        160,
    borderRadius:  80,
    borderWidth:   1.5,
    borderColor:   'rgba(184, 208, 232, 0.35)',
  },
  logoWrap: {
    marginBottom: 20,
  },
  logo: {
    width: 280,
    height: 110,
  },
  tagline: {
    fontFamily: Fonts.body,
    fontSize:   FontSize.base,
    color:      Colors.primaryLight,
    letterSpacing: 1,
    marginBottom: 60,
    marginTop: 6,
  },
  dotsRow: {
    position:  'absolute',
    bottom:    60,
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width:        6,
    height:       6,
    borderRadius: 3,
    backgroundColor: 'rgba(184,208,232,0.3)',
  },
  dotActive: {
    backgroundColor: Colors.primaryLight,
    width: 20,
    borderRadius: 3,
  },
});
