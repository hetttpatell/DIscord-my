import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTracks, useIsSpeaking } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Mic, MicOff, Maximize2 } from 'lucide-react';
import { useVoiceContext } from '../voice/VoiceContext';
import { useAppStore } from '../../stores/useAppStore';
import { ZoomedCameraModal } from './ZoomedCameraModal';

function CameraTile({ trackRef, onZoom }) {
  const videoRef = useRef(null);
  const timerRef = useRef(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const isLongPressRef = useRef(false);

  const participant = trackRef?.participant;
  const isLocal = Boolean(participant?.isLocal);
  const displayName = participant?.name || 'Anonymous';
  const isSpeaking = useIsSpeaking(participant);
  const isMicEnabled = Boolean(participant?.isMicrophoneEnabled);
  const track = trackRef?.publication?.track;

  // Attach LiveKit Video Track
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !track) return;

    try {
      track.attach(el);
      el.play().catch(() => {});
    } catch (err) {
      console.warn('[CameraTile] Track attach error:', err);
    }

    return () => {
      try {
        track.detach(el);
      } catch {}
    };
  }, [track]);

  // Long-press detection handler (>= 400ms)
  const handlePointerDown = (e) => {
    isLongPressRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(40);
        } catch {}
      }
      onZoom?.(trackRef);
    }, 400);
  };

  const handlePointerMove = (e) => {
    const deltaX = Math.abs(e.clientX - startPosRef.current.x);
    const deltaY = Math.abs(e.clientY - startPosRef.current.y);
    // If finger moves more than 8px, cancel long-press (user is scrolling)
    if (deltaX > 8 || deltaY > 8) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handlePointerUp = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleClick = () => {
    // On desktop pointer fine / mouse click, also allow click-to-zoom
    if (typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches) {
      if (!isLongPressRef.current) {
        onZoom?.(trackRef);
      }
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Live video of ${displayName}. Hold or click to zoom.`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onZoom?.(trackRef);
        }
      }}
      className={`relative group shrink-0 w-28 h-20 sm:w-36 sm:h-24 rounded-2xl overflow-hidden bg-[#0B0B10] border transition-all duration-200 select-none cursor-pointer ${
        isSpeaking
          ? 'border-[#2EC4B6] ring-2 ring-[#2EC4B6]/50 shadow-lg shadow-[#2EC4B6]/20'
          : 'border-white/10 hover:border-white/30 shadow-md'
      }`}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted={isLocal}
        className={`w-full h-full object-cover select-none pointer-events-none transition-transform group-hover:scale-105 duration-300 ${
          isLocal ? 'scale-x-[-1]' : ''
        }`}
      />

      {/* Participant Name Badge */}
      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
        <span className="truncate max-w-[70%] px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white bg-black/70 backdrop-blur-md border border-white/10 leading-tight">
          {displayName} {isLocal && '(You)'}
        </span>

        {/* Audio Mic Status Icon */}
        <div className="w-4 h-4 rounded-full bg-black/70 backdrop-blur-md flex items-center justify-center border border-white/10 shrink-0">
          {isMicEnabled ? (
            <Mic className={`w-2.5 h-2.5 ${isSpeaking ? 'text-[#2EC4B6]' : 'text-white'}`} />
          ) : (
            <MicOff className="w-2.5 h-2.5 text-[#FF5A5F]" />
          )}
        </div>
      </div>

      {/* Speaking Ping Indicator */}
      {isSpeaking && (
        <span className="absolute top-1.5 left-1.5 flex h-2 w-2 pointer-events-none">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2EC4B6] opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2EC4B6]" />
        </span>
      )}

      {/* Zoom Hover/Touch Hint */}
      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 backdrop-blur-sm rounded-md p-1 border border-white/10 pointer-events-none">
        <Maximize2 className="w-2.5 h-2.5 text-[#FF9F1C]" />
      </div>
    </div>
  );
}

function LiveKitCameraStrip() {
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const [zoomedTrack, setZoomedTrack] = useState(null);

  // Filter active, published, and unmuted camera tracks
  const activeCameraTracks = tracks.filter((t) => {
    const isCamera = t.source === Track.Source.Camera;
    const isUnmuted = !t.publication?.isMuted;
    const hasTrack = Boolean(t.publication?.track);
    return isCamera && isUnmuted && hasTrack;
  });

  const handleCloseZoom = useCallback(() => {
    setZoomedTrack(null);
  }, []);

  if (activeCameraTracks.length === 0) {
    return null;
  }

  return (
    <>
      {/* Floating / Docked Live Camera Strip (Desktop & Mobile Consistent) */}
      <aside
        aria-label="Active participant cameras"
        className="fixed bottom-[6.5rem] sm:bottom-24 left-1/2 -translate-x-1/2 z-20 max-w-[96vw] sm:max-w-4xl px-2 select-none animate-in fade-in slide-in-from-bottom-2 duration-300"
      >
        <div className="flex items-center gap-2 sm:gap-2.5 p-1.5 sm:p-2 rounded-3xl bg-[#141419]/90 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/80">
          {/* Header Badge */}
          <div className="hidden xs:flex flex-col items-center justify-center px-2 py-1 text-center shrink-0">
            <div className="flex items-center gap-1 text-[10px] sm:text-xs font-extrabold text-[#2EC4B6] uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2EC4B6] animate-pulse" />
              <span>Live</span>
            </div>
            <span className="text-[9px] text-[#9A978F] font-mono leading-none">
              {activeCameraTracks.length} on cam
            </span>
          </div>

          {/* Scrollable Tiles Filmstrip */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 max-w-full">
            {activeCameraTracks.map((trackRef) => (
              <CameraTile
                key={trackRef.publication?.trackSid || trackRef.participant?.identity}
                trackRef={trackRef}
                onZoom={(t) => setZoomedTrack(t)}
              />
            ))}
          </div>
        </div>
      </aside>

      {/* Long-Hold Floating Zoomed Lightbox Modal */}
      {zoomedTrack && (
        <ZoomedCameraModal
          trackRef={zoomedTrack}
          onClose={handleCloseZoom}
        />
      )}
    </>
  );
}

export function CameraStrip({ isHidden = false }) {
  const { isLiveKitActive } = useVoiceContext();
  const isFullscreen = useAppStore((s) => s.isFullscreen);

  if (!isLiveKitActive || isFullscreen || isHidden) {
    return null;
  }
  return <LiveKitCameraStrip />;
}

export default CameraStrip;
