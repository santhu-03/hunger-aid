// Floating ETA card — shown over the map on all tracking screens.

import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

function fmtDist(meters) {
  if (meters == null) return '—';
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function fmtEta(minutes) {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * Props:
 *   etaMinutes      — number | null
 *   distanceMeters  — number | null
 *   status          — delivery status string
 *   isStale         — boolean, true = location not recently updated
 *   source          — 'google_matrix' | 'google' | 'haversine' | 'fallback'
 *   stage           — 'pickup' | 'delivery'
 *   loading         — boolean
 *   dark            — boolean (dark map overlay style)
 */
export default function ETAInfoCard({
  etaMinutes,
  distanceMeters,
  status,
  isStale = false,
  source,
  stage = 'pickup',
  loading = false,
  dark = true,
}) {
  const S = dark ? darkStyles : lightStyles;
  const isPickup = stage === 'pickup';

  return (
    <View style={[S.card, isStale && S.staleCard]}>
      {loading ? (
        <ActivityIndicator size="small" color={dark ? '#4fc3f7' : '#1565c0'} />
      ) : (
        <View style={S.row}>
          {/* ETA */}
          <View style={S.block}>
            <FontAwesome5 name="clock" size={16} color={dark ? '#ff9800' : '#e65100'} />
            <Text style={S.value}>{fmtEta(etaMinutes)}</Text>
            <Text style={S.label}>ETA</Text>
          </View>

          <View style={S.divider} />

          {/* Distance */}
          <View style={S.block}>
            <FontAwesome5 name="route" size={16} color={dark ? '#4fc3f7' : '#1565c0'} />
            <Text style={S.value}>{fmtDist(distanceMeters)}</Text>
            <Text style={S.label}>{isPickup ? 'To Pickup' : 'To Drop-off'}</Text>
          </View>

          <View style={S.divider} />

          {/* Stage */}
          <View style={S.block}>
            <FontAwesome5
              name={isPickup ? 'box' : 'home'}
              size={16}
              color={isPickup ? '#4caf50' : '#e91e63'}
            />
            <Text style={[S.value, { fontSize: 11 }]} numberOfLines={2}>
              {status || (isPickup ? 'Heading to\nPickup' : 'Heading to\nDrop-off')}
            </Text>
            <Text style={S.label}>{isPickup ? 'Pickup Phase' : 'Delivery Phase'}</Text>
          </View>
        </View>
      )}

      {isStale && (
        <View style={S.staleRow}>
          <MaterialIcons name="location-off" size={12} color="#ff7043" />
          <Text style={S.staleText}> Location not updated recently</Text>
        </View>
      )}

      {source === 'google_matrix' && !isStale && (
        <Text style={S.sourceText}>Live traffic ETA</Text>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const base = {
  card: {
    borderRadius: 20,
    padding: 14,
    elevation: 10,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  block: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  divider: {
    width: 1,
    height: 40,
  },
  value:  { fontWeight: '800', fontSize: 16, textAlign: 'center' },
  label:  { fontSize: 10, textAlign: 'center' },
  staleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  staleText: { fontSize: 11 },
  sourceText: { fontSize: 10, textAlign: 'center', marginTop: 6 },
};

const darkStyles = StyleSheet.create({
  ...base,
  card: {
    ...base.card,
    backgroundColor: 'rgba(13,27,42,0.96)',
    borderWidth: 1.5,
    borderColor: 'rgba(79,195,247,0.25)',
    shadowColor: '#4fc3f7',
  },
  staleCard: { borderColor: 'rgba(255,112,67,0.5)' },
  row:      { ...base.row },
  block:    { ...base.block },
  divider:  { ...base.divider, backgroundColor: 'rgba(255,255,255,0.1)' },
  value:    { ...base.value, color: '#fff' },
  label:    { ...base.label, color: 'rgba(255,255,255,0.5)' },
  staleRow: { ...base.staleRow },
  staleText:  { ...base.staleText, color: '#ff7043' },
  sourceText: { ...base.sourceText, color: 'rgba(79,195,247,0.7)' },
});

const lightStyles = StyleSheet.create({
  ...base,
  card: {
    ...base.card,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
  },
  staleCard: { borderColor: '#ff7043' },
  row:      { ...base.row },
  block:    { ...base.block },
  divider:  { ...base.divider, backgroundColor: '#e0e0e0' },
  value:    { ...base.value, color: '#1a1a1a' },
  label:    { ...base.label, color: '#888' },
  staleRow: { ...base.staleRow },
  staleText:  { ...base.staleText, color: '#e64a19' },
  sourceText: { ...base.sourceText, color: '#2196f3' },
});
