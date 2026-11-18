import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRoomContext, useTracks, VideoTrack } from '@livekit/components-react';
import { Track, LocalVideoTrack, LocalAudioTrack } from 'livekit-client';
import { Film, Radio, StopCircle, Maximize2, Minimize2, Users, Smile } from 'lucide-react';
import { PlayerControls } from '../player/PlayerControls';
import { FullscreenSlideWindow } from '../player/FullscreenSlideWindow';
import { useAppStore } from '../../stores/useAppStore';
import { Button } from '../../components/Button';

export function SharedMediaPlayer({
  socket,
  localMediaFile,
  onStopSharing,
  onLocalReaction,
}) {
  const { memberId, members, mediaState } = useAppStore();
  const room = useRoomContext();
  const isSharer = memberId === mediaState?.sharerId;

  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const publishedVideoTrackRef = useRef(null);
  const publishedAudioTrackRef = useRef(null);

  const localVideoUrl = useMemo(() => {
    if (isSharer && localMediaFile) {
      return URL.createObjectURL(localMediaFile);
    }
    return null;
  }, [isSharer, localMediaFile]);

  useEffect(() => {
    return () => {
      if (localVideoUrl) {
        URL.revokeObjectURL(localVideoUrl);
      }
    };
  }, [localVideoUrl]);

  const [duration, setDuration] = useState(mediaState?.durationSec || 0);
  const [currentTime, setCurrentTime] = useState(mediaState?.positionSec || 0);
  const [isPlaying, setIsPlaying] = useState(mediaState?.status === 'playing');
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);

  // Fullscreen & Auto-hide states
  const [isMobileFullscreen, setIsMobileFullscreen] = useState(false);
  const [isSlideWindowOpen, setIsSlideWindowOpen] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const controlsTimerRef = useRef(null);

  // LiveKit ScreenShare tracks for viewers
  const screenShareTracks = useTracks([Track.Source.ScreenShare]);
  const remoteTrackRef = screenShareTracks.find(
    (t) => t.participant?.identity === mediaState?.sharerId || t.source === Track.Source.ScreenShare
  );

  // 2. Sharer: Publish video & audio tracks to LiveKit room
  useEffect(() => {
    if (!isSharer || !room?.localParticipant) return;

    let isCancelled = false;

    const publishMediaStream = async () => {
      const video = videoRef.current;
      if (!video) return;

      try {
        const stream = video.captureStream
          ? video.captureStream()
          : video.mozCaptureStream
          ? video.mozCaptureStream()
          : null;

        if (!stream) {
          console.warn('[SharedMedia] captureStream not supported in this browser.');
          return;
        }

        const videoMediaTrack = stream.getVideoTracks()[0];
        const audioMediaTrack = stream.getAudioTracks()[0];

        if (videoMediaTrack && !isCancelled) {
          const lkVideo = new LocalVideoTrack(videoMediaTrack, { name: 'shared-video' });
          publishedVideoTrackRef.current = lkVideo;
          await room.localParticipant.publishTrack(lkVideo, {
            source: Track.Source.ScreenShare,
          });
        }

        if (audioMediaTrack && !isCancelled) {
          const lkAudio = new LocalAudioTrack(audioMediaTrack, { name: 'shared-audio' });
          publishedAudioTrackRef.current = lkAudio;
          await room.localParticipant.publishTrack(lkAudio, {
            source: Track.Source.ScreenShareAudio,
          });
        }
      } catch (err) {
        console.warn('[SharedMedia] Error publishing media tracks:', err);
      }
    };

    const handleLoadedMetadata = () => {
      if (videoRef.current) {
        const dur = videoRef.current.duration || 0;
        setDuration(dur);
        if (socket) {
          socket.emit('media:start', {
            fileName: localMediaFile?.name || 'Local Video',
            durationSec: dur,
          });
        }
        publishMediaStream();
        videoRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    };

    const videoEl = videoRef.current;
    if (videoEl) {
      if (videoEl.readyState >= 1) {
        handleLoadedMetadata();
      } else {
        videoEl.addEventListener('loadedmetadata', handleLoadedMetadata);
      }
    }

    return () => {
      isCancelled = true;
      if (videoEl) {
        videoEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
      }
      if (publishedVideoTrackRef.current && room?.localParticipant) {
        try {
          room.localParticipant.unpublishTrack(publishedVideoTrackRef.current);
          publishedVideoTrackRef.current.stop();
        } catch {}
        publishedVideoTrackRef.current = null;
      }
      if (publishedAudioTrackRef.current && room?.localParticipant) {
        try {
          room.localParticipant.unpublishTrack(publishedAudioTrackRef.current);
          publishedAudioTrackRef.current.stop();
        } catch {}
        publishedAudioTrackRef.current = null;
      }
    };
  }, [isSharer, room, localMediaFile, socket]);

  // 3. Sync time for sharer locally
  useEffect(() => {
    if (!isSharer || !isPlaying) return;

    const interval = setInterval(() => {
      if (videoRef.current) {
        setCurrentTime(videoRef.current.currentTime || 0);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isSharer, isPlaying]);

  // 4. Listen to media:control socket events
  useEffect(() => {
    if (!socket) return;

    const handleControl = (data) => {
      if (!data) return;

      if (isSharer && videoRef.current) {
        if (data.action === 'play') {
          videoRef.current.play().catch(() => {});
          setIsPlaying(true);
        } else if (data.action === 'pause') {
          videoRef.current.pause();
          setIsPlaying(false);
        } else if (data.action === 'seek' && data.positionSec !== undefined) {
          videoRef.current.currentTime = data.positionSec;
          setCurrentTime(data.positionSec);
        }
      } else {
        // Viewer timeline sync
        if (data.action === 'play') setIsPlaying(true);
        if (data.action === 'pause') setIsPlaying(false);
        if (data.positionSec !== undefined) setCurrentTime(data.positionSec);
      }
    };

    const handleMediaState = (state) => {
      if (!state) return;
      if (state.durationSec) setDuration(state.durationSec);
      if (state.positionSec !== undefined && !isSharer) setCurrentTime(state.positionSec);
      if (state.status) setIsPlaying(state.status === 'playing');
    };

    socket.on('media:control', handleControl);
    socket.on('media:state', handleMediaState);

    return () => {
      socket.off('media:control', handleControl);
      socket.off('media:state', handleMediaState);
    };
  }, [socket, isSharer]);

  // 5. Controls & Actions
  const handlePlayPause = () => {
    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);

    if (isSharer && videoRef.current) {
      if (nextPlaying) videoRef.current.play().catch(() => {});
      else videoRef.current.pause();
    }

    if (socket) {
      socket.emit('media:control', {
        action: nextPlaying ? 'play' : 'pause',
        positionSec: isSharer && videoRef.current ? videoRef.current.currentTime : currentTime,
      });
    }
  };

  const handleSeek = (posSec) => {
    setCurrentTime(posSec);
    if (isSharer && videoRef.current) {
      videoRef.current.currentTime = posSec;
    }
    if (socket) {
      socket.emit('media:control', {
        action: 'seek',
        positionSec: posSec,
      });
    }
  };

  const handleVolumeChange = (newVol) => {
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (videoRef.current) {
      videoRef.current.volume = newVol / 100;
      videoRef.current.muted = newVol === 0;
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
    }
  };

  const handleStop = () => {
    if (socket) {
      socket.emit('media:stop');
    }
    onStopSharing?.();
  };

  // Fullscreen & Auto-hide
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
      if (next) startControlsTimer();
      else if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      return next;
    });
  }, [isMobileFullscreen, startControlsTimer]);

  const handleEnterFullscreen = useCallback(() => {
    setIsMobileFullscreen(true);
    setIsSlideWindowOpen(true);
    setIsControlsVisible(true);
    startControlsTimer();
    if (typeof document !== 'undefined' && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    try {
      if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {});
    } catch {}
  }, [startControlsTimer]);

  const handleExitFullscreen = useCallback(() => {
    setIsMobileFullscreen(false);
    setIsSlideWindowOpen(false);
    setIsControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (typeof document !== 'undefined' && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    try {
      if (screen.orientation?.unlock) screen.orientation.unlock();
    } catch {}
  }, []);

  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      try {
        if (screen.orientation?.unlock) screen.orientation.unlock();
      } catch {}
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={
        isMobileFullscreen
          ? 'fixed inset-0 z-50 bg-[#0B0B10] flex flex-col justify-between select-none overflow-hidden h-[100dvh] w-screen'
          : 'relative w-full flex flex-col bg-[#0B0B10] select-none rounded-2xl overflow-hidden border border-white/10 shadow-2xl'
      }
    >
      {/* Top Header Bar */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          resetControlsTimer();
        }}
        className={
          isMobileFullscreen
            ? `absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-3 sm:p-4 bg-gradient-to-b from-black/85 via-black/50 to-transparent transition-all duration-300 pointer-events-auto ${
                isControlsVisible
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 -translate-y-4 pointer-events-none'
              }`
            : 'w-full bg-[#141419]/90 border-b border-white/10 px-4 py-2.5 backdrop-blur-md flex items-center justify-between'
        }
      >
        <div className="flex items-center gap-2 min-w-0 max-w-[60%]">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#FF5A5F]/20 border border-[#FF5A5F]/30 text-[#FF5A5F] text-[10px] font-bold uppercase tracking-wider shrink-0 animate-pulse">
            <Radio className="w-3 h-3" />
            <span>Watchparty</span>
          </div>
          <p className="text-xs font-semibold text-white truncate">
            {mediaState?.fileName || 'Local Video'}
          </p>
          <span className="text-[11px] text-[#9A978F] hidden sm:inline truncate">
            • by {isSharer ? 'You' : mediaState?.sharerName || 'Room Member'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Lounge Toggle Button in Fullscreen */}
          {isMobileFullscreen && (
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
              title="Lounge & Reactions"
            >
              <Users className="w-3.5 h-3.5 text-[#2EC4B6]" />
              <span className="hidden sm:inline">Lounge</span>
              <span className="px-1.5 py-0.2 rounded-full bg-[#2EC4B6]/20 text-[10px] font-mono font-bold text-[#2EC4B6]">
                {Array.isArray(members) ? members.length : 1}
              </span>
              <Smile className="w-3.5 h-3.5 text-[#FF9F1C]" />
            </button>
          )}

          {/* Stop Sharing Button (Sharer Only) */}
          {isSharer && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleStop}
              className="h-8 px-2.5 text-xs font-bold gap-1.5 rounded-lg"
              aria-label="Stop sharing video"
            >
              <StopCircle className="w-3.5 h-3.5" />
              <span>Stop Sharing</span>
            </Button>
          )}

          {/* Fullscreen Exit on Mobile Fullscreen */}
          {isMobileFullscreen && (
            <button
              type="button"
              onClick={handleExitFullscreen}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/80 hover:bg-black/95 text-white border border-white/20 shadow-2xl backdrop-blur-md active:scale-95 transition-all cursor-pointer"
              title="Exit Full Screen"
            >
              <Minimize2 className="w-4 h-4 text-[#FF9F1C]" />
              <span className="text-xs font-semibold">Exit</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Video Frame */}
      <div
        onClick={handleVideoAreaTap}
        className={
          isMobileFullscreen
            ? 'relative w-full flex-1 bg-[#0B0B10] overflow-hidden flex items-center justify-center p-2 sm:p-4 min-h-0 cursor-pointer'
            : 'relative w-full aspect-video bg-[#0B0B10] overflow-hidden flex items-center justify-center'
        }
      >
        {isSharer ? (
          /* Sharer's Local Video Stream */
          <div
            className={
              isMobileFullscreen
                ? 'relative w-full max-w-4xl max-h-[76vh] aspect-video rounded-2xl overflow-hidden shadow-2xl bg-black border border-white/10 flex items-center justify-center'
                : 'w-full h-full flex items-center justify-center'
            }
          >
            <video
              ref={videoRef}
              src={localVideoUrl}
              playsInline
              className="w-full h-full object-contain pointer-events-none"
            />
          </div>
        ) : remoteTrackRef ? (
          /* Viewer's Incoming LiveKit VideoTrack */
          <div
            className={
              isMobileFullscreen
                ? 'relative w-full max-w-4xl max-h-[76vh] aspect-video rounded-2xl overflow-hidden shadow-2xl bg-black border border-white/10 flex items-center justify-center'
                : 'w-full h-full flex items-center justify-center'
            }
          >
            <VideoTrack
              trackRef={remoteTrackRef}
              className="w-full h-full object-contain pointer-events-none"
            />
          </div>
        ) : (
          /* Connecting / Waiting State for Viewers */
          <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#FF9F1C]/15 border border-[#FF9F1C]/30 flex items-center justify-center text-[#FF9F1C] animate-pulse">
              <Film className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F4F1EA]">
                Connecting to {mediaState?.sharerName || 'room member'}&apos;s stream...
              </p>
              <p className="text-xs text-[#9A978F] mt-1">
                Streaming {mediaState?.fileName || 'shared video'} in real time via WebRTC
              </p>
            </div>
          </div>
        )}

        {/* Mobile Fullscreen trigger button on video */}
        {!isMobileFullscreen && (
          <button
            type="button"
            onClick={handleEnterFullscreen}
            className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/75 hover:bg-black/90 text-white border border-white/20 backdrop-blur-md transition-all active:scale-95 cursor-pointer shadow-lg lg:hidden"
            title="Full Screen"
          >
            <Maximize2 className="w-3.5 h-3.5 text-[#FF9F1C]" />
            <span className="text-[11px] font-semibold text-white/95">Full</span>
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

      {/* Synchronized Custom Controls */}
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
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          isMuted={isMuted}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
          isFullscreen={isMobileFullscreen}
          onToggleFullscreen={isMobileFullscreen ? handleExitFullscreen : handleEnterFullscreen}
          onUserInteraction={resetControlsTimer}
          className={isMobileFullscreen ? 'bg-black/85 backdrop-blur-xl border-t border-white/10' : ''}
        />
      </div>
    </div>
  );
}

export default SharedMediaPlayer;
