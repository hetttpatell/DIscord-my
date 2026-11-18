import React, { useState } from 'react';
import { Heart, X } from 'lucide-react';
import { useAppStore } from '../../stores/useAppStore';

const TAPBACK_EMOJIS = ['❤️', '👍', '🔥', '😂', '😮', '🎉'];

export function ReactionPicker({ socket, onTriggerLocal, isHidden = false, className = '' }) {
  const isFullscreen = useAppStore((s) => s.isFullscreen);
  const [isOpen, setIsOpen] = useState(false);

  if (isFullscreen || isHidden) {
    return null;
  }

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

  return (
    <div
      className={`fixed bottom-[4.75rem] right-3 z-30 sm:bottom-22 sm:right-6 select-none ${className}`}
      aria-label="Reactions"
    >
      {isOpen ? (
        /* Apple iMessage / FaceTime Tapback Reaction Capsule */
        <div className="flex items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 rounded-full bg-[#1C1C1E]/90 dark:bg-[#141418]/90 backdrop-blur-2xl border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.18)] animate-in zoom-in-95 duration-200">
          {TAPBACK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleSend(emoji)}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-lg sm:text-xl hover:bg-white/15 active:scale-130 transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] cursor-pointer select-none"
              aria-label={`Send ${emoji} reaction`}
            >
              <span className="leading-none">{emoji}</span>
            </button>
          ))}

          {/* Dismiss button */}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 active:scale-90 transition-all cursor-pointer ml-0.5"
            aria-label="Close reaction picker"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        /* Apple iOS Reaction Launcher Pill */
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1.5 h-9 sm:h-10 px-3 sm:px-3.5 rounded-full bg-[#1C1C1E]/80 hover:bg-[#2C2C2E]/90 dark:bg-[#141418]/85 dark:hover:bg-[#202026]/95 border border-white/15 backdrop-blur-2xl shadow-[0_8px_28px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.15)] text-white text-xs font-semibold active:scale-95 transition-all cursor-pointer"
          aria-label="Open reactions"
          title="Send Reaction"
        >
          <Heart className="w-3.5 h-3.5 text-[#FF375F] fill-[#FF375F]/40" />
          <span className="text-[11px] sm:text-xs tracking-tight font-medium">React</span>
        </button>
      )}
    </div>
  );
}

export default ReactionPicker;
