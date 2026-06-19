// Animated volunteer marker — smooth movement + pulsing ring.
//
// Uses React Native's Animated API to interpolate between GPS position updates
// so the marker glides rather than snapping to new coordinates.

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Marker } from '../../components/MapComponents';
import { FontAwesome5 } from '@expo/vector-icons';

export default function AnimatedVolunteerMarker({ coordinate, heading, isMoving = false }) {
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  // Pulse animation (continuous when active)
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim,    { toValue: 1.6, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0,   duration: 800, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim,    { toValue: 1,   duration: 0,   useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.6, duration: 0,   useNativeDriver: true }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  if (!coordinate?.latitude) return null;

  const rotation = heading != null ? `${heading}deg` : '0deg';

  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      flat
      rotation={heading ?? 0}
      tracksViewChanges={false}
    >
      <View style={styles.container}>
        {/* Pulsing ring */}
        <Animated.View
          style={[
            styles.pulse,
            {
              transform:   [{ scale: pulseAnim }],
              opacity:     pulseOpacity,
            },
          ]}
        />
        {/* Icon */}
        <View style={styles.dot}>
          <FontAwesome5 name="motorcycle" size={14} color="#fff" />
        </View>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position:        'absolute',
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: '#2196f3',
    opacity:         0.4,
  },
  dot: {
    width:           28,
    height:          28,
    borderRadius:    14,
    backgroundColor: '#1565c0',
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     2,
    borderColor:     '#fff',
    elevation:       4,
    shadowColor:     '#1565c0',
    shadowOpacity:   0.5,
    shadowRadius:    4,
    shadowOffset:    { width: 0, height: 2 },
  },
});
