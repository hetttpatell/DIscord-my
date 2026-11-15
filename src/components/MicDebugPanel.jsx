import React, { useState, useEffect } from 'react';
import {
  getActiveMicrophoneStream,
  getLastGetUserMediaResult,
} from '../lib/microphone';
import { useAppStore } from '../stores/useAppStore';

export function MicDebugPanel() {
  const [isDebug] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1'
  );
  const [tab, setTab] = useState('mesh'); // 'mesh' | 'mic' | 'events'

  const members = useAppStore((s) => s.members);
  const queueVersion = useAppStore((s) => s.queueVersion);
  const recentSocketEvents = useAppStore((s) => s.recentSocketEvents);
  const peerDebugStats = useAppStore((s) => s.peerDebugStats);

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
    }, 1000);

    return () => clearInterval(interval);
  }, [isDebug]);

  if (!isDebug) return null;

  return (
    <aside
      aria-label="Diagnostic Panel"
      className="fixed bottom-24 right-4 z-50 p-3 max-w-sm w-full bg-[#121218]/95 border border-[#FF9F1C]/40 rounded-xl shadow-2xl backdrop-blur-md text-[11px] font-mono text-[#F4F1EA] space-y-2 select-text pointer-events-auto max-h-[80vh] overflow-y-auto custom-scrollbar"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-1 font-bold text-[#FF9F1C]">
        <div className="flex items-center gap-2">
          <span>[debug=1]</span>
          <span className="text-[9px] uppercase px-1 rounded bg-[#FF9F1C]/20 text-[#FF9F1C]">
            v{queueVersion}
          </span>
        </div>
        <div className="flex gap-1 text-[9px]">
          <button
            type="button"
            onClick={() => setTab('mesh')}
            className={`px-1.5 py-0.5 rounded cursor-pointer ${
              tab === 'mesh' ? 'bg-[#FF9F1C] text-[#0B0B10] font-bold' : 'text-white/60 hover:text-white'
            }`}
          >
            Mesh
          </button>
          <button
            type="button"
            onClick={() => setTab('events')}
            className={`px-1.5 py-0.5 rounded cursor-pointer ${
              tab === 'events' ? 'bg-[#FF9F1C] text-[#0B0B10] font-bold' : 'text-white/60 hover:text-white'
            }`}
          >
            Events
          </button>
          <button
            type="button"
            onClick={() => setTab('mic')}
            className={`px-1.5 py-0.5 rounded cursor-pointer ${
              tab === 'mic' ? 'bg-[#FF9F1C] text-[#0B0B10] font-bold' : 'text-white/60 hover:text-white'
            }`}
          >
            Mic
          </button>
        </div>
      </div>

      {tab === 'mesh' && (
        <div className="space-y-2 text-[10px]">
          {/* Members and PeerIDs */}
          <div>
            <div className="text-[#2EC4B6] font-semibold text-[9px] uppercase mb-1">
              Members &amp; PeerIDs ({members.length})
            </div>
            <div className="space-y-1">
              {members.map((m) => (
                <div key={m.id} className="bg-white/5 p-1 rounded">
                  <div className="flex justify-between">
                    <span className="font-bold text-white">{m.name}</span>
                    <span className="text-[#FF9F1C]">{m.isHost ? 'HOST' : ''}</span>
                  </div>
                  <div className="text-white/60 truncate">peer: {m.peerId || 'none'}</div>
                  <div className="text-white/40 text-[9px]">
                    socket: {m.id} • mic: {String(m.micOn)} • cam: {String(m.camOn)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Calls with connectionState */}
          <div className="pt-1 border-t border-white/10">
            <div className="text-[#38BDF8] font-semibold text-[9px] uppercase mb-1">
              Active PeerJS Calls ({peerDebugStats?.calls?.length || 0})
            </div>
            {peerDebugStats?.calls?.length > 0 ? (
              <div className="space-y-1">
                {peerDebugStats.calls.map((c, i) => (
                  <div key={i} className="bg-white/5 p-1 rounded flex justify-between items-center">
                    <span className="truncate max-w-[140px] text-white/80">{c.peerId}</span>
                    <span
                      className={
                        c.connectionState === 'connected' ? 'text-emerald-400 font-bold' : 'text-amber-400'
                      }
                    >
                      {c.connectionState}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-white/40">No active peer calls</div>
            )}
          </div>

          {/* Non-null track senders */}
          <div className="pt-1 border-t border-white/10">
            <div className="text-[#A78BFA] font-semibold text-[9px] uppercase mb-1">
              Senders with non-null tracks ({peerDebugStats?.senders?.length || 0})
            </div>
            {peerDebugStats?.senders?.length > 0 ? (
              <div className="space-y-1">
                {peerDebugStats.senders.map((s, i) => (
                  <div key={i} className="bg-white/5 p-1 rounded flex justify-between text-[9px]">
                    <span className="text-white/80">
                      [{s.kind}] to {s.peerId?.slice(0, 8)}...
                    </span>
                    <span className={s.enabled ? 'text-emerald-400' : 'text-amber-400'}>
                      {s.readyState} ({s.enabled ? 'on' : 'off'})
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-white/40">No video/audio senders active</div>
            )}
          </div>
        </div>
      )}

      {tab === 'events' && (
        <div className="space-y-1 text-[9px]">
          <div className="text-[#FF9F1C] font-semibold uppercase mb-1">
            Last 20 Socket Events
          </div>
          {recentSocketEvents.length > 0 ? (
            <div className="space-y-1 max-h-56 overflow-y-auto custom-scrollbar">
              {recentSocketEvents.map((evt, idx) => (
                <div key={idx} className="bg-white/5 p-1 rounded flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      className={`font-bold px-1 rounded text-[8px] ${
                        evt.dir === 'in' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-sky-500/20 text-sky-300'
                      }`}
                    >
                      {evt.dir.toUpperCase()}
                    </span>
                    <span className="text-white truncate">{evt.event}</span>
                  </div>
                  <span className="text-white/40 shrink-0">
                    {new Date(evt.ts).toLocaleTimeString([], {
                      second: '2-digit',
                      fractionalSecondDigits: 3,
                    })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-white/40">No recorded events yet</div>
          )}
        </div>
      )}

      {tab === 'mic' && (
        <div className="space-y-1 text-[10px]">
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
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

            <span className="text-white/60">Local Mic Stream:</span>
            <span className={stats.hasLocalStream ? 'text-emerald-400' : 'text-white/40'}>
              {stats.hasLocalStream ? 'Active' : 'None'}
            </span>
          </div>

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
        </div>
      )}
    </aside>
  );
}

export default MicDebugPanel;
