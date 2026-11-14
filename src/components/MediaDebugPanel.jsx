import React, { useState, useEffect } from 'react';
import mediaService from '../services/mediaService';
import mediaController from '../services/mediaController';
import peerService from '../services/peerService';

export default function MediaDebugPanel() {
  const [isVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('debug') === '1';
  });
  const [debugState, setDebugState] = useState({
    micPermission: 'checking...',
    isSecureContext: typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false,
    protocol: typeof window !== 'undefined' ? window.location.protocol : '',
    visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
    lastError: null,
    controllerState: mediaController.getState(),
    localTracks: [],
    webrtcInfo: null
  });

  useEffect(() => {
    if (!isVisible) return;

    let mounted = true;

    const poll = async () => {
      let micPerm = 'unsupported';

      if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
        try {
          const res = await navigator.permissions.query({ name: 'microphone' });
          micPerm = res.state;
        } catch (e) {
          micPerm = `n/a (${e.name || 'unsupported'})`;
        }
      }

      const tracks = (mediaController.stream?.getTracks() || []).map(t => {
        let settings = {};
        try {
          settings = typeof t.getSettings === 'function' ? t.getSettings() : {};
        } catch {}
        return {
          id: t.id,
          kind: t.kind,
          readyState: t.readyState,
          enabled: t.enabled,
          muted: t.muted,
          deviceId: settings.deviceId,
          echoCancellation: settings.echoCancellation
        };
      });

      const webrtcInfo = peerService.getDiagnostics();

      if (mounted) {
        setDebugState({
          micPermission: micPerm,
          isSecureContext: typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false,
          protocol: typeof window !== 'undefined' ? window.location.protocol : '',
          visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
          lastError: mediaService.lastGetUserMediaError,
          controllerState: mediaController.getState(),
          localTracks: tracks,
          webrtcInfo
        });
      }
    };

    poll();
    const interval = setInterval(poll, 1000);

    const onVisibilityChange = () => {
      poll();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-2 left-2 z-[9999] max-w-sm max-h-[85vh] overflow-y-auto bg-black/90 text-green-400 p-3 rounded-xl border border-green-500/40 font-mono text-[11px] shadow-2xl backdrop-blur-md select-text pointer-events-auto leading-relaxed">
      <div className="flex items-center justify-between border-b border-green-500/30 pb-1 mb-2">
        <span className="font-bold text-white text-xs">🐞 Audio Diagnostics (?debug=1)</span>
        <span className="text-[10px] bg-green-500/20 px-1.5 py-0.5 rounded text-green-300">LIVE</span>
      </div>

      <div className="space-y-2">
        {/* Environment & Security */}
        <div>
          <div className="text-gray-400 uppercase text-[9px] font-bold">Context</div>
          <div>isSecureContext: <span className={debugState.isSecureContext ? 'text-green-300' : 'text-red-400 font-bold'}>{String(debugState.isSecureContext)}</span></div>
          <div>protocol: <span className="text-white">{debugState.protocol}</span></div>
          <div>visibilityState: <span className="text-white">{debugState.visibilityState}</span></div>
        </div>

        {/* MediaController Explicit States */}
        <div>
          <div className="text-gray-400 uppercase text-[9px] font-bold">Mic Controller State</div>
          <div>micState: <span className="text-yellow-300 font-bold">{debugState.controllerState?.micState}</span></div>
          <div>isSpeaking: <span className={debugState.controllerState?.isSpeaking ? 'text-green-300 font-bold' : 'text-gray-400'}>{String(debugState.controllerState?.isSpeaking)}</span></div>
        </div>

        {/* Permissions */}
        <div>
          <div className="text-gray-400 uppercase text-[9px] font-bold">Permissions API</div>
          <div>mic: <span className="text-white">{debugState.micPermission}</span></div>
        </div>

        {/* Last getUserMedia error */}
        <div>
          <div className="text-gray-400 uppercase text-[9px] font-bold">Last getUserMedia Error</div>
          {debugState.lastError ? (
            <div className="p-1.5 bg-red-950/50 border border-red-500/40 rounded text-red-300">
              <div><span className="text-red-400 font-bold">{debugState.lastError.name}</span>: {debugState.lastError.message}</div>
              <div className="text-[9px] text-gray-300 mt-0.5 break-all">
                constraints: {JSON.stringify(debugState.lastError.constraints)}
              </div>
            </div>
          ) : (
            <div className="text-gray-500 italic">None (no errors recorded)</div>
          )}
        </div>

        {/* Local Audio Tracks */}
        <div>
          <div className="text-gray-400 uppercase text-[9px] font-bold">Local Audio Tracks ({debugState.localTracks.length})</div>
          {debugState.localTracks.length === 0 ? (
            <div className="text-gray-500 italic">No audio tracks acquired</div>
          ) : (
            debugState.localTracks.map(t => (
              <div key={t.id} className="p-1 my-1 bg-white/5 rounded border border-white/10">
                <div className="text-white font-bold">{t.kind} [{t.readyState}]</div>
                <div>enabled: {String(t.enabled)} | muted: <span className={t.muted ? 'text-red-400' : 'text-green-300'}>{String(t.muted)}</span></div>
              </div>
            ))
          )}
        </div>

        {/* Voice Engine Diagnostics */}
        <div>
          <div className="text-gray-400 uppercase text-[9px] font-bold">Voice Engine Path</div>
          {debugState.webrtcInfo ? (
            <div className="space-y-1 text-[10px]">
              <div>Engine: <span className="text-yellow-300 font-bold">PeerJS (1-to-1 WebRTC)</span></div>
              <div>Peer ID: <span className="text-white font-mono">{debugState.webrtcInfo.peerId || 'connecting...'}</span></div>
              <div>Ready: <span className={debugState.webrtcInfo.isReady ? 'text-green-300' : 'text-amber-400'}>{String(debugState.webrtcInfo.isReady)}</span></div>
              <div>Call State: <span className="text-emerald-400 font-bold uppercase">{debugState.webrtcInfo.callState}</span></div>
              <div>Remote User: <span className="text-white">{debugState.webrtcInfo.remoteUser || 'None'}</span></div>
              <div>Remote Speaking: <span className={debugState.webrtcInfo.isRemoteSpeaking ? 'text-green-300 font-bold' : 'text-gray-400'}>{String(debugState.webrtcInfo.isRemoteSpeaking)}</span></div>
              <div>AudioContext: <span className="text-gray-300">{debugState.webrtcInfo.audioContextState}</span></div>
            </div>
          ) : (
            <div className="text-gray-500 italic">Not connected to call</div>
          )}
        </div>
      </div>
    </div>
  );
}
