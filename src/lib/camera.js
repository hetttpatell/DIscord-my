/**
 * Dedicated camera management module ensuring reliable mobile & desktop permission handling.
 * Captures clean video tracks with zero audio interference.
 */

let activeCameraStream = null;
let lastGetUserMediaResult = null;

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
 * Returns the currently active, live camera MediaStream if one exists.
 */
export function getActiveCameraStream() {
  if (activeCameraStream && activeCameraStream.getVideoTracks().some((t) => t.readyState === 'live')) {
    return activeCameraStream;
  }
  return null;
}

/**
 * Stops all tracks on the active camera stream and cleans up references.
 * Ensures device hardware camera LED indicator shuts off completely.
 */
export function stopCamera() {
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });
    activeCameraStream = null;
  }
  if (typeof window !== 'undefined' && window.__activeVideoStream) {
    window.__activeVideoStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });
    window.__activeVideoStream = null;
  }
}

/**
 * Enables or disables the video tracks on the active camera stream.
 */
export function setCameraTrackEnabled(enabled) {
  const stream = getActiveCameraStream();
  if (stream) {
    stream.getVideoTracks().forEach((track) => {
      track.enabled = Boolean(enabled);
    });
    return true;
  }
  return false;
}

/**
 * Directly requests camera access via getUserMedia with zero pre-checks or gates.
 * Throws on failure with the exact browser error.
 *
 * @param {Object} options
 * @param {'user' | 'environment'} [options.facingMode='user']
 * @returns {Promise<MediaStream>}
 */
export async function requestCameraStream({ facingMode = 'user' } = {}) {
  // 1. Stop existing local camera tracks before requesting a new stream
  // so a second capture never causes NotReadableError on mobile Android or desktop webcams
  stopCamera();

  if (typeof window === 'undefined') {
    const err = new Error('Window is not defined');
    err.name = 'UnsupportedError';
    setLastGetUserMediaResult({ ok: false, name: err.name, message: err.message });
    throw err;
  }

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    const err = new Error('Camera requires a secure (HTTPS) page or localhost.');
    err.name = 'SecurityError';
    setLastGetUserMediaResult({ ok: false, name: err.name, message: err.message });
    throw err;
  }

  // 2. Constraints: crisp 720p/30fps optimized for mobile bandwidth and thermals
  const primaryConstraints = {
    video: {
      facingMode,
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: false,
  };

  let stream = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia(primaryConstraints);
  } catch (err) {
    // If OverconstrainedError, retry with basic video: true
    if (err.name === 'OverconstrainedError' || err.name === 'TypeError') {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
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

  activeCameraStream = stream;
  if (typeof window !== 'undefined') {
    window.__activeVideoStream = stream;
  }

  setLastGetUserMediaResult({ ok: true, name: 'Success', message: 'Camera stream acquired' });
  return stream;
}

/**
 * Safe wrapper returning structured { ok, stream } or { ok, reason, name, message }.
 */
export async function requestCamera(options = {}) {
  try {
    const stream = await requestCameraStream(options);
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
      message: errorMessage || 'Failed to capture camera',
    };
  }
}

