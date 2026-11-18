import React, { useEffect, useRef } from 'react';
import { useIsSpeaking } from '@livekit/components-react';
import { X, Mic, MicOff, Maximize2 } from 'lucide-react';

function ZoomedParticipantCard({ trackRef, onClose }) {
  const videoRef = useRef(null);
  const participant = trackRef?.participant;
  const isLocal = Boolean(participant?.isLocal);
  const displayName = participant?.name || 'Anonymous';
  const isSpeaking = useIsSpeaking(participant);
  const isMicEnabled = Boolean(participant?.isMicrophoneEnabled);

  const track = trackRef?.publication?.track;

  // Attach LiveKit Video Track to the video element
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !track) return;

    try {
      track.attach(el);
      el.play().catch(() => {});
    } catch (err) {
      console.warn('[ZoomedCameraModal] Error attaching video track:', err);
    }

    return () => {
      try {
        track.detach(el);
      } catch {}
    };
  }, [track]);

  // Handle Escape key to exit modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Zoomed video for ${displayName}`}
      onPointerDown={() => onClose?.()}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-xl select-none animate-in fade-in duration-200 cursor-pointer"
    >
      {/* Floating Zoomed Video Card - Tap anywhere exits modal */}
      <div
        className="relative w-full max-w-2xl aspect-[4/3] sm:aspect-video rounded-3xl overflow-hidden border border-white/20 shadow-2xl bg-[#141419] flex items-center justify-center animate-in zoom-in-95 duration-200 cursor-pointer"
        onPointerDown={() => onClose?.()}
      >
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted={isLocal}
          className={`w-full h-full object-cover select-none pointer-events-none ${
            isLocal ? 'scale-x-[-1]' : ''
          }`}
        />

        {/* Top Info Bar */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
          {/* Participant Name Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-[#141419]/90 backdrop-blur-md border border-white/15 text-white shadow-xl">
            <span
              className={`w-2 h-2 rounded-full ${
                isSpeaking ? 'bg-[#2EC4B6] animate-ping' : 'bg-[#FF9F1C]'
              }`}
            />
            <span className="text-xs sm:text-sm font-extrabold tracking-tight">
              {displayName} {isLocal && '(You)'}
            </span>
            {isSpeaking && (
              <span className="text-[10px] text-[#2EC4B6] font-bold bg-[#2EC4B6]/20 px-1.5 py-0.5 rounded-md leading-none">
                Speaking
              </span>
            )}
          </div>

          {/* Dismiss Hint Button */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-[#141419]/90 backdrop-blur-md border border-white/15 text-[#9A978F] text-[11px] font-semibold shadow-xl">
            <span>Tap anywhere to exit</span>
            <X className="w-3.5 h-3.5 text-[#FF5A5F]" />
          </div>
        </div>

        {/* Bottom Status Info */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-[11px] text-[#F4F1EA]">
            {isMicEnabled ? (
              <>
                <Mic className="w-3.5 h-3.5 text-[#2EC4B6]" />
                <span>Mic On</span>
              </>
            ) : (
              <>
                <MicOff className="w-3.5 h-3.5 text-[#FF5A5F]" />
                <span>Muted</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-[10px] text-[#9A978F] font-mono">
            <Maximize2 className="w-3 h-3 text-[#FF9F1C]" />
            <span>HD Live</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ZoomedCameraModal({ trackRef, onClose }) {
  if (!trackRef?.participant) return null;
  return <ZoomedParticipantCard trackRef={trackRef} onClose={onClose} />;
}

export default ZoomedCameraModal;

