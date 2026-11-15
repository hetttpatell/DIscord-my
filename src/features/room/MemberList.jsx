import React, { useState } from 'react';
import { Mic, MicOff, Video, VideoOff, Crown, MoreVertical, UserX } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { useAppStore } from '../../stores/useAppStore';
import { getAvatarColor } from '../../lib/utils';

export function MemberList({ members = [], currentMemberId, currentSocketId, socket }) {
  const speakingMembers = useAppStore((s) => s.speakingMembers);
  const [activeMenuMemberId, setActiveMenuMemberId] = useState(null);

  // Determine if current user is host
  const currentUser = members.find(
    (m) => m.id === currentSocketId || m.memberId === currentMemberId
  );
  const isCurrentUserHost = Boolean(currentUser?.isHost);

  const handleKick = (targetMember) => {
    if (!socket || !targetMember) return;
    socket.emit('room:kick', { memberId: targetMember.id || targetMember.memberId });
    setActiveMenuMemberId(null);
  };

  return (
    <div className="flex flex-col h-full w-full p-3 select-none">
      <div className="flex items-center justify-between px-1 pb-3 border-b border-white/10">
        <span className="text-xs font-semibold text-[#9A978F] uppercase tracking-wider">
          Room Members ({members.length})
        </span>
        <Badge variant="default" className="text-[10px]">
          Max 6
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pt-3 custom-scrollbar pr-1">
        {members.map((member) => {
          const isSelf = member.id === currentSocketId || member.memberId === currentMemberId;
          const isSpeaking = Boolean(speakingMembers[member.id] || speakingMembers[member.memberId]);
          const avatarColor = getAvatarColor(member.name);
          const initial = (member.name || 'G')[0].toUpperCase();
          const isMenuOpen = activeMenuMemberId === member.id;

          return (
            <div
              key={member.id || member.memberId}
              className="relative flex items-center justify-between p-2 rounded-xl bg-[#1C1C24]/60 border border-white/5 hover:border-white/10 transition-colors"
            >
              {/* Left: Avatar + Name + Badges */}
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Avatar with speaking ring */}
                <div className="relative">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-[#0B0B10] shadow-sm transition-all duration-200 ${
                      isSpeaking
                        ? 'ring-2 ring-[#2EC4B6] ring-offset-2 ring-offset-[#141419] scale-105 animate-pulse'
                        : ''
                    }`}
                    style={{ backgroundColor: avatarColor }}
                  >
                    {initial}
                  </div>
                  {/* Small mic status dot */}
                  <div
                    className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center border border-[#141419] ${
                      member.micOn ? 'bg-[#2EC4B6]' : 'bg-[#FF5A5F]'
                    }`}
                    title={member.micOn ? 'Microphone on' : 'Microphone muted'}
                  >
                    {member.micOn ? (
                      <Mic className="w-2 h-2 text-[#0B0B10]" />
                    ) : (
                      <MicOff className="w-2 h-2 text-[#F4F1EA]" />
                    )}
                  </div>
                </div>

                {/* Name & Host Tag */}
                <div className="min-w-0 flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-[#F4F1EA] truncate">
                      {member.name || 'Guest'}
                    </span>
                    {isSelf && (
                      <span className="text-[10px] text-[#9A978F] font-mono">(you)</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 mt-0.5">
                    {member.isHost && (
                      <Badge
                        variant="default"
                        className="bg-[#FF9F1C]/20 text-[#FF9F1C] border-[#FF9F1C]/30 text-[9px] px-1 py-0 gap-0.5"
                      >
                        <Crown className="w-2.5 h-2.5" />
                        Host
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Media indicators + Host action menu */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Camera icon */}
                <div
                  className={`p-1 rounded-md text-[10px] ${
                    member.camOn
                      ? 'text-[#2EC4B6] bg-[#2EC4B6]/10'
                      : 'text-[#9A978F]/40'
                  }`}
                  title={member.camOn ? 'Camera on' : 'Camera off'}
                >
                  {member.camOn ? (
                    <Video className="w-3.5 h-3.5" />
                  ) : (
                    <VideoOff className="w-3.5 h-3.5" />
                  )}
                </div>

                {/* Host Actions: Kick */}
                {isCurrentUserHost && !isSelf && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMenuMemberId(isMenuOpen ? null : member.id)
                      }
                      className="p-1 rounded-lg hover:bg-white/10 text-[#9A978F] hover:text-[#F4F1EA] transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
                      aria-label={`Actions for ${member.name}`}
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>

                    {isMenuOpen && (
                      <div className="absolute right-0 top-full mt-1 z-50 w-36 bg-[#141419] border border-white/15 rounded-xl shadow-2xl p-1 animate-in fade-in zoom-in-95">
                        <button
                          type="button"
                          onClick={() => handleKick(member)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[#FF5A5F] hover:bg-[#FF5A5F]/15 rounded-lg transition-colors cursor-pointer"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>Kick Member</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MemberList;
