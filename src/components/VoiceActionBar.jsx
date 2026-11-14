import React from 'react';
import { Mic, MicOff, Search, ListMusic, Loader2 } from 'lucide-react';

/**
 * VoiceActionBar Component
 * Large thumb-friendly action bar for room communication and music navigation:
 * - Prominent mic button with distinct visual states (off, muted, speaking, requesting)
 * - "Add Music / Search" button
 * - "Queue" sheet toggle button
 */
export default function VoiceActionBar({
  micState = 'off',
  isSpeaking = false,
  queueCount = 0,
  onToggleMic,
  onOpenSearch,
  onToggleQueue,
  isQueueOpen = false
}) {
  const isMicLive = micState === 'on';
  const isRequesting = micState === 'requesting';

  return (
    <div className="w-full bg-[#141419]/90 border border-white/10 rounded-2xl p-3 flex items-center gap-3 select-none shadow-xl">
      {/* Search / Add Music button */}
      <button
        type="button"
        onClick={onOpenSearch}
        className="flex-1 min-h-[48px] py-2.5 px-4 bg-white/10 hover:bg-white/15 active:scale-95 text-[#F4F1EA] rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 border border-white/10 transition-all cursor-pointer"
      >
        <Search className="w-4 h-4 text-[#FF9F1C]" />
        <span>Add Music</span>
      </button>

      {/* Prominent Large Mic Toggle Button */}
      <button
        type="button"
        disabled={isRequesting}
        onClick={onToggleMic}
        className={`min-h-[48px] px-5 sm:px-6 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95 ${
          isRequesting
            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
            : isMicLive && isSpeaking
              ? 'bg-gradient-to-r from-[#FF9F1C] to-[#FF5A5F] text-white ring-4 ring-[#FF9F1C]/40 animate-pulse shadow-[#FF5A5F]/30'
              : isMicLive
                ? 'bg-[#2EC4B6]/20 text-[#2EC4B6] border border-[#2EC4B6]/40 shadow-[#2EC4B6]/10'
                : micState === 'soft-muted'
                  ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                  : micState === 'blocked' || micState === 'insecure'
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25'
                    : 'bg-white/10 text-white/70 hover:bg-white/15 border border-white/10'
        }`}
        aria-label="Toggle microphone"
      >
        {isRequesting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
            <span className="hidden sm:inline">Connecting...</span>
          </>
        ) : isMicLive ? (
          <>
            <Mic className={`w-4 h-4 ${isSpeaking ? 'animate-bounce text-white' : 'text-[#2EC4B6]'}`} />
            <span>{isSpeaking ? 'Speaking' : 'Mic ON'}</span>
          </>
        ) : micState === 'blocked' ? (
          <>
            <MicOff className="w-4 h-4 text-amber-400" />
            <span>Fix Mic</span>
          </>
        ) : micState === 'insecure' ? (
          <>
            <MicOff className="w-4 h-4 text-amber-400" />
            <span>Need HTTPS</span>
          </>
        ) : (
          <>
            <MicOff className="w-4 h-4 text-red-400" />
            <span>{micState === 'soft-muted' ? 'Muted' : 'Mic OFF'}</span>
          </>
        )}
      </button>

      {/* Queue toggle button */}
      <button
        type="button"
        onClick={onToggleQueue}
        className={`min-h-[48px] px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 border transition-all cursor-pointer active:scale-95 ${
          isQueueOpen
            ? 'bg-gradient-to-r from-[#FF9F1C] to-[#FF5A5F] text-white border-transparent'
            : 'bg-white/10 hover:bg-white/15 text-white/90 border-white/10'
        }`}
        title="Toggle Up Next Queue"
      >
        <ListMusic className="w-4 h-4" />
        <span className="hidden sm:inline">Queue</span>
        <span className="text-[11px] font-mono bg-black/40 px-1.5 py-0.5 rounded-full text-white/80">
          {queueCount}
        </span>
      </button>
    </div>
  );
}

