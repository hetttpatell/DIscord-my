import React, { useState, useRef, useEffect, useCallback } from 'react';
import YouTube from 'react-youtube';
import { Play, Music } from 'lucide-react';
import { PlayerControls } from './PlayerControls';
import { useYouTubeSync } from './useYouTubeSync';
import { useAppStore } from '../../stores/useAppStore';

export function YouTubePlayer({ socket, onOpenSearch }) {
  const { playerState } = useAppStore();
  const playerRef = useRef(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);

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

    if (state === 1) {
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
    },
  };

  return (
    <div className="relative w-full flex flex-col bg-[#0B0B10] select-none rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
      {/* 16:9 Video Container */}
      <div className="relative w-full aspect-video bg-[#0B0B10] overflow-hidden flex items-center justify-center">
        {playerState.videoId ? (
          <div className="absolute inset-0 w-full h-full pointer-events-none">
            <YouTube
              videoId={playerState.videoId}
              opts={youtubeOpts}
              onReady={onReady}
              onStateChange={onStateChange}
              onError={onError}
              className="w-full h-full"
              iframeClassName="w-full h-full border-none"
            />
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
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                className="mt-2 px-4 py-2 text-xs font-semibold rounded-xl bg-[#FF9F1C] text-[#0B0B10] hover:bg-[#ffb042] transition-colors cursor-pointer min-h-[44px]"
                aria-label="Search YouTube to play"
              >
                Search YouTube
              </button>
            )}
          </div>
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

      {/* Synchronized Custom Controls */}
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
      />
    </div>
  );
}

export default YouTubePlayer;

