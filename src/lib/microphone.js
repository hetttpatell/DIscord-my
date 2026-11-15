/**
 * Dedicated microphone management module ensuring reliable mobile permission handling.
 * All microphone access across Afterspot must go through this module.
 */

let activeMicStream = null;

/**
 * Checks if the user is running inside an in-app browser (e.g. Instagram, WhatsApp, Facebook, Line, Android WebView).
 */
export function isInAppBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)/i.test(ua);
}

/**
 * Safely queries the microphone permission status using the Permissions API.
 * Returns 'granted' | 'denied' | 'prompt' | 'unknown'.
 */
export async function getPermissionStatus() {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unknown';
  }
  try {
    const status = await navigator.permissions.query({ name: 'microphone' });
    return status?.state || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Subscribes to microphone permission changes.
 * When the user changes permission in browser site settings to 'granted',
 * executes onGranted without requiring a page reload.
 */
export function subscribeToPermissionChange(onGranted) {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return () => {};
  }

  let permissionStatus = null;
  let isCancelled = false;

  const handleChange = () => {
    if (permissionStatus && permissionStatus.state === 'granted') {
      onGranted();
    }
  };

  navigator.permissions
    .query({ name: 'microphone' })
    .then((status) => {
      if (isCancelled) return;
      permissionStatus = status;
      if (typeof permissionStatus.addEventListener === 'function') {
        permissionStatus.addEventListener('change', handleChange);
      } else {
        permissionStatus.onchange = handleChange;
      }
    })
    .catch(() => {});

  return () => {
    isCancelled = true;
    if (permissionStatus) {
      if (typeof permissionStatus.removeEventListener === 'function') {
        permissionStatus.removeEventListener('change', handleChange);
      } else {
        permissionStatus.onchange = null;
      }
    }
  };
}

/**
 * Resumes any suspended AudioContext and triggers .play() on audio elements
 * synchronously within the user gesture window.
 */
export function resumeAudioContextAndElements() {
  try {
    if (typeof window !== 'undefined') {
      if (window.__audioContext && window.__audioContext.state === 'suspended') {
        window.__audioContext.resume().catch(() => {});
      }
    }
    if (typeof document !== 'undefined') {
      document.querySelectorAll('audio').forEach((el) => {
        el.play().catch(() => {});
      });
    }
  } catch {
    // Ignore audio autoplay errors
  }
}

/**
 * Returns the currently active, live microphone MediaStream if one exists.
 */
export function getActiveMicrophoneStream() {
  if (activeMicStream && activeMicStream.getAudioTracks().some((t) => t.readyState === 'live')) {
    return activeMicStream;
  }
  return null;
}

/**
 * Stops all tracks on the active microphone stream and cleans up references.
 */
export function stopMicrophone() {
  if (activeMicStream) {
    activeMicStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });
    activeMicStream = null;
  }
  if (typeof window !== 'undefined' && window.__activeAudioStream) {
    window.__activeAudioStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });
    window.__activeAudioStream = null;
  }
}

/**
 * Mutes or unmutes the microphone by toggling track.enabled on the existing stream.
 * Does not stop or re-request media devices.
 */
export function setMicrophoneMuted(muted) {
  const stream = getActiveMicrophoneStream();
  if (stream) {
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    return true;
  }
  return false;
}

/**
 * Formats, logs, and maps errors by error.name into structured reason objects.
 */
async function mapAndLogFailure(err) {
  const errorName = err?.name || 'Error';
  const errorMessage = err?.message || '';
  const permissionState = await getPermissionStatus();
  const isSecure = typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false;
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  // Required diagnostic log on every failure
  console.error('[mic]', {
    name: errorName,
    message: errorMessage,
    permissionState,
    isSecureContext: isSecure,
    userAgent,
  });

  // In-app browser detection
  if (isInAppBrowser() && (errorName === 'NotAllowedError' || errorName === 'SecurityError')) {
    return {
      ok: false,
      reason: 'in_app_browser',
      name: errorName,
      message: 'Open this link in Chrome or Safari to use the microphone.',
    };
  }

  // Map errors by error.name
  if (errorName === 'NotAllowedError') {
    return {
      ok: false,
      reason: 'denied',
      name: errorName,
      message: 'Microphone access denied.',
    };
  }

  if (errorName === 'NotFoundError') {
    return {
      ok: false,
      reason: 'not_found',
      name: errorName,
      message: 'No microphone found on this device.',
    };
  }

  if (errorName === 'NotReadableError' || errorName === 'AbortError') {
    return {
      ok: false,
      reason: 'in_use',
      name: errorName,
      message: 'Microphone is being used by another app or tab. Close it and try again.',
    };
  }

  if (errorName === 'SecurityError') {
    return {
      ok: false,
      reason: 'security',
      name: errorName,
      message: 'Blocked by page security policy.',
    };
  }

  return {
    ok: false,
    reason: 'error',
    name: errorName,
    message: errorMessage ? `${errorName}: ${errorMessage}` : errorName,
  };
}

/**
 * Requests access to the microphone.
 * MUST be invoked synchronously within the user click gesture.
 *
 * @returns {Promise<{ ok: true, stream: MediaStream } | { ok: false, reason: string, name: string, message: string }>}
 */
export async function requestMicrophone() {
  // 1. Synchronous environment checks FIRST (No awaits, no timeouts, no promises prior to this)
  if (typeof window === 'undefined') {
    return {
      ok: false,
      reason: 'unsupported',
      name: 'UnsupportedError',
      message: 'Window is not defined.',
    };
  }

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    const failure = {
      ok: false,
      reason: 'insecure',
      name: 'SecurityError',
      message: 'Microphone needs a secure (HTTPS) page.',
    };
    await mapAndLogFailure(failure);
    return failure;
  }

  // 2. Reuse existing stream if live
  const existing = getActiveMicrophoneStream();
  if (existing) {
    setMicrophoneMuted(false);
    resumeAudioContextAndElements();
    return { ok: true, stream: existing };
  }

  // Clean up any stale or dead tracks
  stopMicrophone();

  // 3. Constraints: first try echoCancellation, noiseSuppression, autoGainControl; never video
  const primaryConstraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  };

  let stream = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia(primaryConstraints);
  } catch (err) {
    // If OverconstrainedError or TypeError, retry once with { audio: true }
    if (err.name === 'OverconstrainedError' || err.name === 'TypeError') {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (retryErr) {
        return await mapAndLogFailure(retryErr);
      }
    } else {
      return await mapAndLogFailure(err);
    }
  }

  activeMicStream = stream;
  if (typeof window !== 'undefined') {
    window.__activeAudioStream = stream;
  }

  // Resume audio contexts and elements in the same gesture
  resumeAudioContextAndElements();

  return { ok: true, stream };
}

