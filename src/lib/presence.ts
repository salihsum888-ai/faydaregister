import { format, isToday, isYesterday } from 'date-fns';
import { UserProfile } from './types';

/**
 * Maximum age in milliseconds for a heartbeat before an account is treated as offline.
 * Heartbeats are sent every 35 seconds while connected to the internet.
 */
export const PRESENCE_ONLINE_WINDOW_MS = 75_000;

export interface PresenceLabels {
  onlineNow: string;
  offlineStatus: string;
  lastSeenJustNow: string;
  lastSeenMinsAgo: string;
  lastSeenTodayAt: string;
  lastSeenYesterdayAt: string;
  lastSeenDate: string;
}

/**
 * Returns true ONLY if the user has an active internet session and sent a heartbeat
 * within the last 75 seconds (never relies on manual `isDutyActive`).
 */
export function isUserTrulyOnline(
  profile?: UserProfile | null,
  nowMs: number = Date.now()
): boolean {
  if (!profile) return false;
  if (profile.isOnline === false) return false;
  if (!profile.lastSeenAt) return false;

  const seenMs = new Date(profile.lastSeenAt).getTime();
  if (Number.isNaN(seenMs)) return false;

  return nowMs - seenMs <= PRESENCE_ONLINE_WINDOW_MS;
}

/**
 * Returns the best timestamp for "Last seen" display (`lastSeenAt` fallback to `updatedAt`).
 */
export function getLastSeenTimestampMs(profile?: UserProfile | null): number {
  if (!profile) return 0;
  const raw = profile.lastSeenAt || profile.updatedAt;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Formats a real-time status label:
 * - "Online" if genuinely connected within the last 75s
 * - Otherwise "Offline • Last seen Xm ago / today at HH:mm / MMM dd, HH:mm"
 */
export function formatRealTimePresence(
  profile: UserProfile | undefined | null,
  labels: PresenceLabels,
  nowMs: number = Date.now()
): string {
  if (isUserTrulyOnline(profile, nowMs)) {
    return labels.onlineNow;
  }

  const seenMs = getLastSeenTimestampMs(profile);
  if (!seenMs) {
    return labels.offlineStatus;
  }

  const diffSeconds = Math.max(0, Math.floor((nowMs - seenMs) / 1000));
  if (diffSeconds < 90) {
    return labels.lastSeenJustNow;
  }

  const diffMins = Math.floor(diffSeconds / 60);
  if (diffMins < 60) {
    return labels.lastSeenMinsAgo.replace('{mins}', String(diffMins));
  }

  const seenDate = new Date(seenMs);
  if (isToday(seenDate)) {
    return labels.lastSeenTodayAt.replace('{time}', format(seenDate, 'HH:mm'));
  }
  if (isYesterday(seenDate)) {
    return labels.lastSeenYesterdayAt.replace('{time}', format(seenDate, 'HH:mm'));
  }

  return labels.lastSeenDate.replace('{date}', format(seenDate, 'MMM dd, HH:mm'));
}
