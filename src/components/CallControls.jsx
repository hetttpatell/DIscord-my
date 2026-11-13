import React, { useState, useEffect } from 'react';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  ScreenShare, 
  Tv, 
  LayoutGrid, 
  PhoneOff,
  SwitchCamera,
  Settings,
  MessageSquare,
  Users,
  Maximize,
  Minimize,
  Headphones,
  X
} from 'lucide-react';

export default function CallControls({
  isMicOn = true,
  isCameraOn = false,
  isScreenSharing = false,
  layoutMode = 'strip',
  isFullscreen = false,
  unreadCount = 0,
  participantCount = 1,
  onToggleMic,
  onToggleCamera,
  onFlipCamera,
  onToggleScreenShare,
  onToggleLayoutMode,
  onToggleFullscreen,
  onOpenSettings,
  onToggleChat,
  onToggleParticipants,
  onLeaveCall
}) {
  const isDesktop = typeof window !== 'undefined' && !/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const [showHeadphonesTip, setShowHeadphonesTip] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;

    let dismissed = false;
    try {
      dismissed = Boolean(localStorage.getItem('tt_headphones_tip_dismissed'));
    } catch {}
    if (dismissed) return;

    const checkAudioOutput = async () => {
      if (!navigator?.mediaDevices?.enumerateDevices) return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
        const hasHeadphones = audioOutputs.some(d => {
          const label = (d.label || '').toLowerCase();
          return /headphone|headset|earphone|airpod|buds|wh-|wf-|bose|bluetooth/i.test(label);
        });

        setShowHeadphonesTip(!hasHeadphones);
      } catch (e) {
        console.debug('[CallControls] Device enumeration error:', e);
      }
    };

    checkAudioOutput();

    if (navigator?.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', checkAudioOutput);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', checkAudioOutput);
      };
    }
  }, [isDesktop]);

  const handleDismissHeadphonesTip = () => {
    setShowHeadphonesTip(false);
    try {
      localStorage.setItem('tt_headphones_tip_dismissed', 'true');
    } catch {}
  };

  return (
    <div className="fixed bottom-16 lg:bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 sm:gap-2.5 px-3 py-2 sm:px-4 rounded-full bg-[#202124]/95 backdrop-blur-md border border-[#3c4043] shadow-2xl max-w-[96vw] overflow-x-auto no-scrollbar">
      {/* Desktop Dismissible Headphones Tip */}
      {showHeadphonesTip && (
        <div className="absolute -top-11 left-1/2 -translate-x-1/2 whitespace-nowrap flex items-center gap-2 px-3 py-1 rounded-full bg-[#1e1f22]/95 border border-[#3c4043] shadow-lg text-xs text-[#e3e5e8] pointer-events-auto">
          <Headphones className="w-3.5 h-3.5 text-[#8ab4f8]" />
          <span>Using headphones prevents music echo</span>
          <button
            onClick={handleDismissHeadphonesTip}
            className="ml-1 text-[#949ba4] hover:text-white transition-colors p-0.5 rounded"
            title="Dismiss tip"
            aria-label="Dismiss headphones tip"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {/* Microphone Button */}
      <button
        onClick={onToggleMic}
        className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all shadow active:scale-95 touch-manipulation flex-shrink-0 ${
          isMicOn
            ? 'bg-[#3c4043] text-white hover:bg-[#4a4e52] border border-[#5f6368]/30'
            : 'bg-[#ea4335] text-white shadow-md shadow-[#ea4335]/30'
        }`}
        title={isMicOn ? "Mute Microphone" : "Unmute Microphone"}
        aria-label={isMicOn ? "Mute Microphone" : "Unmute Microphone"}
      >
        {isMicOn ? <Mic className="w-4 sm:w-5 h-4 sm:h-5 text-white" /> : <MicOff className="w-4 sm:w-5 h-4 sm:h-5 text-white" />}
      </button>

      {/* Camera Button */}
      <button
        onClick={onToggleCamera}
        className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all shadow active:scale-95 flex-shrink-0 ${
          isCameraOn
            ? 'bg-[#3c4043] text-white hover:bg-[#4a4e52] border border-[#5f6368]/30'
            : 'bg-[#ea4335] text-white shadow-md shadow-[#ea4335]/30'
        }`}
        title={isCameraOn ? "Turn Camera Off" : "Turn Camera On"}
        aria-label={isCameraOn ? "Turn Camera Off" : "Turn Camera On"}
      >
        {isCameraOn ? <Video className="w-4 sm:w-5 h-4 sm:h-5 text-white" /> : <VideoOff className="w-4 sm:w-5 h-4 sm:h-5 text-white" />}
      </button>

      {/* Flip Camera Button (Front/Back) */}
      {onFlipCamera && (
        <button
          onClick={onFlipCamera}
          className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#3c4043] hover:bg-[#4a4e52] text-white flex items-center justify-center transition-all border border-[#5f6368]/30 active:scale-95 flex-shrink-0 sm:hidden"
          title="Switch Front/Back Camera"
          aria-label="Switch Camera"
        >
          <SwitchCamera className="w-4 h-4" />
        </button>
      )}

      {/* Screen Share (Desktop only) */}
      {onToggleScreenShare && (
        <button
          onClick={onToggleScreenShare}
          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full hidden sm:flex items-center justify-center transition-all border border-[#5f6368]/30 active:scale-95 flex-shrink-0 ${
            isScreenSharing ? 'bg-[#1a73e8] text-white' : 'bg-[#3c4043] hover:bg-[#4a4e52] text-white'
          }`}
          title="Share Screen"
          aria-label="Share Screen"
        >
          <ScreenShare className="w-4 sm:w-5 h-4 sm:h-5" />
        </button>
      )}

      {/* In-Call Chat Toggle */}
      {onToggleChat && (
        <button
          onClick={onToggleChat}
          className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#3c4043] hover:bg-[#4a4e52] text-white flex items-center justify-center transition-all border border-[#5f6368]/30 active:scale-95 flex-shrink-0"
          title="In-call Messages"
          aria-label="Chat"
        >
          <MessageSquare className="w-4 sm:w-5 h-4 sm:h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#8ab4f8] text-[#202124] text-[10px] font-bold flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Participants List Toggle */}
      {onToggleParticipants && (
        <button
          onClick={onToggleParticipants}
          className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#3c4043] hover:bg-[#4a4e52] text-white flex items-center justify-center transition-all border border-[#5f6368]/30 active:scale-95 flex-shrink-0 hidden md:flex"
          title="Participants"
          aria-label="Participants"
        >
          <Users className="w-4 sm:w-5 h-4 sm:h-5" />
          {participantCount > 1 && (
            <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded-full bg-[#34a853] text-white text-[10px] font-bold flex items-center justify-center">
              {participantCount}
            </span>
          )}
        </button>
      )}

      {/* Layout Switcher (Theater vs Grid) */}
      {onToggleLayoutMode && (
        <button
          onClick={onToggleLayoutMode}
          className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#3c4043] hover:bg-[#4a4e52] text-white flex items-center justify-center transition-all border border-[#5f6368]/30 active:scale-95 flex-shrink-0"
          title={layoutMode === 'grid' ? "Switch to Theater Stage" : "Switch to Meet Grid"}
          aria-label="Switch Layout"
        >
          {layoutMode === 'grid' ? (
            <Tv className="w-4 sm:w-5 h-4 sm:h-5 text-[#8ab4f8]" />
          ) : (
            <LayoutGrid className="w-4 sm:w-5 h-4 sm:h-5 text-white" />
          )}
        </button>
      )}

      {/* Settings Modal Toggle */}
      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#3c4043] hover:bg-[#4a4e52] text-white flex items-center justify-center transition-all border border-[#5f6368]/30 active:scale-95 flex-shrink-0"
          title="Settings & Devices"
          aria-label="Settings"
        >
          <Settings className="w-4 sm:w-5 h-4 sm:h-5 text-white" />
        </button>
      )}

      {/* Fullscreen Toggle (Desktop) */}
      {onToggleFullscreen && (
        <button
          onClick={onToggleFullscreen}
          className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#3c4043] hover:bg-[#4a4e52] text-white hidden sm:flex items-center justify-center transition-all border border-[#5f6368]/30 active:scale-95 flex-shrink-0"
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          aria-label="Fullscreen"
        >
          {isFullscreen ? <Minimize className="w-4 sm:w-5 h-4 sm:h-5" /> : <Maximize className="w-4 sm:w-5 h-4 sm:h-5" />}
        </button>
      )}

      {/* Red End Call / Leave Button */}
      <button
        onClick={onLeaveCall}
        className="h-10 sm:h-11 px-4 sm:px-5 rounded-full bg-[#ea4335] hover:bg-[#d93025] text-white flex items-center justify-center shadow-lg shadow-[#ea4335]/30 active:scale-95 transition-all flex-shrink-0"
        title="Leave Room"
        aria-label="Leave Room"
      >
        <PhoneOff className="w-4 sm:w-5 h-4 sm:h-5 text-white" />
      </button>
    </div>
  );
}
