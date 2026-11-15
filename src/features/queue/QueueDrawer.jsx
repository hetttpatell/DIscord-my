import React from 'react';
import {
  ListMusic,
  Play,
  Trash2,
  ChevronUp,
  ChevronDown,
  FastForward,
  Music,
} from 'lucide-react';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { useAppStore } from '../../stores/useAppStore';

function formatDuration(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const s = Math.floor(sec);
  const mins = Math.floor(s / 60);
  const remSec = s % 60;
  return `${mins}:${remSec.toString().padStart(2, '0')}`;
}

export function QueueDrawer({
  socket,
  currentSocketId,
  currentMemberId,
  onOpenSearch,
}) {
  const queue = useAppStore((s) => s.queue);
  const nowPlaying = useAppStore((s) => s.nowPlaying);
  const members = useAppStore((s) => s.members);
  const skipVotes = useAppStore((s) => s.skipVotes);

  // Check if current user is host
  const currentUser = members.find(
    (m) => m.id === currentSocketId || m.memberId === currentMemberId
  );
  const isHost = Boolean(currentUser?.isHost);

  const handlePlayNow = (itemId) => {
    if (!socket || !isHost) return;
    socket.emit('queue:playNow', { itemId });
  };

  const handleRemove = (itemId) => {
    if (!socket) return;
    socket.emit('queue:remove', { itemId });
  };

  const handleMove = (itemId, direction) => {
    if (!socket || !isHost) return;
    socket.emit('queue:move', { itemId, direction });
  };

  const handleVoteSkip = () => {
    if (!socket) return;
    socket.emit('queue:skip');
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#141419]/90 select-none overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <ListMusic className="w-4 h-4 text-[#FF9F1C]" />
          <span className="text-xs font-semibold text-[#F4F1EA] uppercase tracking-wider">
            Up Next
          </span>
          <Badge variant="default" className="text-[10px] px-1.5 py-0">
            {queue.length}
          </Badge>
        </div>

        {onOpenSearch && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenSearch}
            className="text-xs text-[#FF9F1C] hover:bg-[#FF9F1C]/10 h-7"
          >
            + Add Song
          </Button>
        )}
      </div>

      {/* Now Playing Banner */}
      <div className="p-3 bg-[#1C1C24]/80 border-b border-white/10 shrink-0">
        <span className="text-[10px] font-semibold text-[#2EC4B6] uppercase tracking-wider block mb-2">
          Now Playing
        </span>

        {nowPlaying ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={nowPlaying.thumbnail}
                alt={nowPlaying.title}
                className="w-12 h-8 rounded-lg object-cover shrink-0 border border-white/10"
              />
              <div className="min-w-0 flex flex-col">
                <span className="text-xs font-semibold text-[#F4F1EA] truncate">
                  {nowPlaying.title}
                </span>
                <span className="text-[10px] text-[#9A978F] truncate">
                  {nowPlaying.channel} • Added by {nowPlaying.addedByName}
                </span>
              </div>
            </div>

            {/* Skip Button */}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleVoteSkip}
              className="gap-1.5 text-xs shrink-0 font-medium"
              aria-label="Skip track"
            >
              <FastForward className="w-3.5 h-3.5 text-[#FF9F1C]" />
              <span>
                {isHost
                  ? 'Skip'
                  : `Skip (${skipVotes?.votes || 0}/${skipVotes?.needed || Math.floor(members.length / 2) + 1})`}
              </span>
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 py-1 text-xs text-[#9A978F]">
            <Music className="w-4 h-4 text-[#9A978F]/50" />
            <span>Nothing playing right now</span>
          </div>
        )}
      </div>

      {/* Queue items list */}
      <div className="flex-1 p-3 overflow-y-auto space-y-2 custom-scrollbar">
        {queue.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <ListMusic className="w-8 h-8 text-[#9A978F]/30 mb-2" />
            <p className="text-xs font-medium text-[#9A978F]">Queue is empty</p>
            <p className="text-[11px] text-[#9A978F]/60 mt-0.5">
              Search and add tracks to keep the music flowing!
            </p>
            {onOpenSearch && (
              <Button
                variant="primary"
                size="sm"
                onClick={onOpenSearch}
                className="mt-3 text-xs"
              >
                Search Tracks
              </Button>
            )}
          </div>
        ) : (
          queue.map((item, index) => {
            const canRemove =
              isHost ||
              item.addedById === currentSocketId ||
              item.addedById === currentMemberId;

            return (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 rounded-xl bg-[#1C1C24]/50 border border-white/5 hover:border-white/10 transition-colors gap-2"
              >
                {/* Index & Thumbnail */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-[11px] font-mono text-[#9A978F] w-4 text-center shrink-0">
                    {index + 1}
                  </span>
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-10 h-7 rounded-md object-cover shrink-0 border border-white/10"
                  />
                  <div className="min-w-0 flex flex-col">
                    <span className="text-xs font-medium text-[#F4F1EA] truncate">
                      {item.title}
                    </span>
                    <span className="text-[10px] text-[#9A978F] truncate">
                      {item.channel} • {formatDuration(item.durationSeconds)} • by {item.addedByName}
                    </span>
                  </div>
                </div>

                {/* Host / Owner Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {isHost && (
                    <>
                      {/* Play Now */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handlePlayNow(item.id)}
                        className="h-7 w-7 text-[#2EC4B6] hover:bg-[#2EC4B6]/10"
                        title="Play Now"
                        aria-label="Play item now"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </Button>

                      {/* Move Up */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleMove(item.id, 'up')}
                        disabled={index === 0}
                        className="h-7 w-7 text-[#9A978F] hover:text-[#F4F1EA] disabled:opacity-30"
                        title="Move Up"
                        aria-label="Move item up"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </Button>

                      {/* Move Down */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleMove(item.id, 'down')}
                        disabled={index === queue.length - 1}
                        className="h-7 w-7 text-[#9A978F] hover:text-[#F4F1EA] disabled:opacity-30"
                        title="Move Down"
                        aria-label="Move item down"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}

                  {/* Remove */}
                  {canRemove && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(item.id)}
                      className="h-7 w-7 text-[#FF5A5F] hover:bg-[#FF5A5F]/10"
                      title="Remove from queue"
                      aria-label="Remove item from queue"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default QueueDrawer;

