import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import socket from '../services/socket';
import peerService from '../services/peerService';
import { VolumeX, Play } from 'lucide-react';

/**
 * Synchronized YouTube IFrame Player
 * Never unmounts or reparents while room screen is open.
 * Never hidden with display:none.
 * Guaranteed audio playback with explicit unmute handlers and autoplay detection.
 */
const YouTubePlayer = forwardRef(function YouTubePlayer({
  currentTrack,
  isPlaying,
  playbackPosition,
  volume = 80,
  isMuted = false,
  onDurationChange,
  onCurrentTimeChange,
  onPlayerError,
  onTapToPlayNeeded,
  onTogglePlay
}, ref) {
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [tapToPlayVisible, setTapToPlayVisible] = useState(false);
  const [isMutedByBrowser, setIsMutedByBrowser] = useState(false);

  const propsRef = useRef({
    currentTrack,
    isPlaying,
    playbackPosition,
    volume,
    isMuted,
    onDurationChange,
    onCurrentTimeChange,
    onPlayerError,
    onTapToPlayNeeded,
    onTogglePlay
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
      onTapToPlayNeeded,
      onTogglePlay
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
    if (!player || typeof player.setVolume !== 'function') return;
    try {
      const targetVolume = ducked ? Math.max(5, Math.round(volume * 0.3)) : volume;
      player.setVolume(targetVolume);
      if (isMuted) {
        if (typeof player.mute === 'function') player.mute();
      } else {
        if (typeof player.unMute === 'function') player.unMute();
      }
    } catch {}
  }, [volume, isMuted]);

  // Expose imperative methods to unlock/unmute audio on user gestures
  useImperativeHandle(ref, () => ({
    unmuteAndPlay: () => {
      const player = playerRef.current;
      if (player) {
        try {
          if (typeof player.unMute === 'function') player.unMute();
          if (typeof player.setVolume === 'function') player.setVolume(propsRef.current.volume || 80);
          if (propsRef.current.isPlaying && typeof player.playVideo === 'function') {
            player.playVideo();
          }
          setIsMutedByBrowser(false);
          setTapToPlayVisible(false);
        } catch (e) {
          console.debug('[YouTubePlayer] unmuteAndPlay error:', e);
        }
      }
    },
    unmute: () => {
      const player = playerRef.current;
      if (player && typeof player.unMute === 'function') {
        try {
          player.unMute();
          if (typeof player.setVolume === 'function') player.setVolume(propsRef.current.volume || 80);
          setIsMutedByBrowser(false);
        } catch {}
      }
    },
    getPlayer: () => playerRef.current
  }), []);

  const syncPlayerState = useCallback((targetPlaying, targetPosition) => {
    const player = playerRef.current;
    if (!player || typeof player.getPlayerState !== 'function') return;

    isInternalUpdate.current = true;
    try {
      const currentPos = typeof player.getCurrentTime === 'function' ? (player.getCurrentTime() || 0) : 0;
      const drift = Math.abs(currentPos - targetPosition);

      if (targetPlaying) {
        if (drift > 1.8 && typeof player.seekTo === 'function') {
          player.seekTo(targetPosition, true);
        }
        if (typeof player.unMute === 'function' && !propsRef.current.isMuted) {
          player.unMute();
        }
        if (typeof player.setVolume === 'function') {
          player.setVolume(propsRef.current.volume || 80);
        }
        if (typeof player.playVideo === 'function') {
          player.playVideo();
        }

        // Check if playback actually started within 2 seconds
        if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
        playTimeoutRef.current = setTimeout(() => {
          if (propsRef.current.isPlaying && playerRef.current) {
            const state = typeof playerRef.current.getPlayerState === 'function' ? playerRef.current.getPlayerState() : -1;
            if (window.YT && state !== window.YT.PlayerState.PLAYING) {
              setTapToPlayVisible(true);
              if (propsRef.current.onTapToPlayNeeded) propsRef.current.onTapToPlayNeeded(true);
            } else if (window.YT && state === window.YT.PlayerState.PLAYING) {
              const muted = typeof playerRef.current.isMuted === 'function' ? playerRef.current.isMuted() : false;
              if (muted && !propsRef.current.isMuted) {
                setIsMutedByBrowser(true);
              }
            }
          }
        }, 2000);
      } else {
        if (playTimeoutRef.current) {
          clearTimeout(playTimeoutRef.current);
          playTimeoutRef.current = null;
        }
        setTapToPlayVisible(false);
        if (typeof player.pauseVideo === 'function') {
          player.pauseVideo();
        }
        if (drift > 1.8 && typeof player.seekTo === 'function') {
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
    const player = playerRef.current;

    if (window.YT && playerState === window.YT.PlayerState.PLAYING) {
      setTapToPlayVisible(false);
      if (playTimeoutRef.current) {
        clearTimeout(playTimeoutRef.current);
        playTimeoutRef.current = null;
      }
      // Check if browser forced muted playback
      if (player && typeof player.isMuted === 'function') {
        const muted = player.isMuted();
        setIsMutedByBrowser(muted && !propsRef.current.isMuted);
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

    const initialTrackId = propsRef.current.currentTrack?.id || null;

    try {
      const playerOptions = {
        height: '100%',
        width: '100%',
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
            try {
              player.setVolume(propsRef.current.volume || 80);
              if (propsRef.current.isMuted) {
                player.mute();
              } else {
                player.unMute();
              }
            } catch {}
            if (propsRef.current.currentTrack?.id) {
              syncPlayerState(propsRef.current.isPlaying, propsRef.current.playbackPosition);
            }
          },
          onStateChange: handlePlayerStateChange,
          onError: (e) => {
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
      };

      if (initialTrackId) {
        playerOptions.videoId = initialTrackId;
      }

      playerRef.current = new window.YT.Player(mountNode, playerOptions);
    } catch (err) {
      console.warn('[YouTubePlayer] Error initializing YT.Player:', err);
    }
  }, [handlePlayerStateChange, syncPlayerState]);

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
          player.setVolume(volume);
          if (isMuted) {
            player.mute();
          } else {
            player.unMute();
          }
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
  }, [currentTrack?.id, isReady, isPlaying, playbackPosition, volume, isMuted]);

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
      const allPeers = peerService.getAllPeers();
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

    const unsubPeer = peerService.subscribe(checkSpeakingAndDuck);

    return () => {
      if (duckingSustainTimer.current) clearTimeout(duckingSustainTimer.current);
      if (duckingReleaseTimer.current) clearTimeout(duckingReleaseTimer.current);
      unsubPeer();
    };
  }, [applyPlayerVolume]);

  // Periodic time updates & drift check against server playback position
  useEffect(() => {
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || !isReady || typeof player.getCurrentTime !== 'function') return;

      try {
        const duration = typeof player.getDuration === 'function' ? (player.getDuration() || 0) : 0;
        const currentPos = player.getCurrentTime() || 0;

        if (onDurationChange && duration > 0) onDurationChange(duration);
        if (onCurrentTimeChange) onCurrentTimeChange(currentPos);

        // Check mute state periodically to catch autoplay restrictions
        if (typeof player.isMuted === 'function' && typeof player.getPlayerState === 'function') {
          const state = player.getPlayerState();
          if (state === 1) { // PLAYING
            const muted = player.isMuted();
            setIsMutedByBrowser(muted && !propsRef.current.isMuted);
          }
        }

        if (isPlaying && !isInternalUpdate.current) {
          const expectedPos = propsRef.current.playbackPosition;
          if (expectedPos > 0 && Math.abs(currentPos - expectedPos) > 2.0) {
            isInternalUpdate.current = true;
            if (typeof player.seekTo === 'function') player.seekTo(expectedPos, true);
            setTimeout(() => { isInternalUpdate.current = false; }, 500);
          }
        }
      } catch {}
    }, 500);

    return () => clearInterval(interval);
  }, [isReady, isPlaying, onDurationChange, onCurrentTimeChange]);

  const handleTapToPlay = (e) => {
    e?.stopPropagation();
    const player = playerRef.current;
    if (player && typeof player.playVideo === 'function') {
      if (typeof player.unMute === 'function') player.unMute();
      if (typeof player.setVolume === 'function') player.setVolume(propsRef.current.volume || 80);
      if (typeof player.seekTo === 'function' && propsRef.current.playbackPosition > 0) {
        player.seekTo(propsRef.current.playbackPosition, true);
      }
      player.playVideo();
      setTapToPlayVisible(false);
      setIsMutedByBrowser(false);
    }
  };

  const handleUnmuteClick = (e) => {
    e?.stopPropagation();
    const player = playerRef.current;
    if (player) {
      if (typeof player.unMute === 'function') player.unMute();
      if (typeof player.setVolume === 'function') player.setVolume(propsRef.current.volume || 80);
      setIsMutedByBrowser(false);
    }
  };

  const handleStageClick = () => {
    if (tapToPlayVisible) {
      handleTapToPlay();
      return;
    }
    if (isMutedByBrowser) {
      handleUnmuteClick();
      return;
    }
    if (propsRef.current.onTogglePlay) {
      propsRef.current.onTogglePlay();
    }
  };

  return (
    <div className="relative w-full h-full min-h-[200px] overflow-hidden rounded-[20px] bg-black select-none aspect-video group">
      {/* Tap to play overlay when autoplay is blocked by browser policy */}
      {tapToPlayVisible && (
        <button
          type="button"
          onClick={handleTapToPlay}
          className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md cursor-pointer p-4 text-center transition-opacity"
        >
          <div className="w-16 h-16 rounded-full bg-[#FF9F1C]/20 border border-[#FF9F1C]/40 flex items-center justify-center mb-3 animate-pulse shadow-lg shadow-[#FF9F1C]/20">
            <Play className="w-7 h-7 text-[#FF9F1C] fill-[#FF9F1C] ml-0.5" />
          </div>
          <h4 className="text-[#F4F1EA] text-base font-bold mb-1">Tap to Start Sound</h4>
          <p className="text-[#9A978F] text-xs max-w-xs">
            Browser requires a tap to resume synchronized audio playback.
          </p>
        </button>
      )}

      {/* Floating Unmute Alert when video is playing but sound is muted by browser */}
      {isMutedByBrowser && !tapToPlayVisible && (
        <button
          type="button"
          onClick={handleUnmuteClick}
          className="absolute top-4 left-4 z-30 px-3.5 py-2 bg-gradient-to-r from-[#FF9F1C] to-[#FF5A5F] text-white text-xs font-bold rounded-xl shadow-xl flex items-center gap-2 animate-bounce cursor-pointer hover:opacity-95 active:scale-95 transition-all"
        >
          <VolumeX className="w-4 h-4 fill-white" />
          <span>Sound Muted — Tap to Unmute</span>
        </button>
      )}

      {/* Interaction Shield: blocks external navigation/ads while making entire video stage interactive */}
      <div
        className="absolute inset-0 z-10 bg-transparent select-none cursor-pointer"
        style={{ pointerEvents: 'auto', touchAction: 'none' }}
        onClick={handleStageClick}
        title="Click to play/pause or unmute"
      />

      <div
        ref={containerRef}
        className="w-full h-full pointer-events-none select-none"
      />
    </div>
  );
});

export default YouTubePlayer;
