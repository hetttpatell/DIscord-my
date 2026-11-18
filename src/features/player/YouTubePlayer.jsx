import React, { useState, useRef, useEffect, useCallback } from 'react';
import YouTube from 'react-youtube';
import { Play, Music, Maximize2, Minimize2, Users, Smile, Film, Subtitles } from 'lucide-react';
import { PlayerControls } from './PlayerControls';
import { FullscreenSlideWindow } from './FullscreenSlideWindow';
import { useYouTubeSync } from './useYouTubeSync';
import { useAppStore } from '../../stores/useAppStore';

export function YouTubePlayer({ socket, onOpenSearch, onOpenLocalMediaModal, onLocalReaction }) {
  const { playerState, members, memberId, nowPlaying } = useAppStore();
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);
  const [isMobileFullscreen, setIsMobileFullscreen] = useState(false);
  const [isSlideWindowOpen, setIsSlideWindowOpen] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isCaptionsEnabled, setIsCaptionsEnabled] = useState(false);
  const controlsTimerRef = useRef(null);

  const {
    emitPlay,
    emitPause,
    emitSeek,
    getExpectedPosition,
  } = useYouTubeSync({
    socket,
    playerRef,
    isPlayerReady,
  });

  // Track player current time locally for smooth UI scrubbing
  useEffect(() => {
    if (!isPlayerReady || playerState.status !== 'playing') {
      return;
    }

    const interval = setInterval(async () => {
      const player = playerRef.current;
      if (player) {
        try {
          const time = await player.getCurrentTime();
          setCurrentTime(time || 0);
        } catch {
          // ignore
        }
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isPlayerReady, playerState.status]);

  const displayTime = playerState.status === 'playing' ? currentTime : (playerState.positionSec || 0);

  const startControlsTimer = useCallback(() => {
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    controlsTimerRef.current = setTimeout(() => {
      setIsControlsVisible(false);
    }, 5000);
  }, []);

  const resetControlsTimer = useCallback(() => {
    setIsControlsVisible(true);
    startControlsTimer();
  }, [startControlsTimer]);

  const handleVideoAreaTap = useCallback(() => {
    if (!isMobileFullscreen) return;
    setIsControlsVisible((prev) => {
      const next = !prev;
      if (next) {
        startControlsTimer();
      } else {
        if (controlsTimerRef.current) {
          clearTimeout(controlsTimerRef.current);
        }
      }
      return next;
    });
  }, [isMobileFullscreen, startControlsTimer]);

  const lockLandscape = async () => {
    try {
      if (typeof screen !== 'undefined' && screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch {}
  };

  const unlockOrientation = () => {
    try {
      if (typeof screen !== 'undefined' && screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
      }
    } catch {}
  };

  const handleToggleCaptions = useCallback(async () => {
    const player = playerRef.current;
    const next = !isCaptionsEnabled;
    setIsCaptionsEnabled(next);

    if (!player) return;

    try {
      if (next) {
        if (typeof player.loadModule === 'function') {
          player.loadModule('captions');
        }
        if (typeof player.setOption === 'function') {
          let track = {};
          try {
            const trackList =
              typeof player.getOption === 'function' ? player.getOption('captions', 'tracklist') : [];
            if (Array.isArray(trackList) && trackList.length > 0) {
              track = trackList[0];
            }
          } catch {}
          player.setOption('captions', 'track', track);
          player.setOption('captions', 'reload', true);
        }
      } else {
        if (typeof player.setOption === 'function') {
          player.setOption('captions', 'track', {});
        }
        if (typeof player.unloadModule === 'function') {
          player.unloadModule('captions');
        }
      }
    } catch (err) {
      console.warn('[YouTube Player] Error toggling captions:', err);
    }
  }, [isCaptionsEnabled]);

  const handleEnterFullscreen = useCallback(() => {
    setIsMobileFullscreen(true);
    setIsSlideWindowOpen(true);
    setIsControlsVisible(true);
    startControlsTimer();
    if (typeof document !== 'undefined' && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    lockLandscape();
  }, [startControlsTimer]);

  const handleExitFullscreen = useCallback(() => {
    setIsMobileFullscreen(false);
    setIsSlideWindowOpen(false);
    setIsControlsVisible(true);
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    if (typeof document !== 'undefined' && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    unlockOrientation();
  }, []);

  useEffect(() => {
    return () => {
      unlockOrientation();
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isMobileFullscreen) {
        setIsMobileFullscreen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isMobileFullscreen) {
        handleExitFullscreen();
      }
      if ((e.key === 'c' || e.key === 'C') && !['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) {
        handleToggleCaptions();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileFullscreen, handleExitFullscreen, handleToggleCaptions]);

  useEffect(() => {
    if (isMobileFullscreen) {
      const origOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = origOverflow;
      };
    }
  }, [isMobileFullscreen]);

  // Handle Autoplay blocked user tap
  const handleTapToJoinPlayback = useCallback(async () => {
    setIsAutoplayBlocked(false);
    const player = playerRef.current;
    if (player) {
      try {
        await player.playVideo();
        const expected = getExpectedPosition();
        await player.seekTo(expected, true);
      } catch (err) {
        console.warn('Autoplay unlock error:', err);
      }
    }
  }, [getExpectedPosition]);

  const onReady = async (event) => {
    playerRef.current = event.target;
    setIsPlayerReady(true);
    try {
      event.target.setVolume(volume);
      const dur = await event.target.getDuration();
      setDuration(dur || 0);

      if (playerState.status === 'playing') {
        const expected = getExpectedPosition();
        await event.target.seekTo(expected, true);
        await event.target.playVideo();
      }
    } catch {
      // ignore
    }
  };

  const onStateChange = async (event) => {
    // YouTube player states: -1 = unstarted, 0 = ended, 1 = playing, 2 = paused, 3 = buffering, 5 = cued
    const state = event.data;
    const player = event.target;

    if (state === 0) {
      // Track ended: emit queue:ended with the current nowPlaying item id for de-duplicated auto-advance
      const currentNowPlaying = useAppStore.getState().nowPlaying;
      if (socket && currentNowPlaying?.id) {
        socket.emit('queue:ended', { itemId: currentNowPlaying.id });
      }
    } else if (state === 1) {
      // playing
      setIsAutoplayBlocked(false);
      const dur = await player.getDuration();
      if (dur) setDuration(dur);
    } else if (state === -1 && playerState.status === 'playing') {
      // Unstarted while server is playing indicates autoplay restriction
      setTimeout(async () => {
        try {
          const s = await player.getPlayerState();
          if (s === -1 || s === 2) {
            setIsAutoplayBlocked(true);
          }
        } catch {
          // ignore
        }
      }, 500);
    }
  };

  const onError = (e) => {
    console.warn('[YouTube Player] Error code:', e.data);
  };

  const handlePlayPause = () => {
    if (playerState.status === 'playing') {
      emitPause();
    } else {
      emitPlay();
    }
  };

  const handleSeek = (posSec) => {
    setCurrentTime(posSec);
    emitSeek(posSec);
  };

  const handleVolumeChange = (newVol) => {
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (playerRef.current) {
      playerRef.current.setVolume(newVol);
      if (newVol > 0 && isMuted) {
        playerRef.current.unMute();
      }
    }
  };

  const handleToggleMute = () => {
    if (!playerRef.current) return;
    if (isMuted) {
      playerRef.current.unMute();
      setIsMuted(false);
    } else {
      playerRef.current.mute();
      setIsMuted(true);
    }
  };

  const youtubeOpts = {
    height: '100%',
    width: '100%',
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      fs: 0,
      modestbranding: 1,
      playsinline: 1,
      rel: 0,
      iv_load_policy: 3,
      cc_load_policy: 0,
    },
  };

  return (
    <div
      ref={containerRef}
      className={
        isMobileFullscreen
          ? 'fixed inset-0 z-50 bg-black flex flex-col justify-between select-none overflow-hidden h-[100dvh] w-screen'
          : 'relative w-full flex flex-col bg-[#0B0B10] select-none rounded-2xl overflow-hidden border border-white/10 shadow-2xl'
      }
    >
      {/* Top Header Bar in Fullscreen Mode */}
      {isMobileFullscreen && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            resetControlsTimer();
          }}
          className={`absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-3 sm:p-4 bg-gradient-to-b from-black/85 via-black/50 to-transparent transition-all duration-300 pointer-events-auto ${
            isControlsVisible
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 -translate-y-4 pointer-events-none'
          }`}
        >
          {/* Track Info (Left) */}
          <div className="flex items-center gap-2 min-w-0 max-w-[50%]">
            <span className="w-2 h-2 rounded-full bg-[#FF9F1C] animate-pulse shrink-0" />
            <p className="text-xs sm:text-sm font-semibold text-white truncate">
              {nowPlaying?.title || 'Now Playing'}
            </p>
          </div>

          {/* Action Buttons (Right) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Captions Toggle Button */}
            <button
              type="button"
              onClick={() => {
                handleToggleCaptions();
                resetControlsTimer();
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold backdrop-blur-md transition-all active:scale-95 cursor-pointer ${
                isCaptionsEnabled
                  ? 'bg-[#FF9F1C]/20 border-[#FF9F1C]/50 text-[#FF9F1C]'
                  : 'bg-black/70 border-white/20 text-white/80 hover:bg-black/90 hover:text-white'
              }`}
              aria-label={isCaptionsEnabled ? 'Turn off captions' : 'Turn on captions'}
              title="Captions (c)"
            >
              <Subtitles className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold">CC</span>
            </button>

            {/* Slide Window Toggle Button */}
            <button
              type="button"
              onClick={() => {
                setIsSlideWindowOpen((prev) => !prev);
                resetControlsTimer();
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold backdrop-blur-md transition-all active:scale-95 cursor-pointer ${
                isSlideWindowOpen
                  ? 'bg-[#2EC4B6]/20 border-[#2EC4B6]/50 text-[#2EC4B6]'
                  : 'bg-black/70 border-white/20 text-white hover:bg-black/90'
              }`}
              aria-label={isSlideWindowOpen ? 'Hide lounge panel' : 'Show lounge panel'}
              title="Lounge & Reactions"
            >
              <Users className="w-3.5 h-3.5 text-[#2EC4B6]" />
              <span className="hidden sm:inline">Lounge</span>
              <span className="px-1.5 py-0.2 rounded-full bg-[#2EC4B6]/20 text-[10px] font-mono font-bold text-[#2EC4B6]">
                {Array.isArray(members) ? members.length : 1}
              </span>
              <Smile className="w-3.5 h-3.5 text-[#FF9F1C]" />
            </button>

            {/* Exit Fullscreen Button on the Right Top */}
            <button
              type="button"
              onClick={handleExitFullscreen}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/80 hover:bg-black/95 text-white border border-white/20 shadow-2xl backdrop-blur-md active:scale-95 transition-all cursor-pointer"
              aria-label="Exit full screen"
              title="Exit Full Screen"
            >
              <Minimize2 className="w-4 h-4 text-[#FF9F1C]" />
              <span className="text-xs font-semibold">Exit</span>
            </button>
          </div>
        </div>
      )}

      {/* Video Container (Aspect 16:9 on normal, full edge-to-edge on fullscreen without borders) */}
      <div
        onClick={handleVideoAreaTap}
        className={
          isMobileFullscreen
            ? 'relative w-full flex-1 bg-black overflow-hidden flex items-center justify-center p-0 min-h-0 cursor-pointer'
            : 'relative w-full aspect-video bg-[#0B0B10] overflow-hidden flex items-center justify-center'
        }
      >
        {playerState.videoId ? (
          <div
            className={
              isMobileFullscreen
                ? 'relative w-full h-full flex items-center justify-center bg-black overflow-hidden pointer-events-none'
                : 'absolute inset-0 w-full h-full pointer-events-none'
            }
          >
            <div className={isMobileFullscreen ? 'w-full h-full max-w-full max-h-full aspect-video flex items-center justify-center' : 'w-full h-full'}>
              <YouTube
                videoId={playerState.videoId}
                opts={youtubeOpts}
                onReady={onReady}
                onStateChange={onStateChange}
                onError={onError}
                className="w-full h-full"
                iframeClassName="w-full h-full border-none pointer-events-none"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="p-4 rounded-2xl bg-[#141419] border border-white/10 text-[#FF9F1C]">
              <Music className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F4F1EA]">No track playing</p>
              <p className="text-xs text-[#9A978F] mt-1">
                Search YouTube to pick a track for everyone in the room
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
              {onOpenSearch && (
                <button
                  type="button"
                  onClick={onOpenSearch}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#FF9F1C] text-[#0B0B10] hover:bg-[#ffb042] transition-colors cursor-pointer min-h-[44px]"
                  aria-label="Search YouTube to play"
                >
                  Search YouTube
                </button>
              )}
              {onOpenLocalMediaModal && (
                <button
                  type="button"
                  onClick={onOpenLocalMediaModal}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#1C1C24] text-[#F4F1EA] hover:bg-[#252530] border border-white/10 transition-colors cursor-pointer min-h-[44px] flex items-center gap-2"
                  aria-label="Share video file"
                >
                  <Film className="w-3.5 h-3.5 text-[#2EC4B6]" />
                  <span>Share Video File</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Option like YouTube on the screen for mobile full screen */}
        {!isMobileFullscreen && playerState.videoId && (
          <button
            type="button"
            onClick={handleEnterFullscreen}
            className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/75 hover:bg-black/90 text-white border border-white/20 backdrop-blur-md transition-all active:scale-95 cursor-pointer shadow-lg lg:hidden"
            aria-label="Enter mobile full screen"
            title="Full Screen"
          >
            <Maximize2 className="w-3.5 h-3.5 text-[#FF9F1C]" />
            <span className="text-[11px] font-semibold text-white/95">Full</span>
          </button>
        )}

        {/* Mobile Autoplay Policy Tap-to-Join Overlay */}
        {isAutoplayBlocked && (
          <button
            type="button"
            onClick={handleTapToJoinPlayback}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer p-4 text-center transition-all animate-fade-in"
            aria-label="Tap to join playback"
          >
            <div className="w-16 h-16 rounded-full bg-[#FF9F1C] text-[#0B0B10] flex items-center justify-center shadow-lg shadow-[#FF9F1C]/40 mb-3 animate-pulse">
              <Play className="w-8 h-8 fill-current ml-1" />
            </div>
            <span className="text-base font-bold text-[#F4F1EA]">Tap to join playback</span>
            <span className="text-xs text-[#9A978F] mt-1">Audio requires a tap to start</span>
          </button>
        )}
      </div>

      {/* Floating Slide Window (Emoji & Members Panel) in Fullscreen */}
      {isMobileFullscreen && (
        <FullscreenSlideWindow
          isOpen={isSlideWindowOpen}
          onClose={() => setIsSlideWindowOpen(false)}
          onOpen={() => {
            setIsSlideWindowOpen(true);
            resetControlsTimer();
          }}
          socket={socket}
          members={members}
          currentMemberId={memberId}
          onLocalReaction={onLocalReaction}
          isControlsVisible={isControlsVisible}
        />
      )}

      {/* Synchronized Custom Controls (Timeline bar auto-hides like YouTube) */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          resetControlsTimer();
        }}
        className={
          isMobileFullscreen
            ? `absolute bottom-0 left-0 right-0 z-50 transition-all duration-300 pointer-events-auto ${
                isControlsVisible
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-6 pointer-events-none'
              }`
            : 'w-full'
        }
      >
        <PlayerControls
          isPlaying={playerState.status === 'playing'}
          currentTime={displayTime}
          duration={duration}
          volume={volume}
          isMuted={isMuted}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
          isFullscreen={isMobileFullscreen}
          onToggleFullscreen={isMobileFullscreen ? handleExitFullscreen : handleEnterFullscreen}
          isCaptionsEnabled={isCaptionsEnabled}
          onToggleCaptions={handleToggleCaptions}
          onUserInteraction={resetControlsTimer}
          className={isMobileFullscreen ? 'bg-black/85 backdrop-blur-xl border-t border-white/10' : ''}
        />
      </div>
    </div>
  );
}

export default YouTubePlayer;

