import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, SwitchCamera, Wifi, WifiOff, Pin, PinOff } from 'lucide-react';

export default function VideoTile({
  isLocal = false,
  peerId: _peerId,
  userName = 'Member',
  avatarColor = '#5865f2',
  stream = null,
  isMuted = false,
  isCameraOff = false,
  isSpeaking = false,
  connectionQuality = 'good',
  facingMode = 'user',
  isPinned = false,
  onTogglePin,
  onFlipCamera
}) {
  const videoRef = useRef(null);

  // Check if live video track is present
  const videoTracks = stream ? stream.getVideoTracks() : [];
  const hasLiveVideoTrack = Boolean(
    stream &&
    videoTracks.length > 0 &&
    videoTracks.some(t => t.readyState === 'live') &&
    !isCameraOff
  );

  // Bind video stream
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (stream && hasLiveVideoTrack) {
      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
      }
      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.debug('[VideoTile] Video play deferred:', err.name);
        });
      }
    } else {
      videoEl.srcObject = null;
    }
  }, [stream, hasLiveVideoTrack]);

  // Mirror local selfie camera, but not back camera or remote peers
  const shouldMirror = isLocal && facingMode === 'user';

  return (
    <div
      className={`group relative w-full h-full rounded-2xl overflow-hidden bg-[#202124] border transition-all flex items-center justify-center select-none shadow-md ${
        isSpeaking
          ? 'border-[#34a853] ring-2 ring-[#34a853]/60 shadow-lg shadow-[#34a853]/20'
          : 'border-[#3c4043]/60'
      }`}
    >
      {/* Video Element (Muted to ensure audio is routed exclusively through RemoteAudioLayer) */}
      {hasLiveVideoTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={true}
          className={`w-full h-full object-cover ${shouldMirror ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
        /* Avatar Placeholder when Camera is Off */
        <div className="flex flex-col items-center justify-center text-center p-3">
          <div
            className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-xl sm:text-2xl font-bold text-white shadow-xl mb-2 ring-2 transition-transform ${
              isSpeaking
                ? 'ring-[#34a853] scale-105'
                : isMuted
                ? 'ring-[#ea4335]'
                : 'ring-white/20'
            }`}
            style={{ backgroundColor: avatarColor || '#5865f2' }}
          >
            {userName?.charAt(0).toUpperCase() || (isLocal ? 'Y' : 'U')}
          </div>
          <span className="text-xs text-[#9aa0a6] font-medium">Camera Off</span>
        </div>
      )}

      {/* Pin / Spotlight Button */}
      {onTogglePin && (
        <button
          onClick={onTogglePin}
          className={`absolute top-2 left-2 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all z-20 active:scale-90 ${
            isPinned
              ? 'bg-[#8ab4f8] text-[#202124] shadow-md opacity-100'
              : 'bg-black/60 text-white hover:bg-black/80 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100'
          }`}
          title={isPinned ? "Unpin participant" : "Pin participant to spotlight"}
        >
          {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
        </button>
      )}

      {/* Camera Flip Button for Local User */}
      {isLocal && onFlipCamera && (
        <button
          onClick={onFlipCamera}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/80 shadow transition-transform active:scale-90 z-20"
          title="Flip Camera (Front/Back)"
          aria-label="Flip Camera"
        >
          <SwitchCamera className="w-4 h-4" />
        </button>
      )}

      {/* Bottom Info Bar: Participant Name + Mic Status + Connection Quality */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none drop-shadow z-20">
        <div className="flex items-center gap-1.5 bg-black/75 backdrop-blur-md px-2.5 py-1 rounded-lg text-xs font-medium text-white max-w-[70%]">
          {isSpeaking && (
            <span className="w-2 h-2 rounded-full bg-[#34a853] animate-ping flex-shrink-0" />
          )}
          <span className="truncate">{userName} {isLocal ? '(You)' : ''}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Connection Quality for remote peers */}
          {!isLocal && (
            <div
              className="bg-black/75 backdrop-blur-md p-1.5 rounded-lg"
              title={`Connection: ${connectionQuality}`}
            >
              {connectionQuality === 'poor' ? (
                <WifiOff className="w-3.5 h-3.5 text-[#ea4335]" />
              ) : connectionQuality === 'fair' ? (
                <Wifi className="w-3.5 h-3.5 text-[#fbbc04]" />
              ) : (
                <Wifi className="w-3.5 h-3.5 text-[#34a853]" />
              )}
            </div>
          )}

          {/* Mic Status Badge */}
          <div className={`p-1.5 rounded-lg backdrop-blur-md ${isMuted ? 'bg-[#ea4335]/90 text-white' : 'bg-black/75 text-[#34a853]'}`}>
            {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </div>
        </div>
      </div>
    </div>
  );
}
