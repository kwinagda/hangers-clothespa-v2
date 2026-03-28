// ─────────────────────────────────────────────────────────────────────────────
// SPLASH SCREEN — Animated brand intro with Hangers logo
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Dimensions, StatusBar
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize } from '../utils/theme';

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

      {/* Logo placeholder — replace with actual Hangers logo Image */}
      <Animated.View style={[
        styles.logoWrap,
        { transform: [{ scale: logoScale }], opacity: logoOpacity }
      ]}>
        {/* 
          TO ADD YOUR LOGO:
          Replace this View with:
          <Image source={require('../assets/hangers_logo.png')} style={styles.logo} resizeMode="contain" />
        */}
        <View style={styles.logoBox}>
          <Text style={styles.logoEmoji}>🧺</Text>
        </View>
      </Animated.View>

      {/* Shop Name */}
      <Animated.Text style={[styles.shopName, { opacity: textOpacity }]}>
        HANGERS
      </Animated.Text>

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, { opacity: tagOpacity }]}>
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
    marginBottom: 28,
  },
  logoBox: {
    width:          110,
    height:         110,
    borderRadius:   28,
    backgroundColor:'rgba(255,255,255,0.1)',
    borderWidth:    1,
    borderColor:    'rgba(184,208,232,0.2)',
    alignItems:     'center',
    justifyContent: 'center',
  },
  logoEmoji: {
    fontSize: 52,
  },
  shopName: {
    fontFamily:    'Syne_800ExtraBold',
    fontSize:      32,
    color:         Colors.white,
    letterSpacing: 8,
    marginBottom:  10,
  },
  tagline: {
    fontFamily: 'DMSans_400Regular',
    fontSize:   FontSize.base,
    color:      Colors.primaryLight,
    letterSpacing: 1,
    marginBottom: 60,
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
