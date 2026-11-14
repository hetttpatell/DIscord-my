import React from 'react';
import { Mic, MicOff, Wifi, WifiOff } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';

export function MemberList({
  members = [],
  currentMemberId,
  isReconnecting = false,
}) {
  return (
    <div className="flex flex-col h-full w-full p-2 space-y-2 select-none">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-semibold text-[#9A978F] uppercase tracking-wider">
          Room Members ({members.length})
        </span>
        {isReconnecting && (
          <Badge variant="destructive" className="animate-pulse text-[10px]">
            Reconnecting...
          </Badge>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
        {members.map((member) => {
          const isSelf = member.memberId === currentMemberId;
          const isOnline = member.isOnline !== false;

          return (
            <div
              key={member.memberId}
              className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                isSelf
                  ? 'bg-[#1C1C24] border-white/10'
                  : 'bg-[#141419]/60 border-white/5 hover:border-white/10'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar
                  fallback={member.displayName ? member.displayName.slice(0, 2) : '??'}
                  color="#FF9F1C"
                  className="w-8 h-8 text-xs shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-[#F4F1EA] truncate">
                      {member.displayName || 'Anonymous'}
                    </p>
                    {isSelf && (
                      <span className="text-[10px] text-[#FF9F1C] font-semibold bg-[#FF9F1C]/10 px-1 rounded">
                        You
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#9A978F]">
                    {isOnline ? 'Online' : 'Offline'}
                  </p>
                </div>
              </div>

              {/* Status Indicators */}
              <div className="flex items-center gap-1.5 shrink-0">
                {isOnline ? (
                  <Wifi className="w-3.5 h-3.5 text-[#2EC4B6]" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-[#9A978F]" />
                )}
                {member.isSpeaking ? (
                  <div className="w-6 h-6 rounded-full bg-[#2EC4B6]/20 flex items-center justify-center animate-pulse">
                    <Mic className="w-3.5 h-3.5 text-[#2EC4B6]" />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center">
                    <MicOff className="w-3.5 h-3.5 text-[#9A978F]" />
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

