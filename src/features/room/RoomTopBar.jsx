import React, { useState } from 'react';
import { Copy, Check, LogOut, Radio, Users } from 'lucide-react';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';

export function RoomTopBar({ roomId, membersCount = 1, onLeave }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <header className="h-14 w-full bg-[#141419]/90 border-b border-white/10 px-4 flex items-center justify-between backdrop-blur-md select-none shrink-0 z-20">
      {/* Brand & Room Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF9F1C] to-[#FF5A5F] flex items-center justify-center">
            <Radio className="w-4 h-4 text-[#0B0B10]" />
          </div>
          <span className="font-bold text-sm tracking-tight hidden sm:inline font-display">
            afterspot
          </span>
        </div>

        <div className="h-4 w-px bg-white/10" />

        {/* Room ID with Copy Button */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[#9A978F]">Room:</span>
          <span className="text-xs font-mono font-semibold text-[#F4F1EA] tracking-wide">
            {roomId}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            className="h-8 w-8 min-h-[32px] min-w-[32px] text-[#9A978F] hover:text-[#F4F1EA]"
            aria-label={copied ? 'Room ID copied' : 'Copy Room ID'}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#2EC4B6]" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Member count & Leave Button */}
      <div className="flex items-center gap-2 sm:gap-3">
        <Badge variant="default" className="gap-1.5">
          <Users className="w-3 h-3 text-[#2EC4B6]" />
          <span className="tabular-nums">{membersCount}</span>
        </Badge>

        <Button
          variant="ghost"
          size="sm"
          onClick={onLeave}
          className="text-[#FF5A5F] hover:bg-[#FF5A5F]/10 gap-1.5 min-h-[36px]"
          aria-label="Leave room"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Leave</span>
        </Button>
      </div>
    </header>
  );
}

export default RoomTopBar;

