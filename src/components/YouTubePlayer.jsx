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
  _djMode = false,
  _isHost = false,
  showVideo = true
}) {
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Keep a stable ref of latest props to prevent recreating callbacks and player
  const propsRef = useRef({
    currentTrack,
    isPlaying,
    playbackPosition,
    volume,
    isMuted,
    onDurationChange,
    onCurrentTimeChange
  });

  useEffect(() => {
    propsRef.current = {
      currentTrack,
      isPlaying,
      playbackPosition,
      volume,
      isMuted,
      onDurationChange,
      onCurrentTimeChange
    };
  });

  // Flag: when true, we are programmatically controlling the player.
  // ALL state changes from the YT player are ignored — we never emit back to socket
  // from onStateChange because the controls in CommonScreen already do that.
  const isInternalUpdate = useRef(false);

  // Guard ref to emit track-end or auto-skip at most once per entryId
  const lastEndedEntryIdRef = useRef(null);

  // Track the last known props to detect real changes
  const lastSyncRef = useRef({ isPlaying: false, playbackPosition: 0, trackId: null });

  // Handle YouTube player state changes
  // YouTube is purely an output display: user cannot play/pause YT directly.
  // Playback is strictly governed by our app's play/pause button.
  const handlePlayerStateChange = useCallback((event) => {
    const playerState = event.data;
    const player = event.target;

    // Detect autoplay unblocked
    if (window.YT && playerState === window.YT.PlayerState.PLAYING) {
      setAutoplayBlocked(false);
    }

    // Detect track ended — notify server to advance queue (at most once per entryId)
    if (window.YT && playerState === window.YT.PlayerState.ENDED && !isInternalUpdate.current) {
      const entryId = propsRef.current.currentTrack?.entryId;
      if (entryId && lastEndedEntryIdRef.current !== entryId) {
        lastEndedEntryIdRef.current = entryId;
        socket.emit('player:track-end', { entryId });
      }
      return;
    }

    // If change was triggered programmatically by socket sync, ignore it
    if (isInternalUpdate.current) return;

    // Guard against unwanted pause if room is in playing state
    if (window.YT && playerState === window.YT.PlayerState.PAUSED && propsRef.current.isPlaying) {
      if (player && typeof player.playVideo === 'function') {
        player.playVideo();
      }
    }
  }, []);

  // Synchronize player with room state (called when props change from server socket)
  const syncPlayerState = useCallback((targetPlaying, targetPosition) => {
    const player = playerRef.current;
    if (!player || typeof player.getPlayerState !== 'function') return;

    isInternalUpdate.current = true;

    // Store what we're syncing to
    lastSyncRef.current = { 
      isPlaying: targetPlaying, 
      playbackPosition: targetPosition,
      trackId: propsRef.current.currentTrack?.id 
    };

    try {
      const currentPos = typeof player.getCurrentTime === 'function' ? (player.getCurrentTime() || 0) : 0;
      const drift = Math.abs(currentPos - targetPosition);

      if (targetPlaying) {
        // Re-align if position drift is greater than 2 seconds
        if (drift > 2 && typeof player.seekTo === 'function') {
          player.seekTo(targetPosition, true);
        }
        if (typeof player.playVideo === 'function') {
          const playPromise = player.playVideo();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => setAutoplayBlocked(true));
          }
        }
      } else {
        // Paused on server — unconditionally pause YouTube!
        if (typeof player.pauseVideo === 'function') {
          player.pauseVideo();
        }
        if (drift > 1.5 && typeof player.seekTo === 'function') {
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
          controls: 0, // Custom collaborative controls only
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          origin: typeof window !== 'undefined' && window.location?.origin ? window.location.origin : undefined,
          playsinline: 1, // Important for mobile
          iv_load_policy: 3, // Disable video annotations
          autohide: 1
        },
        events: {
          onReady: (event) => {
            const player = event.target;
            playerRef.current = player;
            setIsReady(true);

            try {
              if (typeof player.setVolume === 'function') {
                player.setVolume(propsRef.current.volume ?? 80);
              }
              if (propsRef.current.isMuted && typeof player.mute === 'function') {
                player.mute();
              } else if (!propsRef.current.isMuted && typeof player.unMute === 'function') {
                player.unMute();
              }

              // Disable pointer events on the iframe so users cannot interact with YT directly
              const iframe = typeof player.getIframe === 'function' ? player.getIframe() : null;
              if (iframe) {
                iframe.style.pointerEvents = 'none';
                iframe.setAttribute('tabindex', '-1');
              }
            } catch (e) {
              console.debug('Iframe style setup:', e);
            }

            // Sync initial state
            if (propsRef.current.currentTrack?.id) {
              syncPlayerState(propsRef.current.isPlaying, propsRef.current.playbackPosition);
            }
          },
          onStateChange: handlePlayerStateChange,
          onError: (e) => {
            console.warn('YouTube Player Error:', e.data);
            // If video unavailable/restricted, notify and skip to next
            if (e.data === 150 || e.data === 101 || e.data === 100) {
              console.log('Restricted video, auto-skipping...');
              const entryId = propsRef.current.currentTrack?.entryId;
              if (entryId && lastEndedEntryIdRef.current !== entryId) {
                lastEndedEntryIdRef.current = entryId;
                socket.emit('player:skip', { entryId });
              }
            }
          }
        }
      });
    } catch (err) {
      console.warn('Error initializing YT.Player:', err);
    }
  }, [handlePlayerStateChange, syncPlayerState]);

  // Load YouTube IFrame API and initialize player once on mount
  useEffect(() => {
    let destroyed = false;

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      if (!document.getElementById('yt-iframe-api')) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        if (firstScriptTag && firstScriptTag.parentNode) {
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        } else {
          document.head.appendChild(tag);
        }
      }

      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (previousReady) previousReady();
        if (!destroyed) {
          initPlayer();
        }
      };
    }

    return () => {
      destroyed = true;
      setIsReady(false);
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try {
          playerRef.current.destroy();
        } catch (e) {
          console.debug('Error destroying player:', e);
        }
        playerRef.current = null;
      }
    };
  }, [initPlayer]);

  // Change video when currentTrack changes
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isReady) return;

    if (!currentTrack?.id) {
      if (typeof player.stopVideo === 'function') {
        try {
          player.stopVideo();
        } catch {
          // Ignore stop errors if player is unmounted
        }
      }
      return;
    }

    if (typeof player.loadVideoById !== 'function') return;

    const currentLoadedId = typeof player.getVideoData === 'function' ? player.getVideoData()?.video_id : null;
    if (currentLoadedId !== currentTrack.id) {
      isInternalUpdate.current = true;
      lastSyncRef.current = { isPlaying, playbackPosition, trackId: currentTrack.id };
      
      try {
        player.loadVideoById({
          videoId: currentTrack.id,
          startSeconds: playbackPosition || 0
        });
      } catch (err) {
        console.warn('loadVideoById error:', err);
      }

      if (!isPlaying) {
        setTimeout(() => {
          if (player && typeof player.pauseVideo === 'function') {
            player.pauseVideo();
          }
          isInternalUpdate.current = false;
        }, 300);
      } else {
        setTimeout(() => {
          isInternalUpdate.current = false;
        }, 600);
      }
    }
  }, [currentTrack?.id, isReady, isPlaying, playbackPosition]);

  // React to isPlaying or playbackPosition changes from socket
  useEffect(() => {
    if (isReady && currentTrack?.id) {
      syncPlayerState(isPlaying, playbackPosition);
    }
  }, [isPlaying, playbackPosition, isReady, currentTrack?.id, syncPlayerState]);

  // Audio ducking state & timers
  const isDuckedRef = useRef(false);
  const duckingReleaseTimeoutRef = useRef(null);

  const applyPlayerVolume = useCallback((ducked = isDuckedRef.current) => {
    const player = playerRef.current;
    if (!player || !isReady || typeof player.setVolume !== 'function') return;
    const targetVolume = ducked ? Math.max(10, Math.round(volume * 0.25)) : volume;
    player.setVolume(targetVolume);
    if (isMuted) {
      if (typeof player.mute === 'function') player.mute();
    } else {
      if (typeof player.unMute === 'function') player.unMute();
    }
  }, [volume, isMuted, isReady]);

  // Volume & Mute updates
  useEffect(() => {
    applyPlayerVolume();
  }, [applyPlayerVolume]);

  // Audio ducking when a remote participant speaks (skipped on iOS where setVolume has no effect)
  useEffect(() => {
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
        const duration = typeof player.getDuration === 'function' ? (player.getDuration() || 0) : 0;
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
            if (typeof player.seekTo === 'function') {
              player.seekTo(expectedPos, true);
            }
            setTimeout(() => {
              isInternalUpdate.current = false;
            }, 500);
          }
        }
      } catch {
        // Ignore read errors when video transitioning
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isReady, isPlaying, playbackPosition, onDurationChange, onCurrentTimeChange]);

  const handleEnableSound = () => {
    const player = playerRef.current;
    if (player && typeof player.playVideo === 'function') {
      if (typeof player.unMute === 'function') player.unMute();
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
