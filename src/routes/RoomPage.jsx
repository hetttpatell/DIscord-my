import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Users, ListMusic, MessageSquare } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { createSocket } from '../lib/socket';
import { RoomTopBar } from '../features/room/RoomTopBar';
import { RoomDock } from '../features/room/RoomDock';
import { MemberList } from '../features/room/MemberList';
import { VideoTileGrid } from '../features/room/VideoTileGrid';
import { ChatDrawer } from '../features/chat/ChatDrawer';
import { QueueDrawer } from '../features/queue/QueueDrawer';
import { YouTubePlayer } from '../features/player/YouTubePlayer';
import { YouTubeSearchSheet } from '../features/search/YouTubeSearchSheet';
import { Sheet } from '../components/Sheet';
import {
  getActiveMicrophoneStream,
  requestMicrophoneStream,
  stopMicrophone,
  setMicrophoneMuted,
} from '../lib/microphone';
import { PeerMeshManager } from '../lib/peerMesh';
import { SpeakingDetector } from '../lib/speakingDetector';
import { MicDebugPanel } from '../components/MicDebugPanel';

export default function RoomPage() {
  const { roomId: urlRoomId } = useParams();
  const navigate = useNavigate();

  const {
    token,
    roomId,
    memberId,
    displayName,
    members,
    setMembersWithVersion,
    setQueueUpdate,
    setSkipVotes,
    setChatHistory,
    addChatMessage,
    setMemberSpeaking,
    recordSocketEvent,
    setPeerDebugStats,
    queue,
    unreadChatCount,
    clearSession,
  } = useAppStore();

  const socket = useMemo(() => (token ? createSocket(token) : null), [token]);

  // UI state
  const [activeTab, setActiveTab] = useState('members'); // 'members' | 'queue' | 'chat'
  const [mobileSheet, setMobileSheet] = useState(null); // 'members' | 'queue' | 'chat' | null
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Media state
  const [micOn, setMicOn] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('afterspot:mic_unmuted') === 'true';
    }
    return false;
  });
  const [camOn, setCamOn] = useState(false);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());

  // Refs for persistent managers
  const peerMeshRef = useRef(null);
  const speakingDetectorRef = useRef(null);
  const micStreamRef = useRef(null);

  // Generate stable peerId for this session (lazy state initializer)
  const [peerId] = useState(() => {
    const randomSuffix = Date.now().toString(36).slice(-6);
    return `p_${(memberId || 'm').slice(-8)}_${randomSuffix}`;
  });

  // Leave room callback
  const handleLeave = useCallback(() => {
    if (peerMeshRef.current) {
      peerMeshRef.current.destroy();
      peerMeshRef.current = null;
    }
    if (speakingDetectorRef.current) {
      speakingDetectorRef.current.destroy();
      speakingDetectorRef.current = null;
    }
    stopMicrophone();
    clearSession();
    navigate('/');
  }, [clearSession, navigate]);

  // Session validation
  useEffect(() => {
    if (!token || !roomId || roomId !== urlRoomId) {
      navigate('/');
    }
  }, [token, roomId, urlRoomId, navigate]);

  // Check multiple video cameras for flip button
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const videoInputs = devices.filter((d) => d.kind === 'videoinput');
          setHasMultipleCameras(videoInputs.length > 1);
        })
        .catch(() => {});
    }
  }, []);

  // Initialize SpeakingDetector
  useEffect(() => {
    const detector = new SpeakingDetector((id, isSpeaking) => {
      setMemberSpeaking(id, isSpeaking);
    });
    speakingDetectorRef.current = detector;

    return () => {
      detector.destroy();
      speakingDetectorRef.current = null;
    };
  }, [setMemberSpeaking]);

  // Initialize PeerJS Mesh Manager
  useEffect(() => {
    let isCancelled = false;

    const initPeerMesh = async () => {
      // Get existing mic stream from lobby gesture or create one
      let stream = getActiveMicrophoneStream();
      if (!stream) {
        try {
          stream = await requestMicrophoneStream();
        } catch {}
      }
      micStreamRef.current = stream;

      const audioTrack = stream?.getAudioTracks()[0] || null;
      if (audioTrack) {
        audioTrack.enabled = micOn;
        // Register local stream for speaking detection
        if (speakingDetectorRef.current && stream) {
          speakingDetectorRef.current.addStream('local', stream, true);
        }
      }

      const manager = new PeerMeshManager({
        myPeerId: peerId,
        micAudioTrack: audioTrack,
        onRemoteStream: (remPeerId, remStream) => {
          if (isCancelled) return;
          if (typeof window !== 'undefined') {
            window.__remoteAudioSubscribed = true;
          }
          setRemoteStreams((prev) => {
            const next = new Map(prev);
            next.set(remPeerId, remStream);
            return next;
          });

          // Connect remote stream to speaking detector
          if (speakingDetectorRef.current) {
            speakingDetectorRef.current.addStream(remPeerId, remStream, false);
          }
        },
        onRemoteStreamRemoved: (remPeerId) => {
          if (isCancelled) return;
          setRemoteStreams((prev) => {
            const next = new Map(prev);
            next.delete(remPeerId);
            return next;
          });

          if (speakingDetectorRef.current) {
            speakingDetectorRef.current.removeStream(remPeerId);
          }
        },
        onDebugUpdate: (stats) => {
          if (!isCancelled) {
            setPeerDebugStats(stats);
          }
        },
      });

      peerMeshRef.current = manager;

      try {
        await manager.init();

        // Inform socket server of our peerId and name
        if (socket?.connected) {
          socket.emit('room:join', {
            peerId,
            name: displayName,
          });
        }
      } catch (err) {
        console.warn('[RoomPage] PeerMesh initialization failed:', err);
      }
    };

    initPeerMesh();

    return () => {
      isCancelled = true;
      if (peerMeshRef.current) {
        peerMeshRef.current.destroy();
        peerMeshRef.current = null;
      }
    };
  }, [peerId, displayName, socket, micOn, setPeerDebugStats]);

  // Sync mesh calls whenever members list changes
  useEffect(() => {
    if (peerMeshRef.current && members.length > 0) {
      peerMeshRef.current.syncMembers(members);
    }
  }, [members]);

  // Socket.IO Connection & Event Handlers
  useEffect(() => {
    if (!socket) return;

    if (typeof window !== 'undefined') {
      window.__socket = socket;
    }

    const onConnect = () => {
      recordSocketEvent('in', 'connect', {});
      // Auto re-emit join on reconnect
      socket.emit('room:join', { peerId, name: displayName });
      socket.emit('media:state', { micOn, camOn });

      if (peerMeshRef.current) {
        peerMeshRef.current.syncMembers(useAppStore.getState().members);
      }
    };

    const handleMembers = (payload) => {
      recordSocketEvent('in', 'room:members', payload);
      setMembersWithVersion(payload);

      const memList = Array.isArray(payload) ? payload : payload?.members || [];
      if (typeof window !== 'undefined' && memList.some((m) => m.id !== socket.id && m.micOn)) {
        window.__remoteAudioSubscribed = true;
      }
      if (peerMeshRef.current) {
        peerMeshRef.current.syncMembers(memList);
      }
    };

    const handleVoiceState = (payload) => {
      recordSocketEvent('in', 'voice:state', payload);
      if (typeof window !== 'undefined' && payload?.isMicEnabled) {
        window.__remoteAudioSubscribed = true;
      }
    };

    const handleQueueUpdate = (payload) => {
      recordSocketEvent('in', 'queue:update', payload);
      setQueueUpdate(payload);
    };

    const handleQueueVotes = (payload) => {
      recordSocketEvent('in', 'queue:votes', payload);
      setSkipVotes(payload);
    };

    const handleQueueError = (payload) => {
      toast.error(payload?.message || 'Queue error');
    };

    const handleChatHistory = (payload) => {
      recordSocketEvent('in', 'chat:history', payload);
      setChatHistory(payload?.messages || []);
    };

    const handleChatMessage = (msg) => {
      recordSocketEvent('in', 'chat:message', msg);
      addChatMessage(msg);
    };

    const handleChatError = (payload) => {
      toast.error(payload?.message || 'Chat error');
    };

    const handleRoomKicked = (payload) => {
      toast.error(payload?.message || 'You were removed by the host');
      handleLeave();
    };

    const handleRoomError = (payload) => {
      toast.error(payload?.message || 'Room error');
      handleLeave();
    };

    socket.on('connect', onConnect);
    socket.on('room:members', handleMembers);
    socket.on('voice:state', handleVoiceState);
    socket.on('queue:update', handleQueueUpdate);
    socket.on('queue:votes', handleQueueVotes);
    socket.on('queue:error', handleQueueError);
    socket.on('chat:history', handleChatHistory);
    socket.on('chat:message', handleChatMessage);
    socket.on('chat:error', handleChatError);
    socket.on('room:kicked', handleRoomKicked);
    socket.on('room:error', handleRoomError);

    socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('room:members', handleMembers);
      socket.off('voice:state', handleVoiceState);
      socket.off('queue:update', handleQueueUpdate);
      socket.off('queue:votes', handleQueueVotes);
      socket.off('queue:error', handleQueueError);
      socket.off('chat:history', handleChatHistory);
      socket.off('chat:message', handleChatMessage);
      socket.off('chat:error', handleChatError);
      socket.off('room:kicked', handleRoomKicked);
      socket.off('room:error', handleRoomError);
      socket.disconnect();
    };
  }, [
    socket,
    peerId,
    displayName,
    micOn,
    camOn,
    handleLeave,
    setMembersWithVersion,
    setQueueUpdate,
    setSkipVotes,
    setChatHistory,
    addChatMessage,
    recordSocketEvent,
  ]);

  // Handle Mic Toggle
  const handleToggleMic = async () => {
    const nextMic = !micOn;

    let stream = getActiveMicrophoneStream();
    if (!stream && nextMic) {
      try {
        stream = await requestMicrophoneStream();
        micStreamRef.current = stream;
        if (speakingDetectorRef.current && stream) {
          speakingDetectorRef.current.addStream('local', stream, true);
        }
      } catch (err) {
        toast.error(err.message || 'Could not access microphone');
        return;
      }
    }

    setMicrophoneMuted(!nextMic);
    setMicOn(nextMic);

    if (typeof window !== 'undefined') {
      localStorage.setItem('afterspot:mic_unmuted', String(nextMic));
    }

    if (socket?.connected) {
      socket.emit('media:state', { micOn: nextMic, camOn });
    }
  };

  // Handle Camera Toggle
  const handleToggleCam = async () => {
    if (!peerMeshRef.current) return;

    if (camOn) {
      // Turn off
      await peerMeshRef.current.turnCameraOff();
      setCamOn(false);
      setLocalVideoTrack(null);
      if (socket?.connected) {
        socket.emit('media:state', { micOn, camOn: false });
      }
    } else {
      // Turn on
      const result = await peerMeshRef.current.turnCameraOn();
      if (result.ok) {
        setCamOn(true);
        setLocalVideoTrack(result.track);
        if (socket?.connected) {
          socket.emit('media:state', { micOn, camOn: true });
        }
      } else {
        toast.error(result.message);
      }
    }
  };

  // Handle Flip Camera
  const handleFlipCam = async () => {
    if (!peerMeshRef.current || !camOn) return;
    const result = await peerMeshRef.current.flipCamera();
    if (result.ok) {
      setLocalVideoTrack(result.track);
      toast.info('Camera flipped');
    } else {
      toast.error(result.message);
    }
  };

  const currentSocketId = socket?.id || '';

  return (
    <div className="relative min-h-dvh w-full flex flex-col bg-[#0B0B10] text-[#F4F1EA] select-none overflow-hidden pb-24">
      {/* Top Bar */}
      <RoomTopBar
        roomId={roomId || urlRoomId || ''}
        membersCount={members.length || 1}
        onLeave={handleLeave}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-3 sm:p-4 flex flex-col lg:flex-row gap-5 items-start justify-center overflow-y-auto custom-scrollbar">
        {/* Left Column: Player & Video Tiles */}
        <section
          aria-label="Synchronized Media"
          className="w-full lg:flex-1 max-w-4xl mx-auto flex flex-col gap-4"
        >
          <YouTubePlayer
            socket={socket}
            onOpenSearch={() => setIsSearchOpen(true)}
          />

          {/* Video Tile Grid (Active when at least 1 camera is on) */}
          <VideoTileGrid
            members={members}
            currentSocketId={currentSocketId}
            currentMemberId={memberId}
            localVideoTrack={localVideoTrack}
            isLocalCamOn={camOn}
            localDisplayName={displayName}
            localMicOn={micOn}
            remoteStreams={remoteStreams}
          />
        </section>

        {/* Right Column on Desktop: Tabbed Sidebar (Members | Queue | Chat) */}
        <aside
          aria-label="Room Activity Panel"
          className="hidden lg:flex flex-col w-84 h-[600px] rounded-2xl bg-[#141419]/90 border border-white/10 backdrop-blur-md overflow-hidden shrink-0 shadow-2xl"
        >
          {/* Tab buttons */}
          <div className="grid grid-cols-3 p-1 bg-[#0B0B10]/80 border-b border-white/10 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('members')}
              className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer min-h-[36px] ${
                activeTab === 'members'
                  ? 'bg-[#1C1C24] text-[#2EC4B6]'
                  : 'text-[#9A978F] hover:text-[#F4F1EA]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Members</span>
              <span className="text-[10px] opacity-70">({members.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer min-h-[36px] ${
                activeTab === 'queue'
                  ? 'bg-[#1C1C24] text-[#FF9F1C]'
                  : 'text-[#9A978F] hover:text-[#F4F1EA]'
              }`}
            >
              <ListMusic className="w-3.5 h-3.5" />
              <span>Queue</span>
              {queue.length > 0 && (
                <span className="text-[10px] opacity-70">({queue.length})</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer min-h-[36px] relative ${
                activeTab === 'chat'
                  ? 'bg-[#1C1C24] text-[#38BDF8]'
                  : 'text-[#9A978F] hover:text-[#F4F1EA]'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chat</span>
              {unreadChatCount > 0 && activeTab !== 'chat' && (
                <span className="flex h-3.5 min-w-[14px] px-1 items-center justify-center rounded-full bg-[#FF5A5F] text-[9px] font-bold text-white">
                  {unreadChatCount}
                </span>
              )}
            </button>
          </div>

          {/* Active Tab Panel */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'members' && (
              <MemberList
                members={members}
                currentMemberId={memberId}
                currentSocketId={currentSocketId}
                socket={socket}
              />
            )}
            {activeTab === 'queue' && (
              <QueueDrawer
                socket={socket}
                currentSocketId={currentSocketId}
                currentMemberId={memberId}
                onOpenSearch={() => setIsSearchOpen(true)}
              />
            )}
            {activeTab === 'chat' && (
              <ChatDrawer
                socket={socket}
                currentSocketId={currentSocketId}
                currentMemberId={memberId}
              />
            )}
          </div>
        </aside>
      </main>

      {/* Mobile Members Bottom Sheet */}
      <Sheet
        open={mobileSheet === 'members'}
        onOpenChange={(open) => setMobileSheet(open ? 'members' : null)}
        title="Room Members"
        description={`${members.length} participant(s) in this lounge`}
      >
        <div className="h-[60dvh]">
          <MemberList
            members={members}
            currentMemberId={memberId}
            currentSocketId={currentSocketId}
            socket={socket}
          />
        </div>
      </Sheet>

      {/* Mobile Queue Bottom Sheet */}
      <Sheet
        open={mobileSheet === 'queue'}
        onOpenChange={(open) => setMobileSheet(open ? 'queue' : null)}
        title="Playback Queue"
        description={`${queue.length} track(s) in queue`}
      >
        <div className="h-[60dvh]">
          <QueueDrawer
            socket={socket}
            currentSocketId={currentSocketId}
            currentMemberId={memberId}
            onOpenSearch={() => {
              setMobileSheet(null);
              setIsSearchOpen(true);
            }}
          />
        </div>
      </Sheet>

      {/* Mobile Chat Bottom Sheet */}
      <Sheet
        open={mobileSheet === 'chat'}
        onOpenChange={(open) => setMobileSheet(open ? 'chat' : null)}
        title="Room Chat"
        description="Live chat with everyone in the lounge"
      >
        <div className="h-[65dvh]">
          <ChatDrawer
            socket={socket}
            currentSocketId={currentSocketId}
            currentMemberId={memberId}
          />
        </div>
      </Sheet>

      {/* YouTube Search Drawer */}
      <YouTubeSearchSheet
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        socket={socket}
      />

      {/* Bottom Dock with full controls */}
      <RoomDock
        micOn={micOn}
        onToggleMic={handleToggleMic}
        camOn={camOn}
        onToggleCam={handleToggleCam}
        hasMultipleCameras={hasMultipleCameras}
        onFlipCam={handleFlipCam}
        onOpenSearch={() => setIsSearchOpen(true)}
        onToggleQueue={() => {
          setActiveTab('queue');
          setMobileSheet('queue');
        }}
        queueCount={queue.length}
        onToggleChat={() => {
          setActiveTab('chat');
          setMobileSheet('chat');
        }}
        unreadChatCount={unreadChatCount}
        onToggleMembers={() => {
          setActiveTab('members');
          setMobileSheet('members');
        }}
        membersCount={members.length || 1}
      />

      {/* Diagnostic Debug Panel when ?debug=1 */}
      <MicDebugPanel />
    </div>
  );
}
