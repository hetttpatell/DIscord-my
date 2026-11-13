import React, { useState, useEffect, useRef } from 'react';
import { searchYouTube } from '../services/youtube';

/**
 * Mobile-First Touch-Friendly YouTube Search & URL Resolution Sheet
 * - Full row selection (minimum 56px height)
 * - Outside pointerdown dismissal (never blur-based dismissal)
 * - Search input: type="search", enterKeyHint="search", min 16px font-size (no iOS zoom)
 * - dvh viewport adaptation & overscroll-contain
 * - Structured error banners (quota exceeded, invalid key, network)
 */
export default function YouTubeSearchSheet({ isOpen, onClose, onPlayNow, onAddToQueue }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [viewportHeight, setViewportHeight] = useState('85dvh');

  const sheetRef = useRef(null);
  const inputRef = useRef(null);

  // visualViewport adaptation for mobile virtual keyboard
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const handleResize = () => {
      const vv = window.visualViewport;
      if (vv) {
        setViewportHeight(`${Math.round(vv.height * 0.88)}px`);
      }
    };

    window.visualViewport.addEventListener('resize', handleResize);
    window.visualViewport.addEventListener('scroll', handleResize);

    return () => {
      window.visualViewport.removeEventListener('resize', handleResize);
      window.visualViewport.removeEventListener('scroll', handleResize);
    };
  }, []);

  // Outside pointerdown detection (avoids mobile touch swallow bugs caused by input blur)
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target)) {
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen, onClose]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleSearchSubmit = async (e) => {
    if (e) e.preventDefault();
    const clean = query.trim();
    if (clean.length < 2) {
      setErrorMessage('Please enter at least 2 characters or paste a YouTube URL.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const res = await searchYouTube(clean);
    setIsLoading(false);

    if (res.error) {
      setErrorMessage(res.message || 'Error loading YouTube results.');
      setResults([]);
    } else {
      setResults(res.items || []);
      if (res.items?.length === 0) {
        setErrorMessage(res.message || 'No results found. Try pasting a direct YouTube video link.');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-fade-in select-none">
      <div
        ref={sheetRef}
        style={{ maxHeight: viewportHeight }}
        className="w-full sm:max-w-xl bg-[#141419] border border-white/10 rounded-t-[28px] sm:rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col transition-all duration-200 overscroll-contain"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div>
            <h3 className="font-bold text-base sm:text-lg text-[#F4F1EA]">Add Music</h3>
            <p className="text-[11px] text-[#9A978F]">Search YouTube or paste any video/shorts link</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center text-sm font-semibold text-white/80 active:scale-95 transition-transform"
            aria-label="Close search"
          >
            ✕
          </button>
        </div>

        {/* Search Input Form */}
        <form onSubmit={handleSearchSubmit} className="pt-4 pb-2">
          <div className="relative flex items-center">
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or paste youtube.com / youtu.be link..."
              style={{ fontSize: '16px' }} // At least 16px to prevent iOS auto-zoom
              className="w-full pl-4 pr-24 py-3 bg-white/5 border border-white/15 rounded-2xl text-white placeholder-white/35 focus:outline-none focus:border-[#FF9F1C] transition-colors"
            />
            <button
              type="submit"
              disabled={isLoading || query.trim().length < 2}
              className="absolute right-1.5 px-4 py-2 bg-gradient-to-r from-[#FF9F1C] to-[#FF5A5F] hover:opacity-95 disabled:opacity-40 text-white rounded-xl text-xs font-semibold shadow-md active:scale-95 transition-all"
            >
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {/* Error / Notice Banner */}
        {errorMessage && (
          <div className="my-2 p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-200 leading-relaxed">
            {errorMessage}
          </div>
        )}

        {/* Results List */}
        <div className="flex-1 overflow-y-auto overscroll-contain space-y-2 mt-2 pr-1 max-h-[50dvh]">
          {isLoading && (
            <div className="py-12 text-center text-xs text-white/50 animate-pulse">
              Searching YouTube &amp; resolving video metadata...
            </div>
          )}

          {!isLoading && results.map((item) => (
            <div
              key={item.id}
              onClick={() => onPlayNow(item)}
              role="button"
              tabIndex={0}
              className="group min-h-[56px] p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/5 flex items-center gap-3 cursor-pointer transition-colors"
            >
              <img
                src={item.thumbnail}
                alt=""
                className="w-16 h-12 object-cover rounded-lg bg-black/40 shrink-0 pointer-events-none"
                loading="lazy"
              />
              <div className="flex-1 min-w-0 pr-2">
                <div className="text-xs sm:text-sm font-semibold text-white truncate group-hover:text-[#FF9F1C] transition-colors">
                  {item.title}
                </div>
                <div className="text-[11px] text-white/50 truncate mt-0.5">
                  {item.channelTitle}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => onPlayNow(item)}
                  className="px-2.5 py-1.5 bg-gradient-to-r from-[#FF9F1C] to-[#FF5A5F] text-white text-[11px] font-semibold rounded-xl active:scale-95 transition-transform"
                >
                  Play
                </button>
                <button
                  type="button"
                  onClick={() => onAddToQueue(item)}
                  className="px-2.5 py-1.5 bg-white/10 hover:bg-white/15 text-white/90 text-[11px] font-semibold rounded-xl border border-white/10 active:scale-95 transition-transform"
                >
                  Queue
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

