import React, { useEffect, useRef, useState, useCallback } from 'react';
import socket from '../services/socket';

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
        controls: 0, // We supply custom collaborative controls
        disablekb: 1,
        enablejsapi: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        origin: window.location.origin,
        playsinline: 1 // Important for mobile
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

  // Handle YouTube player state changes
  // When user interacts with the YouTube player directly, broadcast to the room!
  const handlePlayerStateChange = useCallback((event) => {
    if (!isReady) return;

    const playerState = event.data;

    // Detect autoplay blocked (browser policy)
    if (playerState === window.YT.PlayerState.PLAYING) {
      setAutoplayBlocked(false);
    }

    // Detect track ended — notify server to advance queue
    if (playerState === window.YT.PlayerState.ENDED && !isInternalUpdate.current) {
      socket.emit('player:track-end');
      return;
    }

    // If change was triggered programmatically by socket sync, ignore it
    if (isInternalUpdate.current) return;

    const player = event.target;
    const currentPos = player.getCurrentTime ? player.getCurrentTime() : 0;

    // User physically clicked pause inside the player -> Sync pause to all room members
    if (playerState === window.YT.PlayerState.PAUSED) {
      lastSyncRef.current.isPlaying = false;
      isInternalUpdate.current = true;
      socket.emit('player:pause', { currentTime: currentPos });
      setTimeout(() => {
        isInternalUpdate.current = false;
      }, 500);
    } 
    // User physically clicked play inside the player -> Sync play to all room members
    else if (playerState === window.YT.PlayerState.PLAYING) {
      lastSyncRef.current.isPlaying = true;
      isInternalUpdate.current = true;
      socket.emit('player:play', { currentTime: currentPos });
      setTimeout(() => {
        isInternalUpdate.current = false;
      }, 500);
    }
  }, [isReady]);

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

      {/* Embedded IFrame container */}
      <div 
        ref={containerRef} 
        className="w-full h-full pointer-events-none"
      />
    </div>
  );
}

