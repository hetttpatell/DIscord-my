import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Share2,
  Check,
  Video,
  Tv,
  LayoutGrid,
  ScreenShare,
  AlertCircle,
  Sparkles,
  Maximize2,
  Columns,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import useLocalMedia from '../hooks/useLocalMedia';
import useWebRTC from '../hooks/useWebRTC';
import VideoTile from './VideoTile';
import CallControls from './CallControls';
import InsecureContextBanner from './InsecureContextBanner';
import MeetingSettingsModal from './MeetingSettingsModal';
import MeetingSidePanel from './MeetingSidePanel.jsx';
import MeetingToasts from './MeetingToasts.jsx';
import socket from '../services/socket';
import { computeLayout } from '../layout/computeLayout.js';
import { participantsStore, useParticipantsList, useActiveSpeakerId } from '../state/participantsStore.js';

export default function VideoCallGrid({
  room,
  currentUser,
  members = [],
  layoutMode: _externalLayoutMode = 'strip',
  onToggleLayoutMode: _onToggleLayoutMode,
  onLeaveRoom,
  children
}) {
  const [copied, setCopied] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShareStream, setScreenShareStream] = useState(null);
  const [pinnedPeerId, setPinnedPeerId] = useState(null);

  // Layout Engine States
  const [layoutChoice, setLayoutChoice] = useState(() => {
    try {
      return localStorage.getItem('tt_layout_mode') || 'auto';
    } catch {
      return 'auto';
    }
  });
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);

  // Draggable PiP corner state (defaults to bottom-right)
  const [pipCorner, setPipCorner] = useState(() => {
    try {
      return localStorage.getItem('tt_pip_corner') || 'bottom-right';
    } catch {
      return 'bottom-right';
    }
  });
  const [pipDragPos, setPipDragPos] = useState(null); // { x, y } during active drag
  const pipDragStartRef = useRef(null);

  // Container viewport measurements with ResizeObserver (throttled to 1 update per RAF)
  const gridContainerRef = useRef(null);
  const [viewport, setViewport] = useState({ width: 1280, height: 720, isMobile: false });
  const rafIdRef = useRef(null);

  // Modals & Panels: exactly one active side panel at a time ('people' | 'chat' | 'details' | null)
  const [showSettings, setShowSettings] = useState(false);
  const [activeSidePanel, setActiveSidePanel] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [inCallMessages, setInCallMessages] = useState([]);

  // 1. Local Media Hook
  const {
    stream: localStream,
    isMicOn,
    isCameraOn,
    micState,
    cameraState,
    facingMode,
    isSpeaking: isLocalSpeaking,
    isSecureContext,
    toggleMic,
    toggleCamera,
    switchCamera,
    startAudio
  } = useLocalMedia();

  // In-Call Toasts System
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((toast) => {
    const id = Date.now() + Math.random().toString(36).slice(2, 6);
    const newToast = { ...toast, id };
    setToasts(prev => [...prev.slice(-3), newToast]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Floating reactions on stage
  const [floatingReactions, setFloatingReactions] = useState([]);
  const addFloatingReaction = useCallback((emoji, sender) => {
    const id = `float-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const left = Math.floor(Math.random() * 70) + 15;
    setFloatingReactions(prev => [...prev.slice(-15), { id, emoji, sender, left }]);
    setTimeout(() => {
      setFloatingReactions(prev => prev.filter(r => r.id !== id));
    }, 2400);
  }, []);

  useEffect(() => {
    const onReaction = (payload) => {
      const emoji = payload?.reaction || payload?.emoji;
      if (!emoji) return;
      const sender = payload?.senderName || payload?.sender || '';
      addFloatingReaction(emoji, sender);
    };

    socket.on('participant:reaction', onReaction);
    socket.on('reaction:received', onReaction);
    return () => {
      socket.off('participant:reaction', onReaction);
      socket.off('reaction:received', onReaction);
    };
  }, [addFloatingReaction]);

  // Hand Raise State
  const [isHandRaised, setIsHandRaised] = useState(false);
  const handleToggleHandRaise = useCallback(() => {
    setIsHandRaised(prev => {
      const next = !prev;
      const localId = currentUser?.id || socket.id || 'local';
      participantsStore.setHandRaised(localId, next ? Date.now() : null);
      socket.emit('participant:hand-raise', {
        roomId: room?.id,
        participantId: localId,
        isRaised: next,
        name: currentUser?.name || 'You'
      });
      return next;
    });
  }, [currentUser, room?.id]);

  // Host Action Senders
  const isHost = Boolean(currentUser?.isHost);

  const handleMuteParticipant = useCallback((participantId) => {
    if (!isHost) return;
    socket.emit('host:mute-participant', { roomId: room?.id, participantId });
  }, [isHost, room?.id]);

  const handleMuteAll = useCallback(() => {
    if (!isHost) return;
    socket.emit('host:mute-all', { roomId: room?.id });
    addToast({ type: 'device', message: 'All participants muted' });
  }, [isHost, room?.id, addToast]);

  const handleLowerHand = useCallback((participantId) => {
    if (!isHost) return;
    socket.emit('host:lower-hand', { roomId: room?.id, participantId });
  }, [isHost, room?.id]);

  const handleAskToUnmute = useCallback((participantId) => {
    if (!isHost) return;
    socket.emit('host:ask-to-unmute', { roomId: room?.id, participantId });
    addToast({ type: 'device', message: 'Asked participant to unmute' });
  }, [isHost, room?.id, addToast]);

  const handleSpotlight = useCallback((participantId) => {
    if (!isHost) return;
    socket.emit('host:spotlight-participant', { roomId: room?.id, participantId });
  }, [isHost, room?.id]);

  // Host Action Receivers
  useEffect(() => {
    const localId = currentUser?.id || socket.id || 'local';

    const onMuteParticipant = (payload) => {
      if (payload?.participantId === localId) {
        mediaController.disableMic();
        addToast({ type: 'device', message: 'You were muted by the host' });
      }
    };

    const onMuteAll = (payload) => {
      if (!isHost && payload?.hostId !== socket.id) {
        mediaController.disableMic();
        addToast({ type: 'device', message: 'You were muted by the host' });
      }
    };

    const onLowerHand = (payload) => {
      if (payload?.participantId === localId) {
        setIsHandRaised(false);
        participantsStore.setHandRaised(localId, null);
        addToast({ type: 'hand', message: 'Your hand was lowered by the host' });
      } else if (payload?.participantId) {
        participantsStore.setHandRaised(payload.participantId, null);
      }
    };

    const onAskToUnmute = (payload) => {
      if (payload?.participantId === localId) {
        addToast({ 
          type: 'device', 
          message: `${payload.hostName || 'The host'} is asking you to unmute` 
        });
      }
    };

    const onSpotlight = (payload) => {
      if (payload?.participantId) {
        setPinnedPeerId(payload.participantId);
        addToast({ 
          type: 'device', 
          message: `${payload.hostName || 'The host'} spotlighted a participant` 
        });
      }
    };

    socket.on('host:mute-participant', onMuteParticipant);
    socket.on('host:mute-all', onMuteAll);
    socket.on('host:lower-hand', onLowerHand);
    socket.on('host:ask-to-unmute', onAskToUnmute);
    socket.on('host:spotlight-participant', onSpotlight);

    return () => {
      socket.off('host:mute-participant', onMuteParticipant);
      socket.off('host:mute-all', onMuteAll);
      socket.off('host:lower-hand', onLowerHand);
      socket.off('host:ask-to-unmute', onAskToUnmute);
      socket.off('host:spotlight-participant', onSpotlight);
    };
  }, [currentUser?.id, isHost, addToast]);

  // Reactions
  const handleSendReaction = useCallback((emoji) => {
    socket.emit('participant:reaction', {
      roomId: room?.id,
      reaction: emoji,
      senderName: currentUser?.name || 'You'
    });
    socket.emit('reaction:send', { emoji });
  }, [room?.id, currentUser?.name]);

  // 2. WebRTC / LiveKit Real-Time Hook
  const {
    peers,
    activeEngine,
    connectionNotice,
    sendMediaState,
    unlockAudio
  } = useWebRTC({
    roomId: room?.id,
    userName: currentUser?.name,
    sessionId: currentUser?.sessionId,
    localStream,
    isCallActive: true,
    initialMediaState: {
      isMuted: !isMicOn,
      isCameraOff: !isCameraOn,
      isScreenSharing: false
    }
  });

  // 3. Participant Store Integration
  const storeParticipants = useParticipantsList();
  const activeSpeakerId = useActiveSpeakerId();

  useEffect(() => {
    participantsStore.init({ currentUser, roomId: room?.id });
    if (members?.length > 0) {
      participantsStore.setSignalingMembers(members);
    }
  }, [currentUser, room?.id, members]);

  useEffect(() => {
    if (peers) {
      participantsStore.syncPeers(peers);
    }
  }, [peers]);

  useEffect(() => {
    participantsStore.updateLocalMediaState({
      isMicOn,
      isCameraOn,
      stream: localStream,
      isScreenSharing
    });
  }, [isMicOn, isCameraOn, localStream, isScreenSharing]);

  // Viewport ResizeObserver (throttled to 1 update per RAF)
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(entries => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      if (width <= 0 || height <= 0) return;

      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(() => {
        const isMobile = width < 640 || (typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || ''));
        setViewport({ width: Math.round(width), height: Math.round(height), isMobile });
      });
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  // Acquire microphone on join if not already acquired from lobby
  useEffect(() => {
    let mounted = true;
    const hasLiveAudio = Boolean(localStream?.getAudioTracks().some(t => t.readyState === 'live'));
    const shouldStartMuted = Boolean(room?.isPlaying && room?.currentTrack);

    if (!hasLiveAudio) {
      startAudio(shouldStartMuted).then(track => {
        if (!mounted) return;
        if (track) {
          sendMediaState({ isMuted: shouldStartMuted, isCameraOff: !isCameraOn, isScreenSharing: false });
        }
      });
    } else {
      sendMediaState({ isMuted: !isMicOn, isCameraOff: !isCameraOn, isScreenSharing: false });
    }

    return () => {
      mounted = false;
    };
  }, []); // Run once on room entry

  // Sync in-call chat with room socket & toast notifications
  useEffect(() => {
    const handleChat = (msg) => {
      setInCallMessages(prev => [...prev.slice(-100), msg]);
      if (activeSidePanel !== 'chat' && msg && msg.sender !== (currentUser?.name || 'You')) {
        addToast({
          type: 'chat',
          message: `${msg.sender}: ${msg.text || ''}`
        });
      }
    };
    socket.on('chat:message', handleChat);
    return () => socket.off('chat:message', handleChat);
  }, [activeSidePanel, currentUser?.name, addToast]);

  // Hand-raised socket listener
  useEffect(() => {
    const onHandRaised = (payload) => {
      if (!payload) return;
      const { participantId, isRaised, name } = payload;
      participantsStore.setHandRaised(participantId, isRaised ? Date.now() : null);
      if (isRaised && participantId !== (currentUser?.id || socket.id)) {
        addToast({
          type: 'hand',
          message: `${name || 'A participant'} raised hand`
        });
      }
    };
    socket.on('participant:hand-raised', onHandRaised);
    return () => socket.off('participant:hand-raised', onHandRaised);
  }, [currentUser?.id, addToast]);

  // Track member joins & leaves for toast notifications
  const prevMembersRef = useRef(new Map());
  useEffect(() => {
    const currentMap = new Map();
    (members || []).forEach(m => {
      if (m?.id) currentMap.set(m.id, m.name || 'Participant');
    });

    if (prevMembersRef.current.size > 0) {
      currentMap.forEach((name, id) => {
        if (!prevMembersRef.current.has(id) && id !== currentUser?.id) {
          addToast({
            type: 'join',
            message: `${name} joined the meeting`
          });
        }
      });
      prevMembersRef.current.forEach((name, id) => {
        if (!currentMap.has(id) && id !== currentUser?.id) {
          addToast({
            type: 'leave',
            message: `${name} left the meeting`
          });
        }
      });
    }
    prevMembersRef.current = currentMap;
  }, [members, currentUser?.id, addToast]);

  // Handle Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Sync mic and camera state changes to remote peers
  const handleToggleMic = useCallback(async () => {
    const track = await toggleMic();
    const newMuted = track ? !track.enabled : true;
    sendMediaState({
      isMuted: newMuted,
      isCameraOff: !isCameraOn,
      isScreenSharing
    });
  }, [toggleMic, isCameraOn, isScreenSharing, sendMediaState]);

  const handleToggleCamera = useCallback(async () => {
    const track = await toggleCamera();
    const newCameraOff = !track;
    sendMediaState({
      isMuted: !isMicOn,
      isCameraOff: newCameraOff,
      isScreenSharing
    });
  }, [toggleCamera, isMicOn, isScreenSharing, sendMediaState]);

  // Flip front/back camera on mobile
  const handleFlipCamera = useCallback(async () => {
    const track = await switchCamera();
    if (track) {
      sendMediaState({
        isMuted: !isMicOn,
        isCameraOff: false,
        isScreenSharing
      });
    }
  }, [switchCamera, isMicOn, isScreenSharing, sendMediaState]);

  // Toggle Screen Share (Desktop)
  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenShareStream) {
        screenShareStream.getTracks().forEach(t => t.stop());
      }
      setScreenShareStream(null);
      setIsScreenSharing(false);
      sendMediaState({ isMuted: !isMicOn, isCameraOff: !isCameraOn, isScreenSharing: false });
    } else {
      try {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          alert('Screen sharing is not supported by your mobile browser. Please use desktop Chrome, Edge, or Firefox.');
          return;
        }
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = displayStream.getVideoTracks()[0];
        if (!screenTrack) return;

        setScreenShareStream(displayStream);
        setIsScreenSharing(true);
        sendMediaState({ isMuted: !isMicOn, isCameraOff: false, isScreenSharing: true });

        screenTrack.onended = () => {
          setScreenShareStream(null);
          setIsScreenSharing(false);
          sendMediaState({ isMuted: !isMicOn, isCameraOff: !isCameraOn, isScreenSharing: false });
        };
      } catch (err) {
        console.debug('[WebRTC] Screen share canceled:', err);
      }
    }
  };



  // Global touch / click listener to unlock autoplay on mobile browsers
  useEffect(() => {
    const handleUserInteraction = () => {
      unlockAudio();
    };

    window.addEventListener('click', handleUserInteraction, { passive: true });
    window.addEventListener('touchstart', handleUserInteraction, { passive: true });
    return () => {
      window.removeEventListener('click', handleUserInteraction);
      window.removeEventListener('touchstart', handleUserInteraction);
    };
  }, [unlockAudio]);

  // Layout mode switcher helper
  const handleSelectLayoutMode = (mode) => {
    setLayoutChoice(mode);
    setShowLayoutMenu(false);
    setPageIndex(0);
    try {
      localStorage.setItem('tt_layout_mode', mode);
    } catch {}
  };

  // Prevent accidental back navigation or tab close from exiting the room
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Push a state so history has a buffer and back gesture is trapped
    window.history.pushState({ inMeeting: true }, '', window.location.href);

    const handlePopState = () => {
      // Re-push state so user stays in the meeting
      window.history.pushState({ inMeeting: true }, '', window.location.href);
      addToast({
        type: 'device',
        message: 'To leave the meeting, please use the red Exit button at the bottom.'
      });
    };

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [addToast]);

  // Invite URL copy / share helpers (native Web Share API with clipboard fallback)
  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/?room=${room?.id || ''}` : '';

  const handleShareLink = useCallback(async () => {
    if (!inviteUrl) return;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${room?.name || 'afterspot Lounge'} Meeting`,
          text: 'Join our video meeting on afterspot:',
          url: inviteUrl
        });
        addToast({ type: 'device', message: 'Meeting link shared!' });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      addToast({ type: 'device', message: 'Meeting link copied to clipboard!' });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      addToast({ type: 'device', message: 'Failed to copy link.' });
    }
  }, [inviteUrl, room, addToast]);

  // Combine store participants and ensure local user is included
  const currentUserId = currentUser?.id || 'local';
  const participantsList = useMemo(() => {
    const list = [...storeParticipants];
    const hasLocal = list.some(p => p.isLocal || p.id === currentUserId);
    if (!hasLocal) {
      list.unshift({
        id: currentUserId,
        clientId: currentUser?.clientId || currentUserId,
        name: currentUser?.name || 'You',
        isLocal: true,
        isHost: Boolean(currentUser?.isHost),
        avatarColor: currentUser?.avatarColor || '#5865f2',
        audioEnabled: isMicOn,
        videoEnabled: isCameraOn,
        isScreenSharing,
        stream: localStream,
        connectionQuality: 'good',
        joinedAt: 0
      });
    }
    return list;
  }, [storeParticipants, currentUserId, currentUser, isMicOn, isCameraOn, isScreenSharing, localStream]);

  // Determine presenter / stageActive
  const presentingParticipant = participantsList.find(p => p.isScreenSharing) || (isScreenSharing ? { id: currentUserId, isLocal: true } : null);
  const presentingId = presentingParticipant?.id || null;
  const stageActive = Boolean(room?.currentTrack);

  // Compute Layout using pure engine
  const layoutResult = useMemo(() => {
    return computeLayout({
      participants: participantsList,
      mode: layoutChoice,
      pinnedId: pinnedPeerId,
      activeSpeakerId: activeSpeakerId || (isLocalSpeaking ? currentUserId : null),
      presentingId,
      stageActive,
      viewport,
      pageIndex,
      gap: 8
    });
  }, [
    participantsList,
    layoutChoice,
    pinnedPeerId,
    activeSpeakerId,
    isLocalSpeaking,
    currentUserId,
    presentingId,
    stageActive,
    viewport,
    pageIndex
  ]);

  // Mobile horizontal swipe gestures for pagination
  const touchStartXRef = useRef(null);
  const touchStartYRef = useRef(null);

  const handleTouchStart = (e) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    if (touchStartXRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0 && pageIndex < layoutResult.pageCount - 1) {
        setPageIndex(p => p + 1);
      } else if (deltaX > 0 && pageIndex > 0) {
        setPageIndex(p => p - 1);
      }
    }
  };

  // PiP Dragging & Corner Snapping
  const handlePipPointerDown = (e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    pipDragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialLeft: rect.left,
      initialTop: rect.top
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePipPointerMove = (e) => {
    if (!pipDragStartRef.current) return;
    const deltaX = e.clientX - pipDragStartRef.current.startX;
    const deltaY = e.clientY - pipDragStartRef.current.startY;
    const containerRect = gridContainerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    const currentX = pipDragStartRef.current.initialLeft - containerRect.left + deltaX;
    const currentY = pipDragStartRef.current.initialTop - containerRect.top + deltaY;
    setPipDragPos({ x: currentX, y: currentY });
  };

  const handlePipPointerUp = () => {
    if (!pipDragStartRef.current) return;
    pipDragStartRef.current = null;

    // Determine nearest of 4 corners
    const containerRect = gridContainerRef.current?.getBoundingClientRect();
    if (!containerRect || !pipDragPos) {
      setPipDragPos(null);
      return;
    }

    const midX = containerRect.width / 2;
    const midY = containerRect.height / 2;
    const isLeft = pipDragPos.x < midX;
    const isTop = pipDragPos.y < midY;

    let nearest = 'bottom-right';
    if (isTop && isLeft) nearest = 'top-left';
    else if (isTop && !isLeft) nearest = 'top-right';
    else if (!isTop && isLeft) nearest = 'bottom-left';
    else nearest = 'bottom-right';

    setPipCorner(nearest);
    setPipDragPos(null);
    try {
      localStorage.setItem('tt_pip_corner', nearest);
    } catch {}
  };

  // Calculate PiP coordinates based on snapped corner or active drag
  const pipPlacement = useMemo(() => {
    if (!layoutResult.pip) return null;
    const { width: pipW, height: pipH } = layoutResult.pip;
    const margin = 16;

    if (pipDragPos) {
      return {
        x: Math.max(margin, Math.min(viewport.width - pipW - margin, pipDragPos.x)),
        y: Math.max(margin, Math.min(viewport.height - pipH - margin, pipDragPos.y)),
        width: pipW,
        height: pipH
      };
    }

    let x = viewport.width - pipW - margin;
    let y = viewport.height - pipH - margin;

    if (pipCorner === 'top-left') {
      x = margin;
      y = margin;
    } else if (pipCorner === 'top-right') {
      x = viewport.width - pipW - margin;
      y = margin;
    } else if (pipCorner === 'bottom-left') {
      x = margin;
      y = viewport.height - pipH - margin;
    }

    return { x: Math.round(x), y: Math.round(y), width: pipW, height: pipH };
  }, [layoutResult.pip, pipCorner, pipDragPos, viewport]);

  // Stage Tile presence in layout (Hard Constraint 1)
  const stageTile = layoutResult.tiles.find(t => t.id === 'stage') || null;
  const isStageMainContent = Boolean(stageTile);

  const totalCallCount = participantsList.length;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#121212] overflow-hidden relative select-none">
      {/* Insecure Context Banner */}
      <InsecureContextBanner isSecureContext={isSecureContext} />

      {/* Network / Relay Notice */}
      {connectionNotice && (
        <div className="mx-3 sm:mx-4 mt-2 px-3 py-2 bg-neutral-900/90 border border-neutral-700 rounded-lg text-neutral-300 text-xs flex items-center gap-2 shadow-lg z-40">
          <AlertCircle className="w-4 h-4 text-neutral-400 shrink-0" />
          <span>{connectionNotice}</span>
        </div>
      )}

      {/* Settings Modal */}
      <MeetingSettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        currentUser={currentUser}
        activeEngine={activeEngine}
        isSecureContext={isSecureContext}
        onUpdateUserName={(name) => {
          socket.emit('user:update-name', { name });
        }}
      />

      {/* 1. TOP HEADER BAR */}
      <div className="h-12 px-3 sm:px-4 flex items-center justify-between z-30 flex-shrink-0 bg-[#121212] border-b border-[#202124]">
        {/* Brand / Meeting Badge (Non-destructive, does NOT exit room) */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#8ab4f8]/15 border border-[#8ab4f8]/30 flex items-center justify-center text-[#8ab4f8]">
            <Video className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-white hidden sm:inline tracking-tight">
            afterspot
          </span>
        </div>

        {/* Center Room Pill */}
        <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#202124] border border-[#3c4043]/50 text-xs font-medium text-[#e8eaed] shadow-sm max-w-[200px] sm:max-w-xs truncate">
          <span className="w-2 h-2 rounded-full bg-[#34a853] animate-pulse flex-shrink-0" />
          <span className="truncate">{room?.name || 'afterspot Lounge'}</span>
          <span className="text-[10px] text-[#9aa0a6] font-mono">({totalCallCount})</span>
        </div>

        {/* Action Pills */}
        <div className="flex items-center gap-1.5 sm:gap-2 relative">
          {/* Share Meeting Link Button (Always visible on mobile & desktop) */}
          <button
            type="button"
            onClick={handleShareLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#8ab4f8]/15 hover:bg-[#8ab4f8]/25 border border-[#8ab4f8]/40 text-xs font-semibold text-[#8ab4f8] transition-all active:scale-95 shadow-sm cursor-pointer"
            title="Share Room Link to let others join"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#34a853]" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copied ? 'Link Copied!' : 'Share Link'}</span>
          </button>

          {/* Layout Menu Trigger */}
          <div className="relative">
            <button
              onClick={() => setShowLayoutMenu(prev => !prev)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#e8eaed] hover:bg-[#3c4043]/60 active:scale-95 transition-all"
              title="Change Layout"
              aria-label="Change Layout"
            >
              {layoutChoice === 'auto' ? (
                <Sparkles className="w-4 h-4 text-[#8ab4f8]" />
              ) : layoutChoice === 'tiled' ? (
                <LayoutGrid className="w-4 h-4 text-[#8ab4f8]" />
              ) : layoutChoice === 'spotlight' ? (
                <Maximize2 className="w-4 h-4 text-[#8ab4f8]" />
              ) : (
                <Columns className="w-4 h-4 text-[#8ab4f8]" />
              )}
            </button>

            {/* Layout Switcher Dropdown Menu */}
            {showLayoutMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-[#282a2d] border border-[#3c4043] rounded-xl shadow-2xl py-1.5 z-50 text-xs font-medium text-[#e8eaed] animate-fade-in">
                <div className="px-3 py-1 text-[10px] uppercase font-bold text-[#9aa0a6] border-b border-[#3c4043]/60">
                  Select Layout
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectLayoutMode('auto')}
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-[#3c4043]/70 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#8ab4f8]" />
                    <span>Auto</span>
                  </div>
                  {layoutChoice === 'auto' && <Check className="w-3.5 h-3.5 text-[#34a853]" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectLayoutMode('tiled')}
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-[#3c4043]/70 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-white" />
                    <span>Tiled</span>
                  </div>
                  {layoutChoice === 'tiled' && <Check className="w-3.5 h-3.5 text-[#34a853]" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectLayoutMode('spotlight')}
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-[#3c4043]/70 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Maximize2 className="w-4 h-4 text-white" />
                    <span>Spotlight</span>
                  </div>
                  {layoutChoice === 'spotlight' && <Check className="w-3.5 h-3.5 text-[#34a853]" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectLayoutMode('sidebar')}
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-[#3c4043]/70 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Columns className="w-4 h-4 text-white" />
                    <span>Sidebar</span>
                  </div>
                  {layoutChoice === 'sidebar' && <Check className="w-3.5 h-3.5 text-[#34a853]" />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. MAIN CALL STAGE & OPTIONAL SLIDE-OVER PANELS */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        
        {/* CENTER VIDEO STAGE CONTAINER */}
        <div
          ref={gridContainerRef}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="flex-1 min-h-0 relative overflow-hidden bg-[#121212] mb-16 sm:mb-20"
        >
          {/* A. COMPUTED PARTICIPANT TILES (Keeps DOM identity across layouts: transforms smoothly) */}
          {layoutResult.tiles.map(tile => {
            // Stage is rendered via the persistent stage wrapper at the fixed JSX position
            if (tile.id === 'stage') return null;

            const isScreen = tile.kind === 'screen';
            const participant = isScreen
              ? null
              : (participantsList.find(p => p.id === tile.id) || (tile.id === currentUserId ? {
                  id: currentUserId,
                  name: currentUser?.name || 'You',
                  isLocal: true,
                  audioEnabled: isMicOn,
                  videoEnabled: isCameraOn,
                  stream: localStream
                } : null));

            const isPinned = pinnedPeerId === tile.id;

            return (
              <div
                key={tile.id}
                className="absolute top-0 left-0 transition-[transform,width,height] duration-200 ease-out motion-reduce:transition-none"
                style={{
                  transform: `translate3d(${tile.x}px, ${tile.y}px, 0)`,
                  width: `${tile.width}px`,
                  height: `${tile.height}px`
                }}
              >
                {isScreen && screenShareStream ? (
                  /* Screen Share Video Feed */
                  <div className="w-full h-full rounded-[8px] overflow-hidden bg-black border border-[#3c4043] relative flex items-center justify-center">
                    <video
                      ref={(el) => {
                        if (el && el.srcObject !== screenShareStream) {
                          el.srcObject = screenShareStream;
                          el.play().catch(() => {});
                        }
                      }}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/80 backdrop-blur-md border border-[#8ab4f8]/40 text-[#8ab4f8] text-xs font-semibold shadow-md">
                      <ScreenShare className="w-3.5 h-3.5" />
                      <span>You are presenting</span>
                    </div>
                  </div>
                ) : participant ? (
                  /* Standard Camera Feed / Avatar Tile */
                  <VideoTile
                    participant={participant}
                    isPinned={isPinned}
                    facingMode={facingMode}
                    onTogglePin={() => setPinnedPeerId(isPinned ? null : tile.id)}
                    onFlipCamera={participant.isLocal ? handleFlipCamera : null}
                  />
                ) : null}
              </div>
            );
          })}

          {/* B. 1:1 DRAGGABLE SELF-VIEW PICTURE-IN-PICTURE */}
          {pipPlacement && (
            <div
              key="pip-self-view"
              onPointerDown={handlePipPointerDown}
              onPointerMove={handlePipPointerMove}
              onPointerUp={handlePipPointerUp}
              className="absolute top-0 left-0 z-30 touch-none cursor-grab active:cursor-grabbing transition-[transform,width,height] duration-200 ease-out motion-reduce:transition-none drop-shadow-2xl"
              style={{
                transform: `translate3d(${pipPlacement.x}px, ${pipPlacement.y}px, 0)`,
                width: `${pipPlacement.width}px`,
                height: `${pipPlacement.height}px`
              }}
            >
              <VideoTile
                isLocal={true}
                peerId={currentUserId}
                userName={currentUser?.name || 'You'}
                avatarColor={currentUser?.avatarColor || '#5865f2'}
                stream={localStream}
                isMuted={!isMicOn}
                isCameraOff={!isCameraOn}
                isSpeaking={isLocalSpeaking}
                facingMode={facingMode}
                onFlipCamera={handleFlipCamera}
              />
            </div>
          )}

          {/* C. PAGINATION CONTROLS (Dots + Previous / Next for desktop & mobile) */}
          {layoutResult.pageCount > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-white/10 shadow-xl">
              <button
                type="button"
                onClick={() => setPageIndex(p => Math.max(0, p - 1))}
                disabled={pageIndex === 0}
                className="w-6 h-6 rounded-full flex items-center justify-center text-white hover:bg-white/15 disabled:opacity-30 disabled:pointer-events-none transition-all"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1.5">
                {Array.from({ length: layoutResult.pageCount }).map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPageIndex(idx)}
                    className={`h-2 rounded-full transition-all duration-200 ${
                      idx === pageIndex ? 'w-4 bg-white' : 'w-2 bg-white/35 hover:bg-white/60'
                    }`}
                    title={`Page ${idx + 1}`}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => setPageIndex(p => Math.min(layoutResult.pageCount - 1, p + 1))}
                disabled={pageIndex >= layoutResult.pageCount - 1}
                className="w-6 h-6 rounded-full flex items-center justify-center text-white hover:bg-white/15 disabled:opacity-30 disabled:pointer-events-none transition-all"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* HARD CONSTRAINT 1: PERSISTENT YOUTUBE STAGE RENDERED AT ONE FIXED JSX SPOT */}
          {/* ========================================================================= */}
          <div
            className={
              !stageActive
                ? "fixed -top-96 -left-96 w-[1px] h-[1px] opacity-0 overflow-hidden pointer-events-none"
                : isStageMainContent && stageTile
                ? "absolute top-0 left-0 transition-[transform,width,height] duration-200 ease-out motion-reduce:transition-none z-10"
                : "fixed bottom-20 right-4 z-40 w-[356px] min-h-[200px] h-[200px] max-w-[calc(100vw-2rem)] aspect-video rounded-[8px] overflow-hidden shadow-2xl border border-[#3c4043] bg-black transition-all duration-200 motion-reduce:transition-none"
            }
            style={
              isStageMainContent && stageTile
                ? {
                    transform: `translate3d(${stageTile.x}px, ${stageTile.y}px, 0)`,
                    width: `${stageTile.width}px`,
                    height: `${stageTile.height}px`
                  }
                : undefined
            }
          >
            {children}

            {/* Expand to Spotlight Theater Button when Docked */}
            {stageActive && !isStageMainContent && (
              <button
                type="button"
                onClick={() => {
                  setPinnedPeerId('stage');
                  handleSelectLayoutMode('spotlight');
                }}
                className="absolute top-1.5 left-1.5 z-30 bg-black/80 hover:bg-black/95 backdrop-blur-md px-2.5 py-1 rounded-[6px] text-[10px] text-white font-semibold border border-white/20 transition-all flex items-center gap-1.5 shadow active:scale-95"
                title="Expand to Spotlight Stage"
              >
                <Tv className="w-3 h-3 text-[#5865f2]" />
                <span>Spotlight</span>
              </button>
            )}
          </div>

          {/* FLOATING EMOJI REACTIONS OVERLAY */}
          {floatingReactions.length > 0 && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-40">
              {floatingReactions.map((r) => (
                <div
                  key={r.id}
                  className="absolute bottom-20 animate-float-reaction flex flex-col items-center pointer-events-none select-none"
                  style={{ left: `${r.left}%` }}
                >
                  <span className="text-3xl sm:text-4xl drop-shadow-lg">{r.emoji}</span>
                  {r.sender && (
                    <span className="text-[10px] bg-black/60 text-white font-medium px-1.5 py-0.5 rounded-full mt-1 backdrop-blur-sm truncate max-w-[100px]">
                      {r.sender}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>

        {/* 3. UNIFIED MEETING SIDE PANEL (Desktop 360px pushing stage / Mobile Bottom Sheet) */}
        <MeetingSidePanel
          panel={activeSidePanel}
          onClose={() => setActiveSidePanel(null)}
          room={room}
          currentUser={currentUser}
          isHost={isHost}
          participants={participantsList}
          pinnedPeerId={pinnedPeerId}
          onPinParticipant={setPinnedPeerId}
          onMuteParticipant={handleMuteParticipant}
          onMuteAll={handleMuteAll}
          onLowerHand={handleLowerHand}
          onAskToUnmute={handleAskToUnmute}
          onSpotlight={handleSpotlight}
          messages={inCallMessages}
          onSendMessage={(text) => socket.emit('chat:message', { text })}
          currentTrack={room?.currentTrack}
          isPlaying={Boolean(room?.isPlaying)}
        />

      </div>

      {/* 4. GOOGLE MEET CALL CONTROLS */}
      <CallControls
        room={room}
        isMicOn={isMicOn}
        isCameraOn={isCameraOn}
        micState={micState}
        cameraState={cameraState}
        isScreenSharing={isScreenSharing}
        isHandRaised={isHandRaised}
        layoutMode={layoutChoice}
        isFullscreen={isFullscreen}
        unreadCount={inCallMessages.length}
        participantCount={totalCallCount}
        isPeopleOpen={activeSidePanel === 'people'}
        isChatOpen={activeSidePanel === 'chat'}
        isDetailsOpen={activeSidePanel === 'details'}
        onToggleMic={handleToggleMic}
        onToggleCamera={handleToggleCamera}
        onFlipCamera={handleFlipCamera}
        onToggleScreenShare={handleToggleScreenShare}
        onToggleHandRaise={handleToggleHandRaise}
        onSendReaction={handleSendReaction}
        onSelectLayoutMode={handleSelectLayoutMode}
        onToggleFullscreen={toggleFullscreen}
        onOpenSettings={() => setShowSettings(true)}
        onToggleChat={() => setActiveSidePanel(p => p === 'chat' ? null : 'chat')}
        onToggleParticipants={() => setActiveSidePanel(p => p === 'people' ? null : 'people')}
        onToggleDetails={() => setActiveSidePanel(p => p === 'details' ? null : 'details')}
        onLeaveCall={onLeaveRoom}
        onToast={addToast}
      />

      {/* 5. TOAST NOTIFICATIONS */}
      <MeetingToasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
