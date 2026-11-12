import React, { useEffect, useRef, useState, useCallback } from 'react';
import socket from '../services/socket';

/**
 * Synchronized YouTube IFrame Player
 * Synchronizes play/pause/seek across all connected room members.
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

  // Flags to avoid echo loops between socket emits and player events
  const isInternalUpdate = useRef(false);
  const lastStateChangeTimestamp = useRef(0);

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
        controls: 0, // We supply custom collaborative controls
        disablekb: 1,
        enablejsapi: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        origin: window.location.origin
      },
      events: {
        onReady: (event) => {
          setIsReady(true);
          event.target.setVolume(volume);
          if (isMuted) event.target.mute();

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
            socket.emit('player:skip');
          }
        }
      }
    });
  };

  // Handle changes from user interacting with YouTube embed directly
  const handlePlayerStateChange = useCallback((event) => {
    if (!isReady || isInternalUpdate.current) return;

    const player = event.target;
    const playerState = event.data;

    // Check if DJ Mode restricts control to host only
    if (djMode && !isHost) return;

    if (playerState === window.YT.PlayerState.PLAYING) {
      setAutoplayBlocked(false);
      const currentTime = player.getCurrentTime();
      socket.emit('player:play', { currentTime });
    } else if (playerState === window.YT.PlayerState.PAUSED) {
      const currentTime = player.getCurrentTime();
      socket.emit('player:pause', { currentTime });
    } else if (playerState === window.YT.PlayerState.ENDED) {
      socket.emit('player:track-end');
    }
  }, [isReady, djMode, isHost]);

  // Synchronize player with room state
  const syncPlayerState = (targetPlaying, targetPosition) => {
    const player = playerRef.current;
    if (!player || !isReady || typeof player.getPlayerState !== 'function') return;

    isInternalUpdate.current = true;
    lastStateChangeTimestamp.current = Date.now();

    try {
      const currentPos = player.getCurrentTime() || 0;
      const drift = Math.abs(currentPos - targetPosition);

      // Re-align if position drift is greater than 1.5 seconds
      if (drift > 1.5) {
        player.seekTo(targetPosition, true);
      }

      const currentState = player.getPlayerState();
      if (targetPlaying && currentState !== window.YT.PlayerState.PLAYING) {
        const playPromise = player.playVideo();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => setAutoplayBlocked(true));
        }
      } else if (!targetPlaying && currentState === window.YT.PlayerState.PLAYING) {
        player.pauseVideo();
      }
    } catch (err) {
      console.warn('Error during player sync:', err);
    } finally {
      setTimeout(() => {
        isInternalUpdate.current = false;
      }, 300);
    }
  };

  // Change video when currentTrack changes
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isReady || !currentTrack?.id) return;

    const currentLoadedId = player.getVideoData ? player.getVideoData().video_id : null;
    if (currentLoadedId !== currentTrack.id) {
      isInternalUpdate.current = true;
      player.loadVideoById({
        videoId: currentTrack.id,
        startSeconds: playbackPosition || 0
      });

      if (!isPlaying) {
        setTimeout(() => {
          player.pauseVideo();
          isInternalUpdate.current = false;
        }, 150);
      } else {
        setTimeout(() => {
          isInternalUpdate.current = false;
        }, 300);
      }
    }
  }, [currentTrack?.id, isReady]);

  // React to isPlaying or playbackPosition changes from socket
  useEffect(() => {
    if (isReady && currentTrack?.id) {
      syncPlayerState(isPlaying, playbackPosition);
    }
  }, [isPlaying, playbackPosition, isReady]);

  // Volume & Mute updates
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isReady || typeof player.setVolume !== 'function') return;
    player.setVolume(volume);
    if (isMuted) {
      player.mute();
    } else {
      player.unMute();
    }
  }, [volume, isMuted, isReady]);

  // Periodic time updates & drift check
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

        // Periodic drift correction when playing
        if (isPlaying && !isInternalUpdate.current) {
          const expectedPos = playbackPosition;
          if (expectedPos > 0 && Math.abs(currentPos - expectedPos) > 2.5) {
            console.log(`Drift detected: client=${currentPos.toFixed(1)}s room=${expectedPos.toFixed(1)}s. Correcting...`);
            isInternalUpdate.current = true;
            player.seekTo(expectedPos, true);
            setTimeout(() => {
              isInternalUpdate.current = false;
            }, 300);
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

      {/* Embedded IFrame container */}
      <div 
        ref={containerRef} 
        className="w-full h-full pointer-events-auto"
      />
    </div>
  );
}

