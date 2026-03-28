// ─────────────────────────────────────────────────────────────────────────────
// THEME — Hangers Brand Colors, Typography, Spacing
// ─────────────────────────────────────────────────────────────────────────────

export const Colors = {
  // Brand
  primary:     '#023c62',
  primaryMid:  '#035a8f',
  primaryLight:'#B8D0E8',
  accent:      '#E8F0F7',

  // UI
  white:       '#FFFFFF',
  offWhite:    '#F7F9FC',
  border:      '#DCE8F0',
  borderLight: '#EEF4F9',

  // Text
  textDark:    '#1A2332',
  textMid:     '#3D5470',
  textMuted:   '#6B7FA3',
  textLight:   '#9DAFC8',

  // Status
  success:     '#0D7A4E',
  successBg:   '#E6F7F0',
  warning:     '#B35A00',
  warningBg:   '#FFF3E0',
  error:       '#C0392B',
  errorBg:     '#FDEDEC',

  // Utility
  overlay:     'rgba(2, 60, 98, 0.6)',
  shadow:      'rgba(2, 60, 98, 0.12)',
};

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

export const Radius = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  full: 999,
};

export const FontSize = {
  xs:    11,
  sm:    13,
  base:  15,
  md:    17,
  lg:    20,
  xl:    24,
  xxl:   30,
  xxxl:  38,
};

// ── Shadow presets ────────────────────────────────────────────────────────────
export const Shadow = {
  sm: {
    shadowColor:   Colors.shadow,
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius:  8,
    elevation:     2,
  },
  md: {
    shadowColor:   Colors.shadow,
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius:  16,
    elevation:     4,
  },
  lg: {
    shadowColor:   Colors.shadow,
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius:  24,
    elevation:     8,
  },
};
