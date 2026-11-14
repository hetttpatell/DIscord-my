import React, { useState, useEffect, useRef, useCallback } from 'react';
import peerConnectionService from '../services/peerConnectionService';
import livekitService from '../services/livekitService';
import mediaService from '../services/mediaService';
import AudioUnlockBanner from './AudioUnlockBanner';

/**
 * Shared singleton AudioContext for low-latency Web Audio output across mobile & desktop.
 * Re-used so that unlocking once on any user touch unlocks all current and future peers.
 */
let sharedAudioContext = null;

function getSharedAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    try {
      sharedAudioContext = new AudioContextClass();
    } catch (e) {
      console.warn('[RemoteAudioLayer] Could not create shared AudioContext:', e);
    }
  }
  return sharedAudioContext;
}

/**
 * Single remote peer audio bridge:
 * Uses Web Audio API GainNode for 100% reliable output on iOS & Android (where HTMLAudio.volume is ignored),
 * combined with a non-throttled HTML5 <audio playsInline autoPlay> element.
 * 
 * CRITICAL FIX: The audio element is NEVER muted based on peer.isMuted.
 * WebRTC already sends silence when muted. Toggling audio.muted dynamically on incoming network events
 * triggers mobile Safari & Android Chrome autoplay policy blocks.
 */
function RemoteAudioItem({ peer, voicesVolume = 100, onAutoplayBlocked }) {
  const audioRef = useRef(null);
  const webAudioSourceRef = useRef(null);
  const gainNodeRef = useRef(null);

  // Update volume smoothly via Web Audio GainNode and audio element
  useEffect(() => {
    const vol = Math.max(0, voicesVolume / 100);
    if (gainNodeRef.current && sharedAudioContext && sharedAudioContext.state !== 'closed') {
      try {
        gainNodeRef.current.gain.setTargetAtTime(vol, sharedAudioContext.currentTime, 0.05);
      } catch {
        gainNodeRef.current.gain.value = vol;
      }
    }
    if (audioRef.current) {
      try {
        audioRef.current.volume = Math.min(1, vol);
      } catch {}
    }
  }, [voicesVolume]);

  // Connect stream to Web Audio API & HTMLAudioElement
  useEffect(() => {
    const stream = peer?.stream;
    if (!stream) return;

    const audioTracks = stream.getAudioTracks();
    const hasLiveAudio = audioTracks.some(t => t.readyState === 'live');

    // 1. Web Audio API Connection
    const ctx = getSharedAudioContext();
    if (ctx && hasLiveAudio) {
      try {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }

        // Clean up previous source/gain if stream instance changed
        if (webAudioSourceRef.current) {
          try { webAudioSourceRef.current.disconnect(); } catch {}
          webAudioSourceRef.current = null;
        }

        const source = ctx.createMediaStreamSource(stream);
        const gainNode = ctx.createGain();
        const vol = Math.max(0, voicesVolume / 100);
        gainNode.gain.value = vol;

        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        webAudioSourceRef.current = source;
        gainNodeRef.current = gainNode;
      } catch (err) {
        console.debug('[RemoteAudioLayer] Web Audio attach fallback:', err?.message);
      }
    }

    // 2. HTMLAudioElement Fallback
    const el = audioRef.current;
    if (el) {
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }

      // CRITICAL: Keep element unmuted so sound is heard immediately when packets flow
      el.muted = false;

      if (typeof el.setSinkId === 'function' && mediaService.selectedSpeakerId) {
        el.setSinkId(mediaService.selectedSpeakerId).catch(() => {});
      }

      const p = el.play();
      if (p !== undefined) {
        p.catch(err => {
          console.debug('[RemoteAudioLayer] HTMLAudio play status for', peer.peerId, err?.name);
          if (err?.name === 'NotAllowedError') {
            onAutoplayBlocked();
          }
        });
      }
    }

    // Listen for dynamically added/removed tracks (e.g. when peer turns on mic)
    const handleTracksChanged = () => {
      const liveTracks = stream.getAudioTracks().filter(t => t.readyState === 'live');
      if (liveTracks.length > 0 && ctx && ctx.state !== 'closed' && !webAudioSourceRef.current) {
        try {
          if (ctx.state === 'suspended') ctx.resume().catch(() => {});
          const source = ctx.createMediaStreamSource(stream);
          const gain = ctx.createGain();
          gain.gain.value = Math.max(0, voicesVolume / 100);
          source.connect(gain);
          gain.connect(ctx.destination);
          webAudioSourceRef.current = source;
          gainNodeRef.current = gain;
        } catch {}
      }

      if (el) {
        el.srcObject = stream;
        el.play().catch(() => {});
      }
    };

    stream.addEventListener('addtrack', handleTracksChanged);
    stream.addEventListener('removetrack', handleTracksChanged);

    return () => {
      stream.removeEventListener('addtrack', handleTracksChanged);
      stream.removeEventListener('removetrack', handleTracksChanged);

      if (webAudioSourceRef.current) {
        try { webAudioSourceRef.current.disconnect(); } catch {}
        webAudioSourceRef.current = null;
      }
      if (gainNodeRef.current) {
        try { gainNodeRef.current.disconnect(); } catch {}
        gainNodeRef.current = null;
      }
    };
  }, [peer.stream, peer.peerId, onAutoplayBlocked, voicesVolume]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
      className="hidden"
      aria-hidden="true"
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
      } else if (event === 'remote-track') {
        // Force refresh on new remote track arrival
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
    try {
      const ctx = getSharedAudioContext();
      if (ctx && ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
      await peerConnectionService.unlockAudio();
      await livekitService.startAudio();
      document.querySelectorAll('audio').forEach(a => {
        if (a.paused && a.srcObject) {
          a.play().catch(() => {});
        }
      });
    } catch {}
    setAutoplayBlocked(false);
  }, []);

  const handleAutoplayBlocked = useCallback(() => {
    setAutoplayBlocked(true);
  }, []);

  // Universal User Interaction Audio Unlocker
  // Mobile browsers unlock Web Audio on ANY user touch event
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const unlockOnInteraction = () => {
      const ctx = getSharedAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(() => {
          setAutoplayBlocked(false);
        }).catch(() => {});
      }
      document.querySelectorAll('audio').forEach(a => {
        if (a.paused && a.srcObject) {
          a.play().catch(() => {});
        }
      });
    };

    const events = ['touchstart', 'touchend', 'pointerdown', 'click', 'keydown'];
    events.forEach(evt => window.addEventListener(evt, unlockOnInteraction, { capture: true, passive: true }));

    return () => {
      events.forEach(evt => window.removeEventListener(evt, unlockOnInteraction, { capture: true }));
    };
  }, []);

  const remotePeerList = Object.values(peers).filter(p => p && p.stream);

  return (
    <>
      {/* Tap to enable audio banner when autoplay is blocked by browser */}
      <AudioUnlockBanner
        isVisible={autoplayBlocked}
        onUnlock={handleUnlockAudio}
      />

      {/* Render persistent audio bridge in DOM with zero visual footprint */}
      <div className="sr-only" aria-hidden="true">
        {remotePeerList.map(peer => (
          <RemoteAudioItem
            key={peer.peerId}
            peer={peer}
            voicesVolume={voicesVolume}
            onAutoplayBlocked={handleAutoplayBlocked}
          />
        ))}
      </div>
    </>
  );
}
