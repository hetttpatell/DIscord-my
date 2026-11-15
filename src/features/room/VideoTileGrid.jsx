import React, { useEffect, useRef } from 'react';
import { MicOff, VideoOff, Crown } from 'lucide-react';
import { getAvatarColor } from '../../lib/utils';
import { useAppStore } from '../../stores/useAppStore';

function LocalVideoTile({ localVideoTrack, isCamOn, displayName, isSpeaking, micOn }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      if (isCamOn && localVideoTrack) {
        const stream = new MediaStream([localVideoTrack]);
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [localVideoTrack, isCamOn]);

  const avatarColor = getAvatarColor(displayName);
  const initial = (displayName || 'Y')[0]?.toUpperCase();

  return (
    <div
      className={`relative w-full aspect-video bg-[#141419] rounded-xl overflow-hidden border border-white/10 flex items-center justify-center transition-all ${
        isSpeaking ? 'ring-2 ring-[#2EC4B6] ring-offset-2 ring-offset-[#0B0B10]' : ''
      }`}
    >
      {/* Video element when camOn */}
      {isCamOn && localVideoTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg text-[#0B0B10] shadow-md"
            style={{ backgroundColor: avatarColor }}
          >
            {initial}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-[#9A978F]">
            <VideoOff className="w-3.5 h-3.5" />
            <span>Camera off</span>
          </div>
        </div>
      )}

      {/* Name and mic status overlay */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
        <span className="bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-md text-[11px] font-semibold text-[#F4F1EA] truncate max-w-[120px]">
          {displayName} (you)
        </span>
        {!micOn && (
          <span className="bg-[#FF5A5F]/80 p-1 rounded-md text-white">
            <MicOff className="w-3 h-3" />
          </span>
        )}
      </div>
    </div>
  );
}

function RemoteVideoTile({ member, stream, isSpeaking }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  const avatarColor = getAvatarColor(member.name);
  const initial = (member.name || 'G')[0]?.toUpperCase();

  return (
    <div
      className={`relative w-full aspect-video bg-[#141419] rounded-xl overflow-hidden border border-white/10 flex items-center justify-center transition-all ${
        isSpeaking ? 'ring-2 ring-[#2EC4B6] ring-offset-2 ring-offset-[#0B0B10]' : ''
      }`}
    >
      {/* Remote Video element: audio plays directly through here */}
      {member.camOn && stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <>
          {/* Even if cam is off, video element plays audio */}
          {stream && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="hidden"
            />
          )}
          <div className="flex flex-col items-center justify-center gap-2">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg text-[#0B0B10] shadow-md"
              style={{ backgroundColor: avatarColor }}
            >
              {initial}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-[#9A978F]">
              <VideoOff className="w-3.5 h-3.5" />
              <span>Camera off</span>
            </div>
          </div>
        </>
      )}

      {/* Overlay tag */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-md text-[11px] font-semibold text-[#F4F1EA] truncate max-w-[120px]">
          {member.isHost && <Crown className="w-3 h-3 text-[#FF9F1C]" />}
          <span className="truncate">{member.name}</span>
        </div>
        {!member.micOn && (
          <span className="bg-[#FF5A5F]/80 p-1 rounded-md text-white">
            <MicOff className="w-3 h-3" />
          </span>
        )}
      </div>
    </div>
  );
}

export function VideoTileGrid({
  members = [],
  currentSocketId,
  currentMemberId,
  localVideoTrack,
  isLocalCamOn,
  localDisplayName,
  localMicOn,
  remoteStreams = new Map(),
}) {
  const speakingMembers = useAppStore((s) => s.speakingMembers);

  // Check if at least one member (including local) has camera on
  const anyCameraOn = isLocalCamOn || members.some((m) => m.camOn);

  if (!anyCameraOn) {
    return null;
  }

  const remoteMembers = members.filter(
    (m) => m.id !== currentSocketId && m.memberId !== currentMemberId
  );
  const totalTiles = 1 + remoteMembers.length;

  // Grid classes according to requirements:
  // 1 tile full width, 2 side by side, 3 to 6 in a 2-column grid
  let gridColsClass = 'grid-cols-1';
  if (totalTiles === 2) {
    gridColsClass = 'grid-cols-1 sm:grid-cols-2';
  } else if (totalTiles >= 3) {
    gridColsClass = 'grid-cols-1 sm:grid-cols-2';
  }

  const isLocalSpeaking =
    localMicOn &&
    Boolean(
      speakingMembers['local'] ||
        speakingMembers[currentSocketId] ||
        speakingMembers[currentMemberId]
    );

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Desktop / Responsive Grid */}
      <div className={`hidden sm:grid ${gridColsClass} gap-3 w-full`}>
        {/* Local Tile */}
        <LocalVideoTile
          localVideoTrack={localVideoTrack}
          isCamOn={isLocalCamOn}
          displayName={localDisplayName}
          isSpeaking={isLocalSpeaking}
          micOn={localMicOn}
        />

        {/* Remote Tiles */}
        {remoteMembers.map((m) => {
          const stream = remoteStreams.get(m.peerId);
          const isSpeaking = Boolean(speakingMembers[m.id] || speakingMembers[m.memberId]);

          return (
            <RemoteVideoTile
              key={m.id || m.memberId}
              member={m}
              stream={stream}
              isSpeaking={isSpeaking}
            />
          );
        })}
      </div>

      {/* Mobile Collapsible Horizontal Strip */}
      <div className="flex sm:hidden overflow-x-auto gap-3 pb-2 custom-scrollbar snap-x snap-mandatory">
        <div className="w-48 shrink-0 snap-start">
          <LocalVideoTile
            localVideoTrack={localVideoTrack}
            isCamOn={isLocalCamOn}
            displayName={localDisplayName}
            isSpeaking={isLocalSpeaking}
            micOn={localMicOn}
          />
        </div>

        {remoteMembers.map((m) => {
          const stream = remoteStreams.get(m.peerId);
          const isSpeaking = Boolean(speakingMembers[m.id] || speakingMembers[m.memberId]);

          return (
            <div key={m.id || m.memberId} className="w-48 shrink-0 snap-start">
              <RemoteVideoTile
                member={m}
                stream={stream}
                isSpeaking={isSpeaking}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default VideoTileGrid;
