import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Users, 
  MessageSquare, 
  Info, 
  Search, 
  Mic, 
  MicOff, 
  Hand, 
  Pin, 
  VolumeX, 
  Send, 
  Copy, 
  Check, 
  Sparkles, 
  MoreVertical,
  Volume2
} from 'lucide-react';

export default function MeetingSidePanel({
  panel, // 'people' | 'chat' | 'details' | null
  onClose,
  room,
  currentUser,
  isHost,
  participants = [],
  pinnedPeerId,
  onPinParticipant,
  onMuteParticipant,
  onMuteAll,
  onLowerHand,
  onAskToUnmute,
  onSpotlight,
  messages = [],
  onSendMessage,
  currentTrack,
  isPlaying
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeMenuPeerId, setActiveMenuPeerId] = useState(null);
  const chatBottomRef = useRef(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (panel === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, panel]);

  if (!panel) return null;

  const currentUserId = currentUser?.id || 'local';

  // Copy joining info
  const handleCopyLink = () => {
    if (typeof window === 'undefined') return;
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleChatSubmit = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendMessage?.(chatInput.trim());
    setChatInput('');
  };

  // Raised hands sorted by timestamp
  const raisedHands = participants
    .filter(p => p.handRaisedAt)
    .sort((a, b) => (a.handRaisedAt || 0) - (b.handRaisedAt || 0));

  // Filtered participants list for search
  const filteredParticipants = participants.filter(p => {
    if (!searchQuery.trim()) return true;
    return p.name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const renderContent = () => {
    // -------------------------------------------------------------
    // 1. PEOPLE PANEL
    // -------------------------------------------------------------
    if (panel === 'people') {
      return (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Header */}
          <div className="h-14 px-4 border-b border-[#3c4043] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#8ab4f8]" />
              <h3 className="text-sm font-semibold text-white">People</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#303134] text-[#9aa0a6] font-medium">
                {participants.length}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-white hover:bg-[#3c4043] transition-colors"
              title="Close"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Host Mute All Bar */}
          {isHost && participants.length > 1 && (
            <div className="px-4 py-2.5 bg-[#282a2d] border-b border-[#3c4043] flex items-center justify-between shrink-0">
              <span className="text-xs text-[#9aa0a6]">Host controls</span>
              <button
                type="button"
                onClick={onMuteAll}
                className="px-3 py-1 rounded-full bg-[#3c4043] hover:bg-[#4a4e52] text-[#e8eaed] text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="Mute all participants"
              >
                <VolumeX className="w-3.5 h-3.5 text-[#f28b82]" />
                <span>Mute all</span>
              </button>
            </div>
          )}

          {/* Search Field (shown when > 8 participants) */}
          {participants.length > 8 && (
            <div className="px-4 py-2 border-b border-[#3c4043] shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-[#9aa0a6] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for people"
                  className="w-full bg-[#1e1f22] border border-[#3c4043] rounded-full pl-9 pr-3 py-1.5 text-xs text-white placeholder-[#9aa0a6] focus:outline-none focus:border-[#8ab4f8]"
                />
              </div>
            </div>
          )}

          {/* Participants Scroll List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#3c4043]/40 p-2 space-y-1">
            {/* Raised Hands Section */}
            {raisedHands.length > 0 && (
              <div className="pb-2">
                <span className="text-[10px] uppercase font-bold text-[#fdd663] px-2 block mb-1.5 flex items-center gap-1">
                  <Hand className="w-3 h-3 fill-current" />
                  <span>Raised Hands ({raisedHands.length})</span>
                </span>
                <div className="space-y-1">
                  {raisedHands.map(p => (
                    <div 
                      key={`hand-${p.id}`}
                      className="flex items-center justify-between p-2 rounded-xl bg-[#fdd663]/10 border border-[#fdd663]/30"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div 
                          className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0"
                          style={{ backgroundColor: p.avatarColor || '#5865f2' }}
                        >
                          {p.name?.charAt(0).toUpperCase() || 'P'}
                        </div>
                        <span className="text-xs font-medium text-white truncate">
                          {p.name} {p.id === currentUserId ? '(You)' : ''}
                        </span>
                      </div>

                      {isHost && (
                        <button
                          type="button"
                          onClick={() => onLowerHand?.(p.id)}
                          className="px-2 py-1 rounded bg-[#3c4043] hover:bg-[#4a4e52] text-[#e8eaed] text-[11px] font-medium transition-colors shrink-0"
                        >
                          Lower hand
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* In-Call Members */}
            <div className="pt-2 space-y-1">
              <span className="text-[10px] uppercase font-bold text-[#9aa0a6] px-2 block mb-1">
                In Meeting
              </span>

              {filteredParticipants.map(p => {
                const isLocal = p.id === currentUserId || p.isLocal;
                const isPinned = pinnedPeerId === p.id;
                const isMenuOpen = activeMenuPeerId === p.id;

                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#303134]/50 transition-colors group relative"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0"
                        style={{ backgroundColor: p.avatarColor || '#5865f2' }}
                      >
                        {p.name?.charAt(0).toUpperCase() || 'P'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-white truncate">
                            {p.name}
                          </span>
                          {isLocal && (
                            <span className="text-[10px] text-[#9aa0a6] shrink-0 font-normal">
                              (You)
                            </span>
                          )}
                          {p.isHost && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#3c4043] text-[#8ab4f8] shrink-0">
                              Host
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Action Icons */}
                    <div className="flex items-center gap-1 shrink-0 relative">
                      {/* Audio State Icon */}
                      {p.audioEnabled ? (
                        <Mic className="w-4 h-4 text-[#34a853]" />
                      ) : (
                        <MicOff className="w-4 h-4 text-[#ea4335]" />
                      )}

                      {/* Pin Toggle */}
                      <button
                        type="button"
                        onClick={() => onPinParticipant?.(isPinned ? null : p.id)}
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-white hover:bg-[#3c4043] transition-colors ${
                          isPinned ? 'text-[#8ab4f8] bg-[#3c4043]' : 'opacity-0 group-hover:opacity-100'
                        }`}
                        title={isPinned ? "Unpin participant" : "Pin participant"}
                      >
                        <Pin className="w-3.5 h-3.5 fill-current" />
                      </button>

                      {/* Host Actions Popover Menu Trigger */}
                      {isHost && !isLocal && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setActiveMenuPeerId(prev => prev === p.id ? null : p.id)}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-white hover:bg-[#3c4043] transition-colors"
                            title="More host options"
                            aria-label="More host options"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>

                          {isMenuOpen && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-[#282a2d] border border-[#3c4043] rounded-xl shadow-2xl py-1.5 z-50 text-xs text-[#e8eaed] animate-fade-in divide-y divide-[#3c4043]/50">
                              <div className="py-0.5">
                                {p.audioEnabled ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onMuteParticipant?.(p.id);
                                      setActiveMenuPeerId(null);
                                    }}
                                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[#3c4043]/70 text-left text-[#f28b82]"
                                  >
                                    <VolumeX className="w-3.5 h-3.5" />
                                    <span>Mute participant</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onAskToUnmute?.(p.id);
                                      setActiveMenuPeerId(null);
                                    }}
                                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[#3c4043]/70 text-left"
                                  >
                                    <Volume2 className="w-3.5 h-3.5 text-[#8ab4f8]" />
                                    <span>Ask to unmute</span>
                                  </button>
                                )}
                              </div>

                              <div className="py-0.5">
                                {p.handRaisedAt && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onLowerHand?.(p.id);
                                      setActiveMenuPeerId(null);
                                    }}
                                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[#3c4043]/70 text-left"
                                  >
                                    <Hand className="w-3.5 h-3.5 text-[#fdd663]" />
                                    <span>Lower hand</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSpotlight?.(p.id);
                                    setActiveMenuPeerId(null);
                                  }}
                                  className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[#3c4043]/70 text-left"
                                >
                                  <Sparkles className="w-3.5 h-3.5 text-[#8ab4f8]" />
                                  <span>Spotlight for everyone</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    // -------------------------------------------------------------
    // 2. CHAT PANEL
    // -------------------------------------------------------------
    if (panel === 'chat') {
      return (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Header */}
          <div className="h-14 px-4 border-b border-[#3c4043] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[#8ab4f8]" />
              <h3 className="text-sm font-semibold text-white">In-call messages</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-white hover:bg-[#3c4043] transition-colors"
              title="Close"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Privacy Disclaimer Callout */}
          <div className="p-3 bg-[#171717] border-b border-[#3c4043] shrink-0">
            <p className="text-[11px] text-[#9aa0a6] leading-relaxed">
              Messages can be seen only by people in the call and are deleted when the call ends.
            </p>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-[#9aa0a6] py-12">
                <MessageSquare className="w-8 h-8 mb-2 opacity-30 text-[#8ab4f8]" />
                <span className="text-xs">No messages yet</span>
                <span className="text-[11px] opacity-70">Say hello to everyone in the call</span>
              </div>
            ) : (
              messages.map((msg, i) => {
                const isMe = msg.sender === (currentUser?.name || 'You') || msg.senderId === currentUserId;
                const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

                return (
                  <div key={msg.id || i} className="flex flex-col gap-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-bold text-white">
                        {isMe ? 'You' : (msg.sender || 'Participant')}
                      </span>
                      {timeStr && (
                        <span className="text-[10px] text-[#9aa0a6]">
                          {timeStr}
                        </span>
                      )}
                    </div>
                    <div className="px-3.5 py-2 rounded-2xl bg-[#303134] text-xs text-[#e8eaed] leading-relaxed max-w-[90%] break-words">
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Input Form */}
          <form 
            onSubmit={handleChatSubmit}
            className="p-3 border-t border-[#3c4043] bg-[#202124] shrink-0 flex items-center gap-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Send a message to everyone"
              className="flex-1 bg-[#1e1f22] border border-[#3c4043] rounded-full px-4 py-2 text-xs text-white placeholder-[#9aa0a6] focus:outline-none focus:border-[#8ab4f8]"
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
              className="w-8 h-8 rounded-full bg-[#8ab4f8] disabled:bg-[#3c4043] text-[#202124] disabled:text-[#9aa0a6] flex items-center justify-center transition-all disabled:opacity-50 shrink-0"
              title="Send message"
            >
              <Send className="w-4 h-4 fill-current" />
            </button>
          </form>
        </div>
      );
    }

    // -------------------------------------------------------------
    // 3. MEETING DETAILS PANEL
    // -------------------------------------------------------------
    if (panel === 'details') {
      return (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Header */}
          <div className="h-14 px-4 border-b border-[#3c4043] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Info className="w-5 h-5 text-[#8ab4f8]" />
              <h3 className="text-sm font-semibold text-white">Meeting details</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-white hover:bg-[#3c4043] transition-colors"
              title="Close"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-6 overflow-y-auto">
            {/* Joining info */}
            <div>
              <span className="text-[11px] uppercase font-bold text-[#9aa0a6] block mb-2">
                Joining information
              </span>
              <p className="text-xs text-[#e8eaed] mb-1 font-medium">{room?.name || 'afterspot Meeting'}</p>
              <p className="text-[11px] text-[#9aa0a6] font-mono break-all mb-3 select-all">
                {typeof window !== 'undefined' ? window.location.href : ''}
              </p>
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#303134] hover:bg-[#3c4043] text-xs font-semibold text-[#8ab4f8] transition-colors"
              >
                {copiedLink ? <Check className="w-4 h-4 text-[#34a853]" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'Joining info copied' : 'Copy joining info'}</span>
              </button>
            </div>

            {/* Stage Info */}
            {currentTrack && (
              <div className="pt-4 border-t border-[#3c4043]">
                <span className="text-[11px] uppercase font-bold text-[#9aa0a6] block mb-2">
                  Watch Stage
                </span>
                <div className="p-3 rounded-xl bg-[#1e1f22] border border-[#3c4043] flex items-center gap-3">
                  {currentTrack.thumbnail && (
                    <img 
                      src={currentTrack.thumbnail} 
                      alt="" 
                      className="w-14 h-10 object-cover rounded shrink-0 bg-black"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-medium text-white block truncate">
                      {currentTrack.title || 'Shared Stream'}
                    </span>
                    <span className="text-[10px] text-[#9aa0a6] block truncate">
                      {isPlaying ? 'Playing in Theater' : 'Theater Paused'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      {/* DESKTOP 360px RIGHT PANEL (Pushes stage without unmounting) */}
      <aside 
        className="hidden md:flex w-[360px] flex-shrink-0 bg-[#202124] border-l border-[#3c4043] flex-col z-30 animate-fade-in"
        role="complementary"
        aria-label={`${panel} panel`}
      >
        {renderContent()}
      </aside>

      {/* MOBILE BOTTOM SHEET WITH DRAG HANDLE */}
      <div 
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm md:hidden flex flex-col justify-end animate-fade-in"
        onClick={onClose}
      >
        <div 
          className="bg-[#202124] border-t border-[#3c4043] rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden animate-slide-up"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag Handle */}
          <div className="py-2 flex justify-center shrink-0">
            <div className="w-10 h-1 bg-[#5f6368] rounded-full" />
          </div>

          {renderContent()}
        </div>
      </div>
    </>
  );
}

