import { useMemo } from 'react';
import { useDeliveryTracking } from './useDeliveryTracking';

function toTimestampValue(value) {
  if (!value) return 0;
  if (typeof value.toDate === 'function') {
    return value.toDate().getTime();
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }
  return 0;
}

export function useLiveTimeline(donationId, options = {}) {
  const { tracking, loading, error } = useDeliveryTracking(donationId, options);

  const timeline = useMemo(() => {
    const events = Array.isArray(tracking?.timelineEvents) ? tracking.timelineEvents : [];

    return events
      .map((event, index) => ({
        id: `${tracking?.id || donationId || 'delivery'}-${index}`,
        status: event.status,
        eventLabel: event.status,
        eventTimestamp: event.timestamp,
        actorName: event.actor?.name || event.actor?.role || 'System',
        note: event.notes || '',
      }))
      .sort((left, right) => toTimestampValue(left.eventTimestamp) - toTimestampValue(right.eventTimestamp));
  }, [donationId, tracking]);

  return { timeline, loading, error, tracking };
}
