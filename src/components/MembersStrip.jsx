import React from 'react';
import { MicOff, Mic, Crown, Radio, Phone, PhoneOff, Loader2 } from 'lucide-react';

/**
 * MembersStrip Component
 * Shows avatar chips for each member in the room, live speaking indicators, and mic mute status.
 * Supports initiating and terminating 1-to-1 voice calls via PeerJS.
 * Optimized for mobile touch & responsive scrolling.
 */
export default function MembersStrip({
  members = [],
  peers = {},
  currentUserId = null,
  activeSpeakerId = null,
  localMicOn = false,
  localSpeaking = false,
  callState = 'idle',
  activeCallUser = null,
  onStartCall,
  onEndCall
}) {
  const isConnected = callState === 'connected';
  const isCalling = callState === 'calling';

  return (
    <div className="w-full bg-[#141419]/90 border border-white/10 rounded-2xl p-3.5 select-none space-y-2.5 shadow-lg">
      <div className="flex items-center justify-between text-xs font-semibold text-[#9A978F] px-1">
        <div className="flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span>Room Members ({members.length}/12)</span>
        </div>
        <span className={`text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full border ${
          isConnected
            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 animate-pulse'
            : isCalling
              ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
              : 'text-white/60 bg-white/5 border-white/10'
        }`}>
          {isConnected ? 'Call Connected' : isCalling ? 'Calling...' : 'PeerJS Voice Ready'}
        </span>
      </div>

      <div className="flex items-center gap-2.5 overflow-x-auto overscroll-contain py-1 pr-1 scrollbar-none">
        {members.map((m) => {
          const isMe = m.clientId === currentUserId || m.id === currentUserId;
          const peerRecord = !isMe
            ? Object.values(peers).find(p => p.peerId === m.id || p.clientId === m.clientId || p.userName === m.name)
            : null;
          const isSpeaking = isMe
            ? localSpeaking
            : Boolean(peerRecord?.isSpeaking || m.id === activeSpeakerId || m.clientId === activeSpeakerId || m.isSpeaking);
          const isMicActive = isMe
            ? localMicOn
            : (peerRecord ? !peerRecord.isMuted : Boolean(m.isOnline && !m.isMuted));

          const isCallPartner = Boolean(
            activeCallUser && (activeCallUser.clientId === m.clientId || activeCallUser.id === m.id)
          );

          const initials = (m.name || 'M')
            .split(' ')
            .map(n => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();

          return (
            <div
              key={m.clientId || m.id}
              className={`flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-full border transition-all duration-200 shrink-0 ${
                isCallPartner && isConnected
                  ? 'bg-emerald-500/25 border-emerald-500/80 shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-500/40'
                  : isCallPartner && isCalling
                    ? 'bg-amber-500/20 border-amber-500/60 ring-2 ring-amber-500/30'
                    : isSpeaking
                      ? 'bg-emerald-500/20 border-emerald-500/70 shadow-lg shadow-emerald-500/25 ring-2 ring-emerald-500/30'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}
            >
              {/* Avatar circle with speaking pulse */}
              <div className="relative">
                <div
                  style={{ backgroundColor: m.avatarColor || '#5865f2' }}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-inner transition-transform ${
                    isSpeaking ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-[#0B0B10] scale-105' : ''
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

              {/* Name & Speaking Waveform */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-white/90 max-w-[90px] truncate">
                  {m.name}
                  {isMe && <span className="text-white/50 text-[10px] ml-1">(You)</span>}
                </span>

                {/* Live soundwave animation when speaking */}
                {isSpeaking ? (
                  <span className="flex items-end gap-0.5 h-3 px-0.5">
                    <span className="w-0.5 h-1.5 bg-emerald-400 rounded-full animate-bounce"></span>
                    <span className="w-0.5 h-3 bg-emerald-400 rounded-full animate-bounce delay-75"></span>
                    <span className="w-0.5 h-2 bg-emerald-400 rounded-full animate-bounce delay-150"></span>
                  </span>
                ) : isMicActive ? (
                  <Mic className="w-3 h-3 text-emerald-400/80" />
                ) : (
                  <MicOff className="w-3 h-3 text-red-400/80" />
                )}
              </div>

              {/* Call Control Button for Remote Members */}
              {!isMe && (
                <div className="pl-0.5">
                  {isCallPartner && isConnected ? (
                    <button
                      type="button"
                      onClick={onEndCall}
                      className="px-2 py-0.5 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                      title="End Call"
                    >
                      <PhoneOff className="w-2.5 h-2.5" />
                      <span>End</span>
                    </button>
                  ) : isCallPartner && isCalling ? (
                    <button
                      type="button"
                      onClick={onEndCall}
                      className="px-2 py-0.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                      title="Cancel Calling"
                    >
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      <span>Cancel</span>
                    </button>
                  ) : callState === 'idle' ? (
                    <button
                      type="button"
                      onClick={() => onStartCall && onStartCall(m)}
                      className="px-2 py-0.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95 shadow"
                      title={`Call ${m.name}`}
                    >
                      <Phone className="w-2.5 h-2.5 text-emerald-400" />
                      <span>Call</span>
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
