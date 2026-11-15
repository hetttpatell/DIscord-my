import React, { useState, useEffect } from 'react';
import {
  getActiveMicrophoneStream,
  getLastGetUserMediaResult,
} from '../lib/microphone';

export function MicDebugPanel() {
  const [isDebug] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1'
  );
  const [stats, setStats] = useState({
    isSecureContext: false,
    permissionState: 'unknown',
    hasLocalStream: false,
    tracks: [],
    lastResult: null,
  });

  useEffect(() => {
    if (!isDebug || typeof window === 'undefined') return;

    const interval = setInterval(async () => {
      let permState = 'unknown';
      try {
        if (navigator.permissions?.query) {
          const status = await navigator.permissions.query({ name: 'microphone' });
          permState = status?.state || 'unknown';
        }
      } catch {
        permState = 'unsupported';
      }

      const stream = getActiveMicrophoneStream();
      const tracks = stream
        ? stream.getAudioTracks().map((t) => ({
            label: t.label || 'Microphone',
            readyState: t.readyState,
            enabled: t.enabled,
            muted: t.muted,
          }))
        : [];

      const lastResult = getLastGetUserMediaResult();

      const nextStats = {
        isSecureContext: Boolean(window.isSecureContext),
        permissionState: permState,
        hasLocalStream: Boolean(stream),
        tracks,
        lastResult,
      };

      setStats(nextStats);

      // Console log with required [mic-debug] prefix
      console.log('[mic-debug]', nextStats);
    }, 1000);

    return () => clearInterval(interval);
  }, [isDebug]);

  if (!isDebug) return null;

  return (
    <aside
      aria-label="Microphone Diagnostic Panel"
      className="fixed bottom-24 right-4 z-50 p-3 max-w-xs w-full bg-[#121218]/95 border border-[#FF9F1C]/40 rounded-xl shadow-2xl backdrop-blur-md text-[11px] font-mono text-[#F4F1EA] space-y-1.5 select-text pointer-events-auto"
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-1 font-bold text-[#FF9F1C]">
        <span>[mic-debug]</span>
        <span className="text-[9px] uppercase px-1 rounded bg-[#FF9F1C]/20 text-[#FF9F1C]">
          Live 1s
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
        <span className="text-white/60">Secure Context:</span>
        <span className={stats.isSecureContext ? 'text-emerald-400' : 'text-rose-400'}>
          {String(stats.isSecureContext)}
        </span>

        <span className="text-white/60">Permissions API:</span>
        <span
          className={
            stats.permissionState === 'granted'
              ? 'text-emerald-400'
              : stats.permissionState === 'denied'
                ? 'text-rose-400'
                : 'text-amber-400'
          }
        >
          {stats.permissionState}
        </span>

        <span className="text-white/60">Local Stream:</span>
        <span className={stats.hasLocalStream ? 'text-emerald-400' : 'text-white/40'}>
          {stats.hasLocalStream ? 'Active' : 'None'}
        </span>
      </div>

      {/* Tracks information */}
      {stats.tracks.length > 0 ? (
        <div className="space-y-1 pt-1 border-t border-white/10">
          <span className="text-white/60 text-[9px] uppercase">Audio Tracks:</span>
          {stats.tracks.map((t, idx) => (
            <div key={idx} className="bg-white/5 p-1 rounded text-[9px] space-y-0.5">
              <div className="truncate text-white font-semibold">{t.label}</div>
              <div className="flex gap-2 text-white/70">
                <span>state: {t.readyState}</span>
                <span className={t.enabled ? 'text-emerald-400' : 'text-amber-400'}>
                  {t.enabled ? 'enabled' : 'disabled'}
                </span>
                <span>muted: {String(t.muted)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[10px] text-white/40 pt-1 border-t border-white/10">
          No active audio tracks
        </div>
      )}

      {/* Last getUserMedia attempt */}
      {stats.lastResult && (
        <div className="pt-1 border-t border-white/10 text-[9px]">
          <span className="text-white/60">Last Capture: </span>
          {stats.lastResult.ok ? (
            <span className="text-emerald-400 font-bold">SUCCESS</span>
          ) : (
            <span className="text-rose-400 font-bold">
              {stats.lastResult.name}: {stats.lastResult.message}
            </span>
          )}
        </div>
      )}
    </aside>
  );
}

export default MicDebugPanel;
