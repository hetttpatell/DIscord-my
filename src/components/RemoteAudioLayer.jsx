import React, { useState, useEffect, useRef, useCallback } from 'react';
import peerConnectionService from '../services/peerConnectionService';
import livekitService from '../services/livekitService';
import mediaService from '../services/mediaService';
import AudioUnlockBanner from './AudioUnlockBanner';

function RemoteAudioItem({ peer, onAutoplayBlocked, voicesVolume = 100 }) {
  const audioRef = useRef(null);

  useEffect(() => {
    const el = audioRef.current;
    if (el) {
      el.volume = Math.max(0, Math.min(1, voicesVolume / 100));
    }
  }, [voicesVolume]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !peer?.stream) return;

    if (el.srcObject !== peer.stream) {
      el.srcObject = peer.stream;
    }

    if (typeof el.setSinkId === 'function' && mediaService.selectedSpeakerId) {
      el.setSinkId(mediaService.selectedSpeakerId).catch(() => {});
    }

    const unsubOutput = mediaService.subscribe((event, payload) => {
      if (event === 'audio-output-changed' && typeof el.setSinkId === 'function') {
        el.setSinkId(payload?.deviceId || '').catch(() => {});
      }
    });

    const audioTracks = peer.stream.getAudioTracks();
    if (audioTracks.length > 0) {
      const hasLiveAudio = audioTracks.some(t => t.readyState === 'live' && t.enabled);
      el.muted = !hasLiveAudio;
    } else {
      el.muted = Boolean(peer.isMuted);
    }

    const tryPlay = () => {
      const p = el.play();
      if (p !== undefined) {
        p.catch(err => {
          console.debug('[RemoteAudioLayer] Play error for peer', peer.peerId, err?.name);
          if (err.name === 'NotAllowedError') {
            onAutoplayBlocked();
          }
        });
      }
    };

    tryPlay();

    const handleTrackChange = () => {
      if (el && peer.stream) {
        el.srcObject = peer.stream;
        tryPlay();
      }
    };

    peer.stream.addEventListener('addtrack', handleTrackChange);
    peer.stream.addEventListener('removetrack', handleTrackChange);

    return () => {
      unsubOutput();
      peer.stream.removeEventListener('addtrack', handleTrackChange);
      peer.stream.removeEventListener('removetrack', handleTrackChange);
    };
  }, [peer.stream, peer.isMuted, peer.peerId, onAutoplayBlocked]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
    />
  );
}

export default function RemoteAudioLayer({ voicesVolume = 100 }) {
  const [peers, setPeers] = useState({});
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const webrtcPeersRef = useRef({});
  const livekitPeersRef = useRef({});

  const updateCombinedPeers = useCallback(() => {
    setPeers({ ...webrtcPeersRef.current, ...livekitPeersRef.current });
  }, []);

  // Subscribe to both WebRTC and LiveKit peer updates
  useEffect(() => {
    const unsubWebRTC = peerConnectionService.subscribe((event, payload) => {
      if (event === 'peers-updated') {
        webrtcPeersRef.current = payload || {};
        updateCombinedPeers();
      } else if (event === 'autoplay-changed') {
        setAutoplayBlocked(Boolean(payload));
      }
    });

    const unsubLiveKit = livekitService.subscribe((event, payload) => {
      if (event === 'peers-updated') {
        livekitPeersRef.current = payload || {};
        updateCombinedPeers();
      } else if (event === 'autoplay-changed') {
        setAutoplayBlocked(Boolean(payload));
      }
    });

    return () => {
      unsubWebRTC();
      unsubLiveKit();
    };
  }, [updateCombinedPeers]);

  const handleUnlockAudio = useCallback(async () => {
    await peerConnectionService.unlockAudio();
    await livekitService.startAudio();
    document.querySelectorAll('audio').forEach(a => {
      if (a.paused && a.srcObject) {
        a.play().catch(() => {});
      }
    });
    setAutoplayBlocked(false);
  }, []);

  const handleAutoplayBlocked = useCallback(() => {
    setAutoplayBlocked(true);

    const handlePointerDown = () => {
      handleUnlockAudio();
    };

    window.addEventListener('pointerdown', handlePointerDown, { once: true, passive: true });
  }, [handleUnlockAudio]);

  const remotePeerList = Object.values(peers).filter(p => p && p.stream);

  return (
    <>
      {/* Tap to enable audio banner when autoplay is blocked by browser */}
      <AudioUnlockBanner
        isVisible={autoplayBlocked}
        onUnlock={handleUnlockAudio}
      />

      {/* Fixed offscreen persistent audio elements: 1px, opacity-0, pointer-events-none */}
      <div
        className="fixed -top-96 -left-96 w-[1px] h-[1px] opacity-0 pointer-events-none overflow-hidden"
        aria-hidden="true"
      >
        {remotePeerList.map(peer => (
          <RemoteAudioItem
            key={peer.peerId}
            peer={peer}
            onAutoplayBlocked={handleAutoplayBlocked}
            voicesVolume={voicesVolume}
          />
        ))}
      </div>
    </>
  );
}
