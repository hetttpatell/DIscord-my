import React from 'react';
import { Volume2 } from 'lucide-react';

export default function AudioUnlockBanner({ isVisible, onUnlock }) {
  if (!isVisible) return null;

  return (
    <div
      onClick={onUnlock}
      className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-bounce cursor-pointer select-none"
    >
      <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs sm:text-sm font-semibold shadow-2xl border border-white/20 active:scale-95 transition-all">
        <Volume2 className="w-4 h-4 animate-pulse" />
        <span>Tap here to enable meeting audio</span>
      </div>
    </div>
  );
}

