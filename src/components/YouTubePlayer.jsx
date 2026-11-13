import React, { useEffect, useRef, useState, useCallback } from 'react';
import socket from '../services/socket';
import peerConnectionService from '../services/peerConnectionService';
import livekitService from '../services/livekitService';

/**
 * Synchronized YouTube IFrame Player
 * True theater mode: server is the single source of truth for play/pause/seek.
 * The player ONLY reflects what the server tells it — it never emits back
 * to avoid echo loops that desync rooms.
 */
export default function YouTubePlayer({
  currentTrack,
  isPlaying,
  playbackPosition,
  volume = 80,
  isMuted = false,
  onDurationChange,
  onCurrentTimeChange,
  djMode = false,
  isHost = false,
  showVideo = true
}) {
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Flag: when true, we are programmatically controlling the player.
  // ALL state changes from the YT player are ignored — we never emit back to socket
  // from onStateChange because the controls in CommonScreen already do that.
  const isInternalUpdate = useRef(false);

  // Guard ref to emit track-end or auto-skip at most once per entryId
  const lastEndedEntryIdRef = useRef(null);

  // Track the last known props to detect real changes
  const lastSyncRef = useRef({ isPlaying: false, playbackPosition: 0, trackId: null });

  // Load YouTube IFrame API
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      initPlayer();
      return;
    }

    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (previousReady) previousReady();
      initPlayer();
    };

    return () => {
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, []);

  const initPlayer = () => {
    if (playerRef.current || !containerRef.current) return;

    playerRef.current = new window.YT.Player(containerRef.current, {
      height: '100%',
      width: '100%',
      videoId: currentTrack?.id || '',
      playerVars: {
        autoplay: 1,
        controls: 0, // Custom collaborative controls only
        disablekb: 1,
        enablejsapi: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        origin: window.location.origin,
        playsinline: 1, // Important for mobile
        iv_load_policy: 3, // Disable video annotations
        autohide: 1
      },
      events: {
        onReady: (event) => {
          setIsReady(true);
          event.target.setVolume(volume);
          if (isMuted) event.target.mute();

          // Disable pointer events on the iframe so users cannot interact with YT directly
          try {
            const iframe = event.target.getIframe();
            if (iframe) {
              iframe.style.pointerEvents = 'none';
              iframe.setAttribute('tabindex', '-1');
            }
          } catch (e) {
            console.debug('Iframe style setup:', e);
          }

          // Sync initial state
          if (currentTrack?.id) {
            syncPlayerState(isPlaying, playbackPosition);
          }
        },
        onStateChange: handlePlayerStateChange,
        onError: (e) => {
          console.warn('YouTube Player Error:', e.data);
          // If video unavailable/restricted, notify and skip to next
          if (e.data === 150 || e.data === 101 || e.data === 100) {
            console.log('Restricted video, auto-skipping...');
            const entryId = currentTrack?.entryId;
            if (entryId && lastEndedEntryIdRef.current !== entryId) {
              lastEndedEntryIdRef.current = entryId;
              socket.emit('player:skip', { entryId });
            }
          }
        }
      }
    });
  };

  // Handle YouTube player state changes
  // YouTube is purely an output display: user cannot play/pause YT directly.
  // Playback is strictly governed by our app's play/pause button.
  const handlePlayerStateChange = useCallback((event) => {
    if (!isReady) return;

    const playerState = event.data;

    // Detect autoplay unblocked
    if (playerState === window.YT.PlayerState.PLAYING) {
      setAutoplayBlocked(false);
    }

    // Detect track ended — notify server to advance queue (at most once per entryId)
    if (playerState === window.YT.PlayerState.ENDED && !isInternalUpdate.current) {
      const entryId = currentTrack?.entryId;
      if (entryId && lastEndedEntryIdRef.current !== entryId) {
        lastEndedEntryIdRef.current = entryId;
        socket.emit('player:track-end', { entryId });
      }
      return;
    }

    // If change was triggered programmatically by socket sync, ignore it
    if (isInternalUpdate.current) return;

    // Guard against unwanted pause if room is in playing state
    if (playerState === window.YT.PlayerState.PAUSED && isPlaying) {
      const player = event.target;
      if (player && typeof player.playVideo === 'function') {
        player.playVideo();
      }
    }
  }, [isReady, isPlaying, currentTrack?.entryId]);

  // Synchronize player with room state (called when props change from server socket)
  const syncPlayerState = useCallback((targetPlaying, targetPosition) => {
    const player = playerRef.current;
    if (!player || !isReady || typeof player.getPlayerState !== 'function') return;

    isInternalUpdate.current = true;

    // Store what we're syncing to
    lastSyncRef.current = { 
      isPlaying: targetPlaying, 
      playbackPosition: targetPosition,
      trackId: currentTrack?.id 
    };

    try {
      const currentPos = player.getCurrentTime() || 0;
      const drift = Math.abs(currentPos - targetPosition);

      if (targetPlaying) {
        // Re-align if position drift is greater than 2 seconds
        if (drift > 2) {
          player.seekTo(targetPosition, true);
        }
        const playPromise = player.playVideo();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => setAutoplayBlocked(true));
        }
      } else {
        // Paused on server — unconditionally pause YouTube!
        player.pauseVideo();
        if (drift > 1.5) {
          player.seekTo(targetPosition, true);
          // Ensure it stays paused after seeking
          setTimeout(() => {
            if (player && typeof player.pauseVideo === 'function') {
              player.pauseVideo();
            }
          }, 50);
        }
      }
    } catch (err) {
      console.warn('Error during player sync:', err);
    } finally {
      // Keep the internal flag longer to absorb any YT state change events
      setTimeout(() => {
        isInternalUpdate.current = false;
      }, 800);
    }
  }, [isReady, currentTrack?.id]);

  // Change video when currentTrack changes
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isReady || !currentTrack?.id) return;

    const currentLoadedId = player.getVideoData ? player.getVideoData().video_id : null;
    if (currentLoadedId !== currentTrack.id) {
      isInternalUpdate.current = true;
      lastSyncRef.current = { isPlaying, playbackPosition, trackId: currentTrack.id };
      
      player.loadVideoById({
        videoId: currentTrack.id,
        startSeconds: playbackPosition || 0
      });

      if (!isPlaying) {
        setTimeout(() => {
          player.pauseVideo();
          isInternalUpdate.current = false;
        }, 300);
      } else {
        setTimeout(() => {
          isInternalUpdate.current = false;
        }, 600);
      }
    }
  }, [currentTrack?.id, isReady]);

  // React to isPlaying or playbackPosition changes from socket
  useEffect(() => {
    if (isReady && currentTrack?.id) {
      syncPlayerState(isPlaying, playbackPosition);
    }
  }, [isPlaying, playbackPosition, isReady, syncPlayerState]);

  // Audio ducking state & timers
  const isDuckedRef = useRef(false);
  const duckingReleaseTimeoutRef = useRef(null);

  const applyPlayerVolume = useCallback((ducked = isDuckedRef.current) => {
    const player = playerRef.current;
    if (!player || !isReady || typeof player.setVolume !== 'function') return;
    const targetVolume = ducked ? Math.max(10, Math.round(volume * 0.25)) : volume;
    player.setVolume(targetVolume);
    if (isMuted) {
      player.mute();
    } else {
      player.unMute();
    }
  }, [volume, isMuted, isReady]);

  // Volume & Mute updates
  useEffect(() => {
    applyPlayerVolume();
  }, [applyPlayerVolume]);

  // Audio ducking when a remote participant speaks (skipped on iOS where setVolume has no effect)
  useEffect(() => {
    // Skip ducking on iOS where YouTube IFrame setVolume() has no effect due to OS-level volume control
    const isIOS = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    if (isIOS) return;

    const checkSpeakingAndDuck = () => {
      const player = playerRef.current;
      if (!player || !isReady) return;

      const allPeers = { ...peerConnectionService.getAllPeers(), ...livekitService.getAllPeers() };
      const isRemoteSpeaking = Object.values(allPeers).some(p => Boolean(p.isSpeaking && !p.isMuted));

      if (isRemoteSpeaking) {
        if (duckingReleaseTimeoutRef.current) {
          clearTimeout(duckingReleaseTimeoutRef.current);
          duckingReleaseTimeoutRef.current = null;
        }
        if (!isDuckedRef.current) {
          isDuckedRef.current = true;
          applyPlayerVolume(true);
        }
      } else {
        if (isDuckedRef.current && !duckingReleaseTimeoutRef.current) {
          duckingReleaseTimeoutRef.current = setTimeout(() => {
            isDuckedRef.current = false;
            duckingReleaseTimeoutRef.current = null;
            applyPlayerVolume(false);
          }, 600);
        }
      }
    };

    const unsubWebRTC = peerConnectionService.subscribe(checkSpeakingAndDuck);
    const unsubLiveKit = livekitService.subscribe(checkSpeakingAndDuck);

    return () => {
      if (duckingReleaseTimeoutRef.current) {
        clearTimeout(duckingReleaseTimeoutRef.current);
        duckingReleaseTimeoutRef.current = null;
      }
      unsubWebRTC();
      unsubLiveKit();
    };
  }, [isReady, applyPlayerVolume]);

  // Periodic time updates & gentle drift check
  useEffect(() => {
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || !isReady || typeof player.getCurrentTime !== 'function') return;

      try {
        const duration = player.getDuration() || 0;
        const currentPos = player.getCurrentTime() || 0;

        if (onDurationChange && duration > 0) {
          onDurationChange(duration);
        }
        if (onCurrentTimeChange) {
          onCurrentTimeChange(currentPos);
        }

        // Periodic drift correction when playing (gentler threshold)
        if (isPlaying && !isInternalUpdate.current) {
          const expectedPos = playbackPosition;
          if (expectedPos > 0 && Math.abs(currentPos - expectedPos) > 3) {
            console.log(`Drift detected: client=${currentPos.toFixed(1)}s room=${expectedPos.toFixed(1)}s. Correcting...`);
            isInternalUpdate.current = true;
            player.seekTo(expectedPos, true);
            setTimeout(() => {
              isInternalUpdate.current = false;
            }, 500);
          }
        }
      } catch (e) {
        // Ignore read errors when video transitioning
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isReady, isPlaying, playbackPosition, onDurationChange, onCurrentTimeChange]);

  const handleEnableSound = () => {
    const player = playerRef.current;
    if (player && typeof player.playVideo === 'function') {
      player.unMute();
      player.playVideo();
      setAutoplayBlocked(false);
    }
  };

  return (
    <div className={`relative w-full h-full overflow-hidden rounded-2xl bg-black ${!showVideo ? 'hidden' : ''}`}>
      {/* Autoplay blocked banner */}
      {autoplayBlocked && (
        <div 
          onClick={handleEnableSound}
          className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer p-4 text-center transition-all hover:bg-black/70"
        >
          <div className="w-16 h-16 rounded-full bg-violet-600/30 border border-violet-500/50 flex items-center justify-center mb-3 animate-pulse">
            <span className="text-3xl">🔊</span>
          </div>
          <h4 className="text-white text-lg font-bold mb-1">Click to Enable Audio</h4>
          <p className="text-zinc-400 text-sm max-w-xs">
            Your browser requires a click to allow synchronized audio playback.
          </p>
        </div>
      )}

      {/* Absolute Transparent Shield: Blocks all clicks, touches, context menus from reaching YouTube */}
      <div 
        className="absolute inset-0 z-10 bg-transparent select-none"
        style={{ pointerEvents: 'auto', touchAction: 'none' }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onTouchStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      />

      {/* Embedded IFrame container */}
      <div 
        ref={containerRef} 
        className="w-full h-full pointer-events-none select-none"
        style={{ pointerEvents: 'none' }}
      />
    </div>
  );
}

