import React from 'react';
import { Mic, MicOff, Search, Users } from 'lucide-react';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';

export function RoomDock({
  isMuted = true,
  onToggleMic,
  onOpenSearch,
  onToggleMembers,
  membersCount = 1,
}) {
  return (
    <nav
      aria-label="Room Controls Dock"
      className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#0B0B10]/90 backdrop-blur-xl border-t border-white/10"
    >
      <div className="flex items-center gap-3 bg-[#141419] border border-white/10 rounded-2xl p-1.5 shadow-2xl">
        {/* Mic Toggle Button */}
        <Button
          variant={isMuted ? 'secondary' : 'primary'}
          size="default"
          onClick={onToggleMic}
          aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          className="gap-2 font-medium"
        >
          {isMuted ? (
            <>
              <MicOff className="w-4 h-4 text-[#FF5A5F]" />
              <span className="text-xs">Muted</span>
            </>
          ) : (
            <>
              <Mic className="w-4 h-4 text-[#0B0B10]" />
              <span className="text-xs text-[#0B0B10] font-bold">Live</span>
            </>
          )}
        </Button>

        {/* Search YouTube Button */}
        <Button
          variant="secondary"
          size="default"
          onClick={onOpenSearch}
          aria-label="Search YouTube tracks"
          className="gap-2 font-medium"
        >
          <Search className="w-4 h-4 text-[#FF9F1C]" />
          <span className="text-xs">Search</span>
        </Button>

        {/* Members Toggle Button */}
        <Button
          variant="secondary"
          size="default"
          onClick={onToggleMembers}
          aria-label="Toggle members list"
          className="gap-2 font-medium"
        >
          <Users className="w-4 h-4 text-[#2EC4B6]" />
          <span className="text-xs">Members</span>
          <Badge variant="default" className="px-1.5 py-0 text-[10px]">
            {membersCount}
          </Badge>
        </Button>
      </div>
    </nav>
  );
}

export default RoomDock;

