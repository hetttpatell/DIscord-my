import React from 'react';

/**
 * Mobile-Friendly YouTube "Up Next" Queue Panel
 * Supports skip, remove from queue, and play track now.
 */
export default function YouTubeQueue({
  queue = [],
  currentTrack = null,
  onRemoveTrack,
  onPlayTrack,
  onSkip
}) {
  return (
    <div className="w-full bg-[#141419]/90 border border-white/10 rounded-2xl p-4 flex flex-col space-y-3 select-none">
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-[#F4F1EA]">Up Next</span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white/70">
            {queue.length}
          </span>
        </div>
        {currentTrack && (
          <button
            type="button"
            onClick={onSkip}
            className="text-xs px-2.5 py-1 bg-white/10 hover:bg-white/15 text-white/90 rounded-lg font-medium transition-colors border border-white/10 active:scale-95"
          >
            Skip Track ⏭
          </button>
        )}
      </div>

      {queue.length === 0 ? (
        <div className="py-6 text-center text-xs text-[#9A978F]">
          Queue is empty. Search YouTube or paste a link to queue tracks!
        </div>
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto overscroll-contain pr-1">
          {queue.map((item, index) => (
            <div
              key={item.entryId || item.queueId || index}
              className="group min-h-[52px] p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center gap-2.5 transition-colors"
            >
              <span className="text-xs font-mono text-white/40 w-4 text-center shrink-0">
                {index + 1}
              </span>
              <img
                src={item.thumbnail}
                alt=""
                className="w-12 h-9 object-cover rounded-md bg-black/40 shrink-0 pointer-events-none"
                loading="lazy"
              />
              <div className="flex-1 min-w-0 pr-1">
                <div className="text-xs font-medium text-white truncate group-hover:text-[#FF9F1C] transition-colors">
                  {item.title}
                </div>
                <div className="text-[10px] text-white/40 truncate">
                  {item.addedBy ? `Added by ${item.addedBy}` : item.channelTitle}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onPlayTrack(item)}
                  title="Play now"
                  className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white text-[11px] rounded-lg active:scale-95 transition-transform"
                >
                  ▶
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveTrack(item.entryId || item.queueId)}
                  title="Remove from queue"
                  className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-[11px] rounded-lg active:scale-95 transition-transform"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

