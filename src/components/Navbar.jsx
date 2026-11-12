import React, { useState } from 'react';
import { 
  Radio, 
  Share2, 
  Copy, 
  Check, 
  Key, 
  LogOut, 
  Users, 
  Clock, 
  ExternalLink 
} from 'lucide-react';

export default function Navbar({
  room,
  currentUser,
  membersCount = 0,
  waitingCount = 0,
  hasApiKey = false,
  onToggleApiKeyGuide,
  onLeaveRoom
}) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

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

  return (
    <header className="w-full bg-[#ffffff] border-b border-[#e0e0df] sticky top-0 z-30">
      <div className="max-w-[1240px] mx-auto px-6 h-18 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#2e5bff] text-white flex items-center justify-center shadow-sm">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-[#201f20]">
                Together<span className="text-[#2e5bff]">Tune</span>
              </h1>
              {room && (
                <span className="text-xs bg-[#f7f6f6] border border-[#e0e0df] text-[#494949] font-medium px-2.5 py-0.5 rounded-full">
                  Room {room.id}
                </span>
              )}
            </div>
            {room && (
              <p className="text-xs text-[#606060] font-medium truncate max-w-xs">
                {room.name}
              </p>
            )}
          </div>
        </div>

        {/* Center / Stats: Joined & Waiting to Join */}
        {room && (
          <div className="hidden sm:flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f7f6f6] border border-[#e0e0df] rounded-full text-xs font-semibold text-[#201f20]">
              <Users className="w-3.5 h-3.5 text-[#2e5bff]" />
              <span>{membersCount} Joined</span>
            </div>

            {waitingCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#fff8e6] border border-[#ffd580] rounded-full text-xs font-semibold text-[#b36b00] animate-pulse">
                <Clock className="w-3.5 h-3.5" />
                <span>{waitingCount} in Waiting List</span>
              </div>
            )}
          </div>
        )}

        {/* Right Actions */}
        <div className="flex items-center gap-2.5">
          {room && (
            <>
              {/* Copy ID Button */}
              <button
                onClick={handleCopyId}
                className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#f7f6f6] hover:bg-[#ebeaea] border border-[#e0e0df] text-xs font-semibold text-[#201f20] transition-colors"
                title="Click to copy Room ID"
              >
                <span>ID: {room.id}</span>
                {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-[#606060]" />}
              </button>

              {/* Invite Link Button */}
              <button
                onClick={handleCopyInviteLink}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                  copiedLink
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#2e5bff] hover:bg-[#254bdb] text-white shadow-sm'
                }`}
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Link Copied</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Invite Friends</span>
                  </>
                )}
              </button>
            </>
          )}

          {/* YouTube API Key Button */}
          <button
            onClick={onToggleApiKeyGuide}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#f7f6f6] hover:bg-[#ebeaea] border border-[#e0e0df] text-xs font-semibold text-[#201f20] transition-colors"
            title="Where to get & configure YouTube API Key"
          >
            <Key className="w-3.5 h-3.5 text-[#2e5bff]" />
            <span className="hidden sm:inline">YouTube API Key</span>
            <span className={`w-2 h-2 rounded-full ${hasApiKey ? 'bg-emerald-500' : 'bg-amber-400'}`} />
          </button>

          {/* Leave Room */}
          {room && (
            <button
              onClick={onLeaveRoom}
              className="p-2 rounded-full text-[#606060] hover:text-[#201f20] hover:bg-[#f7f6f6] transition-colors"
              title="Leave Room"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
