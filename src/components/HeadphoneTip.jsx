import React, { useState } from 'react';
import { Headphones, X } from 'lucide-react';

/**
 * One-time dismissible headphone tip to avoid acoustic feedback and echo.
 */
export default function HeadphoneTip() {
  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      return Boolean(localStorage.getItem('afterspot_headphone_tip_dismissed'));
    } catch {
      return false;
    }
  });

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      localStorage.setItem('afterspot_headphone_tip_dismissed', 'true');
    } catch {}
  };

  if (isDismissed) return null;

  return (
    <div className="w-full bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 flex items-center justify-between gap-3 text-xs text-blue-200 select-none animate-fade-in">
      <div className="flex items-center gap-2.5 min-w-0">
        <Headphones className="w-4 h-4 text-blue-400 shrink-0" />
        <span className="truncate">
          <strong>Tip:</strong> Wear headphones to prevent audio feedback and room echo while speaking.
        </span>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white shrink-0 transition-colors"
        aria-label="Dismiss tip"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
