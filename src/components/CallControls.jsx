import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  ScreenShare, 
  PhoneOff,
  SwitchCamera,
  Settings,
  MessageSquare,
  Users,
  Maximize,
  Minimize,
  X,
  Hand,
  Smile,
  MoreVertical,
  ChevronUp,
  Check,
  Copy,
  Share2,
  Info,
  Keyboard,
  Sparkles,
  LayoutGrid,
  Maximize2,
  Columns
} from 'lucide-react';
import mediaController from '../services/mediaController.js';
import KeyboardShortcutsModal from './KeyboardShortcutsModal.jsx';

function formatElapsed(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs.toString().padStart(2, '0')}:${remMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function CallControls({
  room,
  isMicOn = true,
  isCameraOn = false,
  micState = 'off',
  cameraState = 'off',
  isScreenSharing = false,
  isHandRaised = false,
  layoutMode = 'auto',
  isFullscreen = false,
  unreadCount = 0,
  participantCount = 1,
  isPeopleOpen = false,
  isChatOpen = false,
  isDetailsOpen = false,
  onToggleMic,
  onToggleCamera,
  onFlipCamera,
  onToggleScreenShare,
  onToggleHandRaise,
  onSendReaction,
  onSelectLayoutMode,
  onToggleFullscreen,
  onOpenSettings,
  onToggleChat,
  onToggleParticipants,
  onToggleDetails,
  onLeaveCall,
  onToast
}) {
  const [elapsed, setElapsed] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showMicMenu, setShowMicMenu] = useState(false);
  const [showCamMenu, setShowCamMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [showInfoPopover, setShowInfoPopover] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showMobileMoreSheet, setShowMobileMoreSheet] = useState(false);

  // Device lists
  const [audioInputs, setAudioInputs] = useState([]);
  const [videoInputs, setVideoInputs] = useState([]);
  const [audioOutputs, setAudioOutputs] = useState([]);
  const supportsSinkId = typeof HTMLAudioElement !== 'undefined' && 'setSinkId' in HTMLAudioElement.prototype;

  // Selected device IDs
  const [selectedMic, setSelectedMic] = useState(() => mediaController.getState().selectedMicId || '');
  const [selectedCam, setSelectedCam] = useState(() => mediaController.getState().selectedCameraId || '');
  const [selectedSpk, setSelectedSpk] = useState(() => mediaController.getState().selectedSpeakerId || '');

  // Mobile Auto-hide State (5s inactivity)
  const [isMobileBarVisible, setIsMobileBarVisible] = useState(true);
  const mobileHideTimerRef = useRef(null);

  // Feature detection
  const supportsDisplayMedia = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia);

  // Elapsed Meeting Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(s => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Update device lists
  const updateDeviceList = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter(d => d.kind === 'audioinput');
      const cams = devices.filter(d => d.kind === 'videoinput');
      const spks = devices.filter(d => d.kind === 'audiooutput');

      setAudioInputs(mics);
      setVideoInputs(cams);
      setAudioOutputs(spks);

      // Check for disappeared active devices and fall back to default
      const currentMicId = mediaController.getState().selectedMicId;
      if (currentMicId && !mics.some(d => d.deviceId === currentMicId)) {
        mediaController.setAudioInput('');
        setSelectedMic('');
        onToast?.({ type: 'device', message: 'Microphone disconnected. Switched to default.' });
      }

      const currentCamId = mediaController.getState().selectedCameraId;
      if (currentCamId && !cams.some(d => d.deviceId === currentCamId)) {
        mediaController.setVideoInput('');
        setSelectedCam('');
        onToast?.({ type: 'device', message: 'Camera disconnected. Switched to default.' });
      }

      const currentSpkId = mediaController.getState().selectedSpeakerId;
      if (currentSpkId && !spks.some(d => d.deviceId === currentSpkId)) {
        mediaController.setAudioOutput('');
        setSelectedSpk('');
        onToast?.({ type: 'device', message: 'Speaker disconnected. Switched to default.' });
      }
    } catch (e) {
      console.debug('[CallControls] Error enumerating devices:', e);
    }
  }, [onToast]);

  useEffect(() => {
    let active = true;
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        if (!active) return;
        setAudioInputs(devices.filter(d => d.kind === 'audioinput'));
        setVideoInputs(devices.filter(d => d.kind === 'videoinput'));
        setAudioOutputs(devices.filter(d => d.kind === 'audiooutput'));
      }).catch(() => {});
    }

    const onDeviceChange = () => {
      updateDeviceList();
    };

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
      return () => {
        active = false;
        navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
      };
    }
    return () => {
      active = false;
    };
  }, [updateDeviceList]);

  // Subscribe to mediaController changes
  useEffect(() => {
    const unsub = mediaController.subscribe((_evt, _payload, state) => {
      if (state) {
        if (state.selectedMicId !== undefined) setSelectedMic(state.selectedMicId);
        if (state.selectedCameraId !== undefined) setSelectedCam(state.selectedCameraId);
        if (state.selectedSpeakerId !== undefined) setSelectedSpk(state.selectedSpeakerId);
      }
    });
    return () => unsub();
  }, []);

  // Mobile Inactivity Timer (5 seconds)
  const resetMobileTimer = useCallback(() => {
    setIsMobileBarVisible(true);
    if (mobileHideTimerRef.current) clearTimeout(mobileHideTimerRef.current);
    mobileHideTimerRef.current = setTimeout(() => {
      setIsMobileBarVisible(false);
    }, 5000);
  }, []);

  useEffect(() => {
    mobileHideTimerRef.current = setTimeout(() => {
      setIsMobileBarVisible(false);
    }, 5000);

    const handleUserInteraction = () => resetMobileTimer();

    window.addEventListener('touchstart', handleUserInteraction, { passive: true });
    window.addEventListener('mousemove', handleUserInteraction, { passive: true });
    return () => {
      if (mobileHideTimerRef.current) clearTimeout(mobileHideTimerRef.current);
      window.removeEventListener('touchstart', handleUserInteraction);
      window.removeEventListener('mousemove', handleUserInteraction);
    };
  }, [resetMobileTimer]);

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      const target = e.target;
      const isInput = target && (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable
      );
      if (isInput) return;

      const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
      const mod = isMac ? e.metaKey : e.ctrlKey;

      // Esc closes open popovers / modals
      if (e.key === 'Escape') {
        if (showMicMenu || showCamMenu || showMoreMenu || showReactions || showInfoPopover || showShortcutsModal || showMobileMoreSheet) {
          e.preventDefault();
          setShowMicMenu(false);
          setShowCamMenu(false);
          setShowMoreMenu(false);
          setShowReactions(false);
          setShowInfoPopover(false);
          setShowShortcutsModal(false);
          setShowMobileMoreSheet(false);
          return;
        }
        if (isChatOpen && onToggleChat) {
          e.preventDefault();
          onToggleChat();
          return;
        }
        if (isPeopleOpen && onToggleParticipants) {
          e.preventDefault();
          onToggleParticipants();
          return;
        }
      }

      // ? opens shortcuts modal
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowShortcutsModal(prev => !prev);
        return;
      }

      // Ctrl / Cmd + D: Toggle Mic
      if (mod && !e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        onToggleMic?.();
        return;
      }

      // Ctrl / Cmd + E: Toggle Camera
      if (mod && !e.altKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        onToggleCamera?.();
        return;
      }

      // Ctrl / Cmd + Alt + H: Raise Hand
      if (mod && e.altKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        onToggleHandRaise?.();
        return;
      }

      // Ctrl / Cmd + Alt + P: Toggle People
      if (mod && e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        onToggleParticipants?.();
        return;
      }

      // Ctrl / Cmd + Alt + C: Toggle Chat
      if (mod && e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        onToggleChat?.();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onToggleMic, 
    onToggleCamera, 
    onToggleHandRaise, 
    onToggleParticipants, 
    onToggleChat,
    showMicMenu,
    showCamMenu,
    showMoreMenu,
    showReactions,
    showInfoPopover,
    showShortcutsModal,
    showMobileMoreSheet,
    isChatOpen,
    isPeopleOpen
  ]);

  const copyMeetingLink = async () => {
    if (typeof window === 'undefined') return;
    const inviteUrl = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${room?.name || 'afterspot Lounge'} Meeting`,
          text: 'Join our video meeting on afterspot:',
          url: inviteUrl
        });
        onToast?.({ type: 'device', message: 'Meeting link shared!' });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      onToast?.({ type: 'device', message: 'Meeting link copied to clipboard!' });
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      onToast?.({ type: 'device', message: 'Failed to copy link.' });
    }
  };

  const reactionsList = ['💖', '👍', '🎉', '👏', '😂', '😮'];

  const handleSelectMic = (id) => {
    mediaController.setAudioInput(id);
    setSelectedMic(id);
    setShowMicMenu(false);
  };

  const handleSelectCam = (id) => {
    mediaController.setVideoInput(id);
    setSelectedCam(id);
    setShowCamMenu(false);
  };

  const handleSelectSpk = (id) => {
    mediaController.setAudioOutput(id);
    setSelectedSpk(id);
    setShowMicMenu(false);
  };

  return (
    <>
      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />

      {/* 
        BOTTOM CONTROL BAR
        Desktop: Full 3-section layout (Left: Info/Elapsed, Center: Media Controls, Right: People/Chat/Settings)
        Mobile: Auto-hiding compact bar + "More" bottom sheet
      */}
      <footer 
        className={`fixed bottom-0 left-0 right-0 z-40 bg-[#202124] border-t border-[#3c4043] px-3 sm:px-6 py-2.5 sm:py-3 transition-transform duration-300 ease-in-out select-none ${
          !isMobileBarVisible ? 'translate-y-full sm:translate-y-0' : 'translate-y-0'
        }`}
        role="toolbar"
        aria-label="Meeting controls"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          
          {/* ========================================================= */}
          {/* 1. LEFT SECTION (Desktop): Elapsed Time & Room Code Link  */}
          {/* ========================================================= */}
          <div className="hidden lg:flex items-center gap-3 min-w-[220px]">
            <span className="font-mono text-sm text-[#e8eaed] font-medium tracking-wide">
              {formatElapsed(elapsed)}
            </span>
            <span className="h-4 w-px bg-[#5f6368]/40" />
            
            <div className="flex items-center gap-2 text-xs text-[#9aa0a6] truncate max-w-[200px]">
              <span className="truncate font-medium text-[#e8eaed]">
                {room?.name || room?.id || 'afterspot'}
              </span>
              <button
                type="button"
                onClick={copyMeetingLink}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#3c4043]/70 hover:bg-[#3c4043] border border-[#5f6368]/40 text-[#8ab4f8] text-[11px] font-semibold transition-all active:scale-95 cursor-pointer shrink-0"
                title="Share room link"
                aria-label="Share room link"
              >
                {copiedLink ? <Check className="w-3 h-3 text-[#34a853]" /> : <Share2 className="w-3 h-3" />}
                <span>{copiedLink ? 'Copied' : 'Share'}</span>
              </button>
            </div>
          </div>

          {/* ========================================================= */}
          {/* 2. CENTER SECTION: Core Audio/Video/Interaction Controls   */}
          {/* ========================================================= */}
          <div className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 relative">
            
            {/* MICROPHONE SPLIT BUTTON */}
            <div className="relative flex items-center">
              <button
                type="button"
                onClick={onToggleMic}
                aria-pressed={isMicOn}
                aria-busy={micState === 'requesting'}
                className={`min-w-[44px] min-h-[44px] w-11 h-11 rounded-l-full flex items-center justify-center transition-all shadow-md active:scale-95 touch-manipulation ${
                  isMicOn
                    ? 'bg-[#3c4043] text-white hover:bg-[#4a4e52]'
                    : micState === 'blocked' || micState === 'error'
                      ? 'bg-[#ea4335] text-white ring-2 ring-red-400'
                      : 'bg-[#ea4335] text-white'
                }`}
                title={isMicOn ? "Turn off microphone (Ctrl+D)" : "Turn on microphone (Ctrl+D)"}
                aria-label={isMicOn ? "Turn off microphone" : "Turn on microphone"}
              >
                {micState === 'requesting' ? (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : isMicOn ? (
                  <Mic className="w-5 h-5" />
                ) : (
                  <MicOff className="w-5 h-5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMicMenu(prev => !prev);
                  setShowCamMenu(false);
                  setShowMoreMenu(false);
                  setShowReactions(false);
                }}
                className={`min-h-[44px] w-5 h-11 rounded-r-full border-l border-black/20 flex items-center justify-center transition-colors ${
                  isMicOn ? 'bg-[#3c4043] hover:bg-[#4a4e52] text-white' : 'bg-[#ea4335] hover:bg-[#d93025] text-white'
                }`}
                title="Microphone & Speaker settings"
                aria-label="Microphone settings"
                aria-expanded={showMicMenu}
              >
                <ChevronUp className={`w-3.5 h-3.5 transition-transform ${showMicMenu ? 'rotate-180' : ''}`} />
              </button>

              {/* Mic & Speaker Device Popover */}
              {showMicMenu && (
                <div className="absolute bottom-full left-0 mb-3 w-72 bg-[#282a2d] border border-[#3c4043] rounded-2xl shadow-2xl p-3 z-50 text-xs font-medium text-[#e8eaed] animate-fade-in divide-y divide-[#3c4043]">
                  {/* Microphones */}
                  <div className="pb-2.5">
                    <span className="text-[10px] uppercase font-bold text-[#9aa0a6] px-2 block mb-1.5">
                      Microphone
                    </span>
                    <div className="space-y-0.5 max-h-36 overflow-y-auto">
                      {audioInputs.length === 0 ? (
                        <span className="px-2 py-1 text-[#9aa0a6] text-xs block">Default Microphone</span>
                      ) : (
                        audioInputs.map((d, i) => (
                          <button
                            key={d.deviceId || i}
                            type="button"
                            onClick={() => handleSelectMic(d.deviceId)}
                            className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-left hover:bg-[#3c4043]/70 transition-colors"
                          >
                            <span className="truncate pr-2">{d.label || `Microphone ${i + 1}`}</span>
                            {selectedMic === d.deviceId && <Check className="w-3.5 h-3.5 text-[#8ab4f8] shrink-0" />}
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Speakers (if supported) */}
                  {supportsSinkId && (
                    <div className="pt-2.5">
                      <span className="text-[10px] uppercase font-bold text-[#9aa0a6] px-2 block mb-1.5">
                        Speaker
                      </span>
                      <div className="space-y-0.5 max-h-36 overflow-y-auto">
                        {audioOutputs.length === 0 ? (
                          <span className="px-2 py-1 text-[#9aa0a6] text-xs block">Default Speaker</span>
                        ) : (
                          audioOutputs.map((d, i) => (
                            <button
                              key={d.deviceId || i}
                              type="button"
                              onClick={() => handleSelectSpk(d.deviceId)}
                              className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-left hover:bg-[#3c4043]/70 transition-colors"
                            >
                              <span className="truncate pr-2">{d.label || `Speaker ${i + 1}`}</span>
                              {selectedSpk === d.deviceId && <Check className="w-3.5 h-3.5 text-[#8ab4f8] shrink-0" />}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* CAMERA SPLIT BUTTON */}
            <div className="relative flex items-center">
              <button
                type="button"
                onClick={onToggleCamera}
                aria-pressed={isCameraOn}
                aria-busy={cameraState === 'requesting'}
                className={`min-w-[44px] min-h-[44px] w-11 h-11 rounded-l-full flex items-center justify-center transition-all shadow-md active:scale-95 touch-manipulation ${
                  isCameraOn
                    ? 'bg-[#3c4043] text-white hover:bg-[#4a4e52]'
                    : cameraState === 'blocked' || cameraState === 'error'
                      ? 'bg-[#ea4335] text-white ring-2 ring-red-400'
                      : 'bg-[#ea4335] text-white'
                }`}
                title={isCameraOn ? "Turn off camera (Ctrl+E)" : "Turn on camera (Ctrl+E)"}
                aria-label={isCameraOn ? "Turn off camera" : "Turn on camera"}
              >
                {cameraState === 'requesting' ? (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : isCameraOn ? (
                  <Video className="w-5 h-5" />
                ) : (
                  <VideoOff className="w-5 h-5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCamMenu(prev => !prev);
                  setShowMicMenu(false);
                  setShowMoreMenu(false);
                  setShowReactions(false);
                }}
                className={`min-h-[44px] w-5 h-11 rounded-r-full border-l border-black/20 flex items-center justify-center transition-colors ${
                  isCameraOn ? 'bg-[#3c4043] hover:bg-[#4a4e52] text-white' : 'bg-[#ea4335] hover:bg-[#d93025] text-white'
                }`}
                title="Camera settings"
                aria-label="Camera settings"
                aria-expanded={showCamMenu}
              >
                <ChevronUp className={`w-3.5 h-3.5 transition-transform ${showCamMenu ? 'rotate-180' : ''}`} />
              </button>

              {/* Camera Device Popover */}
              {showCamMenu && (
                <div className="absolute bottom-full left-0 mb-3 w-64 bg-[#282a2d] border border-[#3c4043] rounded-2xl shadow-2xl p-3 z-50 text-xs font-medium text-[#e8eaed] animate-fade-in">
                  <span className="text-[10px] uppercase font-bold text-[#9aa0a6] px-2 block mb-1.5">
                    Camera
                  </span>
                  <div className="space-y-0.5 max-h-48 overflow-y-auto">
                    {videoInputs.length === 0 ? (
                      <span className="px-2 py-1 text-[#9aa0a6] text-xs block">Default Camera</span>
                    ) : (
                      videoInputs.map((d, i) => (
                        <button
                          key={d.deviceId || i}
                          type="button"
                          onClick={() => handleSelectCam(d.deviceId)}
                          className="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-left hover:bg-[#3c4043]/70 transition-colors"
                        >
                          <span className="truncate pr-2">{d.label || `Camera ${i + 1}`}</span>
                          {selectedCam === d.deviceId && <Check className="w-3.5 h-3.5 text-[#8ab4f8] shrink-0" />}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* SCREEN SHARE BUTTON (Desktop / Supported browsers only) */}
            {supportsDisplayMedia && (
              <button
                type="button"
                onClick={onToggleScreenShare}
                aria-pressed={isScreenSharing}
                className={`min-w-[44px] min-h-[44px] w-11 h-11 rounded-full hidden sm:flex items-center justify-center transition-all shadow-md active:scale-95 touch-manipulation ${
                  isScreenSharing
                    ? 'bg-[#8ab4f8] text-[#202124]'
                    : 'bg-[#3c4043] hover:bg-[#4a4e52] text-white'
                }`}
                title={isScreenSharing ? "Stop presenting" : "Present now"}
                aria-label={isScreenSharing ? "Stop presenting" : "Present now"}
              >
                <ScreenShare className="w-5 h-5" />
              </button>
            )}

            {/* RAISE HAND BUTTON */}
            <button
              type="button"
              onClick={onToggleHandRaise}
              aria-pressed={isHandRaised}
              className={`min-w-[44px] min-h-[44px] w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-md active:scale-95 touch-manipulation ${
                isHandRaised
                  ? 'bg-[#8ab4f8] text-[#202124]'
                  : 'bg-[#3c4043] hover:bg-[#4a4e52] text-white'
              }`}
              title={isHandRaised ? "Lower hand (Ctrl+Alt+H)" : "Raise hand (Ctrl+Alt+H)"}
              aria-label={isHandRaised ? "Lower hand" : "Raise hand"}
            >
              <Hand className="w-5 h-5" />
            </button>

            {/* REACTIONS BUTTON & FLOATING BAR */}
            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => {
                  setShowReactions(prev => !prev);
                  setShowMicMenu(false);
                  setShowCamMenu(false);
                  setShowMoreMenu(false);
                }}
                className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-[#3c4043] hover:bg-[#4a4e52] text-white flex items-center justify-center transition-all shadow-md active:scale-95"
                title="Send a reaction"
                aria-label="Send a reaction"
                aria-expanded={showReactions}
              >
                <Smile className="w-5 h-5" />
              </button>

              {/* Reaction Emojis Popover */}
              {showReactions && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-[#282a2d] border border-[#3c4043] rounded-full shadow-2xl px-3 py-1.5 flex items-center gap-1.5 z-50 animate-fade-in">
                  {reactionsList.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onSendReaction?.(emoji);
                        setShowReactions(false);
                      }}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-lg hover:bg-[#3c4043] hover:scale-125 active:scale-95 transition-transform"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* FLIP CAMERA (Mobile front/back switcher) */}
            {onFlipCamera && (
              <button
                type="button"
                onClick={onFlipCamera}
                className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-[#3c4043] hover:bg-[#4a4e52] text-white flex items-center justify-center transition-all shadow-md active:scale-95 sm:hidden"
                title="Switch camera"
                aria-label="Switch camera"
              >
                <SwitchCamera className="w-5 h-5" />
              </button>
            )}

            {/* MORE OPTIONS & LAYOUT MENU (Desktop) */}
            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu(prev => !prev);
                  setShowMicMenu(false);
                  setShowCamMenu(false);
                  setShowReactions(false);
                }}
                className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-[#3c4043] hover:bg-[#4a4e52] text-white flex items-center justify-center transition-all shadow-md active:scale-95"
                title="More options"
                aria-label="More options"
                aria-expanded={showMoreMenu}
              >
                <MoreVertical className="w-5 h-5" />
              </button>

              {/* More Menu Dropdown */}
              {showMoreMenu && (
                <div className="absolute bottom-full right-0 mb-3 w-56 bg-[#282a2d] border border-[#3c4043] rounded-2xl shadow-2xl py-2 z-50 text-xs font-medium text-[#e8eaed] animate-fade-in divide-y divide-[#3c4043]/60">
                  {/* Layout choices */}
                  <div className="py-1">
                    <span className="text-[10px] uppercase font-bold text-[#9aa0a6] px-3.5 block mb-1">
                      Change Layout
                    </span>
                    <button
                      type="button"
                      onClick={() => { onSelectLayoutMode?.('auto'); setShowMoreMenu(false); }}
                      className="w-full px-3.5 py-1.5 flex items-center justify-between hover:bg-[#3c4043]/70 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#8ab4f8]" />
                        <span>Auto</span>
                      </div>
                      {layoutMode === 'auto' && <Check className="w-3.5 h-3.5 text-[#8ab4f8]" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => { onSelectLayoutMode?.('tiled'); setShowMoreMenu(false); }}
                      className="w-full px-3.5 py-1.5 flex items-center justify-between hover:bg-[#3c4043]/70 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <LayoutGrid className="w-4 h-4 text-[#8ab4f8]" />
                        <span>Tiled</span>
                      </div>
                      {layoutMode === 'tiled' && <Check className="w-3.5 h-3.5 text-[#8ab4f8]" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => { onSelectLayoutMode?.('spotlight'); setShowMoreMenu(false); }}
                      className="w-full px-3.5 py-1.5 flex items-center justify-between hover:bg-[#3c4043]/70 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Maximize2 className="w-4 h-4 text-[#8ab4f8]" />
                        <span>Spotlight</span>
                      </div>
                      {layoutMode === 'spotlight' && <Check className="w-3.5 h-3.5 text-[#8ab4f8]" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => { onSelectLayoutMode?.('sidebar'); setShowMoreMenu(false); }}
                      className="w-full px-3.5 py-1.5 flex items-center justify-between hover:bg-[#3c4043]/70 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Columns className="w-4 h-4 text-[#8ab4f8]" />
                        <span>Sidebar</span>
                      </div>
                      {layoutMode === 'sidebar' && <Check className="w-3.5 h-3.5 text-[#8ab4f8]" />}
                    </button>
                  </div>

                  {/* Actions & Dialogs */}
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => { copyMeetingLink(); setShowMoreMenu(false); }}
                      className="w-full px-3.5 py-1.5 flex items-center justify-between hover:bg-[#3c4043]/70 text-left text-xs cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Share2 className="w-4 h-4 text-[#8ab4f8]" />
                        <span>Share room link</span>
                      </div>
                      <span className="text-[10px] text-[#8ab4f8] font-bold">Invite</span>
                    </button>
                    {onToggleFullscreen && (
                      <button
                        type="button"
                        onClick={() => { onToggleFullscreen(); setShowMoreMenu(false); }}
                        className="w-full px-3.5 py-1.5 flex items-center gap-2 hover:bg-[#3c4043]/70 text-left"
                      >
                        {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                        <span>{isFullscreen ? 'Exit full screen' : 'Full screen'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setShowShortcutsModal(true); setShowMoreMenu(false); }}
                      className="w-full px-3.5 py-1.5 flex items-center justify-between hover:bg-[#3c4043]/70 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Keyboard className="w-4 h-4" />
                        <span>Keyboard shortcuts</span>
                      </div>
                      <kbd className="text-[10px] font-mono text-[#9aa0a6] bg-[#303134] px-1 rounded">?</kbd>
                    </button>
                    {onOpenSettings && (
                      <button
                        type="button"
                        onClick={() => { onOpenSettings(); setShowMoreMenu(false); }}
                        className="w-full px-3.5 py-1.5 flex items-center gap-2 hover:bg-[#3c4043]/70 text-left"
                      >
                        <Settings className="w-4 h-4" />
                        <span>Settings</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* MOBILE MORE MENU TRIGGER */}
            <button
              type="button"
              onClick={() => setShowMobileMoreSheet(true)}
              className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-[#3c4043] hover:bg-[#4a4e52] text-white flex items-center justify-center transition-all shadow-md active:scale-95 sm:hidden"
              title="More options"
              aria-label="More options"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {/* LEAVE CALL BUTTON (Red) */}
            <button
              type="button"
              onClick={onLeaveCall}
              className="min-w-[44px] min-h-[44px] h-11 px-5 rounded-full bg-[#ea4335] hover:bg-[#d93025] text-white flex items-center justify-center shadow-lg shadow-[#ea4335]/30 active:scale-95 transition-all flex-shrink-0"
              title="Leave call"
              aria-label="Leave call"
            >
              <PhoneOff className="w-5 h-5 fill-current" />
            </button>
          </div>

          {/* ========================================================= */}
          {/* 3. RIGHT SECTION (Desktop): Meeting Info, People, Chat    */}
          {/* ========================================================= */}
          <div className="hidden lg:flex items-center justify-end gap-1.5 min-w-[220px]">
            {/* Info / Details Button */}
            <div className="relative">
              <button
                type="button"
                onClick={onToggleDetails || (() => setShowInfoPopover(prev => !prev))}
                className={`min-w-[44px] min-h-[44px] w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                  isDetailsOpen || showInfoPopover ? 'bg-[#8ab4f8] text-[#202124]' : 'text-[#e8eaed] hover:bg-[#3c4043]'
                }`}
                title="Meeting details"
                aria-label="Meeting details"
                aria-pressed={isDetailsOpen}
              >
                <Info className="w-5 h-5" />
              </button>

              {showInfoPopover && (
                <div className="absolute bottom-full right-0 mb-3 w-72 bg-[#282a2d] border border-[#3c4043] rounded-2xl shadow-2xl p-4 z-50 text-xs text-[#e8eaed] animate-fade-in">
                  <h3 className="font-semibold text-sm mb-1 text-white">Joining info</h3>
                  <p className="text-[#9aa0a6] text-[11px] mb-3">Share this code with people you want in the call</p>
                  
                  <div className="p-2.5 rounded-xl bg-[#202124] border border-[#3c4043] flex items-center justify-between gap-2">
                    <span className="font-mono text-xs truncate select-all">{window.location.href}</span>
                    <button
                      type="button"
                      onClick={copyMeetingLink}
                      className="p-1.5 rounded-lg hover:bg-[#3c4043] text-[#8ab4f8] transition-colors shrink-0"
                      title="Copy link"
                    >
                      {copiedLink ? <Check className="w-4 h-4 text-[#34a853]" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* People List Toggle with Badge */}
            {onToggleParticipants && (
              <button
                type="button"
                onClick={onToggleParticipants}
                aria-pressed={isPeopleOpen}
                className={`min-w-[44px] min-h-[44px] w-11 h-11 rounded-full relative flex items-center justify-center transition-colors ${
                  isPeopleOpen ? 'bg-[#8ab4f8] text-[#202124]' : 'text-[#e8eaed] hover:bg-[#3c4043]'
                }`}
                title="People"
                aria-label={`Participants (${participantCount})`}
              >
                <Users className="w-5 h-5" />
                {participantCount > 0 && (
                  <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center shadow-md ${
                    isPeopleOpen ? 'bg-[#202124] text-[#8ab4f8]' : 'bg-[#3c4043] text-white border border-[#202124]'
                  }`}>
                    {participantCount}
                  </span>
                )}
              </button>
            )}

            {/* In-Call Chat Toggle with Badge */}
            {onToggleChat && (
              <button
                type="button"
                onClick={onToggleChat}
                aria-pressed={isChatOpen}
                className={`min-w-[44px] min-h-[44px] w-11 h-11 rounded-full relative flex items-center justify-center transition-colors ${
                  isChatOpen ? 'bg-[#8ab4f8] text-[#202124]' : 'text-[#e8eaed] hover:bg-[#3c4043]'
                }`}
                title="Chat with everyone"
                aria-label={`Chat ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
              >
                <MessageSquare className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#8ab4f8] text-[#202124] text-[10px] font-bold flex items-center justify-center shadow-md animate-bounce">
                    {unreadCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* ========================================================= */}
      {/* 4. MOBILE BOTTOM SHEET FOR EXTRA ACTIONS ("More" Sheet)   */}
      {/* ========================================================= */}
      {showMobileMoreSheet && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm sm:hidden flex flex-col justify-end animate-fade-in"
          onClick={() => setShowMobileMoreSheet(false)}
        >
          <div 
            className="bg-[#202124] border-t border-[#3c4043] rounded-t-3xl p-4 max-h-[80vh] overflow-y-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag Handle */}
            <div className="w-10 h-1 bg-[#5f6368] rounded-full mx-auto" />

            <div className="flex items-center justify-between pb-2 border-b border-[#3c4043]">
              <h3 className="text-sm font-semibold text-white">More options</h3>
              <button
                type="button"
                onClick={() => setShowMobileMoreSheet(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Share Room Link Card (Mobile) */}
            <button
              type="button"
              onClick={() => {
                copyMeetingLink();
                setShowMobileMoreSheet(false);
              }}
              className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-[#8ab4f8]/15 border border-[#8ab4f8]/30 text-[#8ab4f8] text-xs font-bold transition-all active:scale-95 cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Share2 className="w-4 h-4" />
                <span>Share room link to invite others</span>
              </div>
              <span className="text-[11px] bg-[#8ab4f8] text-[#202124] px-2.5 py-1 rounded-full font-bold shadow-sm">
                {copiedLink ? 'Copied!' : 'Share'}
              </span>
            </button>

            {/* Reactions row */}
            <div className="py-1">
              <span className="text-[10px] uppercase font-bold text-[#9aa0a6] block mb-2">Send Reaction</span>
              <div className="flex items-center justify-around bg-[#282a2d] p-2 rounded-2xl">
                {reactionsList.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onSendReaction?.(emoji);
                      setShowMobileMoreSheet(false);
                    }}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-xl hover:scale-125 active:scale-95 transition-transform"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Primary actions */}
            <div className="grid grid-cols-2 gap-2">
              {onToggleParticipants && (
                <button
                  type="button"
                  onClick={() => {
                    onToggleParticipants();
                    setShowMobileMoreSheet(false);
                  }}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-[#282a2d] text-white text-xs font-medium"
                >
                  <Users className="w-4 h-4 text-[#8ab4f8]" />
                  <span>People ({participantCount})</span>
                </button>
              )}
              {onToggleChat && (
                <button
                  type="button"
                  onClick={() => {
                    onToggleChat();
                    setShowMobileMoreSheet(false);
                  }}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-[#282a2d] text-white text-xs font-medium"
                >
                  <MessageSquare className="w-4 h-4 text-[#8ab4f8]" />
                  <span>Chat {unreadCount > 0 ? `(${unreadCount})` : ''}</span>
                </button>
              )}
            </div>

            {/* Layout & Settings */}
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  setShowShortcutsModal(true);
                  setShowMobileMoreSheet(false);
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-[#282a2d] text-white text-xs font-medium"
              >
                <div className="flex items-center gap-2.5">
                  <Keyboard className="w-4 h-4 text-[#8ab4f8]" />
                  <span>Keyboard shortcuts</span>
                </div>
                <kbd className="text-[10px] font-mono text-[#9aa0a6] bg-[#303134] px-1.5 py-0.5 rounded">?</kbd>
              </button>

              {onOpenSettings && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenSettings();
                    setShowMobileMoreSheet(false);
                  }}
                  className="w-full flex items-center gap-2.5 p-3 rounded-xl bg-[#282a2d] text-white text-xs font-medium"
                >
                  <Settings className="w-4 h-4 text-[#8ab4f8]" />
                  <span>Settings</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
