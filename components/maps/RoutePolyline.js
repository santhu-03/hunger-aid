// Route overlay — renders a styled polyline for the current route.
// Shows a shadow/border line + a coloured route line on top.
// Colours: blue (en-route to pickup) | orange (en-route to delivery)

import React from 'react';
import { Polyline } from '../MapComponents';

const STAGES = {
  pickup:   { strokeColor: '#1565c0', shadowColor: 'rgba(21,101,192,0.35)' },
  delivery: { strokeColor: '#e65100', shadowColor: 'rgba(230,81,0,0.35)' },
};

/**
 * Props:
 *   coords   — [{ latitude, longitude }]
 *   stage    — 'pickup' | 'delivery'
 *   dashed   — boolean (dashed line style)
 */
export default function RoutePolyline({ coords, stage = 'pickup', dashed = false }) {
  if (!coords?.length) return null;

  const { strokeColor, shadowColor } = STAGES[stage] ?? STAGES.pickup;

  return (
    <>
      {/* Shadow line (thicker, semi-transparent) */}
      <Polyline
        coordinates={coords}
        strokeColor={shadowColor}
        strokeWidth={8}
        lineCap="round"
        lineJoin="round"
      />
      {/* Route line */}
      <Polyline
        coordinates={coords}
        strokeColor={strokeColor}
        strokeWidth={4}
        lineCap="round"
        lineJoin="round"
        lineDashPattern={dashed ? [12, 6] : undefined}
      />
    </>
  );
}
