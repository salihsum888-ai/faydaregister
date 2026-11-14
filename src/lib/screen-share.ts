/**
 * Cross-platform Screen Share & Mobile Screenshot Fallback Utilities
 * Handles desktop/Android getDisplayMedia support detection, constraint fallbacks,
 * and mobile image/screenshot compression when OS browsers (like iOS Safari) block getDisplayMedia.
 */

export interface ScreenShareSupportInfo {
  supported: boolean;
  isMobile: boolean;
  isIOS: boolean;
  isInIframe: boolean;
}

export function detectScreenShareSupport(): ScreenShareSupportInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { supported: false, isMobile: false, isIOS: false, isInIframe: false };
  }

  const ua = navigator.userAgent || '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid || /Mobile|Tablet/i.test(ua);

  let isInIframe = false;
  try {
    isInIframe = window.self !== window.top;
  } catch {
    isInIframe = true;
  }

  const hasApi =
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function';

  // iOS/iPadOS WebKit does not support live browser screen capture
  const supported = hasApi && !isIOS;

  return {
    supported,
    isMobile,
    isIOS,
    isInIframe,
  };
}

export type AcquireScreenResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; reason: 'unsupported' | 'cancelled' | 'blocked'; message: string };

export async function acquireDisplayMediaStream(): Promise<AcquireScreenResult> {
  const info = detectScreenShareSupport();

  if (
    typeof navigator === 'undefined' ||
    typeof navigator.mediaDevices?.getDisplayMedia !== 'function' ||
    info.isIOS
  ) {
    return {
      ok: false,
      reason: 'unsupported',
      message: info.isIOS
        ? 'iPhone & iPad browsers do not allow live screen capture. You can share a Screenshot/Photo or switch to Rear Camera instead.'
        : 'This mobile browser does not support live screen capture. You can share a Screenshot/Photo or switch to Rear Camera instead.',
    };
  }

  const attempts: DisplayMediaStreamOptions[] = [
    {
      video: {
        frameRate: { ideal: 30, max: 30 },
      } as MediaTrackConstraints,
      audio: false,
    },
    {
      video: true,
      audio: false,
    },
  ];

  let lastErr: any = null;

  for (const options of attempts) {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia(options);
      if (stream && stream.getVideoTracks().length > 0) {
        return { ok: true, stream };
      }
    } catch (err: any) {
      lastErr = err;
      const errName = err?.name || '';
      // User explicitly cancelled the picker — don't retry
      if (errName === 'AbortError') {
        return {
          ok: false,
          reason: 'cancelled',
          message: 'Screen sharing cancelled.',
        };
      }
      // Permission or policy blocked
      if (errName === 'NotAllowedError' || errName === 'SecurityError') {
        if (info.isMobile) {
          return {
            ok: false,
            reason: 'blocked',
            message: info.isInIframe
              ? 'Mobile browser blocked screen sharing inside embedded preview. Open the app directly in Chrome, or share a Screenshot/Photo instead.'
              : 'Screen sharing permission was denied or is unsupported on this phone browser. You can share a Screenshot/Photo or use Rear Camera instead.',
          };
        }
        return {
          ok: false,
          reason: 'cancelled',
          message: info.isInIframe
            ? 'Screen sharing was cancelled or blocked by browser/iframe permissions.'
            : 'Screen sharing permission was cancelled.',
        };
      }
      if (errName === 'NotSupportedError' || errName === 'TypeError') {
        continue;
      }
    }
  }

  const errName = lastErr?.name || '';
  return {
    ok: false,
    reason: errName === 'NotSupportedError' ? 'unsupported' : 'blocked',
    message: info.isMobile
      ? 'Live screen capture is unavailable on this phone browser. Share a Screenshot/Photo or switch to Rear Camera instead.'
      : `Could not start screen sharing (${errName || 'BrowserError'}). Check browser screen recording permissions.`,
  };
}

/**
 * Compresses an uploaded screenshot or photo to a lightweight JPEG data URL
 * so mobile users can broadcast slides/screenshots over Firestore without exceeding 1MB.
 */
export function compressImageFileForScreenShare(
  file: File,
  maxWidth = 1280,
  quality = 0.78
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read selected image.'));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error('Unsupported image format.'));
      img.onload = () => {
        let targetW = img.width || 1280;
        let targetH = img.height || 720;
        if (targetW > maxWidth) {
          const ratio = maxWidth / targetW;
          targetW = maxWidth;
          targetH = Math.round(targetH * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}
