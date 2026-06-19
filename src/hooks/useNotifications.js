/**
 * useNotifications — convenience hook that surfaces the NotificationContext
 * alongside service-level constants so call sites have a single import.
 *
 * Usage:
 *   const { notifications, unreadCount, markAsRead, deleteNotification } = useNotifications();
 */

import { useNotificationContext } from '../context/NotificationContext';
import { NOTIFICATION_TYPES, PAGE_SIZE } from '../services/notificationService';

export function useNotifications() {
  const ctx = useNotificationContext();
  return {
    ...ctx,
    // Re-expose constants so screens don't need a separate service import.
    NOTIFICATION_TYPES,
    PAGE_SIZE,
  };
}
