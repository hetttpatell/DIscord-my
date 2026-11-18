import React from 'react';
import { Search, Users, ListMusic, Sparkles, Gamepad2 } from 'lucide-react';
import { Button } from '../../components/Button';
import { MicButton } from '../voice/MicButton';

export function RoomDock({
  onOpenVoiceFx,
  onOpenGames,
  onOpenSearch,
  onOpenQueue,
  onToggleMembers,
  queueCount = 0,
  membersCount = 1,
  micSlot,
}) {
  const buttonClass =
    'flex-1 sm:flex-initial h-11 px-1.5 sm:px-3 py-1 sm:py-2 min-w-0 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 font-medium transition-all rounded-xl cursor-pointer';

  return (
    <nav
      aria-label="Room Controls Dock"
      className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-center p-2 sm:p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-[#0B0B10] via-[#0B0B10]/95 to-transparent backdrop-blur-xl border-t border-white/5"
    >
      <div className="flex items-center justify-between sm:justify-center gap-1 sm:gap-1.5 bg-[#141419]/95 border border-white/10 rounded-2xl p-1 sm:p-1.5 shadow-2xl w-full max-w-xl sm:w-auto">
        {/* Microphone Toggle (from LiveKit) */}
        {micSlot || <MicButton className={buttonClass} />}

        {/* Voice FX Changer Button */}
        <Button
          variant="secondary"
          size="default"
          onClick={onOpenVoiceFx}
          aria-label="Open voice effects changer"
          className={buttonClass}
        >
          <Sparkles className="w-4 h-4 shrink-0 text-[#FFE66D]" />
          <span className="text-[10px] sm:text-xs font-semibold whitespace-nowrap tracking-tight">Voice FX</span>
        </Button>

        {/* Scribble Mini-game Button */}
        <Button
          variant="secondary"
          size="default"
          onClick={onOpenGames}
          aria-label="Play Scribble & Guess mini-game"
          className={buttonClass}
        >
          <Gamepad2 className="w-4 h-4 shrink-0 text-[#FF5A5F]" />
          <span className="text-[10px] sm:text-xs font-semibold whitespace-nowrap tracking-tight">Games</span>
        </Button>

        {/* Search YouTube Button */}
        <Button
          variant="secondary"
          size="default"
          onClick={onOpenSearch}
          aria-label="Search YouTube tracks"
          className={buttonClass}
        >
          <Search className="w-4 h-4 shrink-0 text-[#FF9F1C]" />
          <span className="text-[10px] sm:text-xs font-semibold whitespace-nowrap tracking-tight">Search</span>
        </Button>

        {/* Queue Button */}
        <Button
          variant="secondary"
          size="default"
          onClick={onOpenQueue}
          aria-label="Open playback queue"
          className={buttonClass}
        >
          <ListMusic className="w-4 h-4 shrink-0 text-[#FF9F1C]" />
          <span className="text-[10px] sm:text-xs font-semibold whitespace-nowrap tracking-tight">Queue</span>
          {queueCount > 0 && (
            <span className="ml-0.5 px-1 sm:px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold font-mono rounded-full bg-[#FF9F1C]/20 text-[#FF9F1C] border border-[#FF9F1C]/30 leading-none shrink-0">
              {queueCount}
            </span>
          )}
        </Button>

        {/* Members Toggle Button */}
        <Button
          variant="secondary"
          size="default"
          onClick={onToggleMembers}
          aria-label="Toggle members list"
          className={buttonClass}
        >
          <Users className="w-4 h-4 shrink-0 text-[#2EC4B6]" />
          <span className="text-[10px] sm:text-xs font-semibold whitespace-nowrap tracking-tight">Members</span>
          <span className="ml-0.5 px-1 sm:px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold font-mono rounded-full bg-[#2EC4B6]/20 text-[#2EC4B6] border border-[#2EC4B6]/30 leading-none shrink-0">
            {membersCount}
          </span>
        </Button>
      </div>
    </nav>
  );
}

export default RoomDock;
