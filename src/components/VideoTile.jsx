import React, { memo, useEffect, useRef } from 'react';
import { MicOff, SwitchCamera, Wifi, WifiOff, Pin, PinOff, ScreenShare } from 'lucide-react';
import { normalizeQuality } from '../state/participantsStore.js';

const AVATAR_PALETTE = [
  '#1a73e8', // Google Blue
  '#ea4335', // Google Red
  '#34a853', // Google Green
  '#f9ab00', // Amber/Yellow
  '#9334e6', // Purple
  '#12b5cb', // Teal
  '#fa7b17', // Orange
  '#e91e63', // Pink
  '#5865f2', // Discord Blurple
  '#00897b', // Dark Teal
  '#3949ab', // Indigo
  '#7cb342'  // Light Green
];

function getDeterministicColor(id = '') {
  const str = String(id || 'default');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
}

function getInitials(name = '') {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * VideoTile Component
 * Redesigned for modern video meetings in the style of Google Meet.
 *
 * Features:
 * - Rounded 8px tile (rounded-[8px])
 * - object-fit cover for cameras, contain for screen shares
 * - Mirrored local camera
 * - Name label bottom-left with microphone-off icon
 * - Animated 3-bar speaking indicator on name chip + subtle green ring
 * - Pin/unpin button on hover (always visible on touch devices)
 * - Connection-quality indicator shown ONLY for 'medium' and 'poor'
 * - Raised-hand badge
 * - Camera-off state: centered avatar with initials on deterministic color, never black
 * - React.memo'd to prevent unrelated grid re-renders
 * - Video element: autoPlay, playsInline, muted, loadedmetadata play retry
 * - "Presenting" labels on screen-share tiles
 * - Respects prefers-reduced-motion
 */
function VideoTileComponent({
  participant,
  isLocal: propIsLocal,
  peerId: propPeerId,
  id: propId,
  userName: propUserName,
  avatarColor: propAvatarColor,
  stream: propStream,
  isMuted: propIsMuted,
  isCameraOff: propIsCameraOff,
  audioEnabled: propAudioEnabled,
  videoEnabled: propVideoEnabled,
  isSpeaking: propIsSpeaking,
  isActiveSpeaker: propIsActiveSpeaker,
  isScreenShare: propIsScreenShare,
  kind: propKind,
  connectionQuality: propConnectionQuality,
  handRaisedAt: propHandRaisedAt,
  isHandRaised: propIsHandRaised,
  facingMode: propFacingMode = 'user',
  isPinned = false,
  onTogglePin,
  onFlipCamera,
  className = '',
  style = undefined
}) {
  const videoRef = useRef(null);

  // Normalize inputs across store participant records and legacy individual props
  const id = participant?.id || propPeerId || propId || (participant?.isLocal ? 'local' : 'unknown');
  const isLocal = participant?.isLocal !== undefined ? participant.isLocal : Boolean(propIsLocal);
  const userName = participant?.name || propUserName || (isLocal ? 'You' : 'Member');
  const stream = participant?.stream || propStream || null;

  const effectiveAudioEnabled = participant?.audioEnabled !== undefined
    ? participant.audioEnabled
    : (propAudioEnabled !== undefined ? propAudioEnabled : (propIsMuted !== undefined ? !propIsMuted : true));

  const effectiveVideoEnabled = participant?.videoEnabled !== undefined
    ? participant.videoEnabled
    : (propVideoEnabled !== undefined ? propVideoEnabled : (propIsCameraOff !== undefined ? !propIsCameraOff : true));

  const isScreenShare = Boolean(
    participant?.isScreenSharing ||
    propIsScreenShare ||
    propKind === 'screen' ||
    participant?.kind === 'screen'
  );

  const connectionQuality = participant?.connectionQuality || propConnectionQuality || 'good';
  const effectiveQuality = normalizeQuality(connectionQuality);

  const effectiveHandRaised = Boolean(
    participant?.handRaisedAt ||
    propHandRaisedAt ||
    propIsHandRaised
  );

  const effectiveIsSpeaking = Boolean(
    participant?.isSpeaking ||
    propIsSpeaking ||
    propIsActiveSpeaker
  );

  // Derive mute & live video from track if stream exists
  const audioTracks = stream ? stream.getAudioTracks() : [];
  const primaryAudioTrack = audioTracks[0] || null;
  const effectiveIsMuted = primaryAudioTrack
    ? !(primaryAudioTrack.readyState === 'live' && primaryAudioTrack.enabled)
    : !effectiveAudioEnabled;

  const videoTracks = stream ? stream.getVideoTracks() : [];
  const primaryVideoTrack = videoTracks[0] || null;
  const hasLiveVideoTrack = primaryVideoTrack
    ? (primaryVideoTrack.readyState === 'live' && !primaryVideoTrack.muted && primaryVideoTrack.enabled)
    : effectiveVideoEnabled;

  // Bind video element & retry play on loadedmetadata
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (stream && hasLiveVideoTrack) {
      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
      }
      const tryPlay = () => {
        const playPromise = videoEl.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {});
        }
      };
      tryPlay();
      videoEl.addEventListener('loadedmetadata', tryPlay);
      return () => {
        videoEl.removeEventListener('loadedmetadata', tryPlay);
      };
    } else {
      videoEl.srcObject = null;
    }
  }, [stream, hasLiveVideoTrack]);

  // Mirror local selfie camera, but not screen shares or back camera
  const shouldMirror = isLocal && !isScreenShare && propFacingMode === 'user';

  // Deterministic avatar color and initials for camera-off state
  const deterministicBgColor = propAvatarColor || getDeterministicColor(id || userName);
  const initials = getInitials(userName);

  return (
    <div
      className={`group relative w-full h-full rounded-[8px] overflow-hidden bg-[#202124] transition-all duration-200 flex items-center justify-center select-none shadow-md ${
        effectiveIsSpeaking
          ? 'ring-2 ring-[#34a853] shadow-lg shadow-[#34a853]/25'
          : 'border border-[#3c4043]/50'
      } ${className}`}
      style={style}
    >
      {/* 1. Video Element (Muted: all audio routes through RemoteAudioLayer) */}
      {hasLiveVideoTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={true}
          className={`w-full h-full ${
            isScreenShare ? 'object-contain bg-black' : 'object-cover'
          } ${shouldMirror ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
        /* 2. Deterministic Initials Avatar when Camera is Off (Never a black tile) */
        <div className="flex flex-col items-center justify-center text-center p-3 select-none">
          <div
            className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-xl sm:text-2xl font-bold text-white shadow-xl transition-transform duration-200 ${
              effectiveIsSpeaking
                ? 'ring-4 ring-[#34a853] scale-105 motion-reduce:scale-100'
                : 'ring-2 ring-white/15'
            }`}
            style={{ backgroundColor: deterministicBgColor }}
          >
            {initials}
          </div>
          <span className="text-xs text-[#9aa0a6] font-medium mt-2">Camera off</span>
        </div>
      )}

      {/* 3. Screen Share "Presenting" Badge */}
      {isScreenShare && (
        <div className={`absolute ${effectiveHandRaised ? 'top-10' : 'top-2'} left-2 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/80 backdrop-blur-md border border-[#8ab4f8]/40 text-[#8ab4f8] text-xs font-semibold shadow-md`}>
          <ScreenShare className="w-3.5 h-3.5" />
          <span>{isLocal ? 'You are presenting' : `${userName} is presenting`}</span>
        </div>
      )}

      {/* 4. Raised Hand Badge */}
      {effectiveHandRaised && (
        <div className="absolute top-2 left-2 z-20 flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#fbbc04] text-[#202124] text-xs font-bold shadow-lg animate-bounce motion-reduce:animate-none">
          <span>✋</span>
          <span className="text-[11px] font-semibold hidden sm:inline">Hand raised</span>
        </div>
      )}

      {/* 5. Pin / Unpin Button (Always visible on touch, hover on desktop) */}
      {onTogglePin && (
        <button
          type="button"
          onClick={onTogglePin}
          className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all z-20 active:scale-95 ${
            isPinned
              ? 'bg-[#8ab4f8] text-[#202124] shadow-md opacity-100'
              : 'bg-black/60 text-white hover:bg-black/80 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100'
          }`}
          title={isPinned ? 'Unpin participant' : 'Pin participant to spotlight'}
          aria-label={isPinned ? 'Unpin participant' : 'Pin participant to spotlight'}
        >
          {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
        </button>
      )}

      {/* 6. Local Camera Flip Button on Mobile */}
      {isLocal && onFlipCamera && !isScreenShare && (
        <button
          type="button"
          onClick={onFlipCamera}
          className="absolute top-2 right-11 w-8 h-8 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/80 shadow transition-transform active:scale-90 z-20 sm:hidden"
          title="Flip Camera (Front/Back)"
          aria-label="Flip Camera"
        >
          <SwitchCamera className="w-4 h-4" />
        </button>
      )}

      {/* 7. Bottom-Left Name Label Chip with Mute & Animated Speaking Indicator */}
      <div className="absolute bottom-2 left-2 max-w-[calc(100%-4rem)] z-20 flex items-center gap-1.5 pointer-events-none drop-shadow">
        <div className="flex items-center gap-1.5 bg-black/75 backdrop-blur-md px-2.5 py-1 rounded-[6px] text-xs font-medium text-white truncate border border-white/10 shadow-sm">
          {/* Animated 3-Bar Speaking Indicator on Name Chip */}
          {effectiveIsSpeaking && (
            <span className="flex items-center gap-0.5 h-3 px-0.5 shrink-0" aria-label="Speaking" title="Speaking">
              <span className="w-0.5 h-2 bg-[#34a853] rounded-full animate-pulse motion-reduce:animate-none" />
              <span className="w-0.5 h-3 bg-[#34a853] rounded-full animate-bounce motion-reduce:animate-none" style={{ animationDelay: '150ms' }} />
              <span className="w-0.5 h-1.5 bg-[#34a853] rounded-full animate-pulse motion-reduce:animate-none" style={{ animationDelay: '300ms' }} />
            </span>
          )}

          <span className="truncate">{userName} {isLocal ? '(You)' : ''}</span>

          {/* Microphone Off Icon */}
          {effectiveIsMuted && (
            <span className="p-0.5 rounded text-[#f28b82] shrink-0" title="Microphone is off">
              <MicOff className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
      </div>

      {/* 8. Bottom-Right Connection Quality Indicator (Shown ONLY for 'medium' and 'poor') */}
      {!isLocal && (effectiveQuality === 'poor' || effectiveQuality === 'medium') && (
        <div
          className="absolute bottom-2 right-2 bg-black/75 backdrop-blur-md p-1.5 rounded-[6px] z-20 border border-white/10 shadow-sm"
          title={effectiveQuality === 'poor' ? 'Poor connection' : 'Unstable connection'}
        >
          {effectiveQuality === 'poor' ? (
            <WifiOff className="w-3.5 h-3.5 text-[#ea4335]" />
          ) : (
            <Wifi className="w-3.5 h-3.5 text-[#fbbc04]" />
          )}
        </div>
      )}
    </div>
  );
}

export const VideoTile = memo(VideoTileComponent);
export default VideoTile;
