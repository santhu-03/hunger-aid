import React, { createContext, useContext, useState } from 'react';

export const PALETTE = {
  primary:     '#16a34a',
  primaryDark: '#14532d',
  primaryMid:  '#166534',
  primaryLight:'#dcfce7',
  blue:        '#3b82f6',
  blueDark:    '#1d4ed8',
  blueLight:   '#dbeafe',
  amber:       '#f59e0b',
  amberDark:   '#b45309',
  amberLight:  '#fef3c7',
  red:         '#ef4444',
  redDark:     '#b91c1c',
  redLight:    '#fee2e2',
  purple:      '#8b5cf6',
  purpleDark:  '#6d28d9',
  purpleLight: '#ede9fe',
  cyan:        '#06b6d4',
  cyanDark:    '#0e7490',
  cyanLight:   '#cffafe',
  pink:        '#ec4899',
  pinkLight:   '#fce7f3',
  orange:      '#f97316',
  orangeLight: '#ffedd5',
};

export const LIGHT = {
  bg:            '#f0fdf4',
  bgAlt:         '#f8fafc',
  surface:       '#ffffff',
  sidebarBg:     '#0d2b12',
  sidebarHover:  '#1a4a1f',
  sidebarActive: '#166534',
  sidebarBorder: '#1f3d24',
  headerBg:      '#166534',
  text:          '#0f172a',
  textSec:       '#475569',
  textMuted:     '#94a3b8',
  border:        '#e2e8f0',
  borderLight:   '#f1f5f9',
  inputBg:       '#f8fafc',
  skeleton:      '#e2e8f0',
  skeletonShine: '#f8fafc',
  ...PALETTE,
};

export const DARK = {
  bg:            '#060f0a',
  bgAlt:         '#0a1a0f',
  surface:       '#0f1f14',
  sidebarBg:     '#030a05',
  sidebarHover:  '#0d2010',
  sidebarActive: '#14532d',
  sidebarBorder: '#112215',
  headerBg:      '#0a1a0f',
  text:          '#f0fdf4',
  textSec:       '#86efac',
  textMuted:     '#4ade80',
  border:        '#1a3320',
  borderLight:   '#112215',
  inputBg:       '#0a1a0f',
  skeleton:      '#1a3320',
  skeletonShine: '#0f2918',
  ...PALETTE,
};

const ThemeCtx = createContext({
  theme: LIGHT,
  isDark: false,
  toggle: () => {},
});

export function AdminThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);
  return (
    <ThemeCtx.Provider value={{ theme: isDark ? DARK : LIGHT, isDark, toggle: () => setIsDark(p => !p) }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useAdminTheme = () => useContext(ThemeCtx);

export function statusColor(status, theme) {
  const s = (status || '').toLowerCase();
  if (s === 'active' || s === 'completed' || s === 'completed verified' || s === 'verified') return theme.primary;
  if (s === 'pending' || s === 'offered' || s === 'pending pickup') return theme.amber;
  if (s === 'blocked' || s === 'cancelled' || s === 'rejected' || s === 'failed') return theme.red;
  if (s === 'busy' || s === 'en route' || s === 'in progress') return theme.blue;
  if (s === 'available') return theme.cyan;
  return theme.textMuted;
}

export function roleBadge(role) {
  switch ((role || '').toLowerCase()) {
    case 'admin':        return { bg: '#ede9fe', text: '#6d28d9' };
    case 'donor':        return { bg: '#dbeafe', text: '#1d4ed8' };
    case 'volunteer':    return { bg: '#dcfce7', text: '#166534' };
    case 'beneficiary':  return { bg: '#fef3c7', text: '#b45309' };
    default:             return { bg: '#f1f5f9', text: '#475569' };
  }
}
