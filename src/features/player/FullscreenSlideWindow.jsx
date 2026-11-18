import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParticipants } from '@livekit/components-react';
import { Users, Smile, ChevronRight } from 'lucide-react';
import { VoiceParticipantItem } from '../voice/VoiceParticipantItem';
import { useVoiceContext } from '../voice/VoiceContext';
import { ErrorBoundary } from '../../components/ErrorBoundary';

const ALL_EMOJIS = [
  '❤️', '🔥', '😂', '👏',
  '🎉', '🚀', '😮', '💯',
  '✨', '⭐', '🥳', '💃'
];

function normalizeMembers(members) {
  if (Array.isArray(members)) return members;
  if (members && Array.isArray(members.members)) return members.members;
  if (members && typeof members === 'object') return Object.values(members);
  return [];
}

function LiveKitScrollableMembers({ currentMemberId, fallbackMembers }) {
  const participants = useParticipants();
  const safeFallback = normalizeMembers(fallbackMembers);

  if (participants.length === 0 && safeFallback.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-[#9A978F]">
        No members currently in lounge
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-1.5 p-2">
      {participants.length > 0
        ? participants.map((p) => (
            <VoiceParticipantItem
              key={p.identity}
              participant={p}
              isSelf={p.identity === currentMemberId || p.isLocal}
            />
          ))
        : safeFallback.map((member, idx) => (
            <VoiceParticipantItem
              key={member.memberId || member.id || member.displayName || `m-${idx}`}
              fallbackMember={member}
              isSelf={member.memberId === currentMemberId || member.id === currentMemberId}
            />
          ))}
    </div>
  );
}

function FallbackScrollableMembers({ currentMemberId, members }) {
  const memberList = normalizeMembers(members);

  if (memberList.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-[#9A978F]">
        No members currently in lounge
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-1.5 p-2">
      {memberList.map((member, idx) => (
        <VoiceParticipantItem
          key={member.memberId || member.id || member.displayName || `m-${idx}`}
          fallbackMember={member}
          isSelf={member.memberId === currentMemberId || member.id === currentMemberId}
        />
      ))}
    </div>
  );
}

export function FullscreenSlideWindow({
  isOpen,
  onClose,
  onOpen,
  socket,
  members = [],
  currentMemberId,
  onLocalReaction,
  isControlsVisible = true,
}) {
  const { isLiveKitActive } = useVoiceContext();
  const [activeTab, setActiveTab] = useState('members'); // 'members' | 'reactions'
  const timerRef = useRef(null);
  const memberList = normalizeMembers(members);

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    // Auto slide away when not touched for 5 seconds
    timerRef.current = setTimeout(() => {
      onClose?.();
    }, 5000);
  }, [onClose]);

  const pauseTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  }, []);

  // Sync auto-close timer with open state
  useEffect(() => {
    if (isOpen) {
      resetTimer();
    } else {
      pauseTimer();
    }
    return () => pauseTimer();
  }, [isOpen, resetTimer, pauseTimer]);

  const handleSendReaction = (emoji) => {
    resetTimer();
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

  // If closed, render discreet floating edge tab (hidden when controls auto-hide)
  if (!isOpen) {
    if (!isControlsVisible) return null;

    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen?.();
        }}
        className="absolute top-1/2 -translate-y-1/2 right-0 z-40 flex items-center gap-1.5 px-2.5 py-3 rounded-l-2xl bg-[#141419]/90 backdrop-blur-2xl border border-r-0 border-white/15 text-white shadow-2xl hover:bg-[#1C1C24] active:scale-95 transition-all cursor-pointer animate-fade-in"
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
      onClick={(e) => e.stopPropagation()}
      onTouchStart={pauseTimer}
      onTouchMove={pauseTimer}
      onPointerDown={pauseTimer}
      onWheel={pauseTimer}
      onScroll={pauseTimer}
      onTouchEnd={resetTimer}
      onPointerUp={resetTimer}
      onMouseLeave={resetTimer}
      className="absolute top-14 bottom-18 right-2 sm:right-4 z-40 w-64 sm:w-72 max-h-[82vh] bg-[#141419]/90 backdrop-blur-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.85)] rounded-2xl flex flex-col overflow-hidden animate-fade-in transition-all"
      aria-label="Floating Lounge and Reaction Window"
    >
      {/* Header: Segmented Tabs + Close */}
      <div className="flex items-center justify-between p-2 border-b border-white/10 bg-white/5 shrink-0">
        <div className="flex items-center gap-1 bg-[#0B0B10]/60 p-0.5 rounded-xl border border-white/5">
          <button
            type="button"
            onClick={() => {
              setActiveTab('members');
              resetTimer();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'members'
                ? 'bg-[#2EC4B6] text-[#0B0B10] shadow-sm'
                : 'text-[#9A978F] hover:text-[#F4F1EA]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Members ({memberList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('reactions');
              resetTimer();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'reactions'
                ? 'bg-[#FF9F1C] text-[#0B0B10] shadow-sm'
                : 'text-[#9A978F] hover:text-[#F4F1EA]'
            }`}
          >
            <Smile className="w-3.5 h-3.5" />
            <span>React</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-[#9A978F] hover:text-[#F4F1EA] hover:bg-white/10 active:scale-95 transition-colors cursor-pointer"
          aria-label="Close slide window"
          title="Minimize"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'members' ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Scrollable Members List */}
          <div
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <ErrorBoundary>
              {isLiveKitActive ? (
                <LiveKitScrollableMembers
                  currentMemberId={currentMemberId}
                  fallbackMembers={memberList}
                />
              ) : (
                <FallbackScrollableMembers
                  currentMemberId={currentMemberId}
                  members={memberList}
                />
              )}
            </ErrorBoundary>
          </div>
        </div>
      ) : (
        /* Full Reaction Pad Tab */
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF9F1C] mb-2.5">
            Tap to send instant reaction
          </p>
          <div className="grid grid-cols-4 gap-2">
            {ALL_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleSendReaction(emoji)}
                className="h-11 rounded-xl bg-white/5 hover:bg-white/15 active:scale-125 transition-all flex items-center justify-center text-xl cursor-pointer"
                aria-label={`Send ${emoji} reaction`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default FullscreenSlideWindow;
