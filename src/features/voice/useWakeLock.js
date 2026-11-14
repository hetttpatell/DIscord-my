import { useEffect, useRef } from 'react';

export function useWakeLock(enabled = true) {
  const wakeLockRef = useRef(null);

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return;
    }

    let isCancelled = false;

    const requestWakeLock = async () => {
      try {
        if (!isCancelled && document.visibilityState === 'visible') {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        // Non-blocking wake lock failure (e.g. low battery mode or permission)
        console.warn('[WakeLock] Request failed:', err.message);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isCancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [enabled]);
}

