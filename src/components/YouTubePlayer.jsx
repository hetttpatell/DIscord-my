import React, { useEffect, useRef, useState, useCallback } from 'react';
import socket from '../services/socket';
import peerConnectionService from '../services/peerConnectionService';
import livekitService from '../services/livekitService';

/**
 * Synchronized YouTube IFrame Player
 * Never unmounts or reparents while room screen is open.
 * Never hidden with display:none.
 */
export default function YouTubePlayer({
  currentTrack,
  isPlaying,
  playbackPosition,
  volume = 80,
  isMuted = false,
  onDurationChange,
  onCurrentTimeChange,
  onPlayerError,
  onTapToPlayNeeded
}) {
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [tapToPlayVisible, setTapToPlayVisible] = useState(false);

  const propsRef = useRef({
    currentTrack,
    isPlaying,
    playbackPosition,
    volume,
    isMuted,
    onDurationChange,
    onCurrentTimeChange,
    onPlayerError,
    onTapToPlayNeeded
  });

  useEffect(() => {
    propsRef.current = {
      currentTrack,
      isPlaying,
      playbackPosition,
      volume,
      isMuted,
      onDurationChange,
      onCurrentTimeChange,
      onPlayerError,
      onTapToPlayNeeded
    };
  });

  const isInternalUpdate = useRef(false);
  const lastEndedEntryIdRef = useRef(null);
  const isDuckedRef = useRef(false);
  const duckingSustainTimer = useRef(null);
  const duckingReleaseTimer = useRef(null);
  const playTimeoutRef = useRef(null);

  const applyPlayerVolume = useCallback((ducked = isDuckedRef.current) => {
    const player = playerRef.current;
    if (!player || !isReady || typeof player.setVolume !== 'function') return;
    const targetVolume = ducked ? Math.max(5, Math.round(volume * 0.3)) : volume;
    player.setVolume(targetVolume);
    if (isMuted) {
      if (typeof player.mute === 'function') player.mute();
    } else {
      if (typeof player.unMute === 'function') player.unMute();
    }
  }, [volume, isMuted, isReady]);

  const syncPlayerState = useCallback((targetPlaying, targetPosition) => {
    const player = playerRef.current;
    if (!player || typeof player.getPlayerState !== 'function') return;

    isInternalUpdate.current = true;
    try {
      const currentPos = typeof player.getCurrentTime === 'function' ? (player.getCurrentTime() || 0) : 0;
      const drift = Math.abs(currentPos - targetPosition);

      if (targetPlaying) {
        if (drift > 1.5 && typeof player.seekTo === 'function') {
          player.seekTo(targetPosition, true);
        }
        if (typeof player.playVideo === 'function') {
          player.playVideo();
        }

        // Check if playback starts within 2.5s (mobile autoplay policy guard)
        if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
        playTimeoutRef.current = setTimeout(() => {
          if (propsRef.current.isPlaying && playerRef.current) {
            const state = typeof playerRef.current.getPlayerState === 'function' ? playerRef.current.getPlayerState() : -1;
            if (window.YT && state !== window.YT.PlayerState.PLAYING) {
              setTapToPlayVisible(true);
              if (propsRef.current.onTapToPlayNeeded) propsRef.current.onTapToPlayNeeded(true);
            }
          }
        }, 2500);
      } else {
        if (playTimeoutRef.current) {
          clearTimeout(playTimeoutRef.current);
          playTimeoutRef.current = null;
        }
        queueMicrotask(() => {
          setTapToPlayVisible(false);
        });
        if (typeof player.pauseVideo === 'function') {
          player.pauseVideo();
        }
        if (drift > 1.5 && typeof player.seekTo === 'function') {
          player.seekTo(targetPosition, true);
        }
      }
    } catch (err) {
      console.warn('[YouTubePlayer] syncPlayerState error:', err);
    } finally {
      setTimeout(() => {
        isInternalUpdate.current = false;
      }, 500);
    }
  }, []);

  const handlePlayerStateChange = useCallback((event) => {
    const playerState = event.data;
    if (window.YT && playerState === window.YT.PlayerState.PLAYING) {
      setTapToPlayVisible(false);
      if (playTimeoutRef.current) {
        clearTimeout(playTimeoutRef.current);
        playTimeoutRef.current = null;
      }
    }

    if (window.YT && playerState === window.YT.PlayerState.ENDED && !isInternalUpdate.current) {
      const entryId = propsRef.current.currentTrack?.entryId;
      if (entryId && lastEndedEntryIdRef.current !== entryId) {
        lastEndedEntryIdRef.current = entryId;
        socket.emit('player:track-end', { entryId });
      }
    }
  }, []);

  const initPlayer = useCallback(() => {
    if (playerRef.current || !containerRef.current || typeof window === 'undefined' || !window.YT || !window.YT.Player) return;

    const container = containerRef.current;
    container.innerHTML = '';
    const mountNode = document.createElement('div');
    mountNode.style.width = '100%';
    mountNode.style.height = '100%';
    container.appendChild(mountNode);

    const initialTrackId = propsRef.current.currentTrack?.id || '';

    try {
      playerRef.current = new window.YT.Player(mountNode, {
        height: '100%',
        width: '100%',
        videoId: initialTrackId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          origin: typeof window !== 'undefined' ? window.location.origin : undefined,
          playsinline: 1,
          iv_load_policy: 3
        },
        events: {
          onReady: (event) => {
            const player = event.target;
            playerRef.current = player;
            setIsReady(true);
            applyPlayerVolume();
            if (propsRef.current.currentTrack?.id) {
              syncPlayerState(propsRef.current.isPlaying, propsRef.current.playbackPosition);
            }
          },
          onStateChange: handlePlayerStateChange,
          onError: (e) => {
            // Handle embed restriction / unavailable error codes: 2, 5, 100, 101, 150
            if (e.data === 2 || e.data === 5 || e.data === 100 || e.data === 101 || e.data === 150) {
              const entryId = propsRef.current.currentTrack?.entryId;
              if (entryId && lastEndedEntryIdRef.current !== entryId) {
                lastEndedEntryIdRef.current = entryId;
                socket.emit('player:skip', { entryId });
                socket.emit('queue:skip', { entryId });
                if (typeof propsRef.current.onPlayerError === 'function') {
                  propsRef.current.onPlayerError("That video can't be played here, skipped");
                }
              }
            }
          }
        }
      });
    } catch (err) {
      console.warn('[YouTubePlayer] Error initializing YT.Player:', err);
    }
  }, [handlePlayerStateChange, syncPlayerState, applyPlayerVolume]);

  useEffect(() => {
    let destroyed = false;
    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      if (!document.getElementById('yt-iframe-api')) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (previousReady) previousReady();
        if (!destroyed) initPlayer();
      };
    }

    return () => {
      destroyed = true;
      setIsReady(false);
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }
    };
  }, [initPlayer]);

  // Load new video when track changes
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isReady) return;

    if (!currentTrack?.id) {
      if (typeof player.stopVideo === 'function') {
        try { player.stopVideo(); } catch {}
      }
      return;
    }

    if (typeof player.loadVideoById === 'function') {
      const loadedId = typeof player.getVideoData === 'function' ? player.getVideoData()?.video_id : null;
      if (loadedId !== currentTrack.id) {
        isInternalUpdate.current = true;
        try {
          player.loadVideoById({ videoId: currentTrack.id, startSeconds: playbackPosition || 0 });
        } catch {}
        if (!isPlaying) {
          setTimeout(() => {
            if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
            isInternalUpdate.current = false;
          }, 300);
        } else {
          setTimeout(() => {
            isInternalUpdate.current = false;
          }, 600);
        }
      }
    }
  }, [currentTrack?.id, isReady, isPlaying, playbackPosition]);

  // Sync isPlaying / playbackPosition changes
  useEffect(() => {
    if (isReady && currentTrack?.id) {
      syncPlayerState(isPlaying, playbackPosition);
    }
  }, [isPlaying, playbackPosition, isReady, currentTrack?.id, syncPlayerState]);

  // Volume & Mute changes
  useEffect(() => {
    applyPlayerVolume();
  }, [applyPlayerVolume]);

  // Audio ducking (30% volume after 250ms sustained speech, 600ms release; skip iOS)
  useEffect(() => {
    const isIOS = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    if (isIOS) return;

    const checkSpeakingAndDuck = () => {
      const allPeers = { ...peerConnectionService.getAllPeers(), ...livekitService.getAllPeers() };
      const isRemoteSpeaking = Object.values(allPeers).some(p => Boolean(p.isSpeaking && !p.isMuted));

      if (isRemoteSpeaking) {
        if (duckingReleaseTimer.current) {
          clearTimeout(duckingReleaseTimer.current);
          duckingReleaseTimer.current = null;
        }
        if (!isDuckedRef.current && !duckingSustainTimer.current) {
          duckingSustainTimer.current = setTimeout(() => {
            isDuckedRef.current = true;
            applyPlayerVolume(true);
            duckingSustainTimer.current = null;
          }, 250);
        }
      } else {
        if (duckingSustainTimer.current) {
          clearTimeout(duckingSustainTimer.current);
          duckingSustainTimer.current = null;
        }
        if (isDuckedRef.current && !duckingReleaseTimer.current) {
          duckingReleaseTimer.current = setTimeout(() => {
            isDuckedRef.current = false;
            applyPlayerVolume(false);
            duckingReleaseTimer.current = null;
          }, 600);
        }
      }
    };

    const unsubWebRTC = peerConnectionService.subscribe(checkSpeakingAndDuck);
    const unsubLiveKit = livekitService.subscribe(checkSpeakingAndDuck);

    return () => {
      if (duckingSustainTimer.current) clearTimeout(duckingSustainTimer.current);
      if (duckingReleaseTimer.current) clearTimeout(duckingReleaseTimer.current);
      unsubWebRTC();
      unsubLiveKit();
    };
  }, [applyPlayerVolume]);

  // Periodic time updates & 1.5s drift check
  useEffect(() => {
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || !isReady || typeof player.getCurrentTime !== 'function') return;

      try {
        const duration = typeof player.getDuration === 'function' ? (player.getDuration() || 0) : 0;
        const currentPos = player.getCurrentTime() || 0;

        if (onDurationChange && duration > 0) onDurationChange(duration);
        if (onCurrentTimeChange) onCurrentTimeChange(currentPos);

        if (isPlaying && !isInternalUpdate.current) {
          const expectedPos = playbackPosition;
          if (expectedPos > 0 && Math.abs(currentPos - expectedPos) > 1.5) {
            isInternalUpdate.current = true;
            if (typeof player.seekTo === 'function') player.seekTo(expectedPos, true);
            setTimeout(() => { isInternalUpdate.current = false; }, 500);
          }
        }
      } catch {}
    }, 500);

    return () => clearInterval(interval);
  }, [isReady, isPlaying, playbackPosition, onDurationChange, onCurrentTimeChange]);

  const handleTapToPlay = () => {
    const player = playerRef.current;
    if (player && typeof player.playVideo === 'function') {
      if (typeof player.unMute === 'function') player.unMute();
      if (typeof player.seekTo === 'function' && propsRef.current.playbackPosition > 0) {
        player.seekTo(propsRef.current.playbackPosition, true);
      }
      player.playVideo();
      setTapToPlayVisible(false);
    }
  };

  return (
    <div className="relative w-full h-full min-h-[200px] overflow-hidden rounded-[20px] bg-black select-none aspect-video">
      {tapToPlayVisible && (
        <button
          type="button"
          onClick={handleTapToPlay}
          className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md cursor-pointer p-4 text-center transition-opacity"
        >
          <div className="w-16 h-16 rounded-full bg-[#FF9F1C]/20 border border-[#FF9F1C]/40 flex items-center justify-center mb-3 animate-pulse">
            <span className="text-2xl text-[#FF9F1C]">▶</span>
          </div>
          <h4 className="text-[#F4F1EA] text-base font-bold mb-1">Tap to play</h4>
          <p className="text-[#9A978F] text-xs max-w-xs">
            Browser requires a tap to resume synchronized audio playback.
          </p>
        </button>
      )}

      {/* Interaction Shield: blocks click hijacking while keeping player active */}
      <div
        className="absolute inset-0 z-10 bg-transparent select-none"
        style={{ pointerEvents: 'auto', touchAction: 'none' }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      />

      <div
        ref={containerRef}
        className="w-full h-full pointer-events-none select-none"
      />
    </div>
  );
}
