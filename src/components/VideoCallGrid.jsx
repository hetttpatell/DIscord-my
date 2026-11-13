import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ArrowLeft,
  Copy,
  Check,
  Share2,
  Tv,
  LayoutGrid,
  Users,
  MessageSquare,
  X,
  Send,
  ScreenShare
} from 'lucide-react';
import useLocalMedia from '../hooks/useLocalMedia';
import useWebRTC from '../hooks/useWebRTC';
import VideoTile from './VideoTile';
import CallControls from './CallControls';
import InsecureContextBanner from './InsecureContextBanner';
import MeetingSettingsModal from './MeetingSettingsModal';
import socket from '../services/socket';

export default function VideoCallGrid({
  room,
  currentUser,
  members = [],
  layoutMode = 'strip', // 'strip' (Theater stage + camera strip) | 'grid' (Google Meet full grid)
  onToggleLayoutMode,
  onLeaveRoom,
  children
}) {
  const [copied, setCopied] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShareStream, setScreenShareStream] = useState(null);
  const [pinnedPeerId, setPinnedPeerId] = useState(null);

  // Modals & Panels
  const [showSettings, setShowSettings] = useState(false);
  const [showInCallChat, setShowInCallChat] = useState(false);
  const [showParticipantsList, setShowParticipantsList] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // In-call chat input
  const [chatInput, setChatInput] = useState('');
  const [inCallMessages, setInCallMessages] = useState([]);
  const chatBottomRef = useRef(null);

  // 1. Local Media Hook (Camera, Mic, Speaking detector)
  const {
    stream: localStream,
    isMicOn,
    isCameraOn,
    facingMode,
    isSpeaking: isLocalSpeaking,
    isSecureContext,
    toggleMic,
    toggleCamera,
    switchCamera,
    startAudio,
    stopAll
  } = useLocalMedia();

  // 2. WebRTC / LiveKit Unified Real-Time Hook
  const {
    peers,
    activeEngine,
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

  // Auto-acquire microphone on join (muted by default when a track is playing)
  useEffect(() => {
    let mounted = true;
    const shouldStartMuted = Boolean(room?.isPlaying && room?.currentTrack);
    startAudio(shouldStartMuted).then(track => {
      if (!mounted) return;
      if (track) {
        sendMediaState({ isMuted: shouldStartMuted, isCameraOff: !isCameraOn, isScreenSharing: false });
      }
    });

    return () => {
      mounted = false;
      stopAll();
    };
  }, [startAudio, stopAll, sendMediaState, isCameraOn, room?.isPlaying, room?.currentTrack]);

  // Sync in-call chat with room socket
  useEffect(() => {
    const handleChat = (msg) => {
      setInCallMessages(prev => [...prev.slice(-100), msg]);
    };
    socket.on('chat:message', handleChat);
    return () => socket.off('chat:message', handleChat);
  }, []);

  useEffect(() => {
    if (showInCallChat) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [inCallMessages, showInCallChat]);

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
    await switchCamera();
  }, [switchCamera]);

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

  // Send message in chat
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('chat:message', { text: chatInput.trim() });
    setChatInput('');
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

  // Invite URL copy / share helpers
  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/?room=${room?.id || ''}` : '';

  const copyInviteLink = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareInviteLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join our meeting: ${room?.name || 'afterspot'}`,
          url: inviteUrl
        });
        return;
      } catch {}
    }
    copyInviteLink();
  };

  // Derive remote participants combining room members and active WebRTC peers
  const currentUserId = currentUser?.id;
  const peerList = Object.values(peers);

  const memberPeers = (members || [])
    .filter(m => m.id !== currentUserId)
    .map(m => {
      const activePeer = peers[m.id];
      return activePeer || {
        peerId: m.id,
        userName: m.name,
        avatarColor: m.avatarColor,
        isMuted: true,
        isCameraOff: true,
        isSpeaking: false,
        connectionQuality: 'good',
        stream: null
      };
    });

  const remoteMap = new Map();
  memberPeers.forEach(p => remoteMap.set(p.peerId, p));
  peerList.forEach(p => {
    if (p && p.peerId !== currentUserId) {
      remoteMap.set(p.peerId, p);
    }
  });
  const remoteParticipants = Array.from(remoteMap.values());
  const totalCallCount = remoteParticipants.length + 1;
  const isAlone = remoteParticipants.length === 0;

  // Selected spotlight/pinned participant
  const pinnedParticipant = pinnedPeerId
    ? (pinnedPeerId === currentUserId
        ? { isLocal: true, userName: currentUser?.name || 'You', stream: localStream, isMuted: !isMicOn, isCameraOff: !isCameraOn, isSpeaking: isLocalSpeaking }
        : remoteParticipants.find(p => p.peerId === pinnedPeerId))
    : null;

  // Layout mode helper: true only in default theater strip mode without spotlight or screen share
  const isTheaterMode = layoutMode === 'strip' && !pinnedParticipant && !(isScreenSharing && screenShareStream);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#121212] overflow-hidden relative select-none">
      {/* Insecure Context Banner (HTTP on Mobile) */}
      <InsecureContextBanner isSecureContext={isSecureContext} />

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
        {/* Back / Leave button */}
        <button
          onClick={onLeaveRoom}
          className="w-9 h-9 rounded-full flex items-center justify-center text-[#e8eaed] hover:bg-[#3c4043]/60 active:scale-95 transition-all"
          title="Leave Room"
          aria-label="Leave Room"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Center Room Pill */}
        <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#202124] border border-[#3c4043]/50 text-xs font-medium text-[#e8eaed] shadow-sm max-w-[200px] sm:max-w-xs truncate">
          <span className="w-2 h-2 rounded-full bg-[#34a853] animate-pulse flex-shrink-0" />
          <span className="truncate">{room?.name || 'afterspot Lounge'}</span>
          <span className="text-[10px] text-[#9aa0a6] font-mono">({totalCallCount})</span>
        </div>

        {/* Action Pills */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={copyInviteLink}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#202124] hover:bg-[#3c4043] border border-[#3c4043]/50 text-xs text-[#e8eaed] transition-colors"
            title="Copy Invite Link"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#34a853]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Share'}</span>
          </button>

          <button
            onClick={onToggleLayoutMode}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#e8eaed] hover:bg-[#3c4043]/60 active:scale-95 transition-all"
            title={layoutMode === 'grid' ? "Switch to Theater Stage" : "Switch to Meet Grid"}
            aria-label="Toggle Layout"
          >
            {layoutMode === 'grid' ? (
              <Tv className="w-4 h-4 text-[#8ab4f8]" />
            ) : (
              <LayoutGrid className="w-4 h-4 text-[#e8eaed]" />
            )}
          </button>
        </div>
      </div>

      {/* 2. MAIN CALL STAGE & OPTIONAL SLIDE-OVER PANELS */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        
        {/* CENTER VIDEO STAGE */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          
          {/* A. SCREEN SHARE ACTIVE STAGE */}
          {isScreenSharing && screenShareStream ? (
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row p-2 gap-2 bg-[#121212]">
              <div className="flex-1 min-h-0 rounded-2xl overflow-hidden bg-black border border-[#3c4043] shadow-2xl relative flex items-center justify-center">
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
                <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md px-3 py-1 rounded-full text-xs text-[#8ab4f8] font-bold border border-[#8ab4f8]/30 flex items-center gap-1.5">
                  <ScreenShare className="w-3.5 h-3.5" />
                  <span>You are presenting to everyone</span>
                </div>
              </div>

              {/* Side Participant Strip */}
              <div className="w-full lg:w-72 flex-shrink-0 flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto no-scrollbar">
                {remoteParticipants.map(peer => (
                  <div key={peer.peerId} className="w-44 lg:w-full aspect-video min-h-[110px] flex-shrink-0">
                    <VideoTile
                      isLocal={false}
                      peerId={peer.peerId}
                      userName={peer.userName}
                      avatarColor={peer.avatarColor}
                      stream={peer.stream}
                      isMuted={peer.isMuted}
                      isCameraOff={peer.isCameraOff}
                      isSpeaking={peer.isSpeaking}
                      connectionQuality={peer.connectionQuality}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : pinnedParticipant ? (
            /* B. SPOTLIGHT / PINNED PARTICIPANT VIEW */
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row p-2 gap-2 bg-[#121212]">
              <div className="flex-1 min-h-0 rounded-2xl overflow-hidden bg-[#202124] border border-[#3c4043] shadow-2xl relative">
                <VideoTile
                  isLocal={pinnedParticipant.isLocal}
                  peerId={pinnedPeerId}
                  userName={pinnedParticipant.userName}
                  avatarColor={pinnedParticipant.avatarColor}
                  stream={pinnedParticipant.stream}
                  isMuted={pinnedParticipant.isMuted}
                  isCameraOff={pinnedParticipant.isCameraOff}
                  isSpeaking={pinnedParticipant.isSpeaking}
                  isPinned={true}
                  onTogglePin={() => setPinnedPeerId(null)}
                  onFlipCamera={pinnedParticipant.isLocal ? handleFlipCamera : null}
                />
              </div>

              {/* Remaining Participants Strip */}
              <div className="w-full lg:w-72 flex-shrink-0 flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto no-scrollbar">
                {pinnedPeerId !== currentUserId && (
                  <div className="w-44 lg:w-full aspect-video min-h-[110px] flex-shrink-0">
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
                {remoteParticipants.filter(p => p.peerId !== pinnedPeerId).map(peer => (
                  <div key={peer.peerId} className="w-44 lg:w-full aspect-video min-h-[110px] flex-shrink-0">
                    <VideoTile
                      isLocal={false}
                      peerId={peer.peerId}
                      userName={peer.userName}
                      avatarColor={peer.avatarColor}
                      stream={peer.stream}
                      isMuted={peer.isMuted}
                      isCameraOff={peer.isCameraOff}
                      isSpeaking={peer.isSpeaking}
                      connectionQuality={peer.connectionQuality}
                      onTogglePin={() => setPinnedPeerId(peer.peerId)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : isTheaterMode ? (
            /* C. THEATER STAGE: Side Participant Column Layout */
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden bg-[#121212] p-2 gap-2">
              {/* Spacer allowing persistent stream container to occupy the main theater stage */}
              <div className="flex-1 min-h-0 w-full" />

              {/* Side Participant Column */}
              <div className="w-full lg:w-72 xl:w-80 flex-shrink-0 flex flex-col min-h-0 bg-[#1e1f22] rounded-2xl border border-[#3c4043]/40 overflow-hidden shadow-xl z-20">
                <div className="h-8 px-3 bg-[#202124] border-b border-[#3c4043]/40 flex items-center justify-between flex-shrink-0">
                  <span className="text-[11px] font-bold text-[#e8eaed] flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#34a853]" />
                    <span>Meeting ({totalCallCount})</span>
                  </span>
                  <span className="text-[10px] text-[#34a853] bg-[#34a853]/15 border border-[#34a853]/30 px-2 py-0.5 rounded-full font-bold">
                    {activeEngine === 'livekit' ? 'LiveKit SFU' : 'Live'}
                  </span>
                </div>

                <div className="flex-1 p-2 grid grid-cols-2 lg:grid-cols-1 gap-2 overflow-y-auto no-scrollbar">
                  <div className="aspect-video min-h-[110px]">
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
                      onTogglePin={() => setPinnedPeerId(currentUserId)}
                      onFlipCamera={handleFlipCamera}
                    />
                  </div>

                  {remoteParticipants.map(peer => (
                    <div key={peer.peerId} className="aspect-video min-h-[110px]">
                      <VideoTile
                        isLocal={false}
                        peerId={peer.peerId}
                        userName={peer.userName}
                        avatarColor={peer.avatarColor}
                        stream={peer.stream}
                        isMuted={peer.isMuted}
                        isCameraOff={peer.isCameraOff}
                        isSpeaking={peer.isSpeaking}
                        connectionQuality={peer.connectionQuality}
                        onTogglePin={() => setPinnedPeerId(peer.peerId)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* D. FULL GOOGLE MEET DYNAMIC GRID VIEW */
            <div className="flex-1 min-h-0 flex flex-col p-3 overflow-hidden bg-[#121212] pb-24">
              <div className={`flex-1 min-h-0 grid gap-2.5 sm:gap-3 place-items-stretch overflow-y-auto no-scrollbar ${
                totalCallCount === 1
                  ? 'grid-cols-1 max-w-2xl mx-auto w-full'
                  : totalCallCount === 2
                  ? 'grid-cols-1 sm:grid-cols-2 max-w-4xl mx-auto w-full'
                  : totalCallCount <= 4
                  ? 'grid-cols-2 max-w-5xl mx-auto w-full'
                  : 'grid-cols-2 sm:grid-cols-3 max-w-6xl mx-auto w-full'
              }`}>
                {/* Local Tile */}
                <div className="w-full h-full min-h-[160px] aspect-video">
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
                    onTogglePin={() => setPinnedPeerId(currentUserId)}
                    onFlipCamera={handleFlipCamera}
                  />
                </div>

                {/* Remote Participant Tiles */}
                {remoteParticipants.map(peer => (
                  <div key={peer.peerId} className="w-full h-full min-h-[160px] aspect-video">
                    <VideoTile
                      isLocal={false}
                      peerId={peer.peerId}
                      userName={peer.userName}
                      avatarColor={peer.avatarColor}
                      stream={peer.stream}
                      isMuted={peer.isMuted}
                      isCameraOff={peer.isCameraOff}
                      isSpeaking={peer.isSpeaking}
                      connectionQuality={peer.connectionQuality}
                      onTogglePin={() => setPinnedPeerId(peer.peerId)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PERSISTENT STREAM CONTAINER: EXACT SAME JSX POSITION IN EVERY MODE */}
          <div
            className={
              isTheaterMode
                ? "absolute inset-2 bottom-2 right-2 lg:right-[300px] xl:right-[332px] flex items-center justify-center bg-black rounded-2xl overflow-hidden shadow-2xl border border-[#3c4043]/40 z-10 transition-all duration-300"
                : "fixed bottom-20 right-4 z-40 w-[356px] min-h-[200px] max-w-[calc(100vw-2rem)] aspect-video rounded-xl overflow-hidden shadow-2xl border border-[#3c4043] bg-black transition-all duration-300"
            }
          >
            {children}

            {isTheaterMode && isAlone && (
              <div className="absolute top-3 right-3 z-30 flex items-center gap-2 animate-fade-in">
                <button
                  onClick={shareInviteLink}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#f28b82] hover:bg-[#f6aea9] text-[#202124] text-xs font-bold shadow-xl active:scale-95 transition-all"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share invite</span>
                </button>
              </div>
            )}

            {!isTheaterMode && (
              <button
                onClick={() => {
                  setPinnedPeerId(null);
                  if (layoutMode !== 'strip') onToggleLayoutMode?.();
                }}
                className="absolute top-1.5 left-1.5 z-30 bg-black/80 hover:bg-black/95 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-white font-semibold border border-white/20 transition-all flex items-center gap-1 shadow cursor-pointer active:scale-95"
                title="Expand to Theater Stage"
              >
                <Tv className="w-3 h-3 text-[#5865f2]" />
                <span>Theater</span>
              </button>
            )}
          </div>

        </div>

        {/* 3. IN-CALL CHAT PANEL (Slide-over) */}
        {showInCallChat && (
          <aside className="w-80 md:w-88 flex-shrink-0 bg-[#202124] border-l border-[#3c4043] flex flex-col z-30 animate-fade-in">
            <div className="h-12 px-4 border-b border-[#3c4043] flex items-center justify-between flex-shrink-0">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#8ab4f8]" />
                <span>In-Call Messages</span>
              </span>
              <button
                onClick={() => setShowInCallChat(false)}
                className="p-1 rounded text-[#9aa0a6] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-3">
              {inCallMessages.length === 0 ? (
                <div className="text-center py-12 text-[#9aa0a6] text-xs">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>Messages can only be seen by people in the call and are deleted when the call ends.</p>
                </div>
              ) : (
                inCallMessages.map(msg => (
                  <div key={msg.id} className="text-xs">
                    <div className="flex items-baseline gap-1.5 mb-0.5">
                      <span className="font-bold text-white">{msg.sender}</span>
                      <span className="text-[10px] text-[#9aa0a6]">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[#e8eaed] bg-[#303134] p-2.5 rounded-xl break-words">
                      {msg.text}
                    </p>
                  </div>
                ))
              )}
              <div ref={chatBottomRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-3 border-t border-[#3c4043] flex gap-2">
              <input
                type="text"
                placeholder="Send a message to everyone..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 bg-[#303134] border border-[#5f6368] rounded-full px-3.5 py-2 text-xs text-white placeholder-[#9aa0a6] focus:outline-none focus:border-[#8ab4f8]"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="w-8 h-8 rounded-full bg-[#8ab4f8] text-[#202124] flex items-center justify-center disabled:opacity-40 transition-all flex-shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </aside>
        )}

        {/* 4. PARTICIPANTS LIST PANEL (Slide-over) */}
        {showParticipantsList && (
          <aside className="w-80 md:w-88 flex-shrink-0 bg-[#202124] border-l border-[#3c4043] flex flex-col z-30 animate-fade-in">
            <div className="h-12 px-4 border-b border-[#3c4043] flex items-center justify-between flex-shrink-0">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-[#8ab4f8]" />
                <span>People ({totalCallCount})</span>
              </span>
              <button
                onClick={() => setShowParticipantsList(false)}
                className="p-1 rounded text-[#9aa0a6] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-2">
              {/* Local User */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#303134]/60 border border-[#3c4043]">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white"
                    style={{ backgroundColor: currentUser?.avatarColor || '#5865f2' }}
                  >
                    {currentUser?.name?.charAt(0).toUpperCase() || 'Y'}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">{currentUser?.name || 'You'} (You)</span>
                    <span className="text-[10px] text-[#9aa0a6]">{currentUser?.isHost ? 'Meeting Host' : 'Participant'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isMicOn ? 'bg-[#34a853]' : 'bg-[#ea4335]'}`} />
                </div>
              </div>

              {/* Remote Participants */}
              {remoteParticipants.map(peer => (
                <div key={peer.peerId} className="flex items-center justify-between p-2.5 rounded-xl bg-[#303134]/40 border border-[#3c4043]/60">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white"
                      style={{ backgroundColor: peer.avatarColor || '#5865f2' }}
                    >
                      {peer.userName?.charAt(0).toUpperCase() || 'M'}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">{peer.userName}</span>
                      <span className="text-[10px] text-[#9aa0a6]">{peer.isSpeaking ? 'Speaking...' : 'Participant'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${!peer.isMuted ? 'bg-[#34a853]' : 'bg-[#ea4335]'}`} />
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}

      </div>

      {/* 5. GOOGLE MEET FLOATING CALL CONTROLS DOCK */}
      <CallControls
        isMicOn={isMicOn}
        isCameraOn={isCameraOn}
        isScreenSharing={isScreenSharing}
        layoutMode={layoutMode}
        isFullscreen={isFullscreen}
        unreadCount={inCallMessages.length}
        participantCount={totalCallCount}
        onToggleMic={handleToggleMic}
        onToggleCamera={handleToggleCamera}
        onFlipCamera={handleFlipCamera}
        onToggleScreenShare={handleToggleScreenShare}
        onToggleLayoutMode={onToggleLayoutMode}
        onToggleFullscreen={toggleFullscreen}
        onOpenSettings={() => setShowSettings(true)}
        onToggleChat={() => {
          setShowInCallChat(prev => !prev);
          setShowParticipantsList(false);
        }}
        onToggleParticipants={() => {
          setShowParticipantsList(prev => !prev);
          setShowInCallChat(false);
        }}
        onLeaveCall={onLeaveRoom}
      />
    </div>
  );
}
