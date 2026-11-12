import React, { useState, useEffect } from 'react';
import { 
  Search, 
  X, 
  Link as LinkIcon, 
  Sparkles, 
  Plus, 
  Play, 
  Key, 
  Loader2, 
  Check, 
  Music
} from 'lucide-react';
import { 
  CURATED_TRACKS, 
  searchYouTube, 
  fetchVideoDetails, 
  extractYouTubeId 
} from '../services/youtube';
import socket from '../services/socket';

export default function SearchModal({
  isOpen,
  onClose,
  apiKey,
  onOpenApiKeyModal
}) {
  const [activeTab, setActiveTab] = useState('curated'); // 'search' | 'url' | 'curated'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  // Link paste state
  const [pastedUrl, setPastedUrl] = useState('');
  const [pastedPreview, setPastedPreview] = useState(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  // Feedback states
  const [addedIds, setAddedIds] = useState(new Set());

  // Default to search tab if apiKey is present
  useEffect(() => {
    if (apiKey) {
      setActiveTab('search');
    }
  }, [apiKey]);

  if (!isOpen) return null;

  const handleSearchSubmit = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const results = await searchYouTube(searchQuery, apiKey);
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError('No videos found for this search. Try different keywords or paste a direct YouTube link.');
      }
    } catch (err) {
      console.error(err);
      setSearchError(err.message || 'Error searching YouTube. Please check your API key or connection.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleUrlChange = async (e) => {
    const val = e.target.value;
    setPastedUrl(val);
    setPreviewError(null);
    setPastedPreview(null);

    const videoId = extractYouTubeId(val);
    if (videoId) {
      setIsLoadingPreview(true);
      try {
        const details = await fetchVideoDetails(videoId);
        setPastedPreview(details);
      } catch (err) {
        setPreviewError('Could not fetch details for this video. Please check the URL.');
      } finally {
        setIsLoadingPreview(false);
      }
    }
  };

  const addTrackToQueue = (track) => {
    socket.emit('queue:add', { track });
    setAddedIds(prev => new Set(prev).add(track.id));
    setTimeout(() => {
      setAddedIds(prev => {
        const next = new Set(prev);
        next.delete(track.id);
        return next;
      });
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div 
        className="relative w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Music className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Add Music to Room</h2>
              <p className="text-xs text-zinc-400">Collaborative queue for everyone</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-white/5 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-white/5">
          <button
            onClick={() => setActiveTab('search')}
            className={`flex items-center gap-2 pb-3 px-2 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'search'
                ? 'border-violet-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Search YouTube</span>
            {!apiKey && (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full border border-amber-500/30">
                Key needed
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('url')}
            className={`flex items-center gap-2 pb-3 px-2 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'url'
                ? 'border-violet-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <LinkIcon className="w-4 h-4" />
            <span>Paste Link / Video ID</span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full border border-emerald-500/30">
              No Key
            </span>
          </button>

          <button
            onClick={() => setActiveTab('curated')}
            className={`flex items-center gap-2 pb-3 px-2 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'curated'
                ? 'border-violet-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span>Instant Hits & Lo-Fi</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* TAB 1: Search YouTube */}
          {activeTab === 'search' && (
            <div className="space-y-4">
              {!apiKey && (
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
                  <div className="flex items-center gap-2.5">
                    <Key className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span>Configure your YouTube API Key to search the full YouTube catalog directly.</span>
                  </div>
                  <button
                    onClick={onOpenApiKeyModal}
                    className="flex-shrink-0 ml-3 bg-amber-500 hover:bg-amber-400 text-black font-semibold px-3 py-1.5 rounded-lg transition-all"
                  >
                    Set Key
                  </button>
                </div>
              )}

              <form onSubmit={handleSearchSubmit} className="relative">
                <input
                  type="text"
                  placeholder="Search songs, artists, channels or beats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-11 pr-24 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
                />
                <Search className="w-5 h-5 text-zinc-400 absolute left-3.5 top-3.5" />
                <button
                  type="submit"
                  disabled={isSearching || !searchQuery.trim()}
                  className="absolute right-2 top-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-xl transition-all"
                >
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                </button>
              </form>

              {searchError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  {searchError}
                </div>
              )}

              {/* Search Results List */}
              <div className="space-y-2 mt-4">
                {searchResults.map((track) => {
                  const isAdded = addedIds.has(track.id);
                  return (
                    <div
                      key={track.id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all group"
                    >
                      <img
                        src={track.thumbnail}
                        alt={track.title}
                        className="w-16 h-12 object-cover rounded-xl flex-shrink-0 bg-zinc-800"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-white truncate group-hover:text-violet-400 transition-colors">
                          {track.title}
                        </h4>
                        <p className="text-xs text-zinc-400 truncate">{track.channelTitle}</p>
                      </div>
                      <button
                        onClick={() => addTrackToQueue(track)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                          isAdded
                            ? 'bg-emerald-600 text-white'
                            : 'bg-violet-600/30 hover:bg-violet-600 text-violet-300 hover:text-white border border-violet-500/30'
                        }`}
                      >
                        {isAdded ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Added!</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: Paste URL */}
          {activeTab === 'url' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-zinc-800/50 border border-white/10 text-xs text-zinc-300">
                Paste any YouTube video link (e.g. <span className="font-mono text-violet-400">https://youtu.be/...</span> or <span className="font-mono text-violet-400">https://youtube.com/watch?v=...</span>) or an 11-character video ID. No API key needed!
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Paste YouTube Link or Video ID here..."
                  value={pastedUrl}
                  onChange={handleUrlChange}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-11 pr-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all font-mono"
                />
                <LinkIcon className="w-5 h-5 text-zinc-400 absolute left-3.5 top-3.5" />
              </div>

              {isLoadingPreview && (
                <div className="flex items-center justify-center p-8 text-zinc-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
                  <span className="text-sm">Fetching video preview...</span>
                </div>
              )}

              {previewError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  {previewError}
                </div>
              )}

              {pastedPreview && (
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col md:flex-row items-center gap-4 animate-scale-up">
                  <img
                    src={pastedPreview.thumbnail}
                    alt={pastedPreview.title}
                    className="w-full md:w-44 h-28 object-cover rounded-xl shadow-md"
                  />
                  <div className="flex-1 min-w-0 text-center md:text-left">
                    <h4 className="text-sm font-bold text-white mb-1 line-clamp-2">
                      {pastedPreview.title}
                    </h4>
                    <p className="text-xs text-zinc-400 mb-3">{pastedPreview.channelTitle}</p>
                    <button
                      onClick={() => {
                        addTrackToQueue(pastedPreview);
                        setPastedUrl('');
                        setPastedPreview(null);
                      }}
                      className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg shadow-violet-600/30 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add to Room Queue</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Curated Tracks */}
          {activeTab === 'curated' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Tested high-quality music streams & radio:</span>
                <span className="text-violet-400 font-semibold">{CURATED_TRACKS.length} available</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {CURATED_TRACKS.map((track) => {
                  const isAdded = addedIds.has(track.id);
                  return (
                    <div
                      key={track.id}
                      className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all group"
                    >
                      <img
                        src={track.thumbnail}
                        alt={track.title}
                        className="w-16 h-12 object-cover rounded-xl flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-violet-400">
                          {track.category}
                        </span>
                        <h4 className="text-xs font-bold text-white truncate group-hover:text-violet-300 transition-colors">
                          {track.title}
                        </h4>
                        <p className="text-[11px] text-zinc-400 truncate">{track.channelTitle}</p>
                      </div>
                      <button
                        onClick={() => addTrackToQueue(track)}
                        className={`p-2 rounded-xl transition-all ${
                          isAdded
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white/10 hover:bg-violet-600 text-zinc-300 hover:text-white'
                        }`}
                        title="Add to Queue"
                      >
                        {isAdded ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

