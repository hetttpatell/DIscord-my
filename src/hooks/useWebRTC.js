import { useState, useEffect, useCallback, useRef } from 'react';
import peerConnectionService from '../services/peerConnectionService';
import livekitService from '../services/livekitService';
import mediaService from '../services/mediaService';

/**
 * Universal Unified Audio Real-Time Communication Hook
 * Automatically uses LiveKit SFU if server credentials are set in .env;
 * gracefully falls back to native W3C Perfect Negotiation WebRTC audio mesh.
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
    let cleanupCurrent = null;

    // 1. Try LiveKit SFU first
    livekitService.connectRoom({
      roomId,
      userName,
      sessionId,
      localStream: streamRef.current,
      initialMediaState: initialMediaStateRef.current
    }).then(result => {
      if (!mounted) return;

      if (result && result.connected) {
        console.info('[VoiceEngine] Using LiveKit SFU audio engine (credentials detected)');
        setActiveEngine('livekit');
        setConnectionNotice(null);
        const unsub = livekitService.subscribe((event, payload) => {
          if (event === 'peers-updated') {
            setPeers({ ...payload });
          }
        });
        cleanupCurrent = () => {
          unsub();
          livekitService.disconnect();
        };
      } else {
        // 2. Seamless fallback to Native WebRTC Mesh
        const reason = result?.reason || 'missing credentials';
        console.info(`[VoiceEngine] Using Native WebRTC audio mesh: ${reason}`);
        setActiveEngine('webrtc');

        if (reason === 'token request failed' || reason === 'connect failed') {
          setConnectionNotice('Switched to peer-to-peer audio mesh.');
        } else {
          setConnectionNotice(null);
        }

        const unsub = peerConnectionService.subscribe((event, payload) => {
          if (event === 'peers-updated') {
            setPeers({ ...payload });
          } else if (event === 'autoplay-unblocked') {
            setAutoplayBlocked(false);
          }
        });

        peerConnectionService.initiateCall({ localStream: streamRef.current, sessionId, initialMediaState: initialMediaStateRef.current }).catch(err => {
          console.error('[WebRTC] initiateCall error:', err);
        });

        cleanupCurrent = () => {
          unsub();
          peerConnectionService.leaveCall();
        };
      }
    });

    return () => {
      mounted = false;
      if (cleanupCurrent) {
        cleanupCurrent();
      } else {
        livekitService.disconnect();
        peerConnectionService.leaveCall();
      }
    };
  }, [isCallActive, roomId, userName, sessionId]);

  const sendMediaState = useCallback((state) => {
    if (activeEngine === 'livekit') {
      if (state.isMuted !== undefined) {
        livekitService.setMicrophoneEnabled(!state.isMuted);
      }
    }
    peerConnectionService.sendMediaState(state);
  }, [activeEngine]);

  const unlockAudio = useCallback(async () => {
    await peerConnectionService.unlockAudio();
    await livekitService.startAudio();
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
