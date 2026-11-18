import React from 'react';
import { Users, Smile, ChevronRight } from 'lucide-react';
import { MemberList } from '../room/MemberList';
import { ErrorBoundary } from '../../components/ErrorBoundary';

const EMOJIS = ['❤️', '🔥', '😂', '👏', '🎉', '🚀', '😮', '💯'];

export function FullscreenSlideWindow({
  isOpen,
  onClose,
  onOpen,
  socket,
  members = [],
  currentMemberId,
  onLocalReaction,
}) {
  const memberList = Array.isArray(members)
    ? members
    : (members && Array.isArray(members.members)
      ? members.members
      : Object.values(members || {}));

  const handleSendReaction = (emoji) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(15);
      } catch {}
    }

    if (socket) {
      socket.emit('reaction:send', { emoji });
    }

    if (onLocalReaction) {
      onLocalReaction({ emoji });
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="absolute top-1/2 -translate-y-1/2 right-0 z-40 flex items-center gap-1.5 px-2.5 py-3 rounded-l-2xl bg-[#141419]/90 backdrop-blur-xl border border-r-0 border-white/20 text-white shadow-2xl hover:bg-[#1C1C24] active:scale-95 transition-all cursor-pointer"
        aria-label="Open Lounge and Reaction panel"
        title="Lounge & Reactions"
      >
        <div className="flex flex-col items-center gap-1">
          <Users className="w-4 h-4 text-[#2EC4B6]" />
          <span className="text-[10px] font-bold font-mono text-[#2EC4B6] leading-none">
            {memberList.length}
          </span>
          <Smile className="w-4 h-4 text-[#FF9F1C] mt-1" />
        </div>
      </button>
    );
  }

  return (
    <div
      className="absolute top-12 bottom-18 right-2 sm:right-4 z-40 w-64 sm:w-72 bg-[#141419]/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in transition-all select-none"
      aria-label="Floating Lounge and Reaction Window"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="w-4 h-4 text-[#2EC4B6] shrink-0" />
          <span className="text-xs font-bold text-[#F4F1EA] tracking-wide truncate">
            Lounge ({memberList.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#9A978F] hover:text-[#F4F1EA] hover:bg-white/10 active:scale-95 transition-colors cursor-pointer"
            aria-label="Close slide window"
            title="Minimize"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Section 1: Emoji Reaction Panel */}
      <div className="p-3 border-b border-white/10 bg-[#0B0B10]/40">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF9F1C] flex items-center gap-1">
            <Smile className="w-3 h-3" /> Quick Reactions
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleSendReaction(emoji)}
              className="h-9 rounded-xl bg-white/5 hover:bg-white/15 active:scale-125 transition-all flex items-center justify-center text-lg cursor-pointer"
              aria-label={`Send ${emoji} reaction`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Section 2: Members Panel */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="px-3 pt-2 pb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#9A978F]">
            Participants ({memberList.length})
          </span>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar px-1 pb-2">
          <ErrorBoundary>
            <MemberList
              members={memberList}
              currentMemberId={currentMemberId}
            />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

export default FullscreenSlideWindow;
