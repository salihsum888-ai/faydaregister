'use client';

let sharedAudioCtx: AudioContext | null = null;
let unlockListenersAttached = false;
let permissionRequested = false;
let activeCallNotification: Notification | null = null;
let lastNotifiedCallId: string | null = null;

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      sharedAudioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  return sharedAudioCtx;
}

/**
 * Unlocks the shared Web Audio context and requests browser Notification permission
 * on the first user interaction anywhere in the app.
 */
export function ensureRingtoneAudioUnlocked(): void {
  if (typeof window === 'undefined' || unlockListenersAttached) return;
  unlockListenersAttached = true;

  const unlock = () => {
    const ctx = getOrCreateAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    if (
      !permissionRequested &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'default'
    ) {
      permissionRequested = true;
      try {
        Notification.requestPermission().catch(() => {});
      } catch {
        // Ignore older Safari synchronous callback errors
      }
    }
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
  window.addEventListener('click', unlock, { passive: true });
}

export interface IncomingCallNotificationParams {
  callId: string;
  title: string;
  body: string;
  onActivate?: () => void;
}

/**
 * Shows a native OS/browser desktop or mobile notification when an incoming call arrives
 * while the browser tab is minimized, hidden, or unfocused.
 */
export function showIncomingCallSystemNotification({
  callId,
  title,
  body,
  onActivate,
}: IncomingCallNotificationParams): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const isTabBackgrounded = document.visibilityState === 'hidden' || !document.hasFocus();
  if (!isTabBackgrounded) return;

  if (lastNotifiedCallId === callId && activeCallNotification) {
    return;
  }

  try {
    if (activeCallNotification) {
      activeCallNotification.close();
      activeCallNotification = null;
    }

    const notification = new Notification(title, {
      body,
      tag: `fayda-incoming-call-${callId}`,
      requireInteraction: true,
      silent: false,
    });

    lastNotifiedCallId = callId;
    activeCallNotification = notification;

    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // Ignore focus errors
      }
      notification.close();
      activeCallNotification = null;
      if (onActivate) {
        onActivate();
      }
    };

    notification.onclose = () => {
      if (activeCallNotification === notification) {
        activeCallNotification = null;
      }
    };
  } catch {
    // Ignore environments where Notification constructor is restricted (e.g., certain mobile webviews)
  }
}

/**
 * Closes any active system notification for an incoming call when answered, declined, or ended.
 */
export function clearIncomingCallSystemNotification(callId?: string): void {
  if (!activeCallNotification) return;
  if (!callId || lastNotifiedCallId === callId) {
    try {
      activeCallNotification.close();
    } catch {
      // Ignore close errors
    }
    activeCallNotification = null;
    lastNotifiedCallId = null;
  }
}

/**
 * Plays a single ringtone or ringback burst.
 * - 'incoming': Clear, audible two-pulse harmonic phone ringtone + mobile vibration
 * - 'outgoing': Standard 440Hz + 480Hz telephone ringback tone for caller
 */
export async function playCallToneBurst(type: 'incoming' | 'outgoing'): Promise<void> {
  if (typeof window === 'undefined') return;

  if (type === 'incoming' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([260, 120, 260]);
    } catch {
      // Ignore vibration errors on unsupported devices
    }
  }

  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  } catch {
    // Continue even if resume rejects prior to interaction
  }

  const now = ctx.currentTime;

  if (type === 'outgoing') {
    // Classic 440Hz + 480Hz telephone ringback tone (900ms burst)
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.exponentialRampToValueAtTime(0.22, now + 0.04);
    masterGain.gain.setValueAtTime(0.22, now + 0.84);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.92);
    masterGain.connect(ctx.destination);

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(440, now);
    osc2.frequency.setValueAtTime(480, now);

    osc1.connect(masterGain);
    osc2.connect(masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.94);
    osc2.stop(now + 0.94);
    return;
  }

  // Incoming call: Crisp 3-note harmonic arpeggio repeated twice (D5 -> F#5 -> A5)
  const notes = [
    { freq: 587.33, start: 0.0, duration: 0.16 },   // D5
    { freq: 739.99, start: 0.17, duration: 0.16 },  // F#5
    { freq: 880.0, start: 0.34, duration: 0.28 },   // A5
    { freq: 587.33, start: 0.72, duration: 0.16 },  // D5 (second cadence)
    { freq: 739.99, start: 0.89, duration: 0.16 },  // F#5
    { freq: 1174.66, start: 1.06, duration: 0.34 }, // D6
  ];

  notes.forEach(({ freq, start, duration }) => {
    const startTime = now + start;
    const stopTime = startTime + duration;

    const noteGain = ctx.createGain();
    noteGain.gain.setValueAtTime(0.001, startTime);
    noteGain.gain.exponentialRampToValueAtTime(0.34, startTime + 0.02);
    noteGain.gain.exponentialRampToValueAtTime(0.18, startTime + duration * 0.65);
    noteGain.gain.exponentialRampToValueAtTime(0.001, stopTime);
    noteGain.connect(ctx.destination);

    // Primary fundamental tone
    const oscMain = ctx.createOscillator();
    oscMain.type = 'triangle';
    oscMain.frequency.setValueAtTime(freq, startTime);

    // Warm sine sub-harmonic
    const oscSub = ctx.createOscillator();
    oscSub.type = 'sine';
    oscSub.frequency.setValueAtTime(freq * 0.5, startTime);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.45, startTime);

    oscMain.connect(noteGain);
    oscSub.connect(subGain);
    subGain.connect(noteGain);

    oscMain.start(startTime);
    oscSub.start(startTime);
    oscMain.stop(stopTime + 0.01);
    oscSub.stop(stopTime + 0.01);
  });
}
