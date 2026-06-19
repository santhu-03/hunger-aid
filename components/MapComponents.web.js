import React from 'react';
import { View, Text } from 'react-native';

const MapView = ({ style, children }) => (
  <View style={[style, { backgroundColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' }]}>
    <Text style={{ color: '#64748b' }}>Maps are not supported on Web.</Text>
    {children}
  </View>
);

export const Circle = () => null;
export const Marker = () => null;
export const Polyline = () => null;

export default MapView;
