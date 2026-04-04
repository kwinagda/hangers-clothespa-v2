import React, { useRef } from 'react';
import {
  Animated,
  GestureResponderEvent,
  StyleProp,
  TouchableOpacity,
  TouchableOpacityProps,
  ViewStyle,
} from 'react-native';

export default function AnimatedButton({
  children,
  style,
  onPressIn,
  onPressOut,
  activeOpacity = 0.92,
  ...props
}: TouchableOpacityProps & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value: number) => {
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      tension: 220,
      friction: 18,
    }).start();
  };

  const handlePressIn = (event: GestureResponderEvent) => {
    animateTo(0.97);
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    animateTo(1);
    onPressOut?.(event);
  };

  return (
    <AnimatedTouchableOpacity
      {...props}
      activeOpacity={activeOpacity}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedTouchableOpacity>
  );
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(
  TouchableOpacity
);
