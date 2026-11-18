import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Users,
  ListMusic,
  Sparkles,
  Gamepad2,
  ChevronUp,
  ChevronDown,
  Share2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '../../stores/useAppStore';
import { Button } from '../../components/Button';
import { MicButton } from '../voice/MicButton';
import { CameraButton } from '../voice/CameraButton';

export function RoomDock({
  onOpenVoiceFx,
  onOpenGames,
  onOpenSearch,
  onOpenQueue,
  onToggleMembers,
  queueCount = 0,
  membersCount = 1,
  isGameActive = false,
  isHidden = false,
  micSlot,
  cameraSlot,
}) {
  const isFullscreen = useAppStore((s) => s.isFullscreen);
  const [isExpandedState, setIsExpanded] = useState(false);
  const isExpanded = isFullscreen || isHidden ? false : isExpandedState;
  const dragStartYRef = useRef(0);
  const isDraggingRef = useRef(false);

  // Close drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  // Touch gesture handler for drag-to-slide
  const handleTouchStart = (e) => {
    dragStartYRef.current = e.touches[0].clientY;
    isDraggingRef.current = true;
  };

  const handleTouchMove = (e) => {
    if (!isDraggingRef.current) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - dragStartYRef.current;

    // If dragged UP by > 35px while closed, open
    if (!isExpanded && deltaY < -35) {
      setIsExpanded(true);
      isDraggingRef.current = false;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(20);
        } catch {}
      }
    }
    // If dragged DOWN by > 35px while open, close
    else if (isExpanded && deltaY > 35) {
      setIsExpanded(false);
      isDraggingRef.current = false;
    }
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
  };

  // Share room invite link
  const handleShareLink = async () => {
    try {
      const url = window.location.href;
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast.success('Room invite link copied to clipboard!');
      } else {
        toast.info(`Room link: ${url}`);
      }
    } catch {
      toast.info(`Room: ${window.location.href}`);
    }
    setIsExpanded(false);
  };

  const buttonClass =
    'flex-1 h-12 rounded-full flex flex-col items-center justify-center gap-0.5 transition-all duration-200 cursor-pointer select-none active:scale-95 !bg-white/[0.08] hover:!bg-white/[0.14] !border-white/[0.08] text-white/80 hover:text-white font-medium';

  return (
    <>
      {/* ============================================================== */}
      {/* 1. APPLE MODAL BACKDROP */}
      {/* ============================================================== */}
      {isExpanded && !isFullscreen && !isHidden && (
        <div
          role="presentation"
          aria-hidden="true"
          onClick={() => setIsExpanded(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
        />
      )}

      {/* ============================================================== */}
      {/* 2. APPLE IOS MODAL SHEET (GOOGLE MEET ACTION GRID) */}
      {/* ============================================================== */}
      {isExpanded && !isFullscreen && !isHidden && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Lounge activities and controls"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[36px] bg-[#1C1C1E]/95 backdrop-blur-3xl border-t border-white/[0.15] p-5 pb-[max(5.5rem,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_rgba(0,0,0,0.7)] max-w-lg mx-auto animate-in slide-in-from-bottom duration-300"
        >
          {/* Apple Grabber Pill */}
          <div
            className="w-full flex items-center justify-center pt-0 pb-3 cursor-grab active:cursor-grabbing touch-none"
            onClick={() => setIsExpanded(false)}
          >
            <div className="w-9 h-1 rounded-full bg-white/30 hover:bg-white/50 transition-colors" />
          </div>

          {/* Drawer Header */}
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/[0.08]">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Lounge Activities
              </h2>
              <p className="text-xs text-white/50">
                Music, games &amp; party tools
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Close controls"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Apple Control Center 3-Column Touch Squircle Grid */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 py-2">
            {/* 1. YouTube Search */}
            <button
              type="button"
              onClick={() => {
                setIsExpanded(false);
                onOpenSearch?.();
              }}
              className="flex flex-col items-center justify-center p-3 rounded-[22px] bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 transition-all duration-150 border border-white/[0.06] text-center group cursor-pointer"
            >
              <div className="w-11 h-11 rounded-[16px] bg-[#FF9F0A]/15 border border-[#FF9F0A]/30 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform shadow-md shadow-[#FF9F0A]/10">
                <Search className="w-5 h-5 text-[#FF9F0A]" />
              </div>
              <span className="text-xs font-semibold text-white tracking-tight">Search</span>
              <span className="text-[10px] text-white/50">YouTube Music</span>
            </button>

            {/* 2. Playback Queue */}
            <button
              type="button"
              onClick={() => {
                setIsExpanded(false);
                onOpenQueue?.();
              }}
              className="relative flex flex-col items-center justify-center p-3 rounded-[22px] bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 transition-all duration-150 border border-white/[0.06] text-center group cursor-pointer"
            >
              <div className="w-11 h-11 rounded-[16px] bg-[#FF9F0A]/15 border border-[#FF9F0A]/30 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform shadow-md shadow-[#FF9F0A]/10">
                <ListMusic className="w-5 h-5 text-[#FF9F0A]" />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-semibold text-white tracking-tight">Queue</span>
                {queueCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-[#FF9F0A]/20 text-[#FF9F0A] border border-[#FF9F0A]/30">
                    {queueCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-white/50">
                {queueCount > 0 ? `${queueCount} tracks` : 'Empty'}
              </span>
            </button>

            {/* 3. Room Members */}
            <button
              type="button"
              onClick={() => {
                setIsExpanded(false);
                onToggleMembers?.();
              }}
              className="relative flex flex-col items-center justify-center p-3 rounded-[22px] bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 transition-all duration-150 border border-white/[0.06] text-center group cursor-pointer"
            >
              <div className="w-11 h-11 rounded-[16px] bg-[#32ADE6]/15 border border-[#32ADE6]/30 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform shadow-md shadow-[#32ADE6]/10">
                <Users className="w-5 h-5 text-[#32ADE6]" />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-semibold text-white tracking-tight">Members</span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-[#32ADE6]/20 text-[#32ADE6] border border-[#32ADE6]/30">
                  {membersCount}
                </span>
              </div>
              <span className="text-[10px] text-white/50">{membersCount} online</span>
            </button>

            {/* 4. Voice Effects */}
            <button
              type="button"
              onClick={() => {
                setIsExpanded(false);
                onOpenVoiceFx?.();
              }}
              className="flex flex-col items-center justify-center p-3 rounded-[22px] bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 transition-all duration-150 border border-white/[0.06] text-center group cursor-pointer"
            >
              <div className="w-11 h-11 rounded-[16px] bg-[#FFD60A]/15 border border-[#FFD60A]/30 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform shadow-md shadow-[#FFD60A]/10">
                <Sparkles className="w-5 h-5 text-[#FFD60A]" />
              </div>
              <span className="text-xs font-semibold text-white tracking-tight">Voice FX</span>
              <span className="text-[10px] text-white/50">DSP Presets</span>
            </button>

            {/* 5. Scribble Arena */}
            <button
              type="button"
              onClick={() => {
                setIsExpanded(false);
                onOpenGames?.();
              }}
              className="relative flex flex-col items-center justify-center p-3 rounded-[22px] bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 transition-all duration-150 border border-white/[0.06] text-center group cursor-pointer"
            >
              <div className="w-11 h-11 rounded-[16px] bg-[#FF375F]/15 border border-[#FF375F]/30 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform shadow-md shadow-[#FF375F]/10">
                <Gamepad2 className="w-5 h-5 text-[#FF375F]" />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-semibold text-white tracking-tight">Scribble</span>
                {isGameActive && (
                  <span className="px-1 py-0.2 text-[8px] font-extrabold uppercase bg-[#FF375F] text-white rounded-md leading-none animate-pulse">
                    Live
                  </span>
                )}
              </div>
              <span className="text-[10px] text-white/50">Draw &amp; Guess</span>
            </button>

            {/* 6. Share Room Invite */}
            <button
              type="button"
              onClick={handleShareLink}
              className="flex flex-col items-center justify-center p-3 rounded-[22px] bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 transition-all duration-150 border border-white/[0.06] text-center group cursor-pointer"
            >
              <div className="w-11 h-11 rounded-[16px] bg-[#30D158]/15 border border-[#30D158]/30 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform shadow-md shadow-[#30D158]/10">
                <Share2 className="w-5 h-5 text-[#30D158]" />
              </div>
              <span className="text-xs font-semibold text-white tracking-tight">Share Invite</span>
              <span className="text-[10px] text-white/50">Copy Link</span>
            </button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. APPLE FLOATING DOCK ISLAND (4 PRIMARY BUTTONS) */}
      {/* ============================================================== */}
      <nav
        aria-label="Room Controls Dock"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`fixed bottom-3 sm:bottom-5 left-0 right-0 z-50 flex flex-col items-center justify-center px-3 select-none pointer-events-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isFullscreen || isHidden
            ? 'translate-y-36 opacity-0 pointer-events-none'
            : 'translate-y-0 opacity-100'
        }`}
      >
        <div className="pointer-events-auto flex flex-col items-center max-w-sm sm:max-w-md w-full">
          {/* Subtle Pull-Up Grabber */}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-label={isExpanded ? 'Collapse controls drawer' : 'Slide up for all controls'}
            className="w-full flex items-center justify-center pt-0 pb-1.5 cursor-pointer touch-none group"
          >
            <div className="w-8 h-1 rounded-full bg-white/25 group-hover:bg-white/45 transition-colors" />
          </button>

          {/* Apple Frosted Glass Island */}
          <div className="flex items-center justify-between gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-full bg-[#1C1C1E]/85 dark:bg-[#141418]/85 backdrop-blur-3xl border border-white/[0.14] shadow-[0_16px_48px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.18)] w-full">
            {/* 1. Microphone Button */}
            {micSlot || <MicButton className={buttonClass} />}

            {/* 2. Camera Button */}
            {cameraSlot || <CameraButton className={buttonClass} />}

            {/* 3. Scribble Games Button */}
            <Button
              variant="secondary"
              size="default"
              onClick={onOpenGames}
              aria-label="Play Scribble & Guess mini-game"
              className={`${buttonClass} relative`}
            >
              <div className="relative">
                <Gamepad2 className="w-4 h-4 shrink-0 text-[#FF375F]" />
                {isGameActive && (
                  <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-[#FF375F] animate-ping" />
                )}
              </div>
              <span className="text-[10px] sm:text-xs font-semibold whitespace-nowrap tracking-tight flex items-center gap-1">
                <span>Games</span>
                {isGameActive && (
                  <span className="px-1 py-0.2 text-[7px] font-extrabold uppercase bg-[#FF375F] text-white rounded-md leading-none shadow-sm">
                    Live
                  </span>
                )}
              </span>
            </Button>

            {/* 4. More Options Toggle Button (Slides up the Apple Sheet) */}
            <Button
              variant="secondary"
              size="default"
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Close more controls' : 'Open more controls'}
              className={`${buttonClass} relative ${
                isExpanded ? '!bg-white/20 !text-white !border-white/30' : ''
              }`}
            >
              <div className="relative">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 shrink-0 text-[#30D158]" />
                ) : (
                  <ChevronUp className="w-4 h-4 shrink-0 text-[#FF9F0A]" />
                )}
                {queueCount > 0 && !isExpanded && (
                  <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-[#FF9F0A] animate-pulse" />
                )}
              </div>
              <span className="text-[10px] sm:text-xs font-semibold whitespace-nowrap tracking-tight">
                {isExpanded ? 'Less' : 'More'}
              </span>
            </Button>
          </div>
        </div>
      </nav>
    </>
  );
}

export default RoomDock;
