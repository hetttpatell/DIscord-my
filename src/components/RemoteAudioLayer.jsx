import React, { useState, useEffect, useCallback } from 'react';
import peerService from '../services/peerService';
import AudioUnlockBanner from './AudioUnlockBanner';

/**
 * RemoteAudioLayer
 * Manages mobile audio unlock flow, autoplay policy banners, and user interaction triggers.
 * Audio playback itself is cleanly managed by PeerService's dedicated HTMLAudioElement
 * to prevent duplicate audio tracks, echo, and volume distortion on mobile Chrome & iOS Safari.
 */
export default function RemoteAudioLayer({ voicesVolume = 100 }) {
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Sync volume slider to PeerService
  useEffect(() => {
    peerService.setVoicesVolume(voicesVolume);
  }, [voicesVolume]);

  // Subscribe to PeerJS autoplay & state notifications
  useEffect(() => {
    const unsub = peerService.subscribe((event, payload) => {
      if (event === 'autoplay-changed') {
        setAutoplayBlocked(Boolean(payload));
      }
    });

    return () => unsub();
  }, []);

  const handleUnlockAudio = useCallback(async () => {
    try {
      await peerService.unlockAudio();
      if (typeof document !== 'undefined') {
        document.querySelectorAll('audio').forEach(a => {
          if (a.paused && a.srcObject) {
            a.play().catch(() => {});
          }
        });
      }
    } catch {}
    setAutoplayBlocked(false);
  }, []);

  // Universal User Interaction Audio Unlocker
  // Mobile browsers unlock audio on any user touch / gesture event
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const unlockOnInteraction = () => {
      peerService.unlockAudio();
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

  return (
    <AudioUnlockBanner
      isVisible={autoplayBlocked}
      onUnlock={handleUnlockAudio}
    />
  );
}
