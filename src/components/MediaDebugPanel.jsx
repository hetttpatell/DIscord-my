import React, { useState, useEffect } from 'react';
import mediaService from '../services/mediaService';
import mediaController from '../services/mediaController';
import peerConnectionService from '../services/peerConnectionService';
import livekitService from '../services/livekitService';

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

      let webrtcInfo = null;
      if (livekitService.isConnected) {
        webrtcInfo = livekitService.getDiagnostics();
      } else {
        webrtcInfo = peerConnectionService.getDiagnostics();
      }

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

        {/* WebRTC Diagnostics */}
        <div>
          <div className="text-gray-400 uppercase text-[9px] font-bold">Voice Engine Path</div>
          {debugState.webrtcInfo ? (
            <div>
              <div>Engine: <span className="text-yellow-300 font-bold">{debugState.webrtcInfo.engine}</span></div>
              {debugState.webrtcInfo.engine === 'livekit' ? (
                <div>
                  <div>State: {debugState.webrtcInfo.connectionState}</div>
                  <div>Publications: {debugState.webrtcInfo.senders?.length || 0}</div>
                  {debugState.webrtcInfo.senders?.map((s, idx) => (
                    <div key={idx} className="text-[9px] text-gray-300 pl-2">
                      • {s.kind} ({s.source}): muted={String(s.isMuted)}, readyState={s.readyState}
                    </div>
                  ))}
                  {debugState.webrtcInfo.diagnostics?.lastAction && (
                    <div className="p-1 my-1 bg-white/5 rounded text-[10px]">
                      <div className="text-gray-400">Last Action:</div>
                      <div>method: {debugState.webrtcInfo.diagnostics.lastAction.method}</div>
                      <div>kind: {debugState.webrtcInfo.diagnostics.lastAction.trackKind}</div>
                      <div className="text-gray-400">{debugState.webrtcInfo.diagnostics.lastAction.timestamp}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div>Peers: {debugState.webrtcInfo.connections?.length || 0}</div>
                  {debugState.webrtcInfo.iceFetchError && (
                    <div className="p-1 my-1 bg-red-950/60 border border-red-500/40 rounded text-red-300 text-[10px]">
                      ⚠️ ICE Fetch Failed: {debugState.webrtcInfo.iceFetchError} (Using STUN fallback)
                    </div>
                  )}
                  {debugState.webrtcInfo.connections?.map(c => (
                    <div key={c.peerId} className="p-1 my-1 bg-white/5 rounded border border-white/10">
                      <div className="text-white text-[10px] truncate font-bold">{c.peerId}</div>
                      <div>conn: <span className="text-white">{c.connectionState}</span> | ice: <span className="text-white">{c.iceConnectionState}</span> (gather: {c.iceGatheringState})</div>
                      <div>
                        selected pair: <span className={`px-1 py-0.5 rounded font-bold uppercase text-[9px] ${
                          c.selectedCandidatePairType === 'relay'
                            ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                            : c.selectedCandidatePairType === 'srflx'
                              ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                              : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}>{c.selectedCandidatePairType || 'none'}</span>
                        {c.selectedPairDetails && <span className="text-[9px] text-gray-400 ml-1">({c.selectedPairDetails})</span>}
                      </div>
                      <div className="text-[10px] text-gray-300">
                        candidates: <span className={c.candidateTypes?.includes('relay') ? 'text-green-300' : 'text-yellow-400'}>
                          {c.candidateTypes?.length ? c.candidateTypes.join(', ') : 'gathering...'}
                        </span>
                      </div>
                      {c.troubleConnecting && (
                        <div className="text-[10px] text-red-400 font-bold">⚠️ Connection trouble (&gt;10s in checking/failed)</div>
                      )}
                      <div>signaling: {c.signalingState} | polite: {String(c.polite)}</div>
                      <div className="text-[9px] text-gray-300 mt-1">
                        <div className="font-semibold text-gray-400">Audio Transceivers ({c.transceivers?.length || 0}):</div>
                        {c.transceivers?.map((t, idx) => (
                          <div key={idx} className="pl-1">
                            mid={t.mid ?? 'null'}: {t.direction} (curr: {t.currentDirection || 'none'}) | sender: {t.senderTrackKind || 'none'}[{t.senderTrackReadyState || 'none'}] en={String(t.senderTrackEnabled)}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {debugState.webrtcInfo.diagnostics?.lastToggle && (
                    <div className="p-1 my-1 bg-white/5 rounded text-[10px]">
                      <div className="text-gray-400">Last Mesh Audio Toggle:</div>
                      <div>audio: {debugState.webrtcInfo.diagnostics.lastToggle.audioTrackKind || 'none'} [{debugState.webrtcInfo.diagnostics.lastToggle.audioTrackReadyState || 'none'}]</div>
                      <div>peers: {debugState.webrtcInfo.diagnostics.lastToggle.peers?.length || 0}</div>
                    </div>
                  )}
                  {debugState.webrtcInfo.diagnostics?.lastMediaStateSent && (
                    <div className="p-1 my-1 bg-white/5 rounded text-[10px]">
                      <div className="text-gray-400">Last webrtc:media-state Sent:</div>
                      <div>{JSON.stringify(debugState.webrtcInfo.diagnostics.lastMediaStateSent.payload)}</div>
                      <div className="text-gray-500 text-[9px]">{debugState.webrtcInfo.diagnostics.lastMediaStateSent.timestamp}</div>
                    </div>
                  )}
                  {debugState.webrtcInfo.diagnostics?.lastMediaStateReceived && (
                    <div className="p-1 my-1 bg-white/5 rounded text-[10px]">
                      <div className="text-gray-400">Last webrtc:media-state Received:</div>
                      <div>from: {debugState.webrtcInfo.diagnostics.lastMediaStateReceived.from}</div>
                      <div>{JSON.stringify(debugState.webrtcInfo.diagnostics.lastMediaStateReceived.payload)}</div>
                      <div className="text-gray-500 text-[9px]">{debugState.webrtcInfo.diagnostics.lastMediaStateReceived.timestamp}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-500 italic">Not connected to call</div>
          )}
        </div>
      </div>
    </div>
  );
}
