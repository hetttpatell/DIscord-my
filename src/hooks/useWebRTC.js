import { useState, useEffect, useCallback, useRef } from 'react';
import peerConnectionService from '../services/peerConnectionService';
import livekitService from '../services/livekitService';
import mediaService from '../services/mediaService';

/**
 * Universal Unified Real-Time Communication Hook
 * Automatically uses LiveKit SFU if server credentials are set in .env;
 * gracefully and reliably falls back to native W3C Perfect Negotiation WebRTC mesh.
 */
export function useWebRTC({
  roomId,
  userName,
  sessionId,
  localStream,
  isCallActive = true,
  initialMediaState = {}
} = {}) {
  const [peers, setPeers] = useState({});
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [activeEngine, setActiveEngine] = useState('webrtc'); // 'livekit' | 'webrtc'
  const [connectionNotice, setConnectionNotice] = useState(null);
  const streamRef = useRef(localStream);

  const initialMediaStateRef = useRef(initialMediaState);

  useEffect(() => {
    streamRef.current = localStream;
    if (activeEngine === 'livekit') {
      if (livekitService.isConnected) {
        livekitService.publishLocalStream(localStream, initialMediaStateRef.current);
      }
    } else {
      peerConnectionService.updateLocalStream(localStream);
    }
  }, [localStream, activeEngine]);

  // Handle system re-acquired tracks (mobile app switch / screen lock)
  useEffect(() => {
    const unsub = mediaService.subscribe((event, payload) => {
      if (event === 'track-replaced' && payload?.newTrack) {
        if (activeEngine === 'livekit') {
          livekitService.republishTrack(payload.newTrack);
        } else {
          peerConnectionService.replaceLocalTrack(payload.oldTrack, payload.newTrack);
        }
      }
    });
    return () => unsub();
  }, [activeEngine]);

  useEffect(() => {
    if (!isCallActive) return;

    let mounted = true;

    // 1. Try LiveKit SFU first
    livekitService.connectRoom({
      roomId,
      userName,
      sessionId,
      localStream,
      initialMediaState
    }).then(result => {
      if (!mounted) return;

      if (result && result.connected) {
        console.info('[MediaCoordinator] Using LiveKit SFU');
        setActiveEngine('livekit');
        setConnectionNotice(null);
        const unsub = livekitService.subscribe((event, payload) => {
          if (event === 'peers-updated') {
            setPeers({ ...payload });
          }
        });
        return () => {
          unsub();
          livekitService.disconnect();
        };
      } else {
        // 2. Seamless fallback to Native WebRTC Mesh
        const reason = result?.reason || 'missing credentials';
        console.warn(`[MediaCoordinator] Using Native WebRTC mesh: reason: ${reason}`);
        setActiveEngine('webrtc');

        if (reason === 'token request failed' || reason === 'connect failed') {
          console.error(`[MediaCoordinator] LiveKit error: ${result?.error || reason}. Showing fallback notice.`);
          setConnectionNotice('LiveKit SFU connection failed. Switched to peer-to-peer mesh.');
        } else {
          setConnectionNotice(null);
        }

        const unsub = peerConnectionService.subscribe((event, payload) => {
          if (event === 'peers-updated') {
            setPeers({ ...payload });
          } else if (event === 'autoplay-changed') {
            setAutoplayBlocked(Boolean(payload));
          } else if (event === 'ice-fetch-failed') {
            setConnectionNotice('Could not reach relay server. Connections may be limited.');
          }
        });

        peerConnectionService.joinCall(localStream, initialMediaState).catch(err => {
          console.error('[WebRTC] joinCall error:', err);
        });

        return () => {
          unsub();
          peerConnectionService.leaveCall();
        };
      }
    });

    return () => {
      mounted = false;
      livekitService.disconnect();
      if (activeEngine !== 'livekit') {
        peerConnectionService.leaveCall();
      }
    };
  }, [isCallActive, roomId, userName, sessionId]);

  const sendMediaState = useCallback((state) => {
    if (activeEngine === 'livekit') {
      if (state.isMuted !== undefined) {
        livekitService.setMicrophoneMuted(state.isMuted);
      }
      if (state.isCameraOff !== undefined) {
        livekitService.setCameraEnabled(!state.isCameraOff);
      }
      if (state.isScreenSharing !== undefined) {
        livekitService.setScreenShareEnabled(state.isScreenSharing);
      }
    }
    peerConnectionService.sendMediaState(state);
  }, [activeEngine]);

  const unlockAudio = useCallback(async () => {
    await peerConnectionService.unlockAudio();
    setAutoplayBlocked(false);
  }, []);

  return {
    peers,
    activeEngine,
    connectionNotice,
    autoplayBlocked,
    sendMediaState,
    unlockAudio
  };
}

export default useWebRTC;
