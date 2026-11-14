import React, { useState, useEffect } from 'react';
import { useDebounce } from 'use-debounce';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, X, Loader2, Music2, AlertCircle, Clock } from 'lucide-react';
import { Drawer } from 'vaul';
import { apiRequest } from '../../lib/api';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../stores/useAppStore';

function formatDuration(sec) {
  if (!sec || isNaN(sec)) return '';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

export function YouTubeSearchSheet({ open, onOpenChange, socket }) {
  const token = useAppStore((s) => s.token);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedQuery] = useDebounce(searchTerm, 350);

  const {
    data: results = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['youtubeSearch', debouncedQuery],
    queryFn: async ({ signal }) => {
      const q = encodeURIComponent(debouncedQuery.trim());
      const res = await apiRequest(`/api/search?q=${q}`, {
        method: 'GET',
        token,
        signal,
      });
      return res;
    },
    enabled: Boolean(debouncedQuery && debouncedQuery.trim().length > 0),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 10, // 10 minutes client cache matching server TTL
  });

  // Display error toast via Sonner on API failure
  useEffect(() => {
    if (isError && error) {
      toast.error(error.message || 'YouTube search failed');
    }
  }, [isError, error]);

  const handleSelect = (videoId) => {
    // Emit player:set-video directly in the tap handler without awaiting
    socket?.emit('player:set-video', { videoId });
    // Close the sheet
    onOpenChange(false);
  };

  const handleClear = () => {
    setSearchTerm('');
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs" />
        <Drawer.Content
          aria-label="YouTube Search Drawer"
          className={cn(
            'fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-[24px] bg-[#141419] border-t border-white/10 p-4 focus:outline-none max-h-[85dvh] max-w-2xl mx-auto'
          )}
        >
          {/* Drawer Handle */}
          <div className="mx-auto mb-4 h-1.5 w-12 shrink-0 rounded-full bg-white/20" />

          {/* Header */}
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <Music2 className="w-5 h-5 text-[#FF9F1C]" />
              <Drawer.Title className="text-base font-bold text-[#F4F1EA]">
                Search YouTube
              </Drawer.Title>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-lg text-[#9A978F] hover:text-[#F4F1EA] hover:bg-white/5 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close search"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <Drawer.Description className="sr-only">
            Search for YouTube videos to play in sync with everyone in the room
          </Drawer.Description>

          {/* Search Input Container */}
          <div className="relative mb-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9A978F]" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search songs, artists, or paste video title..."
              style={{ fontSize: '16px' }} // Ensures iOS does not zoom
              className="w-full h-12 min-h-[44px] pl-10 pr-10 rounded-xl bg-[#0B0B10] border border-white/10 text-base text-[#F4F1EA] placeholder:text-[#9A978F]/60 focus:outline-none focus:ring-2 focus:ring-[#FF9F1C] focus:border-transparent transition-all"
              autoFocus
            />
            {searchTerm && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-[#9A978F] hover:text-[#F4F1EA] cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Clear search query"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto overscroll-contain pr-1 custom-scrollbar min-h-[260px]">
            {/* Loading State */}
            {isLoading && (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-[#9A978F]">
                <Loader2 className="w-6 h-6 animate-spin text-[#FF9F1C]" />
                <p className="text-xs">Searching YouTube...</p>
              </div>
            )}

            {/* Error State */}
            {isError && (
              <div className="py-10 flex flex-col items-center justify-center text-center p-4">
                <AlertCircle className="w-8 h-8 text-[#FF5A5F] mb-2" />
                <p className="text-sm font-medium text-[#F4F1EA]">
                  {error?.message || 'Search failed'}
                </p>
                <p className="text-xs text-[#9A978F] mt-1 max-w-xs">
                  Please verify your query or check your connection and try again.
                </p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="mt-4 px-4 py-2 text-xs font-semibold rounded-xl bg-[#1C1C24] hover:bg-[#252530] border border-white/10 text-[#F4F1EA] cursor-pointer min-h-[44px]"
                >
                  Retry Search
                </button>
              </div>
            )}

            {/* Empty Initial State */}
            {!isLoading && !isError && debouncedQuery.trim() === '' && (
              <div className="py-14 flex flex-col items-center justify-center text-center text-[#9A978F] p-4">
                <Search className="w-8 h-8 opacity-30 mb-2" />
                <p className="text-sm font-medium text-[#F4F1EA]">Find music for the room</p>
                <p className="text-xs text-[#9A978F] mt-1">
                  Type any video title or artist to search
                </p>
              </div>
            )}

            {/* No Results State */}
            {!isLoading &&
              !isError &&
              debouncedQuery.trim() !== '' &&
              results.length === 0 && (
                <div className="py-12 flex flex-col items-center justify-center text-center text-[#9A978F] p-4">
                  <p className="text-sm font-medium text-[#F4F1EA]">No results found</p>
                  <p className="text-xs text-[#9A978F] mt-1">
                    Try different keywords or check spelling
                  </p>
                </div>
              )}

            {/* Results List */}
            {!isLoading && !isError && results.length > 0 && (
              <div className="space-y-2 pb-6" role="list">
                {results.map((video) => (
                  <button
                    key={video.videoId}
                    type="button"
                    onClick={() => handleSelect(video.videoId)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-[#0B0B10]/60 hover:bg-[#1C1C24] border border-white/5 hover:border-white/10 transition-all text-left cursor-pointer min-h-[44px] group"
                    aria-label={`Play ${video.title} by ${video.channel}`}
                  >
                    {/* Thumbnail with duration */}
                    <div className="relative w-24 h-14 shrink-0 rounded-lg overflow-hidden bg-black/40">
                      <img
                        src={video.thumbnailUrl}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                      {video.durationSec > 0 && (
                        <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/80 text-[10px] font-mono text-white flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {formatDuration(video.durationSec)}
                        </span>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-sm font-semibold text-[#F4F1EA] truncate group-hover:text-[#FF9F1C] transition-colors">
                        {video.title}
                      </p>
                      <p className="text-xs text-[#9A978F] truncate mt-0.5">
                        {video.channel}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export default YouTubeSearchSheet;

