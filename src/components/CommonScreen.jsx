import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  SkipForward, 
  Volume2, 
  VolumeX, 
  Search, 
  Radio, 
  Copy, 
  Check, 
  Crown, 
  MessageSquare, 
  Send, 
  ListMusic, 
  Plus, 
  Trash2, 
  ExternalLink, 
  Key, 
  Sparkles, 
  Clock, 
  UserCheck, 
  XCircle, 
  X, 
  LogOut, 
  Mic, 
  MicOff, 
  Headphones, 
  Settings, 
  Tv, 
  Music, 
  Loader2, 
  Hash, 
  Share2,
  Pencil,
  Menu,
  PanelLeft,
  PanelRight,
  Users
} from 'lucide-react';
import YouTubePlayer from './YouTubePlayer';
import VideoCallGrid from './VideoCallGrid';
import { 
  searchYouTube, 
  extractYouTubeId, 
  fetchVideoDetails, 
  formatTime, 
  CURATED_TRACKS 
} from '../services/youtube';
import socket from '../services/socket';

const QUICK_REACTIONS = ['🔥', '❤️', '🎧', '🕺', '👏', '🚀', '✨', '😂'];

export default function CommonScreen({
  room,
  currentUser,
  currentTrack,
  isPlaying,
  playbackPosition,
  members = [],
  waitingList = [],
  queue = [],
  chatMessages = [],
  floatingReactions = [],
  isHost,
  hasApiKey,
  apiKey,
  onSaveApiKey,
  showApiKeyGuide,
  onToggleApiKeyGuide,
  onCloseApiKeyGuide,
  onLeaveRoom,
  volume,
  setVolume,
  isMuted,
  setIsMuted
}) {
  // Navigation / Tab state for Right Panel: 'chat' | 'queue'
  const [rightTab, setRightTab] = useState('chat');
  // Video Call Mode: 'strip' (camera tiles above YouTube) | 'grid' (Google Meet full grid)
  const [callLayoutMode, setCallLayoutMode] = useState('strip');

  // Player Scrubber
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(playbackPosition || 0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchContainerRef = useRef(null);

  // Chat message state
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);

  // API Key input
  const [keyInput, setKeyInput] = useState(apiKey || '');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keySaveMessage, setKeySaveMessage] = useState(null);

  // UI helpers
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const searchInputRef = useRef(null);

  // Edit Room Name & User Nickname independently
  const [isEditingRoomName, setIsEditingRoomName] = useState(false);
  const [newRoomName, setNewRoomName] = useState(room?.name || '');
  const [isEditingUserName, setIsEditingUserName] = useState(false);
  const [newUserName, setNewUserName] = useState(currentUser?.name || '');

  // Mobile Drawers & Desktop Collapsible Panels (Sliders)
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState(false); // Mobile left channels drawer
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState(false); // Mobile right chat drawer
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false); // Desktop left panel collapse
  const [isRightCollapsed, setIsRightCollapsed] = useState(false); // Desktop right panel collapse

  const handleSaveRoomName = (e) => {
    e?.preventDefault();
    if (newRoomName.trim()) {
      socket.emit('room:update-name', { name: newRoomName.trim() });
      setIsEditingRoomName(false);
    }
  };

  const handleSaveUserName = (e) => {
    e?.preventDefault();
    if (newUserName.trim()) {
      socket.emit('user:update-name', { name: newUserName.trim() });
      setIsEditingUserName(false);
    }
  };

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (rightTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, rightTab]);

  // Sync currentTime with playbackPosition
  useEffect(() => {
    if (!isScrubbing) {
      setCurrentTime(playbackPosition || 0);
    }
  }, [playbackPosition, isScrubbing]);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut Ctrl+K to focus search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen]);

  // Synchronized Playback controls (Host & Members Theater Mode)
  const handlePlayPause = () => {
    const activePos = typeof currentTime === 'number' && currentTime > 0 ? currentTime : (playbackPosition || 0);
    if (isPlaying) {
      socket.emit('player:pause', { currentTime: activePos });
    } else {
      socket.emit('player:play', { currentTime: activePos });
    }
  };

  const handleSeekChange = (e) => {
    setIsScrubbing(true);
    setScrubValue(parseFloat(e.target.value));
  };

  const handleSeekCommit = () => {
    setIsScrubbing(false);
    setCurrentTime(scrubValue);
    socket.emit('player:seek', { currentTime: scrubValue });
  };

  const handleSkipTrack = () => {
    socket.emit('player:skip');
  };

  // Search or Direct URL submit
  const handleSearchSubmit = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;

    // Check if input is a direct YouTube link
    const extractedId = extractYouTubeId(searchQuery.trim());
    if (extractedId) {
      setIsSearching(true);
      try {
        const details = await fetchVideoDetails(extractedId);
        playVideoImmediately(details);
        setSearchQuery('');
        setIsSearchOpen(false);
      } catch (err) {
        setSearchError('Could not load this video. Please check the link.');
      } finally {
        setIsSearching(false);
      }
      return;
    }

    // Otherwise perform YouTube search
    setIsSearching(true);
    setSearchError(null);
    setIsSearchOpen(true);

    try {
      const results = await searchYouTube(searchQuery, apiKey);
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError('No videos found. Try different search terms or paste a direct YouTube video link.');
      }
    } catch (err) {
      setSearchError('Search failed. Please try again or paste a direct YouTube link.');
    } finally {
      setIsSearching(false);
    }
  };

  const playVideoImmediately = (track) => {
    socket.emit('player:set-track', { track });
    setIsSearchOpen(false);
    setSearchQuery('');
  };

  const addTrackToQueue = (track) => {
    socket.emit('queue:add', { track });
  };

  const handlePlayNowFromQueue = (queueId) => {
    socket.emit('queue:play-now', { queueId });
  };

  const handleRemoveFromQueue = (queueId) => {
    socket.emit('queue:remove', { queueId });
  };

  // Chat message send
  const handleSendMessage = (e) => {
    e?.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('chat:message', { text: chatInput.trim() });
    setChatInput('');
  };

  // Reactions
  const handleSendReaction = (emoji) => {
    socket.emit('reaction:send', { emoji });
  };

  // Host Waiting List Actions
  const handleApproveUser = (userId) => {
    socket.emit('room:approve-user', { userId });
  };

  const handleApproveAll = () => {
    socket.emit('room:approve-all');
  };

  const handleRejectUser = (userId) => {
    socket.emit('room:reject-user', { userId });
  };

  // Save Key handler
  const handleSaveKeySubmit = async () => {
    if (!keyInput.trim()) return;
    setIsSavingKey(true);
    setKeySaveMessage(null);
    try {
      await onSaveApiKey(keyInput.trim());
      setKeySaveMessage({ success: true, text: 'API Key saved successfully!' });
    } catch (err) {
      setKeySaveMessage({ success: false, text: 'Error saving key.' });
    } finally {
      setIsSavingKey(false);
    }
  };

  // Copy Room link and ID
  const handleCopyInviteLink = () => {
    if (!room?.id) return;
    const url = `${window.location.origin}?room=${room.id}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyId = () => {
    if (!room?.id) return;
    navigator.clipboard.writeText(room.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const activeTime = isScrubbing ? scrubValue : currentTime;

  return (
    <div className="flex flex-col h-full h-[100dvh] w-full max-w-full bg-[#1e1f22] text-[#dbdee1] overflow-hidden overscroll-none select-none font-sans fixed inset-0">
      
      {/* 1. DISCORD TOP TITLEBAR / APP HEADER */}
      <header className="h-12 bg-[#1e1f22] border-b border-[#232428] px-2.5 sm:px-4 flex items-center justify-between flex-shrink-0 relative z-50">
        {/* Left: Mobile Drawer Trigger, Desktop Collapse & Room Title */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          {/* Mobile Drawer Hamburger Button */}
          <button
            onClick={() => {
              setIsLeftDrawerOpen(true);
              setIsRightDrawerOpen(false);
            }}
            className="p-1.5 rounded-lg text-[#949ba4] hover:text-white hover:bg-[#2b2d31] lg:hidden transition-colors flex-shrink-0 active:scale-95"
            title="Channels & Members Drawer"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Desktop Left Sidebar Toggle */}
          <button
            onClick={() => setIsLeftCollapsed(!isLeftCollapsed)}
            className="hidden lg:flex p-1.5 rounded-lg text-[#949ba4] hover:text-white hover:bg-[#2b2d31] transition-colors flex-shrink-0"
            title={isLeftCollapsed ? 'Expand Channels' : 'Collapse Channels'}
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-[#5865f2] to-[#4752c4] text-white flex items-center justify-center shadow-md font-bold text-xs sm:text-sm flex-shrink-0 ring-2 ring-[#5865f2]/30">
              {/* afterspot Custom Logo */}
              <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 46L32 15L45 46" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M24 35H40" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
                <circle cx="46" cy="17" r="7.5" fill="#23A55A" stroke="#1E1F22" strokeWidth="2.5" />
                <circle cx="46" cy="17" r="3" fill="#FFFFFF" />
              </svg>
            </div>
            <div className="min-w-0">
              {isEditingRoomName ? (
                <form onSubmit={handleSaveRoomName} className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    autoFocus
                    placeholder="Room Name"
                    className="bg-[#111214] border border-[#5865f2] rounded px-2 py-0.5 text-xs text-white focus:outline-none w-28 sm:w-40 font-bold"
                  />
                  <button type="submit" className="p-1 text-[#23a55a] hover:bg-[#2b2d31] rounded" title="Save Room Name">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => setIsEditingRoomName(false)} className="p-1 text-[#f23f43] hover:bg-[#2b2d31] rounded" title="Cancel">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                  <span className="font-bold text-white text-xs sm:text-sm tracking-wide max-w-[95px] xs:max-w-[130px] sm:max-w-[160px] md:max-w-[200px] truncate">
                    {room.name || 'afterspot Lounge'}
                  </span>
                  {isHost && (
                    <button
                      onClick={() => {
                        setNewRoomName(room.name || '');
                        setIsEditingRoomName(true);
                      }}
                      className="p-1 text-[#949ba4] hover:text-white rounded hover:bg-[#2b2d31] transition-colors flex-shrink-0"
                      title="Rename Room"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  <span className="hidden sm:inline-block text-[10px] bg-[#2b2d31] text-[#949ba4] border border-[#383a40] px-1.5 py-0.5 rounded font-mono flex-shrink-0">
                    {room.id}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="hidden sm:block h-4 w-[1px] bg-[#383a40] mx-0.5" />

          {/* Quick Copy ID & Invite Buttons (Desktop) */}
          <button
            onClick={handleCopyId}
            className="hidden sm:flex items-center gap-1 text-xs text-[#949ba4] hover:text-[#dbdee1] bg-[#2b2d31] hover:bg-[#35373c] px-2 py-1 rounded-md transition-colors"
            title="Copy Room ID"
          >
            {copiedId ? <Check className="w-3.5 h-3.5 text-[#23a55a]" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="font-mono text-[11px]">ID</span>
          </button>

          <button
            onClick={handleCopyInviteLink}
            className="hidden md:flex items-center gap-1 text-xs text-white bg-[#5865f2] hover:bg-[#4752c4] px-2.5 py-1 rounded-md font-semibold transition-colors shadow-sm"
            title="Copy Invite Link"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>Invite</span>
          </button>
        </div>

        {/* Subtle click-dismissal backdrop behind dropdown */}
        {isSearchOpen && (
          <div 
            className="fixed inset-0 z-40 bg-black/75 backdrop-blur-[2px] animate-fade-in"
            onClick={() => setIsSearchOpen(false)}
          />
        )}

        {/* Center: Discord / Spotify Integrated Global Search Bar (Desktop) */}
        <div ref={searchContainerRef} className="relative z-50 flex-1 max-w-2xl mx-3 sm:mx-4 hidden md:block">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <div className="absolute left-3 flex items-center pointer-events-none text-[#949ba4]">
              {isSearching ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#5865f2]" />
              ) : (
                <Search className="w-4 h-4 text-[#949ba4]" />
              )}
            </div>

            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search YouTube songs, artists, or paste a link..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!isSearchOpen) setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              className="w-full bg-[#111214] hover:bg-[#1e1f22]/70 focus:bg-[#1e1f22] border border-[#383a40] focus:border-[#5865f2] rounded-lg py-1.5 pl-9 pr-24 text-xs text-white placeholder-[#80848e] focus:outline-none focus:ring-1 focus:ring-[#5865f2] transition-all shadow-inner"
            />

            <div className="absolute right-2 flex items-center gap-1.5">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setSearchError(null);
                  }}
                  className="p-1 text-[#949ba4] hover:text-white rounded hover:bg-[#2b2d31] transition-colors"
                  title="Clear"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="submit"
                disabled={isSearching || !searchQuery.trim()}
                className="inline-block text-[11px] font-bold text-[#5865f2] hover:text-white hover:bg-[#5865f2] border border-[#5865f2]/40 px-2 py-0.5 rounded transition-all disabled:opacity-30 disabled:pointer-events-none"
              >
                Go
              </button>
              <kbd className="hidden md:inline-block text-[10px] bg-[#2b2d31] border border-[#383a40] text-[#949ba4] px-1.5 py-0.5 rounded font-mono pointer-events-none">
                Ctrl+K
              </kbd>
            </div>
          </form>

          {/* Desktop Integrated Search Dropdown */}
          {isSearchOpen && (
            <div className="absolute left-0 right-0 top-full mt-2 bg-[#2b2d31] border border-[#4e5058] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] z-50 overflow-hidden flex flex-col max-h-[75vh] animate-fade-in">
              {/* Quick Preset Genre Chips */}
              <div className="px-3 py-2 bg-[#232428] border-b border-[#1f2023] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <span className="text-[10px] uppercase font-bold text-[#80848e] mr-1 flex-shrink-0">
                  Quick Play:
                </span>
                {CURATED_TRACKS.map((track) => (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => {
                      playVideoImmediately(track);
                      setIsSearchOpen(false);
                    }}
                    className="flex-shrink-0 text-[11px] px-2.5 py-1 rounded-full bg-[#1e1f22] hover:bg-[#5865f2] hover:text-white border border-[#383a40] text-[#dbdee1] transition-colors font-medium flex items-center gap-1 active:scale-95"
                  >
                    <Sparkles className="w-3 h-3 text-[#f0b232]" />
                    <span>{track.title.split('-')[0].trim()}</span>
                  </button>
                ))}
              </div>

              {/* Search Results */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5 max-h-[420px]">
                {isSearching ? (
                  <div className="py-8 flex flex-col items-center justify-center text-[#949ba4] gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-[#5865f2]" />
                    <span className="text-xs">Searching YouTube catalog...</span>
                  </div>
                ) : searchError ? (
                  <div className="p-3 text-xs text-[#f23f43] bg-[#f23f43]/10 border border-[#f23f43]/20 rounded-lg">
                    {searchError}
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((video) => (
                    <div
                      key={video.id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[#1e1f22] hover:bg-[#35373c] border border-[#383a40] hover:border-[#5865f2]/60 transition-all group shadow-sm"
                    >
                      <div className="relative w-20 h-12 flex-shrink-0 rounded-md overflow-hidden bg-black border border-[#383a40]">
                        <img
                          src={video.thumbnail}
                          alt={video.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                        {video.duration && (
                          <span className="absolute bottom-0.5 right-1 text-[9px] bg-black/80 text-white font-mono px-1 rounded">
                            {video.duration}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-semibold text-white truncate group-hover:text-[#5865f2] transition-colors">
                          {video.title}
                        </h4>
                        <p className="text-[11px] text-[#949ba4] truncate">{video.channelTitle}</p>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            playVideoImmediately(video);
                            setIsSearchOpen(false);
                          }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-bold transition-all shadow-sm active:scale-95"
                          title="Stream Now"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Play</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            addTrackToQueue(video);
                          }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#383a40] hover:bg-[#404249] text-white text-xs font-medium transition-all border border-[#4e5058] active:scale-95"
                          title="Add to shared room queue"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Queue</span>
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-2.5 px-2">
                    <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#949ba4] mb-2 px-1">
                      <span>Featured Radio &amp; Streams</span>
                      <span className="text-[10px] text-[#5865f2] font-normal normal-case">Or type above to search anything</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {CURATED_TRACKS.map((track) => (
                        <div
                          key={track.id}
                          onClick={() => {
                            playVideoImmediately(track);
                            setIsSearchOpen(false);
                          }}
                          className="flex items-center gap-2.5 p-2 rounded-lg bg-[#1e1f22] hover:bg-[#35373c] border border-[#383a40] hover:border-[#5865f2]/60 cursor-pointer transition-all group shadow-sm"
                        >
                          <img
                            src={track.thumbnail}
                            alt={track.title}
                            className="w-12 h-9 rounded object-cover flex-shrink-0 bg-black"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-[#dbdee1] group-hover:text-white truncate">
                              {track.title}
                            </p>
                            <span className="text-[10px] text-[#949ba4] block truncate">
                              {track.channelTitle}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Dropdown Footer */}
              <div className="px-3 py-1.5 bg-[#232428] border-t border-[#1f2023] flex items-center justify-between text-[11px] text-[#949ba4]">
                <span>Type and press <kbd className="bg-[#1e1f22] px-1 rounded text-[#dbdee1]">Enter</kbd> to search YouTube</span>
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(false)}
                  className="hover:text-white transition-colors"
                >
                  Close (Esc)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Actions on Desktop & Sleek Mobile Actions */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {/* Mobile Search Button (Triggers Mobile Search Modal) */}
          <button
            onClick={() => {
              setIsSearchOpen(true);
            }}
            className="p-1.5 rounded-lg text-[#949ba4] hover:text-white hover:bg-[#2b2d31] md:hidden transition-colors active:scale-95"
            title="Search YouTube"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Mobile Chat / Queue Drawer Button */}
          <button
            onClick={() => {
              setIsRightDrawerOpen(true);
              setIsLeftDrawerOpen(false);
            }}
            className="relative p-1.5 rounded-lg text-[#949ba4] hover:text-white hover:bg-[#2b2d31] lg:hidden transition-colors active:scale-95"
            title="Open Chat & Queue"
          >
            <MessageSquare className="w-5 h-5" />
            {chatMessages.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#5865f2]" />
            )}
          </button>

          {/* Desktop Right Sidebar Toggle (Sliders style) */}
          <button
            onClick={() => setIsRightCollapsed(!isRightCollapsed)}
            className="hidden lg:flex p-1.5 rounded-lg text-[#949ba4] hover:text-white hover:bg-[#2b2d31] transition-colors"
            title={isRightCollapsed ? 'Expand Chat & Queue' : 'Collapse Chat & Queue'}
          >
            <PanelRight className="w-4 h-4" />
          </button>

          {/* YouTube API Key indicator (Desktop) */}
          <button
            onClick={onToggleApiKeyGuide}
            className="hidden sm:flex items-center gap-1.5 text-xs text-[#949ba4] hover:text-[#dbdee1] bg-[#2b2d31] hover:bg-[#35373c] px-2.5 py-1 rounded-md transition-colors"
            title="Configure YouTube Data API v3 Key"
          >
            <Key className="w-3.5 h-3.5 text-[#f0b232]" />
            <span className="hidden md:inline text-[11px] font-medium">YouTube Key</span>
            <span className={`w-2 h-2 rounded-full ${hasApiKey ? 'bg-[#23a55a]' : 'bg-[#f0b232]'}`} />
          </button>

          {/* Leave Voice Room Button */}
          <button
            onClick={() => setShowLeaveModal(true)}
            className="flex items-center gap-1 text-xs text-white bg-[#f23f43] hover:bg-[#da373b] p-1.5 sm:px-3 sm:py-1.5 rounded-lg font-semibold transition-colors shadow-sm cursor-pointer active:scale-95"
            title="Leave / Exit Room"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Leave Room</span>
          </button>
        </div>
      </header>

      {/* MOBILE SEARCH MODAL OVERLAY (Smooth Fullscreen Search for Mobile) */}
      {isSearchOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-start justify-center p-3 pt-12 bg-black/85 backdrop-blur-md md:hidden animate-fade-in"
          onClick={() => setIsSearchOpen(false)}
        >
          <div 
            className="w-full max-w-lg bg-[#2b2d31] border border-[#383a40] rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input Bar in Mobile Modal */}
            <div className="p-3 bg-[#1e1f22] border-b border-[#232428] flex items-center gap-2">
              <form onSubmit={handleSearchSubmit} className="relative flex-1 flex items-center">
                <Search className="w-4 h-4 text-[#949ba4] absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search YouTube songs, artists, or links..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#111214] border border-[#383a40] focus:border-[#5865f2] rounded-xl py-2 pl-9 pr-16 text-xs text-white placeholder-[#80848e] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isSearching || !searchQuery.trim()}
                  className="absolute right-1.5 text-xs font-bold text-white bg-[#5865f2] px-2.5 py-1 rounded-lg disabled:opacity-40"
                >
                  Go
                </button>
              </form>
              <button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className="p-1.5 rounded-lg text-[#949ba4] hover:text-white hover:bg-[#35373c]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Play Genre Chips */}
            <div className="px-3 py-2 bg-[#232428] border-b border-[#1f2023] flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-shrink-0">
              <span className="text-[10px] uppercase font-bold text-[#80848e] mr-1 flex-shrink-0">
                Quick:
              </span>
              {CURATED_TRACKS.map((track) => (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => {
                    playVideoImmediately(track);
                    setIsSearchOpen(false);
                  }}
                  className="flex-shrink-0 text-[11px] px-2.5 py-1 rounded-full bg-[#1e1f22] hover:bg-[#5865f2] hover:text-white border border-[#383a40] text-[#dbdee1] transition-colors font-medium flex items-center gap-1 active:scale-95"
                >
                  <Sparkles className="w-3 h-3 text-[#f0b232]" />
                  <span>{track.title.split('-')[0].trim()}</span>
                </button>
              ))}
            </div>

            {/* Mobile Results Container */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 space-y-2">
              {isSearching ? (
                <div className="py-10 flex flex-col items-center justify-center text-[#949ba4] gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[#5865f2]" />
                  <span className="text-xs">Searching YouTube catalog...</span>
                </div>
              ) : searchError ? (
                <div className="p-3 text-xs text-[#f23f43] bg-[#f23f43]/10 border border-[#f23f43]/20 rounded-lg">
                  {searchError}
                </div>
              ) : searchResults.length > 0 ? (
                searchResults.map((video) => (
                  <div
                    key={video.id}
                    className="flex items-center justify-between gap-2.5 p-2 rounded-xl bg-[#1e1f22] border border-[#383a40] shadow-sm"
                  >
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-16 h-11 rounded-lg object-cover flex-shrink-0 bg-black"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-semibold text-white truncate">
                        {video.title}
                      </h4>
                      <p className="text-[10px] text-[#949ba4] truncate">{video.channelTitle}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          playVideoImmediately(video);
                          setIsSearchOpen(false);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-[#5865f2] text-white text-xs font-bold active:scale-95"
                      >
                        Play
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          addTrackToQueue(video);
                        }}
                        className="p-1.5 rounded-lg bg-[#383a40] text-white text-xs active:scale-95"
                        title="Add to queue"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-2">
                  <span className="text-[10px] uppercase font-bold text-[#949ba4] mb-2 block">
                    Featured Radio Stations:
                  </span>
                  <div className="space-y-1.5">
                    {CURATED_TRACKS.map((track) => (
                      <div
                        key={track.id}
                        onClick={() => {
                          playVideoImmediately(track);
                          setIsSearchOpen(false);
                        }}
                        className="flex items-center gap-2.5 p-2 rounded-xl bg-[#1e1f22] hover:bg-[#35373c] border border-[#383a40] cursor-pointer"
                      >
                        <img
                          src={track.thumbnail}
                          alt={track.title}
                          className="w-12 h-9 rounded object-cover flex-shrink-0 bg-black"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-white truncate">{track.title}</p>
                          <span className="text-[10px] text-[#949ba4] block truncate">{track.channelTitle}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. DISCORD 3-COLUMN MAIN BODY */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Left Drawer Backdrop (Mobile only) */}
        {isLeftDrawerOpen && (
          <div 
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden animate-fade-in"
            onClick={() => setIsLeftDrawerOpen(false)}
          />
        )}

        {/* ======================================================== */}
        {/* COLUMN 1: DISCORD CHANNELS & VOICE STAGE (Left Drawer)   */}
        {/* ======================================================== */}
        <aside className={`
          bg-[#2b2d31] flex flex-col border-r border-[#1f2023] justify-between transition-transform duration-300 ease-in-out
          fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-2xl
          ${isLeftDrawerOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:static lg:z-auto lg:shadow-none lg:translate-x-0
          ${isLeftCollapsed ? 'lg:hidden' : 'lg:flex lg:w-60 xl:w-68'}
        `}>
          {/* Mobile Drawer Header */}
          <div className="h-11 px-3 bg-[#1e1f22] border-b border-[#232428] flex items-center justify-between lg:hidden flex-shrink-0">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-[#5865f2]" />
              <span>Channels &amp; Members</span>
            </span>
            <button
              onClick={() => setIsLeftDrawerOpen(false)}
              className="p-1 text-[#949ba4] hover:text-white rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
            
            {/* TEXT CHANNELS SECTION */}
            <div>
              <div className="text-[11px] uppercase tracking-wider font-bold text-[#949ba4] px-2 mb-1 flex items-center justify-between">
                <span>Text Channels</span>
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => setRightTab('chat')}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    rightTab === 'chat'
                      ? 'bg-[#35373c] text-white font-semibold'
                      : 'text-[#949ba4] hover:bg-[#313338]/60 hover:text-[#dbdee1]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-[#80848e]" />
                    <span>music-chat</span>
                  </div>
                  {chatMessages.length > 0 && (
                    <span className="text-[10px] bg-[#111214] text-[#949ba4] px-1.5 py-0.2 rounded-full font-mono">
                      {chatMessages.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setRightTab('queue')}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    rightTab === 'queue'
                      ? 'bg-[#35373c] text-white font-semibold'
                      : 'text-[#949ba4] hover:bg-[#313338]/60 hover:text-[#dbdee1]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ListMusic className="w-4 h-4 text-[#80848e]" />
                    <span>shared-queue</span>
                  </div>
                  {queue.length > 0 && (
                    <span className="text-[10px] bg-[#5865f2] text-white px-1.5 py-0.2 rounded-full font-mono font-bold">
                      {queue.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* VOICE / STAGE CHANNEL (Live Listeners) */}
            <div>
              <div className="text-[11px] uppercase tracking-wider font-bold text-[#949ba4] px-2 mb-1.5 flex items-center justify-between">
                <span>Voice / Stage Lounge</span>
                <span className="text-[10px] text-[#23a55a] flex items-center gap-1 font-mono font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#23a55a] animate-pulse" />
                  LIVE
                </span>
              </div>

              {/* Discord Voice Connected Header Card */}
              <div className="bg-[#1e1f22] border border-[#383a40] rounded-lg p-2.5 mb-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#23a55a] animate-ping" />
                  <div>
                    <h5 className="text-[11px] font-bold text-[#23a55a] leading-none">
                      Voice Connected
                    </h5>
                    <p className="text-[10px] text-[#949ba4] mt-0.5 font-mono">
                      afterspot Stage / 64kbps
                    </p>
                  </div>
                </div>
                <Tv className="w-3.5 h-3.5 text-[#949ba4]" />
              </div>

              {/* Members List */}
              <div className="space-y-1">
                {members.map((member) => {
                  const isUserHost = Boolean(member.isHost);
                  const isCurrent = member.id === currentUser?.id;

                  return (
                    <div
                      key={member.id}
                      className="group flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-[#313338]/60 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Avatar with speaking ring animation */}
                        <div className="relative flex-shrink-0">
                          <div 
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm transition-all ${
                              isPlaying ? 'speaking-ring ring-2 ring-[#23a55a]' : ''
                            }`}
                            style={{ backgroundColor: member.avatarColor || '#5865f2' }}
                          >
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#23a55a] rounded-full border-2 border-[#2b2d31]" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className={`text-xs truncate font-medium ${isCurrent ? 'text-white font-bold' : 'text-[#dbdee1]'}`}>
                              {member.name}
                            </span>
                            {isUserHost && (
                              <Crown className="w-3 h-3 text-[#f0b232] fill-[#f0b232] flex-shrink-0" title="Room Host" />
                            )}
                          </div>
                          <span className="text-[10px] text-[#949ba4] block leading-none truncate">
                            {isUserHost ? 'Host' : 'Listening in sync'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 text-[#949ba4]">
                        {isMuted ? (
                          <VolumeX className="w-3.5 h-3.5 text-[#f23f43]" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5 text-[#23a55a]" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* WAITING LIST (Host Approval Queue) */}
            {waitingList.length > 0 && (
              <div className="bg-[#fff8e6]/10 border border-[#f0b232]/30 rounded-xl p-3 animate-fade-in">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#f0b232]">
                    <Clock className="w-3.5 h-3.5 animate-pulse" />
                    <span>Waiting Room ({waitingList.length})</span>
                  </div>
                  {isHost && (
                    <button
                      onClick={handleApproveAll}
                      className="text-[10px] bg-[#23a55a] hover:bg-[#1f924f] text-white px-2 py-0.5 rounded font-bold transition-colors"
                    >
                      Admit All
                    </button>
                  )}
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                  {waitingList.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between bg-[#111214]/60 p-2 rounded-lg"
                    >
                      <span className="text-xs text-[#dbdee1] truncate font-medium max-w-[100px]">
                        {user.name}
                      </span>
                      {isHost ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleApproveUser(user.id)}
                            className="p-1 rounded bg-[#23a55a]/20 hover:bg-[#23a55a] text-[#23a55a] hover:text-white transition-colors"
                            title="Admit"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRejectUser(user.id)}
                            className="p-1 rounded bg-[#f23f43]/20 hover:bg-[#f23f43] text-[#f23f43] hover:text-white transition-colors"
                            title="Decline"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-[#f0b232]">Waiting...</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* DISCORD BOTTOM USER DOCK */}
          <div className="h-14 bg-[#232428] px-3 flex items-center justify-between border-t border-[#1f2023] flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="relative flex-shrink-0">
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm"
                  style={{ backgroundColor: currentUser?.avatarColor || '#5865f2' }}
                >
                  {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#23a55a] rounded-full border-2 border-[#232428]" />
              </div>
              <div className="min-w-0">
                {isEditingUserName ? (
                  <form onSubmit={handleSaveUserName} className="flex items-center gap-1">
                    <input
                      type="text"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      autoFocus
                      placeholder="Nickname"
                      className="bg-[#111214] border border-[#5865f2] rounded px-1.5 py-0.5 text-xs text-white focus:outline-none w-24 font-bold"
                    />
                    <button type="submit" className="p-0.5 text-[#23a55a] hover:bg-[#35373c] rounded" title="Save Nickname">
                      <Check className="w-3 h-3" />
                    </button>
                    <button type="button" onClick={() => setIsEditingUserName(false)} className="p-0.5 text-[#f23f43] hover:bg-[#35373c] rounded" title="Cancel">
                      <X className="w-3 h-3" />
                    </button>
                  </form>
                ) : (
                  <div 
                    className="flex items-center gap-1 group/nick cursor-pointer"
                    onClick={() => {
                      setNewUserName(currentUser?.name || '');
                      setIsEditingUserName(true);
                    }}
                    title="Click to change your nickname"
                  >
                    <span className="text-xs font-bold text-white block truncate leading-tight group-hover/nick:text-[#5865f2] transition-colors">
                      {currentUser?.name || 'Guest'}
                    </span>
                    <Pencil className="w-2.5 h-2.5 text-[#949ba4] opacity-0 group-hover/nick:opacity-100 transition-opacity flex-shrink-0" />
                  </div>
                )}
                <span className="text-[10px] text-[#949ba4] block leading-none font-mono">
                  {isHost ? 'Crown Host' : '#member'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 text-[#b5bac1]">
              <button
                onClick={() => setIsMicMuted(!isMicMuted)}
                className={`p-1.5 rounded hover:bg-[#35373c] transition-colors ${isMicMuted ? 'text-[#f23f43]' : 'hover:text-[#dbdee1]'}`}
                title={isMicMuted ? 'Unmute Mic' : 'Mute Mic'}
              >
                {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setIsMuted(!isMuted)}
                className={`p-1.5 rounded hover:bg-[#35373c] transition-colors ${isMuted ? 'text-[#f23f43]' : 'hover:text-[#dbdee1]'}`}
                title={isMuted ? 'Deafen Audio' : 'Audio On'}
              >
                {isMuted ? <Headphones className="w-4 h-4 text-[#f23f43]" /> : <Headphones className="w-4 h-4" />}
              </button>

              <button
                onClick={onToggleApiKeyGuide}
                className="p-1.5 rounded hover:bg-[#35373c] hover:text-[#dbdee1] transition-colors"
                title="User & Stream Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* ======================================================== */}
        {/* COLUMN 2: CENTER VIDEO STREAM & STAGE (Discord Stage)    */}
        {/* ======================================================== */}
        <main className="flex-1 bg-[#313338] flex flex-col overflow-hidden relative">
          
          {/* Stream Top Info Bar (Desktop only, mobile uses Google Meet top bar) */}
          <div className="h-11 bg-[#2b2d31] border-b border-[#232428] px-4 hidden sm:flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full bg-[#f23f43] animate-pulse flex-shrink-0" />
              <div className="min-w-0 flex items-center gap-2">
                <h3 className="text-xs md:text-sm font-bold text-white truncate">
                  {currentTrack ? currentTrack.title : 'No stream currently playing'}
                </h3>
                {currentTrack && (
                  <span className="hidden sm:inline text-xs text-[#949ba4] truncate">
                    • {currentTrack.channelTitle} (added by {currentTrack.addedBy})
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] bg-[#f23f43] text-white font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                LIVE
              </span>
              <span className="text-xs bg-[#1e1f22] border border-[#383a40] text-[#dbdee1] px-2.5 py-0.5 rounded font-mono font-medium">
                {members.length} watching
              </span>
            </div>
          </div>

          {/* WEBRTC REAL-TIME VOICE & VIDEO CALL BAR + STAGE (Google Meet & Theater style) */}
          <VideoCallGrid
            room={room}
            currentUser={currentUser}
            members={members}
            layoutMode={callLayoutMode}
            onToggleLayoutMode={() => setCallLayoutMode(prev => prev === 'strip' ? 'grid' : 'strip')}
            onLeaveRoom={handleLeaveRoom}
          >
            {/* 16:9 Stream Container - Full width on mobile, rounded card on desktop */}
            <div className="relative w-full max-w-[1280px] max-h-full aspect-video bg-black rounded-none sm:rounded-xl overflow-hidden shadow-2xl border-y sm:border border-[#383a40] flex items-center justify-center">
              
              {currentTrack ? (
                <>
                  <YouTubePlayer
                    currentTrack={currentTrack}
                    isPlaying={isPlaying}
                    playbackPosition={playbackPosition}
                    volume={volume}
                    isMuted={isMuted}
                    onDurationChange={setDuration}
                    onCurrentTimeChange={setCurrentTime}
                    djMode={false}
                    isHost={isHost}
                    showVideo={true}
                  />

                  {/* Theater Screen Status Overlay (Display only, non-interactive) */}
                  <div className="absolute inset-0 z-20 pointer-events-none select-none">
                    {/* Synchronized Theater Status Badge when Paused */}
                    {!isPlaying && (
                      <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md px-3 py-1 rounded-full border border-white/15 flex items-center gap-1.5 text-xs font-bold text-white shadow-xl animate-fade-in">
                        <Pause className="w-3 h-3 text-[#f0b232] fill-current" />
                        <span>Theater Paused</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* Empty Stream Stage Placeholder */
                <div className="w-full h-full flex flex-col items-center justify-center p-4 sm:p-6 text-center bg-[#1e1f22] text-[#dbdee1]">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl sm:rounded-3xl bg-[#5865f2]/20 border border-[#5865f2]/40 flex items-center justify-center text-[#5865f2] mb-2 sm:mb-3 shadow-lg">
                    <Music className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  <h4 className="text-sm sm:text-lg font-bold text-white mb-1">
                    Ready to stream together
                  </h4>
                  <p className="text-[11px] sm:text-xs text-[#949ba4] max-w-sm mb-3 sm:mb-4 leading-relaxed hidden xs:block">
                    Search for any song above or click a curated radio station below to start streaming in real-time!
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 max-w-md">
                    {CURATED_TRACKS.slice(0, 4).map((track) => (
                      <button
                        key={track.id}
                        onClick={() => playVideoImmediately(track)}
                        className="text-[11px] sm:text-xs bg-[#2b2d31] hover:bg-[#5865f2] hover:text-white border border-[#383a40] px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[#dbdee1] font-medium transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
                      >
                        <Sparkles className="w-3 h-3 text-[#f0b232]" />
                        <span>{track.title.split('-')[0].trim()}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* FLOATING EMOJI REACTIONS OVERLAY */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
                {floatingReactions.map((reaction) => (
                  <div
                    key={reaction.id}
                    className="absolute bottom-6 animate-float-reaction flex flex-col items-center pointer-events-none"
                    style={{ left: `${reaction.left}%` }}
                  >
                    <span className="text-3xl sm:text-4xl drop-shadow-lg filter select-none">
                      {reaction.emoji}
                    </span>
                    {reaction.sender && (
                      <span className="text-[9px] sm:text-[10px] bg-black/70 text-white px-1.5 py-0.2 rounded-full font-bold shadow-md mt-1">
                        {reaction.sender}
                      </span>
                    )}
                  </div>
                ))}
              </div>

            </div>
          </VideoCallGrid>

          {/* STREAM BOTTOM CONTROLS BAR - Sticky with mobile safe-area inset */}
          <div className="bg-[#2b2d31] border-t border-[#232428] px-3 sm:px-4 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] sm:py-2.5 flex flex-col gap-1.5 sm:gap-2 flex-shrink-0 z-20 select-none">
            
            {/* Timeline Scrubber */}
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="text-[10px] sm:text-[11px] font-mono font-semibold text-[#949ba4] w-10 sm:w-12 text-right">
                {formatTime(activeTime)}
              </span>

              <div className="flex-1 py-1">
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  step="0.5"
                  value={activeTime || 0}
                  onChange={handleSeekChange}
                  onMouseUp={handleSeekCommit}
                  onTouchEnd={handleSeekCommit}
                  className="w-full h-1.5 bg-[#1e1f22] rounded-lg appearance-none cursor-pointer accent-[#5865f2]"
                />
              </div>

              <span className="text-[10px] sm:text-[11px] font-mono font-semibold text-[#949ba4] w-10 sm:w-12">
                {formatTime(duration)}
              </span>
            </div>

            {/* Buttons Row */}
            <div className="flex items-center justify-between gap-2">
              
              {/* Play/Pause, Skip, Volume */}
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                <button
                  onClick={handlePlayPause}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#5865f2] hover:bg-[#4752c4] text-white flex items-center justify-center shadow-md transition-transform active:scale-95"
                  title={isPlaying ? 'Pause stream' : 'Play stream'}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current translate-x-0.5" />
                  )}
                </button>

                <button
                  onClick={handleSkipTrack}
                  className="p-1.5 sm:p-2 rounded-lg text-[#949ba4] hover:text-white hover:bg-[#35373c] transition-colors"
                  title="Skip to next queued song"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                {/* Volume Slider (Hidden on mobile, uses hardware volume) */}
                <div className="hidden sm:flex items-center gap-2">
                  <div className="h-4 w-[1px] bg-[#383a40]" />
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-1.5 text-[#949ba4] hover:text-white transition-colors"
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-4 h-4 text-[#f23f43]" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => {
                      setVolume(parseInt(e.target.value));
                      if (isMuted) setIsMuted(false);
                    }}
                    className="w-16 md:w-24 h-1 bg-[#1e1f22] rounded-lg appearance-none cursor-pointer accent-[#5865f2]"
                  />
                </div>
              </div>

              {/* Quick Reactions Bar (Horizontal scroll with no-scrollbar on mobile) */}
              <div className="flex items-center gap-0.5 sm:gap-1 bg-[#1e1f22] border border-[#383a40] px-1.5 sm:px-2 py-0.5 rounded-full shadow-inner overflow-x-auto no-scrollbar max-w-[180px] xs:max-w-[240px] sm:max-w-none">
                <span className="text-[10px] text-[#949ba4] font-bold uppercase tracking-wider mr-1 hidden sm:inline">
                  React:
                </span>
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleSendReaction(emoji)}
                    className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center hover:bg-[#35373c] rounded-full text-sm sm:text-base transition-transform hover:scale-125 active:scale-95 flex-shrink-0"
                    title={`Send ${emoji} to stream`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

            </div>
          </div>
        </main>

        {/* Right Drawer Backdrop (Mobile only) */}
        {isRightDrawerOpen && (
          <div 
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden animate-fade-in"
            onClick={() => setIsRightDrawerOpen(false)}
          />
        )}

        {/* ======================================================== */}
        {/* COLUMN 3: RIGHT PANEL (Discord Chat & Queue / Drawer)    */}
        {/* ======================================================== */}
        <section className={`
          bg-[#2b2d31] flex flex-col border-l border-[#1f2023] transition-transform duration-300 ease-in-out
          fixed inset-y-0 right-0 z-50 w-80 max-w-[90vw] shadow-2xl
          ${isRightDrawerOpen ? 'translate-x-0' : 'translate-x-full'}
          lg:static lg:z-auto lg:shadow-none lg:translate-x-0
          ${isRightCollapsed ? 'lg:hidden' : 'lg:flex lg:w-72 xl:w-80'}
        `}>
          {/* Mobile Drawer Header */}
          <div className="h-11 px-3 bg-[#1e1f22] border-b border-[#232428] flex items-center justify-between lg:hidden flex-shrink-0">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-[#5865f2]" />
              <span>{rightTab === 'chat' ? 'Room Chat' : 'Shared Queue'}</span>
            </span>
            <button
              onClick={() => setIsRightDrawerOpen(false)}
              className="p-1 text-[#949ba4] hover:text-white rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          {/* Header Tabs */}
          <div className="h-11 bg-[#2b2d31] border-b border-[#232428] px-3 flex items-center justify-between flex-shrink-0">
            <div className="grid grid-cols-2 p-0.5 bg-[#1e1f22] rounded-lg w-full">
              <button
                onClick={() => setRightTab('chat')}
                className={`py-1 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  rightTab === 'chat'
                    ? 'bg-[#35373c] text-white shadow-sm'
                    : 'text-[#949ba4] hover:text-[#dbdee1]'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-[#5865f2]" />
                <span>Room Chat</span>
              </button>

              <button
                onClick={() => setRightTab('queue')}
                className={`py-1 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  rightTab === 'queue'
                    ? 'bg-[#35373c] text-white shadow-sm'
                    : 'text-[#949ba4] hover:text-[#dbdee1]'
                }`}
              >
                <ListMusic className="w-3.5 h-3.5 text-[#23a55a]" />
                <span>Queue ({queue.length})</span>
              </button>
            </div>
          </div>

          {/* TAB 1: DISCORD CHAT */}
          {rightTab === 'chat' && (
            <div className="flex-1 flex flex-col min-h-0 bg-[#313338]">
              
              {/* Messages History */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
                <div className="pt-2 pb-1 text-center border-b border-[#383a40]/60 mb-2">
                  <div className="w-9 h-9 rounded-full bg-[#5865f2]/20 text-[#5865f2] mx-auto flex items-center justify-center mb-1">
                    <Hash className="w-5 h-5" />
                  </div>
                  <h4 className="text-xs font-bold text-white">Welcome to #music-chat!</h4>
                  <p className="text-[11px] text-[#949ba4]">This is the start of the #{room.name || 'room'} channel.</p>
                </div>

                {chatMessages.map((msg) => {
                  const isMe = msg.senderId === currentUser?.id || msg.sender === currentUser?.name;
                  const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

                  return (
                    <div key={msg.id} className="flex items-start gap-2.5 group hover:bg-[#2e3035]/50 -mx-2 px-2 py-1 rounded">
                      <div 
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: msg.senderColor || '#5865f2' }}
                      >
                        {msg.sender?.charAt(0).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xs font-bold text-white hover:underline cursor-pointer truncate">
                            {msg.sender}
                          </span>
                          {msg.isHost && (
                            <span className="text-[9px] bg-[#f0b232]/20 text-[#f0b232] px-1 py-0.2 rounded font-bold">
                              HOST
                            </span>
                          )}
                          <span className="text-[10px] text-[#949ba4] font-mono">
                            {timeStr}
                          </span>
                        </div>
                        <p className="text-xs text-[#dbdee1] leading-relaxed break-words mt-0.5">
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-3 bg-[#313338] border-t border-[#2b2d31]">
                <form onSubmit={handleSendMessage} className="relative">
                  <input
                    type="text"
                    placeholder="Message #music-chat..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="w-full bg-[#383a40] border-none rounded-lg py-2.5 pl-3.5 pr-10 text-xs text-white placeholder-[#949ba4] focus:outline-none focus:ring-1 focus:ring-[#5865f2] transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="absolute right-1.5 top-1.5 p-1.5 rounded-md bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-40 text-white transition-all shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>

            </div>
          )}

          {/* TAB 2: DISCORD SHARED QUEUE */}
          {rightTab === 'queue' && (
            <div className="flex-1 flex flex-col min-h-0 bg-[#313338]">
              
              <div className="p-3 border-b border-[#2b2d31] flex items-center justify-between bg-[#2b2d31]/50">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Upcoming Tracks
                </span>
                <button
                  onClick={() => {
                    setIsSearchOpen(true);
                    setTimeout(() => searchInputRef.current?.focus(), 50);
                  }}
                  className="flex items-center gap-1 text-xs text-white bg-[#5865f2] hover:bg-[#4752c4] px-2.5 py-1 rounded-md font-semibold transition-colors shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Track</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                {queue.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#949ba4]">
                    <ListMusic className="w-8 h-8 opacity-40 text-[#5865f2] mb-2" />
                    <p className="text-xs font-bold text-white mb-1">Queue is empty</p>
                    <p className="text-[11px] text-[#949ba4] mb-3">
                      Search YouTube songs to build an uninterrupted watch party queue!
                    </p>
                    <button
                      onClick={() => {
                        setIsSearchOpen(true);
                        setTimeout(() => searchInputRef.current?.focus(), 50);
                      }}
                      className="text-xs text-[#5865f2] hover:underline font-semibold"
                    >
                      Browse songs now
                    </button>
                  </div>
                ) : (
                  queue.map((track, idx) => (
                    <div
                      key={track.queueId || idx}
                      className="group flex items-center gap-2.5 p-2 rounded-lg bg-[#2b2d31] hover:bg-[#35373c] border border-[#383a40] transition-colors"
                    >
                      <span className="text-xs font-mono font-bold text-[#949ba4] w-4 text-center">
                        {idx + 1}
                      </span>
                      <img
                        src={track.thumbnail}
                        alt={track.title}
                        className="w-12 h-9 object-cover rounded bg-[#111214] flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <h5 className="text-xs font-bold text-white truncate group-hover:text-[#5865f2] transition-colors">
                          {track.title}
                        </h5>
                        <p className="text-[10px] text-[#949ba4] truncate">
                          {track.channelTitle} • by {track.addedBy}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                        <button
                          onClick={() => handlePlayNowFromQueue(track.queueId)}
                          className="p-1 rounded text-[#949ba4] hover:text-white hover:bg-[#5865f2] transition-colors"
                          title="Play Immediately"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                        <button
                          onClick={() => handleRemoveFromQueue(track.queueId)}
                          className="p-1 rounded text-[#949ba4] hover:text-[#f23f43] hover:bg-[#f23f43]/20 transition-colors"
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
          )}

        </section>

      </div>

      {/* 3. DISCORD MOBILE BOTTOM NAVIGATION DOCK (Sticky, Non-Scrollable) */}
      <nav className="h-14 bg-[#1e1f22] border-t border-[#232428] px-2 flex items-center justify-around lg:hidden flex-shrink-0 z-30 pb-[env(safe-area-inset-bottom,0px)]">
        <button
          onClick={() => {
            setIsLeftDrawerOpen(false);
            setIsRightDrawerOpen(false);
          }}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-xl text-xs font-semibold transition-all active:scale-95 min-w-[56px] min-h-[44px] ${
            !isLeftDrawerOpen && !isRightDrawerOpen ? 'text-[#5865f2] bg-[#5865f2]/10' : 'text-[#949ba4] hover:text-[#dbdee1]'
          }`}
        >
          <Tv className="w-4 h-4" />
          <span className="text-[10px] font-medium">Stage</span>
        </button>

        <button
          onClick={() => {
            setRightTab('chat');
            setIsRightDrawerOpen(true);
            setIsLeftDrawerOpen(false);
          }}
          className={`relative flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-xl text-xs font-semibold transition-all active:scale-95 min-w-[56px] min-h-[44px] ${
            isRightDrawerOpen && rightTab === 'chat' ? 'text-[#5865f2] bg-[#5865f2]/10' : 'text-[#949ba4] hover:text-[#dbdee1]'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span className="text-[10px] font-medium">Chat</span>
          {chatMessages.length > 0 && (
            <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-[#5865f2]" />
          )}
        </button>

        <button
          onClick={() => {
            setRightTab('queue');
            setIsRightDrawerOpen(true);
            setIsLeftDrawerOpen(false);
          }}
          className={`relative flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-xl text-xs font-semibold transition-all active:scale-95 min-w-[56px] min-h-[44px] ${
            isRightDrawerOpen && rightTab === 'queue' ? 'text-[#5865f2] bg-[#5865f2]/10' : 'text-[#949ba4] hover:text-[#dbdee1]'
          }`}
        >
          <ListMusic className="w-4 h-4" />
          <span className="text-[10px] font-medium">Queue</span>
          {queue.length > 0 && (
            <span className="absolute top-1 right-2 text-[9px] bg-[#5865f2] text-white px-1 rounded-full font-mono font-bold leading-tight">
              {queue.length}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setIsLeftDrawerOpen(true);
            setIsRightDrawerOpen(false);
          }}
          className={`relative flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-xl text-xs font-semibold transition-all active:scale-95 min-w-[56px] min-h-[44px] ${
            isLeftDrawerOpen ? 'text-[#5865f2] bg-[#5865f2]/10' : 'text-[#949ba4] hover:text-[#dbdee1]'
          }`}
        >
          <Users className="w-4 h-4" />
          <span className="text-[10px] font-medium">Members</span>
          {members.length > 0 && (
            <span className="absolute top-1 right-1.5 text-[9px] bg-[#23a55a] text-white px-1 rounded-full font-mono font-bold leading-tight">
              {members.length}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setIsSearchOpen(true);
          }}
          className="flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-xl text-xs font-semibold text-[#949ba4] hover:text-[#dbdee1] transition-all active:scale-95 min-w-[56px] min-h-[44px]"
        >
          <Search className="w-4 h-4" />
          <span className="text-[10px] font-medium">Search</span>
        </button>
      </nav>



      {/* ======================================================== */}
      {/* 4. YOUTUBE API KEY SETUP MODAL (Collapsible/Modal)        */}
      {/* ======================================================== */}
      {showApiKeyGuide && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
          onClick={onCloseApiKeyGuide}
        >
          <div 
            className="w-full max-w-lg bg-[#313338] border border-[#383a40] rounded-2xl shadow-2xl p-6 animate-fade-in relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#383a40] mb-4">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-[#f0b232]" />
                <h3 className="text-sm font-bold text-white">YouTube API Key Configuration</h3>
              </div>
              <button
                onClick={onCloseApiKeyGuide}
                className="text-[#949ba4] hover:text-white p-1 rounded hover:bg-[#35373c]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#dbdee1]">
              <div className="bg-[#2b2d31] p-3 rounded-xl border border-[#383a40]">
                <p className="font-semibold text-white mb-1">Zero-Key Fallback Enabled 🚀</p>
                <p className="text-[11px] text-[#949ba4] leading-relaxed">
                  TogetherTune automatically provides fast YouTube search even without an API key! Adding your own Google Cloud key gives you official quota and higher rate limits.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-white mb-1.5">
                  Paste your YouTube Data API v3 Key:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="AIzaSy..."
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    className="flex-1 bg-[#1e1f22] border border-[#383a40] rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#5865f2]"
                  />
                  <button
                    onClick={handleSaveKeySubmit}
                    disabled={isSavingKey || !keyInput.trim()}
                    className="px-4 py-2 bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                  >
                    {isSavingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Key'}
                  </button>
                </div>
              </div>

              {keySaveMessage && (
                <p className={`text-xs font-medium ${keySaveMessage.success ? 'text-[#23a55a]' : 'text-[#f23f43]'}`}>
                  {keySaveMessage.text}
                </p>
              )}

              <div className="pt-2 text-[11px] text-[#949ba4] flex items-center justify-between">
                <span>Free keys available at Google Cloud Console</span>
                <a
                  href="https://console.cloud.google.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#5865f2] hover:underline flex items-center gap-1 font-semibold"
                >
                  console.cloud.google.com <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. LEAVE ROOM CONFIRMATION MODAL */}
      {showLeaveModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowLeaveModal(false)}
        >
          <div 
            className="w-full max-w-sm bg-[#313338] border border-[#383a40] rounded-2xl shadow-2xl p-6 text-center animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-[#f23f43]/20 border border-[#f23f43]/40 text-[#f23f43] flex items-center justify-center mx-auto mb-3 shadow-md">
              <LogOut className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-white mb-1">
              Leave this Room?
            </h3>
            <p className="text-xs text-[#949ba4] mb-5 leading-relaxed">
              Refreshing your browser page will keep you in the room. Are you sure you want to completely exit?
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowLeaveModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#2b2d31] hover:bg-[#35373c] text-white text-xs font-semibold border border-[#383a40] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowLeaveModal(false);
                  onLeaveRoom();
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#f23f43] hover:bg-[#da373b] text-white text-xs font-bold transition-colors shadow-md"
              >
                Exit Room
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
