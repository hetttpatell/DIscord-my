/**
 * Dedicated microphone management module ensuring reliable mobile permission handling.
 * Eliminates all pre-checks and gates before getUserMedia.
 */

let activeMicStream = null;
let lastGetUserMediaResult = null;

/**
 * Delete every persisted or in-memory flag that records a denial (localStorage, sessionStorage)
 * so users already stuck immediately recover.
 */
export function clearStoredDenialFlags() {
  if (typeof window === 'undefined') return;
  const denialKeys = [
    'mic_denied',
    'afterspot_mic_denied',
    'micDenied',
    'hasPermission',
    'permissionDenied',
    'microphone_denied',
  ];

  denialKeys.forEach((key) => {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {}
  });
}

// Automatically clear any stuck denial flags on load
clearStoredDenialFlags();

/**
 * Checks if the user is running inside an in-app browser (e.g. Instagram, WhatsApp, Facebook, Line, Android WebView).
 */
export function isInAppBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)/i.test(ua);
}

/**
 * Returns the last result of a getUserMedia capture attempt for diagnostics.
 */
export function getLastGetUserMediaResult() {
  return lastGetUserMediaResult;
}

export function setLastGetUserMediaResult(result) {
  lastGetUserMediaResult = result;
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
 * Directly requests microphone access via getUserMedia with zero pre-checks or gates.
 * Throws on failure with the exact browser error.
 *
 * @returns {Promise<MediaStream>}
 */
export async function requestMicrophoneStream() {
  // 1. Stop existing local audio tracks before requesting a new stream
  // so a second capture never causes NotReadableError on mobile Android
  stopMicrophone();

  if (typeof window === 'undefined') {
    const err = new Error('Window is not defined');
    err.name = 'UnsupportedError';
    setLastGetUserMediaResult({ ok: false, name: err.name, message: err.message });
    throw err;
  }

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    const err = new Error('Microphone needs a secure (HTTPS) page.');
    err.name = 'SecurityError';
    setLastGetUserMediaResult({ ok: false, name: err.name, message: err.message });
    throw err;
  }

  // 2. Constraints: first try echoCancellation, noiseSuppression, autoGainControl; never video
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
        setLastGetUserMediaResult({
          ok: false,
          name: retryErr.name || 'Error',
          message: retryErr.message || '',
        });
        throw retryErr;
      }
    } else {
      setLastGetUserMediaResult({
        ok: false,
        name: err.name || 'Error',
        message: err.message || '',
      });
      throw err;
    }
  }

  activeMicStream = stream;
  if (typeof window !== 'undefined') {
    window.__activeAudioStream = stream;
  }

  setLastGetUserMediaResult({ ok: true, name: 'Success', message: 'Stream acquired' });

  // Resume audio contexts and elements in the same user gesture
  resumeAudioContextAndElements();

  return stream;
}

/**
 * Safe wrapper returning structured { ok, stream } or { ok, reason, name, message }.
 */
export async function requestMicrophone() {
  try {
    const stream = await requestMicrophoneStream();
    return { ok: true, stream };
  } catch (err) {
    const errorName = err?.name || 'Error';
    const errorMessage = err?.message || '';

    let reason = 'error';
    if (errorName === 'NotAllowedError') reason = 'denied';
    else if (errorName === 'NotFoundError') reason = 'not_found';
    else if (errorName === 'NotReadableError' || errorName === 'AbortError') reason = 'in_use';
    else if (errorName === 'SecurityError') reason = 'security';

    return {
      ok: false,
      reason,
      name: errorName,
      message: errorMessage || 'Failed to capture microphone',
    };
  }
}
