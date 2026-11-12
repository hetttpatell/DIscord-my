import React from 'react';
import { 
  ListMusic, 
  Play, 
  Trash2, 
  Plus, 
  Clock, 
  User, 
  Music 
} from 'lucide-react';
import socket from '../services/socket';

export default function QueuePanel({
  queue = [],
  currentTrack,
  onOpenSearch,
  isHost,
  djMode
}) {
  const handlePlayNow = (queueId) => {
    if (djMode && !isHost) return;
    socket.emit('queue:play-now', { queueId });
  };

  const handleRemove = (queueId) => {
    socket.emit('queue:remove', { queueId });
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900/80 border border-white/10 rounded-3xl p-5 backdrop-blur-xl shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
            <ListMusic className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Shared Queue</span>
              <span className="text-xs bg-white/10 text-zinc-300 px-2 py-0.5 rounded-full font-mono">
                {queue.length}
              </span>
            </h3>
            <p className="text-[11px] text-zinc-400">Plays in order automatically</p>
          </div>
        </div>

        <button
          onClick={onOpenSearch}
          className="flex items-center gap-1.5 bg-violet-600/30 hover:bg-violet-600 text-violet-300 hover:text-white border border-violet-500/30 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add</span>
        </button>
      </div>

      {/* Queue List */}
      <div className="flex-1 overflow-y-auto py-3 space-y-2 pr-1 custom-scrollbar">
        {queue.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center mb-3">
              <Music className="w-6 h-6 opacity-40 text-violet-400" />
            </div>
            <p className="text-xs font-medium text-zinc-400 mb-1">Queue is empty</p>
            <p className="text-[11px] text-zinc-500 max-w-[200px] mb-4">
              Add songs from YouTube to keep the room party going uninterrupted!
            </p>
            <button
              onClick={onOpenSearch}
              className="text-xs text-violet-400 hover:text-violet-300 font-semibold underline underline-offset-4"
            >
              Browse music now
            </button>
          </div>
        ) : (
          queue.map((track, idx) => (
            <div
              key={track.queueId || idx}
              className="group flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all"
            >
              <span className="text-xs font-mono font-bold text-zinc-500 w-5 text-center flex-shrink-0">
                {idx + 1}
              </span>

              <img
                src={track.thumbnail}
                alt={track.title}
                className="w-12 h-10 object-cover rounded-lg flex-shrink-0 bg-zinc-800"
              />

              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-semibold text-white truncate group-hover:text-violet-400 transition-colors">
                  {track.title}
                </h4>
                <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                  <span className="truncate">{track.channelTitle}</span>
                  <span>•</span>
                  <span className="text-violet-400/90 font-medium truncate flex items-center gap-1">
                    <User className="w-2.5 h-2.5" />
                    {track.addedBy || 'Member'}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {(!djMode || isHost) && (
                  <button
                    onClick={() => handlePlayNow(track.queueId)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                    title="Play Now"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>
                )}
                <button
                  onClick={() => handleRemove(track.queueId)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Remove from queue"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

