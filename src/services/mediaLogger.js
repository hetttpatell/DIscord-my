/**
 * Structured Development Logger for Audio & WebRTC
 * Provides structured diagnostic logs for platform, secure context,
 * permission state, getUserMedia lifecycle, and PeerJS connection status.
 *
 * Never logs sensitive user information.
 */

export function logMediaDebug(topic, details = {}) {
  if (typeof window === 'undefined') return;

  const isDev = Boolean(
    (typeof import.meta !== 'undefined' && import.meta.env?.DEV) ||
    new URLSearchParams(window.location.search).get('debug') === '1'
  );

  if (!isDev) return;

  const timestamp = new Date().toISOString().substring(11, 23);
  console.log(`[VoiceDebug][${timestamp}][${topic}]`, details);
}

export function getPlatformInfo() {
  if (typeof navigator === 'undefined') {
    return { platform: 'server', isSecureContext: false };
  }

  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isChrome = /Chrome/i.test(ua) && !/Edge|Edg/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome/i.test(ua);

  return {
    isAndroid,
    isIOS,
    isChrome,
    isSafari,
    isSecureContext: typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false,
    hasMediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
    hasPermissionsQuery: Boolean(navigator.permissions?.query)
  };
}

export default logMediaDebug;
