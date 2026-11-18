import React, { useState } from 'react';
import { SmilePlus, ChevronRight, X } from 'lucide-react';

const PRIMARY_EMOJIS = ['❤️', '🔥', '😂', '👏'];
const EXTENDED_EMOJIS = ['🎉', '🚀', '😮', '💯'];

export function ReactionPicker({ socket, onTriggerLocal, className = '' }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const handleSend = (emoji) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(15);
      } catch {}
    }

    if (socket) {
      socket.emit('reaction:send', { emoji });
    }

    if (onTriggerLocal) {
      onTriggerLocal({ emoji });
    }
  };

  if (isMinimized) {
    return (
      <div className={`fixed bottom-20 right-3 z-30 sm:bottom-24 sm:right-6 select-none ${className}`}>
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="w-10 h-10 rounded-full bg-[#141419]/90 backdrop-blur-xl border border-white/15 text-[#FF9F1C] flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
          aria-label="Open reactions"
          title="Send Reaction"
        >
          <SmilePlus className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`fixed bottom-20 right-3 z-30 sm:bottom-24 sm:right-6 select-none flex items-center ${className}`}
      aria-label="Reaction floating bar"
    >
      <div className="flex items-center gap-0.5 sm:gap-1 bg-[#141419]/90 backdrop-blur-xl border border-white/15 rounded-full p-1 shadow-2xl transition-all">
        {/* Primary Emojis */}
        {PRIMARY_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => handleSend(emoji)}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-base sm:text-lg hover:bg-white/10 active:scale-125 transition-all cursor-pointer"
            aria-label={`Send ${emoji} reaction`}
          >
            {emoji}
          </button>
        ))}

        {/* Extended Emojis if Expanded */}
        {isExpanded &&
          EXTENDED_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleSend(emoji)}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-base sm:text-lg hover:bg-white/10 active:scale-125 transition-all cursor-pointer animate-fade-in"
              aria-label={`Send ${emoji} reaction`}
            >
              {emoji}
            </button>
          ))}

        {/* Expand / Collapse More Emojis */}
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[#9A978F] hover:text-[#F4F1EA] hover:bg-white/10 active:scale-95 transition-all cursor-pointer text-xs"
          aria-label={isExpanded ? 'Show fewer emojis' : 'Show more emojis'}
          title={isExpanded ? 'Less' : 'More'}
        >
          <ChevronRight
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Minimize button */}
        <button
          type="button"
          onClick={() => setIsMinimized(true)}
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[#9A978F] hover:text-[#FF5A5F] hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
          aria-label="Hide reaction bar"
          title="Minimize"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default ReactionPicker;

