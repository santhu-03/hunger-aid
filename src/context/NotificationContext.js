/**
 * NotificationContext — real-time notification state for the entire app.
 *
 * Architecture
 * ────────────
 * • One onSnapshot listener per signed-in user, scoped strictly to
 *   where('userId', '==', uid).  No other user's documents can arrive.
 * • On first mount the snapshot fires immediately ("initial load").  We mark
 *   that first batch as non-popup so the user isn't bombarded when they open
 *   the app.  Only genuinely new additions after that fire popups.
 * • The listener is torn down on sign-out or component unmount, preventing
 *   memory leaks and permission errors after logout.
 *
 * Popup queue
 * ───────────
 * When docChanges() reports a type === 'added' document after the initial
 * load we push it onto popupQueue.  NotificationPopup reads this queue and
 * renders one popup at a time; dismissPopup() removes it.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import {
  deleteNotification as svcDelete,
  markAllAsRead as svcMarkAll,
  markAsRead as svcMarkOne,
  subscribeToNotifications,
} from '../services/notificationService';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [popupQueue,    setPopupQueue]    = useState([]);

  // Tracks whether the next snapshot callback is the initial load.
  // We skip popups on the initial load to avoid notification floods on open.
  const isInitial = useRef(true);

  // ── Real-time Firestore listener ──────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      setPopupQueue([]);
      return;
    }

    setLoading(true);
    isInitial.current = true;

    const unsub = subscribeToNotifications(user.uid, (items, snap) => {
      setNotifications(items);
      setUnreadCount(items.filter((n) => !n.read).length);
      setLoading(false);

      // Detect newly added documents for popup notifications.
      // Skip on the initial snapshot so we don't show stale popups on launch.
      if (!isInitial.current && snap) {
        snap.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const newNotif = { id: change.doc.id, ...change.doc.data() };
            setPopupQueue((prev) => [...prev, newNotif]);
          }
        });
      }
      isInitial.current = false;
    });

    return () => {
      unsub();
      isInitial.current = true;
    };
  }, [user]);

  // ── Actions (memoised so consumers don't re-render on every parent render) ─

  /** Remove a notification from the popup queue (called by NotificationPopup). */
  const dismissPopup = useCallback((id) => {
    setPopupQueue((prev) => prev.filter((n) => n.id !== id));
  }, []);

  /** Mark a single notification as read. */
  const markAsRead = useCallback(async (id) => {
    await svcMarkOne(id);
  }, []);

  /** Batch-mark all unread notifications for the current user as read. */
  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    await svcMarkAll(user.uid);
  }, [user]);

  /** Permanently delete a notification document. */
  const deleteNotification = useCallback(async (id) => {
    await svcDelete(id);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        popupQueue,
        dismissPopup,
        markAsRead,
        markAllAsRead,
        deleteNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotificationContext must be used inside <NotificationProvider>');
  }
  return ctx;
}
