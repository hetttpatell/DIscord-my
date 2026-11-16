import React from 'react';
import { Drawer } from 'vaul';
import { toast } from 'sonner';
import {
  ListMusic,
  X,
  SkipForward,
  Trash2,
  Plus,
  Clock,
  Music2,
  Radio,
} from 'lucide-react';
import { useAppStore } from '../../stores/useAppStore';
import { cn } from '../../lib/utils';

function formatDuration(sec) {
  if (!sec || isNaN(sec)) return '';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

export function QueueSheet({ open, onOpenChange, socket: propSocket, onOpenSearch }) {
  const socket = propSocket || (typeof window !== 'undefined' ? window.__socket : null);
  const queue = useAppStore((s) => s.queue);
  const nowPlaying = useAppStore((s) => s.nowPlaying);

  const totalCount = queue.length + (nowPlaying ? 1 : 0);

  const handleSkip = () => {
    const activeSock = socket?.connected ? socket : (typeof window !== 'undefined' ? window.__socket : socket);
    if (!activeSock) return;
    activeSock.emit('queue:skip');
    toast.info('Skipped to next track');
  };

  const handleRemove = (itemId, title) => {
    const activeSock = socket?.connected ? socket : (typeof window !== 'undefined' ? window.__socket : socket);
    if (!activeSock) return;
    activeSock.emit('queue:remove', { itemId });
    toast.info(`Removed "${title}" from queue`);
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs" />
        <Drawer.Content
          aria-label="Room Playback Queue"
          className={cn(
            'fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-[24px] bg-[#141419] border-t border-white/10 p-4 focus:outline-none max-h-[85dvh] max-w-2xl mx-auto'
          )}
        >
          {/* Drawer Handle */}
          <div className="mx-auto mb-4 h-1.5 w-12 shrink-0 rounded-full bg-white/20" />

          {/* Header */}
          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex items-center gap-2">
              <ListMusic className="w-5 h-5 text-[#FF9F1C]" />
              <Drawer.Title className="text-base font-bold text-[#F4F1EA]">
                Playback Queue
              </Drawer.Title>
              {totalCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-mono font-medium rounded-full bg-[#FF9F1C]/20 text-[#FF9F1C] border border-[#FF9F1C]/30">
                  {totalCount} {totalCount === 1 ? 'song' : 'songs'}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-lg text-[#9A978F] hover:text-[#F4F1EA] hover:bg-white/5 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close queue"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <Drawer.Description className="sr-only">
            View currently playing track and upcoming queue of videos
          </Drawer.Description>

          {/* Scrollable Container */}
          <div className="flex-1 overflow-y-auto overscroll-contain pr-1 custom-scrollbar space-y-5">
            {/* Now Playing Section */}
            <div>
              <div className="flex items-center gap-1.5 mb-2 px-1 text-[11px] font-semibold tracking-wider text-[#9A978F] uppercase">
                <Radio className="w-3.5 h-3.5 text-[#2EC4B6] animate-pulse" />
                <span>Now Playing</span>
              </div>

              {nowPlaying ? (
                <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[#0B0B10] border border-white/10 shadow-inner">
                  {/* Thumbnail */}
                  <div className="relative w-20 h-12 shrink-0 rounded-lg overflow-hidden bg-black/50">
                    <img
                      src={nowPlaying.thumbnail}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    {nowPlaying.durationSeconds > 0 && (
                      <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 text-[9px] font-mono text-white flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {formatDuration(nowPlaying.durationSeconds)}
                      </span>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#F4F1EA] truncate">
                      {nowPlaying.title}
                    </p>
                    <p className="text-xs text-[#9A978F] truncate mt-0.5">
                      {nowPlaying.channel}
                      {nowPlaying.addedByName && (
                        <span className="text-[#9A978F]/70">
                          {' '}
                          • Added by {nowPlaying.addedByName}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Skip Button */}
                  <button
                    type="button"
                    onClick={handleSkip}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-[#FF9F1C] hover:text-[#0B0B10] text-[#F4F1EA] text-xs font-semibold border border-white/10 transition-colors min-h-[44px] cursor-pointer"
                    aria-label="Skip to next track in queue"
                  >
                    <SkipForward className="w-4 h-4" />
                    <span>Skip</span>
                  </button>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-[#0B0B10]/50 border border-white/5 text-center text-[#9A978F] flex items-center justify-between">
                  <span className="text-xs">No video currently playing</span>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenSearch?.();
                    }}
                    className="text-xs font-semibold text-[#FF9F1C] hover:underline cursor-pointer"
                  >
                    Search to play →
                  </button>
                </div>
              )}
            </div>

            {/* Up Next / Queue Section */}
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[11px] font-semibold tracking-wider text-[#9A978F] uppercase">
                  Up Next ({queue.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenSearch?.();
                  }}
                  className="text-xs font-medium text-[#FF9F1C] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Songs</span>
                </button>
              </div>

              {queue.length === 0 ? (
                <div className="py-10 flex flex-col items-center justify-center text-center text-[#9A978F] border border-dashed border-white/10 rounded-2xl p-6">
                  <Music2 className="w-8 h-8 opacity-30 mb-2 text-[#FF9F1C]" />
                  <p className="text-sm font-medium text-[#F4F1EA]">
                    {nowPlaying ? 'No upcoming songs in queue' : 'The queue is empty'}
                  </p>
                  <p className="text-xs text-[#9A978F] mt-1 max-w-xs">
                    {nowPlaying
                      ? 'The track above is currently playing. Add more songs to line them up next!'
                      : 'Search and queue songs to keep the music playing automatically.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenSearch?.();
                    }}
                    className="mt-4 px-4 py-2 text-xs font-semibold rounded-xl bg-[#1C1C24] hover:bg-[#FF9F1C] hover:text-[#0B0B10] border border-white/10 text-[#F4F1EA] transition-all cursor-pointer min-h-[44px] flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Songs to Queue</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2 pb-6" role="list">
                  {queue.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-[#0B0B10]/60 hover:bg-[#1C1C24] border border-white/5 hover:border-white/10 transition-all group"
                    >
                      {/* Queue Index Number */}
                      <span className="w-5 text-center font-mono text-xs font-bold text-[#9A978F]">
                        {index + 1}
                      </span>

                      {/* Thumbnail */}
                      <div className="relative w-20 h-12 shrink-0 rounded-lg overflow-hidden bg-black/40">
                        <img
                          src={item.thumbnail}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {item.durationSeconds > 0 && (
                          <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 text-[9px] font-mono text-white flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {formatDuration(item.durationSeconds)}
                          </span>
                        )}
                      </div>

                      {/* Metadata */}
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="text-sm font-semibold text-[#F4F1EA] truncate">
                          {item.title}
                        </p>
                        <p className="text-xs text-[#9A978F] truncate mt-0.5">
                          {item.channel}
                          {item.addedByName && (
                            <span className="text-[#9A978F]/70">
                              {' '}
                              • Added by {item.addedByName}
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => handleRemove(item.id, item.title)}
                        className="p-2 rounded-lg text-[#9A978F] hover:text-[#FF5A5F] hover:bg-white/5 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                        aria-label={`Remove ${item.title} from queue`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export default QueueSheet;

