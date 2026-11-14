import React from 'react';
import { Mic, MicOff, Search, ListMusic, Loader2, PhoneCall, PhoneOff, Phone, Shield } from 'lucide-react';

/**
 * VoiceActionBar Component
 * Mobile-centric, professional voice calling interface powered by PeerJS:
 * - Live in-call status indicator with elapsed call timer (connected state)
 * - Remote user name display during call
 * - Animated audio waveform visualization when someone is speaking
 * - Large, tactile, thumb-friendly call/mic button with haptic feedback
 * - Dedicated End Call button when connected
 * - Clear visual states for speaking, live mic, muted, and permission guidance
 */
export default function VoiceActionBar({
  micState = 'off',
  isSpeaking = false,
  queueCount = 0,
  activeSpeakerName = null,
  peersCount = 0,
  callState = 'idle',
  callDuration = 0,
  remoteUser = null,
  onToggleMic,
  onEndCall,
  onAcceptCall,
  onRejectCall,
  onOpenSearch,
  onToggleQueue,
  isQueueOpen = false
}) {
  const isMicLive = micState === 'on';
  const isRequesting = micState === 'requesting';
  const isConnected = callState === 'connected';
  const isCalling = callState === 'calling';
  const isRinging = callState === 'ringing';

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleMicClick = () => {
    // Provide tactile haptic feedback on mobile if supported
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(25); } catch {}
    }
    onToggleMic();
  };

  return (
    <div className="w-full bg-[#141419]/95 backdrop-blur-md border border-white/10 rounded-3xl p-3 sm:p-4 select-none shadow-2xl space-y-3">
      {/* Top Phone Call Status Banner */}
      <div className="flex items-center justify-between px-1.5 pt-0.5">
        <div className="flex items-center gap-2">
          {/* Status Dot */}
          <div className="relative flex items-center justify-center">
            <span className={`w-2.5 h-2.5 rounded-full ${
              isConnected
                ? 'bg-emerald-500'
                : isCalling || isRinging
                  ? 'bg-amber-500'
                  : 'bg-white/30'
            }`}></span>
            {(isConnected || isCalling || isRinging) && (
              <span className={`absolute w-4 h-4 rounded-full animate-ping ${
                isConnected ? 'bg-emerald-500/40' : 'bg-amber-500/40'
              }`}></span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-white/90">
            <PhoneCall className={`w-3.5 h-3.5 ${
              isConnected ? 'text-emerald-400' : isCalling || isRinging ? 'text-amber-400' : 'text-white/40'
            }`} />
            {isConnected ? (
              <>
                <span className="truncate max-w-[130px]">Call with {remoteUser?.name || 'Member'}</span>
                <span className="text-white/40 font-mono text-[11px]">({formatDuration(callDuration)})</span>
              </>
            ) : isCalling ? (
              <span className="text-amber-300">Calling {remoteUser?.name || 'Member'}...</span>
            ) : isRinging ? (
              <span className="text-emerald-300 font-bold animate-pulse">Call from {remoteUser?.name || 'Member'}!</span>
            ) : (
              <span className="text-white/60">Voice Call Ready</span>
            )}
          </div>
        </div>

        {/* Right Info: Live active speaker or HD Voice badge */}
        <div className="flex items-center gap-2 text-[11px]">
          {isSpeaking ? (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-500/15 border border-emerald-500/30 rounded-full text-emerald-300 font-medium animate-pulse">
              <span className="flex gap-0.5 items-end h-3">
                <span className="w-0.5 h-1.5 bg-emerald-400 animate-bounce"></span>
                <span className="w-0.5 h-3 bg-emerald-400 animate-bounce delay-75"></span>
                <span className="w-0.5 h-2 bg-emerald-400 animate-bounce delay-150"></span>
              </span>
              <span>You are speaking</span>
            </div>
          ) : activeSpeakerName ? (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-white/10 border border-white/10 rounded-full text-white/90 font-medium">
              <span className="flex gap-0.5 items-end h-3">
                <span className="w-0.5 h-1.5 bg-emerald-400 animate-bounce"></span>
                <span className="w-0.5 h-3 bg-emerald-400 animate-bounce delay-75"></span>
                <span className="w-0.5 h-2 bg-emerald-400 animate-bounce delay-150"></span>
              </span>
              <span className="truncate max-w-[120px]">{activeSpeakerName}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-white/50 text-[10px] font-medium">
              <Shield className="w-3 h-3 text-emerald-400" />
              <span>PeerJS HD Voice{peersCount > 0 ? ` (${peersCount})` : ''}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Touch Controls Bar */}
      <div className="flex items-center gap-2">
        {/* Add Music button */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex-1 min-h-[52px] py-2.5 px-2 sm:px-3 bg-white/5 hover:bg-white/10 active:scale-95 text-[#F4F1EA] rounded-2xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 border border-white/10 transition-all cursor-pointer shadow"
          title="Search & Add Music"
        >
          <Search className="w-4 h-4 text-[#FF9F1C]" />
          <span className="hidden xs:inline">Music</span>
        </button>

        {/* Central Prominent Mobile Phone-Call Mic Button */}
        <button
          type="button"
          disabled={isRequesting}
          onClick={handleMicClick}
          className={`flex-[1.8] min-h-[54px] px-3 sm:px-4 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xl active:scale-95 ${
            isRequesting
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
              : isMicLive && isSpeaking
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white ring-4 ring-emerald-400/40 shadow-emerald-500/30 animate-pulse'
                : isMicLive
                  ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 shadow-emerald-500/10 hover:bg-emerald-500/30'
                  : micState === 'soft-muted'
                    ? 'bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/25'
                    : micState === 'blocked' || micState === 'insecure'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                      : 'bg-white/10 text-white/80 hover:bg-white/15 border border-white/10'
          }`}
          aria-label="Toggle microphone"
        >
          {isRequesting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin text-amber-300" />
              <span>Connecting Mic...</span>
            </>
          ) : isMicLive ? (
            <>
              <div className="relative">
                <Mic className={`w-5 h-5 ${isSpeaking ? 'text-white' : 'text-emerald-400'}`} />
                {isSpeaking && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full animate-ping"></span>
                )}
              </div>
              <div className="flex flex-col text-left leading-tight">
                <span className="font-bold">{isSpeaking ? 'Speaking...' : 'Mic Live'}</span>
                <span className="text-[10px] opacity-75 font-normal">Tap to mute</span>
              </div>
            </>
          ) : micState === 'blocked' ? (
            <>
              <MicOff className="w-5 h-5 text-amber-400" />
              <div className="flex flex-col text-left leading-tight">
                <span className="font-bold">Allow Mic</span>
                <span className="text-[10px] opacity-75 font-normal">Tap for instructions</span>
              </div>
            </>
          ) : micState === 'insecure' ? (
            <>
              <MicOff className="w-5 h-5 text-amber-400" />
              <div className="flex flex-col text-left leading-tight">
                <span className="font-bold">Need HTTPS</span>
                <span className="text-[10px] opacity-75 font-normal">Required on mobile</span>
              </div>
            </>
          ) : (
            <>
              <MicOff className="w-5 h-5 text-red-400" />
              <div className="flex flex-col text-left leading-tight">
                <span className="font-bold">Muted</span>
                <span className="text-[10px] opacity-75 font-normal">Tap to speak</span>
              </div>
            </>
          )}
        </button>

        {/* In-Call Hang Up Button (When connected or calling) */}
        {(isConnected || isCalling) && (
          <button
            type="button"
            onClick={onEndCall}
            className="min-h-[52px] px-3.5 py-2.5 rounded-2xl bg-red-500/20 hover:bg-red-500/30 active:scale-95 text-red-400 border border-red-500/40 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg"
            title={isConnected ? 'End Call' : 'Cancel Call'}
          >
            <PhoneOff className="w-4 h-4" />
            <span className="text-xs font-bold hidden sm:inline">{isConnected ? 'End' : 'Cancel'}</span>
          </button>
        )}

        {/* Incoming Call Accept & Decline Quick Actions */}
        {isRinging && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onAcceptCall}
              className="min-h-[52px] px-3 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white font-bold flex items-center justify-center gap-1 shadow-lg shadow-emerald-500/30 transition-all cursor-pointer"
              title="Accept Call"
            >
              <Phone className="w-4 h-4" />
              <span className="text-xs font-bold hidden sm:inline">Answer</span>
            </button>
            <button
              type="button"
              onClick={onRejectCall}
              className="min-h-[52px] px-3 py-2.5 rounded-2xl bg-red-500/20 hover:bg-red-500/30 active:scale-95 text-red-400 border border-red-500/40 flex items-center justify-center gap-1 transition-all cursor-pointer"
              title="Decline Call"
            >
              <PhoneOff className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Up Next Queue toggle button */}
        <button
          type="button"
          onClick={onToggleQueue}
          className={`flex-1 min-h-[52px] py-2.5 px-2 sm:px-3 rounded-2xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer active:scale-95 ${
            isQueueOpen
              ? 'bg-gradient-to-r from-[#FF9F1C] to-[#FF5A5F] text-white border-transparent shadow-lg'
              : 'bg-white/5 hover:bg-white/10 text-white/90 border-white/10'
          }`}
          title="Toggle Up Next Queue"
        >
          <ListMusic className="w-4 h-4" />
          <span className="hidden xs:inline">Queue</span>
          <span className="text-[11px] font-mono bg-black/50 px-1.5 py-0.5 rounded-full text-white/80 border border-white/10">
            {queueCount}
          </span>
        </button>
      </div>
    </div>
  );
}
