// Global tracking context — shares the active delivery's tracking state
// across all role dashboards without prop-drilling.
//
// Provides:
//   donationId           — currently tracked donation (if any)
//   volunteerPos         — latest volunteer position
//   trackingDoc          — full liveTracking document
//   eta                  — { etaMinutes, distanceMeters, source }
//   isActive             — boolean
//   setActiveDonationId  — call to start tracking a specific donation

import React, { createContext, useContext, useMemo } from 'react';
import { useLiveTracking } from '../../hooks/tracking/useLiveTracking';

const TrackingContext = createContext(null);

export function TrackingProvider({ donationId, children }) {
  const tracking = useLiveTracking(donationId || null);

  const value = useMemo(() => ({
    donationId,
    ...tracking,
  }), [donationId, tracking]);

  return (
    <TrackingContext.Provider value={value}>
      {children}
    </TrackingContext.Provider>
  );
}

export function useTracking() {
  const ctx = useContext(TrackingContext);
  if (!ctx) return { isActive: false, volunteerPos: null, trackingDoc: null, eta: null };
  return ctx;
}
