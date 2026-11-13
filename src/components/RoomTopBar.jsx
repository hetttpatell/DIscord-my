import React from 'react';
import { Copy, Key, LogOut, Check } from 'lucide-react';

/**
 * RoomTopBar Component
 * Header navigation for active music room:
 * - Room Name & 6-character Room Code with one-tap copy
 * - Member count chip
 * - Host-only "Copy password" action
 * - Leave room button
 */
export default function RoomTopBar({
  roomName,
  roomId,
  membersCount = 1,
  isHost = false,
  hasHostPassword = false,
  onCopyInvite,
  onCopyPassword,
  onLeaveRoom
}) {
  const [copiedId, setCopiedId] = React.useState(false);

  const handleCopyId = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId).then(() => {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }).catch(() => {});
    onCopyInvite();
  };

  return (
    <header className="w-full bg-[#141419]/90 border-b border-white/10 px-4 py-3 select-none flex items-center justify-between gap-3 shrink-0">
      {/* Room identity */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0">
          <h2 className="font-display font-bold text-sm sm:text-base text-[#F4F1EA] truncate">
            {roomName || 'afterspot Lounge'}
          </h2>
          <div className="flex items-center gap-2 mt-0.5">
            <button
              type="button"
              onClick={handleCopyId}
              title="Click to copy invite link"
              className="group flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[#0B0B10] border border-white/10 hover:border-[#FF9F1C]/40 text-xs text-[#FF9F1C] font-mono font-bold tracking-wider active:scale-95 transition-all"
            >
              <span>{roomId}</span>
              {copiedId ? (
                <Check className="w-3 h-3 text-[#2EC4B6]" />
              ) : (
                <Copy className="w-3 h-3 text-white/40 group-hover:text-white transition-colors" />
              )}
            </button>
            <span className="text-[11px] font-semibold text-[#9A978F] bg-white/5 px-2 py-0.5 rounded-md">
              {membersCount}/12
            </span>
          </div>
        </div>
      </div>

      {/* Top right actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Host-only Copy Password action */}
        {isHost && hasHostPassword && (
          <button
            type="button"
            onClick={onCopyPassword}
            title="Copy room password (Host only)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold active:scale-95 transition-all cursor-pointer"
          >
            <Key className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Password</span>
          </button>
        )}

        {/* Copy Invite Link */}
        <button
          type="button"
          onClick={onCopyInvite}
          title="Copy room invite link"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-xs font-semibold active:scale-95 transition-all cursor-pointer"
        >
          <Copy className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Invite Link</span>
        </button>

        {/* Leave Room Button */}
        <button
          type="button"
          onClick={onLeaveRoom}
          title="Leave Room"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-semibold active:scale-95 transition-all cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </div>
    </header>
  );
}

