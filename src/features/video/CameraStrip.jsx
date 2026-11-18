import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTracks, useIsSpeaking } from '@livekit/components-react';
import { Track } from 'livekit-client';
import {
  Video,
  Mic,
  MicOff,
  Maximize2,
  ChevronDown,
  GripHorizontal,
  LayoutGrid,
} from 'lucide-react';
import { useVoiceContext } from '../voice/VoiceContext';
import { useAppStore } from '../../stores/useAppStore';
import { ZoomedCameraModal } from './ZoomedCameraModal';

function CameraTile({ trackRef, onZoom, isSingle = false }) {
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
          navigator.vibrate(35);
        } catch {}
      }
      onZoom?.(trackRef);
    }, 400);
  };

  const handlePointerMove = (e) => {
    const deltaX = Math.abs(e.clientX - startPosRef.current.x);
    const deltaY = Math.abs(e.clientY - startPosRef.current.y);
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

  const handleClick = (e) => {
    if (e.target.closest('button')) return;
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
      className={`relative group rounded-2xl overflow-hidden bg-[#0B0B10] border transition-all duration-200 select-none cursor-pointer flex items-center justify-center ${
        isSingle
          ? 'w-full aspect-[4/3] sm:aspect-video min-h-[170px] sm:min-h-[220px]'
          : 'w-full aspect-[4/3] sm:aspect-video min-h-[110px] sm:min-h-[130px]'
      } ${
        isSpeaking
          ? 'border-[#2EC4B6] ring-2 ring-[#2EC4B6]/50 shadow-lg shadow-[#2EC4B6]/25'
          : 'border-white/10 hover:border-white/25 shadow-md'
      }`}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted={isLocal}
        className={`w-full h-full object-cover select-none pointer-events-none transition-transform group-hover:scale-[1.02] duration-300 ${
          isLocal ? 'scale-x-[-1]' : ''
        }`}
      />

      {/* Speaking Halo Accent Glow */}
      {isSpeaking && (
        <div className="absolute inset-0 pointer-events-none border-2 border-[#2EC4B6] rounded-2xl shadow-[inset_0_0_18px_rgba(46,196,182,0.35)] animate-pulse" />
      )}

      {/* Participant Name Badge */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
        <span className="truncate max-w-[70%] px-2 py-0.5 rounded-lg text-[10.5px] sm:text-[11px] font-bold text-white bg-black/75 backdrop-blur-md border border-white/15 leading-tight shadow-md">
          {displayName} {isLocal && '(You)'}
        </span>

        {/* Audio Mic Status Icon */}
        <div className="w-5 h-5 rounded-full bg-black/75 backdrop-blur-md flex items-center justify-center border border-white/15 shrink-0 shadow-md">
          {isMicEnabled ? (
            <Mic className={`w-2.5 h-2.5 sm:w-3 sm:h-3 ${isSpeaking ? 'text-[#2EC4B6]' : 'text-white'}`} />
          ) : (
            <MicOff className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#FF5A5F]" />
          )}
        </div>
      </div>

      {/* Speaking Live Dot */}
      {isSpeaking && (
        <span className="absolute top-2 left-2 flex h-2 w-2 pointer-events-none">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2EC4B6] opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2EC4B6]" />
        </span>
      )}

      {/* Zoom Hover/Touch Hint */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onZoom?.(trackRef);
        }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 hover:bg-black/90 backdrop-blur-sm rounded-lg p-1.5 border border-white/15 cursor-pointer text-[#FF9F1C] active:scale-95 shadow-md"
        title="Zoom Fullscreen"
        aria-label="Zoom video fullscreen"
      >
        <Maximize2 className="w-3 h-3" />
      </button>
    </div>
  );
}

function LiveKitFloatingVideoTab() {
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const [zoomedTrack, setZoomedTrack] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isWideLayout, setIsWideLayout] = useState(false);

  // Dragging state
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ pointerX: 0, pointerY: 0, posX: 0, posY: 0 });

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

  // Drag start handler for header
  const handleDragStart = (e) => {
    if (e.target.closest('button')) return;
    isDraggingRef.current = true;
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      posX: dragOffset.x,
      posY: dragOffset.y,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handleDragMove = (e) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - dragStartRef.current.pointerX;
    const deltaY = e.clientY - dragStartRef.current.pointerY;
    setDragOffset({
      x: dragStartRef.current.posX + deltaX,
      y: dragStartRef.current.posY + deltaY,
    });
  };

  const handleDragEnd = (e) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      } catch {}
    }
  };

  if (activeCameraTracks.length === 0) {
    return null;
  }

  // ==============================================================
  // 1. MINIMIZED FLOATING PILL CAPSULE
  // ==============================================================
  if (isMinimized) {
    return (
      <aside
        aria-label="Minimized video call tab"
        style={{
          transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
        }}
        className="fixed top-16 right-3 sm:top-20 sm:right-6 z-40 select-none animate-in fade-in zoom-in-95 duration-200"
      >
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#1C1C1E]/95 dark:bg-[#141418]/95 backdrop-blur-2xl border border-white/20 shadow-[0_12px_36px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.18)] hover:scale-105 active:scale-95 transition-all text-white cursor-pointer group"
          title="Expand Video Call Window"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2EC4B6] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2EC4B6]" />
          </span>
          <Video className="w-3.5 h-3.5 text-[#2EC4B6]" />
          <span className="text-xs font-bold tracking-tight">
            Video Call ({activeCameraTracks.length})
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-white/50 group-hover:text-white transition-colors rotate-180" />
        </button>
      </aside>
    );
  }

  // ==============================================================
  // 2. EXPANDED FLOATING VIDEO CALL WINDOW / TAB
  // ==============================================================
  return (
    <>
      <aside
        aria-label="Floating video call window"
        style={{
          transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
        }}
        className={`fixed top-16 right-3 sm:top-20 sm:right-6 z-40 select-none animate-in fade-in zoom-in-95 duration-200 ${
          isWideLayout && activeCameraTracks.length > 1
            ? 'w-[calc(100vw-1.5rem)] sm:w-[540px]'
            : 'w-[calc(100vw-1.5rem)] max-w-sm sm:max-w-none sm:w-[380px]'
        }`}
      >
        <div className="rounded-3xl bg-[#141418]/95 backdrop-blur-3xl border border-white/15 shadow-[0_24px_64px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.16)] overflow-hidden flex flex-col">
          {/* Draggable Header Bar */}
          <div
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
            onDoubleClick={() => setDragOffset({ x: 0, y: 0 })}
            className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/10 bg-white/[0.04] cursor-grab active:cursor-grabbing touch-none"
          >
            {/* Left: Live Status & Participant Count */}
            <div className="flex items-center gap-2 min-w-0">
              <GripHorizontal className="w-3.5 h-3.5 text-white/40 shrink-0" />
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2EC4B6] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2EC4B6]" />
              </span>
              <span className="font-bold text-xs text-white tracking-tight shrink-0">
                Live Video
              </span>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-[#2EC4B6]/20 text-[#2EC4B6] border border-[#2EC4B6]/30 shrink-0">
                {activeCameraTracks.length}
              </span>
            </div>

            {/* Right: Controls (Layout Toggle, Minimize) */}
            <div className="flex items-center gap-1 shrink-0">
              {activeCameraTracks.length > 1 && (
                <button
                  type="button"
                  onClick={() => setIsWideLayout((prev) => !prev)}
                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                    isWideLayout
                      ? 'bg-white/20 border-white/30 text-white'
                      : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                  title={isWideLayout ? 'Compact view' : 'Wide view'}
                  aria-label="Toggle video layout"
                >
                  <LayoutGrid className="w-3 h-3" />
                </button>
              )}

              {/* Minimize to Floating Capsule */}
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-white/70 hover:text-white transition-all cursor-pointer active:scale-95"
                title="Minimize video window"
                aria-label="Minimize video call tab"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Video Grid Stage */}
          <div className="p-2 sm:p-2.5 max-h-[68vh] overflow-y-auto custom-scrollbar">
            <div
              className={`grid gap-2 ${
                activeCameraTracks.length === 1
                  ? 'grid-cols-1'
                  : activeCameraTracks.length === 2 && !isWideLayout
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : 'grid-cols-2'
              }`}
            >
              {activeCameraTracks.map((trackRef) => (
                <CameraTile
                  key={trackRef.publication?.trackSid || trackRef.participant?.identity}
                  trackRef={trackRef}
                  isSingle={activeCameraTracks.length === 1}
                  onZoom={(t) => setZoomedTrack(t)}
                />
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Fullscreen Zoomed Lightbox Modal */}
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
  return <LiveKitFloatingVideoTab />;
}

export { CameraStrip as FloatingVideoTab };
export default CameraStrip;
