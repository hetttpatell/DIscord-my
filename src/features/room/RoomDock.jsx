import React from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  SwitchCamera,
  Search,
  ListMusic,
  MessageSquare,
  Users,
} from 'lucide-react';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';

export function RoomDock({
  micOn,
  onToggleMic,
  camOn,
  onToggleCam,
  hasMultipleCameras,
  onFlipCam,
  onOpenSearch,
  onToggleQueue,
  queueCount = 0,
  onToggleChat,
  unreadChatCount = 0,
  onToggleMembers,
  membersCount = 1,
}) {
  return (
    <nav
      aria-label="Room Controls Dock"
      className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-center p-2 sm:p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#0B0B10]/90 backdrop-blur-xl border-t border-white/10"
    >
      <div className="flex items-center gap-1.5 sm:gap-2.5 bg-[#141419] border border-white/10 rounded-2xl p-1.5 shadow-2xl max-w-full overflow-x-auto custom-scrollbar">
        {/* Mic Toggle */}
        <Button
          variant={micOn ? 'primary' : 'secondary'}
          size="default"
          onClick={onToggleMic}
          aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
          className="min-h-[44px] min-w-[44px] px-2.5 sm:px-3 gap-1.5"
        >
          {micOn ? (
            <>
              <Mic className="w-4 h-4 text-[#0B0B10]" />
              <span className="text-xs text-[#0B0B10] font-bold hidden sm:inline">On Air</span>
            </>
          ) : (
            <>
              <MicOff className="w-4 h-4 text-[#FF5A5F]" />
              <span className="text-xs hidden sm:inline">Muted</span>
            </>
          )}
        </Button>

        {/* Camera Toggle */}
        <Button
          variant={camOn ? 'primary' : 'secondary'}
          size="default"
          onClick={onToggleCam}
          aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
          className="min-h-[44px] min-w-[44px] px-2.5 sm:px-3 gap-1.5"
        >
          {camOn ? (
            <>
              <Video className="w-4 h-4 text-[#0B0B10]" />
              <span className="text-xs text-[#0B0B10] font-bold hidden sm:inline">Cam On</span>
            </>
          ) : (
            <>
              <VideoOff className="w-4 h-4 text-[#9A978F]" />
              <span className="text-xs hidden sm:inline">Cam Off</span>
            </>
          )}
        </Button>

        {/* Flip Camera (visible on mobile / when multiple video inputs exist) */}
        {hasMultipleCameras && camOn && (
          <Button
            variant="secondary"
            size="icon"
            onClick={onFlipCam}
            aria-label="Flip camera"
            className="min-h-[44px] min-w-[44px] text-[#9A978F] hover:text-[#F4F1EA]"
          >
            <SwitchCamera className="w-4 h-4" />
          </Button>
        )}

        <div className="h-5 w-px bg-white/10 mx-0.5" />

        {/* Search */}
        <Button
          variant="secondary"
          size="default"
          onClick={onOpenSearch}
          aria-label="Search YouTube tracks"
          className="min-h-[44px] px-2.5 sm:px-3 gap-1.5 font-medium"
        >
          <Search className="w-4 h-4 text-[#FF9F1C]" />
          <span className="text-xs hidden md:inline">Search</span>
        </Button>

        {/* Queue */}
        <Button
          variant="secondary"
          size="default"
          onClick={onToggleQueue}
          aria-label="Open Queue"
          className="min-h-[44px] px-2.5 sm:px-3 gap-1.5 font-medium relative"
        >
          <ListMusic className="w-4 h-4 text-[#FF9F1C]" />
          <span className="text-xs hidden md:inline">Queue</span>
          {queueCount > 0 && (
            <Badge variant="default" className="px-1.5 py-0 text-[10px] ml-0.5">
              {queueCount}
            </Badge>
          )}
        </Button>

        {/* Chat with Unread Badge */}
        <Button
          variant="secondary"
          size="default"
          onClick={onToggleChat}
          aria-label="Open Chat"
          className="min-h-[44px] px-2.5 sm:px-3 gap-1.5 font-medium relative"
        >
          <MessageSquare className="w-4 h-4 text-[#38BDF8]" />
          <span className="text-xs hidden md:inline">Chat</span>
          {unreadChatCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-[#FF5A5F] text-[10px] font-bold text-white shadow-md animate-pulse">
              {unreadChatCount > 99 ? '99+' : unreadChatCount}
            </span>
          )}
        </Button>

        {/* Members */}
        <Button
          variant="secondary"
          size="default"
          onClick={onToggleMembers}
          aria-label="Toggle members list"
          className="min-h-[44px] px-2.5 sm:px-3 gap-1.5 font-medium"
        >
          <Users className="w-4 h-4 text-[#2EC4B6]" />
          <span className="text-xs hidden md:inline">Members</span>
          <Badge variant="default" className="px-1.5 py-0 text-[10px] ml-0.5">
            {membersCount}
          </Badge>
        </Button>
      </div>
    </nav>
  );
}

export default RoomDock;
