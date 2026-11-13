import React from 'react';
import { MicOff, Mic, Crown } from 'lucide-react';

/**
 * MembersStrip Component
 * Shows avatar chips for each member in the room, live speaking indicators, and mic mute status.
 * Audio level values never trigger React re-renders per frame.
 */
export default function MembersStrip({
  members = [],
  currentUserId = null,
  activeSpeakerId = null,
  localMicOn = false,
  localSpeaking = false
}) {
  return (
    <div className="w-full bg-[#141419]/90 border border-white/10 rounded-2xl p-3.5 select-none space-y-2">
      <div className="flex items-center justify-between text-xs font-semibold text-[#9A978F] px-1">
        <span>In Room ({members.length}/12)</span>
        <span className="text-[10px] uppercase tracking-wider text-white/40">Voice Mesh / SFU</span>
      </div>

      <div className="flex items-center gap-2.5 overflow-x-auto overscroll-contain py-1 pr-1 scrollbar-none">
        {members.map((m) => {
          const isMe = m.clientId === currentUserId || m.id === currentUserId;
          const isSpeaking = isMe ? localSpeaking : (m.id === activeSpeakerId || m.clientId === activeSpeakerId || m.isSpeaking);
          const isMicActive = isMe ? localMicOn : Boolean(m.isOnline && !m.isMuted);

          const initials = (m.name || 'M')
            .split(' ')
            .map(n => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();

          return (
            <div
              key={m.clientId || m.id}
              className={`flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border transition-all duration-200 shrink-0 ${
                isSpeaking
                  ? 'bg-green-500/15 border-green-500/60 shadow-lg shadow-green-500/20'
                  : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}
            >
              {/* Avatar circle with speaking pulse */}
              <div className="relative">
                <div
                  style={{ backgroundColor: m.avatarColor || '#5865f2' }}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-inner ${
                    isSpeaking ? 'ring-2 ring-green-400 ring-offset-1 ring-offset-[#0B0B10] animate-pulse' : ''
                  }`}
                >
                  {initials}
                </div>

                {/* Host Badge */}
                {m.isHost && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 rounded-full flex items-center justify-center text-[8px] text-black font-bold shadow">
                    <Crown className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>

              {/* Name & Indicators */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-white/90 max-w-[90px] truncate">
                  {m.name}
                  {isMe && <span className="text-white/50 text-[10px] ml-1">(You)</span>}
                </span>

                {/* Mic status icon */}
                {isMicActive ? (
                  <Mic className={`w-3 h-3 ${isSpeaking ? 'text-green-400 animate-pulse' : 'text-white/40'}`} />
                ) : (
                  <MicOff className="w-3 h-3 text-red-400/80" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

