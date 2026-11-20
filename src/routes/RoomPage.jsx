import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAppStore } from '../stores/useAppStore';
import { createSocket, disconnectSocket } from '../lib/socket';
import { RoomTopBar } from '../features/room/RoomTopBar';
import { RoomDock } from '../features/room/RoomDock';
import { MemberList } from '../features/room/MemberList';
import { YouTubePlayer } from '../features/player/YouTubePlayer';
import { SharedMediaPlayer } from '../features/media/SharedMediaPlayer';
import { LocalMediaModal } from '../features/media/LocalMediaModal';
import { YouTubeSearchSheet } from '../features/search/YouTubeSearchSheet';
import { QueueSheet } from '../features/queue/QueueSheet';
import { LiveKitVoiceProvider } from '../features/voice/LiveKitVoiceProvider';
import { VoiceEffectsSheet } from '../features/voice/VoiceEffectsSheet';
import { ScribbleArena } from '../features/games/ScribbleArena';
import { FloatingReactions } from '../features/reactions/FloatingReactions';
import { ReactionPicker } from '../features/reactions/ReactionPicker';
import { CameraStrip } from '../features/video/CameraStrip';
import { WelcomeCelebrationModal } from '../features/room/WelcomeCelebrationModal';
import { SetWelcomeMessageModal } from '../features/room/SetWelcomeMessageModal';
import { ExitConfirmModal } from '../features/room/ExitConfirmModal';
import { InRoomJoinCard } from '../features/room/InRoomJoinCard';
import { getSavedRoom, saveRoomCredentials } from '../lib/roomStorage';
import { apiRequest } from '../lib/api';
import { Gamepad2, Radio } from 'lucide-react';
import { Sheet } from '../components/Sheet';
import { stopMicrophone } from '../lib/microphone';
import { stopCamera } from '../lib/camera';
import { ErrorBoundary } from '../components/ErrorBoundary';

export default function RoomPage() {
  const { roomId: urlRoomId } = useParams();
  const navigate = useNavigate();
  const token = useAppStore((s) => s.token);
  const roomId = useAppStore((s) => s.roomId);
  const memberId = useAppStore((s) => s.memberId);
  const members = useAppStore((s) => s.members);
  const queue = useAppStore((s) => s.queue);
  const nowPlaying = useAppStore((s) => s.nowPlaying);
  const mediaState = useAppStore((s) => s.mediaState);
  const setMediaState = useAppStore((s) => s.setMediaState);
  const clearSession = useAppStore((s) => s.clearSession);

  const totalQueueCount = queue.length + (nowPlaying ? 1 : 0);

  const socket = useMemo(() => (token ? createSocket(token) : null), [token]);
  const localReactionRef = useRef(null);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isVoiceFxOpen, setIsVoiceFxOpen] = useState(false);
  const [isGamesOpen, setIsGamesOpen] = useState(false);
  const [activeGameInfo, setActiveGameInfo] = useState(null);
  const [isLocalMediaModalOpen, setIsLocalMediaModalOpen] = useState(false);
  const [localMediaFile, setLocalMediaFile] = useState(null);
  const [celebrationMessage, setCelebrationMessage] = useState(null);
  const [isSetWelcomeOpen, setIsSetWelcomeOpen] = useState(false);
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(!token || roomId !== urlRoomId);
  const [needsAuth, setNeedsAuth] = useState(false);

  // Validate session on mount or auto-restore credentials from localStorage
  useEffect(() => {
    if (token && roomId === urlRoomId) {
      return;
    }

    let isMounted = true;
    const checkAndRestore = async () => {
      if (!urlRoomId) {
        if (isMounted) navigate('/');
        return;
      }

      const saved = getSavedRoom(urlRoomId);
      if (saved?.password) {
        try {
          const data = await apiRequest('/api/rooms/join', {
            method: 'POST',
            body: {
              roomId: urlRoomId.trim(),
              password: saved.password,
              displayName: saved.displayName || 'Guest',
            },
          });

          if (!isMounted) return;

          useAppStore.getState().setSession({
            token: data.token,
            roomId: data.roomId,
            memberId: data.memberId,
            displayName: data.displayName,
          });

          saveRoomCredentials({
            roomId: data.roomId,
            token: data.token,
            memberId: data.memberId,
            displayName: data.displayName,
            password: saved.password,
          });

          if (data.welcomeMessage) {
            useAppStore.getState().setWelcomeMessage(data.welcomeMessage, data.creatorDisplayName || 'Host');
            const seenKey = `welcome_seen_${data.roomId}_${data.welcomeMessage}`;
            if (typeof window !== 'undefined' && !sessionStorage.getItem(seenKey)) {
              setCelebrationMessage({
                message: data.welcomeMessage,
                creatorDisplayName: data.creatorDisplayName || 'Host',
              });
            }
          }

          setIsCheckingSession(false);
          setNeedsAuth(false);
          toast.success(`Reconnected to ${urlRoomId}!`);
          return;
        } catch (err) {
          console.warn('[RoomPage] Auto-rejoin failed:', err?.message);
        }
      }

      if (isMounted) {
        setIsCheckingSession(false);
        setNeedsAuth(true);
      }
    };

    checkAndRestore();

    return () => {
      isMounted = false;
    };
  }, [token, roomId, urlRoomId, navigate]);

  // Intercept browser back button & mobile swipe back gesture to prompt exit confirmation
  useEffect(() => {
    if (!token || !roomId || roomId !== urlRoomId) return;

    // Push dummy history entry so back button doesn't immediately exit
    window.history.pushState({ afterspotRoom: true }, '', window.location.href);

    const handlePopState = () => {
      // Re-push state so URL stays in the room while modal confirms
      window.history.pushState({ afterspotRoom: true }, '', window.location.href);
      setIsExitConfirmOpen(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [token, roomId, urlRoomId]);

  // Clean up on window close / page refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      disconnectSocket();
      stopMicrophone();
      stopCamera();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Connect Socket.IO
  useEffect(() => {
    if (!socket) return;

    if (typeof window !== 'undefined') {
      window.__socket = socket;
    }

    const handleMembers = (updatedMembers) => {
      useAppStore.getState().setMembers(updatedMembers);
    };

    const handleVoiceState = ({ memberId: targetId, isMicEnabled }) => {
      if (typeof window !== 'undefined' && isMicEnabled) {
        window.__remoteAudioSubscribed = true;
      }
      useAppStore.setState((prev) => {
        const currentList = Array.isArray(prev.members)
          ? prev.members
          : (prev.members && Array.isArray(prev.members.members)
            ? prev.members.members
            : Object.values(prev.members || {}));
        return {
          members: currentList.map((m) =>
            m.memberId === targetId || m.id === targetId
              ? { ...m, isMicEnabled, isSpeaking: isMicEnabled }
              : m
          ),
        };
      });
    };

    const handleCameraState = ({ memberId: targetId, isCameraEnabled }) => {
      useAppStore.setState((prev) => {
        const currentList = Array.isArray(prev.members)
          ? prev.members
          : (prev.members && Array.isArray(prev.members.members)
            ? prev.members.members
            : Object.values(prev.members || {}));
        return {
          members: currentList.map((m) =>
            m.memberId === targetId || m.id === targetId
              ? { ...m, isCameraEnabled }
              : m
          ),
        };
      });
    };

    const handleQueueUpdate = ({ queue: updatedQueue, nowPlaying: updatedNowPlaying, version }) => {
      useAppStore.getState().setQueueUpdate({
        queue: updatedQueue,
        nowPlaying: updatedNowPlaying,
        version,
      });
    };

    const handleQueueError = ({ message }) => {
      toast.error(message || 'Queue error');
    };

    const handleMediaState = (updatedMediaState) => {
      if (updatedMediaState) {
        setMediaState(updatedMediaState);
        if (updatedMediaState.type !== 'local') {
          setLocalMediaFile(null);
        }
      }
    };

    const handleGameStarted = (data) => {
      setActiveGameInfo(data);
    };

    const handleGameState = (state) => {
      if (state && state.status === 'drawing') {
        setActiveGameInfo({
          round: state.round,
          drawerName: state.currentDrawerName,
          category: state.category,
        });
      } else if (state && state.status === 'idle') {
        setActiveGameInfo(null);
      }
    };

    const handleMatchEnd = () => {
      setActiveGameInfo(null);
    };

    const handleWelcomeMessage = (data) => {
      if (data?.message) {
        useAppStore.getState().setWelcomeMessage(data.message, data.creatorDisplayName);
        const seenKey = `welcome_seen_${roomId}_${data.message}`;
        if (typeof window !== 'undefined' && !sessionStorage.getItem(seenKey)) {
          setCelebrationMessage({
            message: data.message,
            creatorDisplayName: data.creatorDisplayName || 'Host',
          });
        }
      }
    };

    socket.on('room:members', handleMembers);
    socket.on('voice:state', handleVoiceState);
    socket.on('camera:state', handleCameraState);
    socket.on('queue:update', handleQueueUpdate);
    socket.on('queue:error', handleQueueError);
    socket.on('media:state', handleMediaState);
    socket.on('game:started', handleGameStarted);
    socket.on('game:state', handleGameState);
    socket.on('game:match_end', handleMatchEnd);
    socket.on('room:welcome_message', handleWelcomeMessage);

    if (!socket.connected && !socket.connecting) {
      socket.connect();
    }

    return () => {
      socket.off('room:members', handleMembers);
      socket.off('voice:state', handleVoiceState);
      socket.off('camera:state', handleCameraState);
      socket.off('queue:update', handleQueueUpdate);
      socket.off('queue:error', handleQueueError);
      socket.off('media:state', handleMediaState);
      socket.off('game:started', handleGameStarted);
      socket.off('game:state', handleGameState);
      socket.off('game:match_end', handleMatchEnd);
      socket.off('room:welcome_message', handleWelcomeMessage);
    };
  }, [socket, setMediaState, roomId]);

  const handleConfirmLeave = () => {
    setIsExitConfirmOpen(false);
    disconnectSocket();
    stopMicrophone();
    stopCamera();
    clearSession();
    navigate('/', { replace: true });
  };

  const handleStartShare = (file) => {
    if (!file) return;
    setLocalMediaFile(file);

    // 1. Optimistically update local mediaState so the player mounts instantly
    setMediaState({
      type: 'local',
      sharerId: memberId,
      sharerName: useAppStore.getState().displayName || 'You',
      fileName: file.name,
      durationSec: 0,
      positionSec: 0,
      status: 'playing',
    });

    // 2. Pause YouTube playback in the client store
    useAppStore.setState((prev) => ({
      playerState: { ...prev.playerState, status: 'paused' },
    }));

    // 3. Emit media:start over socket so the room switches and receives stream
    const activeSock = socket?.connected ? socket : (typeof window !== 'undefined' ? window.__socket : socket);
    activeSock?.emit('media:start', {
      fileName: file.name,
      durationSec: 0,
    });

    toast.success(`Started watchparty for "${file.name}"`);
  };

  const handleStopSharing = () => {
    setLocalMediaFile(null);
    setMediaState({
      type: 'youtube',
      sharerId: null,
      sharerName: null,
      fileName: null,
      durationSec: 0,
      positionSec: 0,
      status: 'paused',
    });
    const activeSock = socket?.connected ? socket : (typeof window !== 'undefined' ? window.__socket : socket);
    activeSock?.emit('media:stop');
  };

  if (isCheckingSession) {
    return (
      <div className="min-h-dvh w-full flex flex-col items-center justify-center p-4 bg-[#0B0B10] text-[#F4F1EA] select-none">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF9F1C] to-[#FF5A5F] flex items-center justify-center shadow-lg shadow-[#FF9F1C]/25 mb-4 animate-pulse">
          <Radio className="w-7 h-7 text-[#0B0B10]" />
        </div>
        <p className="text-sm font-semibold text-[#F4F1EA]">Reconnecting to Lounge...</p>
        <p className="text-xs text-[#9A978F] mt-1.5 font-mono">Room: {urlRoomId}</p>
      </div>
    );
  }

  if (needsAuth) {
    return (
      <InRoomJoinCard
        roomId={urlRoomId || ''}
        onJoined={() => {
          setNeedsAuth(false);
          setIsCheckingSession(false);
        }}
      />
    );
  }

  return (
    <LiveKitVoiceProvider>
      <div className="relative min-h-dvh w-full flex flex-col bg-[#0B0B10] text-[#F4F1EA] select-none overflow-hidden pb-20">
        {/* Top Bar */}
        <RoomTopBar
          roomId={roomId || urlRoomId || ''}
          membersCount={Array.isArray(members) ? members.length : 1}
          onLeave={() => setIsExitConfirmOpen(true)}
          onOpenLocalMedia={() => setIsLocalMediaModalOpen(true)}
        />

        {/* Main Content Area */}
        <main className="flex-1 w-full max-w-6xl mx-auto p-4 flex flex-col lg:flex-row gap-6 items-start justify-center overflow-y-auto">
          {/* Left: Video Player */}
          <section
            aria-label="Synchronized Media Player"
            className="w-full lg:flex-1 max-w-3xl mx-auto flex flex-col gap-4"
          >
            {mediaState?.type === 'local' ? (
              <SharedMediaPlayer
                socket={socket}
                localMediaFile={localMediaFile}
                onStopSharing={handleStopSharing}
                onLocalReaction={(data) => {
                  localReactionRef.current?.({
                    ...data,
                    senderName: useAppStore.getState().displayName || 'You',
                  });
                }}
              />
            ) : (
              <YouTubePlayer
                socket={socket}
                onOpenSearch={() => setIsSearchOpen(true)}
                onOpenLocalMediaModal={() => setIsLocalMediaModalOpen(true)}
                onLocalReaction={(data) => {
                  localReactionRef.current?.({
                    ...data,
                    senderName: useAppStore.getState().displayName || 'You',
                  });
                }}
              />
            )}
          </section>

          {/* Right column on Desktop: Members */}
          <aside
            aria-label="Room Participants"
            className="hidden lg:block w-80 h-[500px] rounded-2xl bg-[#141419]/90 border border-white/10 backdrop-blur-md overflow-hidden shrink-0"
          >
            <ErrorBoundary>
              <MemberList
                members={members}
                currentMemberId={memberId}
              />
            </ErrorBoundary>
          </aside>
        </main>

        {/* Mobile Members Bottom Sheet */}
        <Sheet
          open={isMembersOpen}
          onOpenChange={setIsMembersOpen}
          title="Room Members"
          description={`${Array.isArray(members) ? members.length : 1} participant(s) in this lounge`}
        >
          <div className="h-64">
            <ErrorBoundary>
              <MemberList
                members={members}
                currentMemberId={memberId}
              />
            </ErrorBoundary>
          </div>
        </Sheet>

        {/* YouTube Search Drawer */}
        <YouTubeSearchSheet
          open={isSearchOpen}
          onOpenChange={setIsSearchOpen}
          socket={socket}
          onOpenLocalMediaModal={() => setIsLocalMediaModalOpen(true)}
        />

        {/* Local Media Sharing Modal */}
        <LocalMediaModal
          open={isLocalMediaModalOpen}
          onOpenChange={setIsLocalMediaModalOpen}
          onStartShare={handleStartShare}
        />

        {/* Playback Queue Drawer */}
        <QueueSheet
          open={isQueueOpen}
          onOpenChange={setIsQueueOpen}
          socket={socket}
          onOpenSearch={() => {
            setIsQueueOpen(false);
            setIsSearchOpen(true);
          }}
        />

        {/* Microphone Voice Changer Sheet */}
        <VoiceEffectsSheet
          open={isVoiceFxOpen}
          onOpenChange={setIsVoiceFxOpen}
        />

        {/* Apple Dynamic Island Live Match Capsule when Arena is closed */}
        {activeGameInfo && !isGamesOpen && (
          <aside
            aria-label="Active match announcement"
            className="fixed top-3 sm:top-4 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-1.5rem)] sm:max-w-md flex items-center justify-between gap-2.5 px-3.5 py-1.5 rounded-full bg-[#1C1C1E]/95 dark:bg-[#141418]/95 backdrop-blur-2xl border border-white/20 shadow-[0_12px_36px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.15)] animate-in slide-in-from-top-3 duration-300 select-none"
          >
            <div className="flex items-center gap-2 min-w-0 truncate">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF375F] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF375F]" />
              </span>
              <span className="font-bold text-xs text-white shrink-0">Scribble</span>
              <span className="text-white/40 shrink-0">•</span>
              <span className="text-xs text-white/75 truncate font-medium">
                Round {activeGameInfo.round} ({activeGameInfo.drawerName})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsGamesOpen(true)}
              className="h-7 px-3 rounded-full bg-[#FF9F0A] hover:bg-[#FF9F0A]/90 active:scale-95 text-[#0B0B10] font-bold text-xs shrink-0 whitespace-nowrap shadow-md shadow-[#FF9F0A]/20 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>Join</span>
              <Gamepad2 className="w-3.5 h-3.5" />
            </button>
          </aside>
        )}

        {/* Dedicated Scribble & Guess Arena Screen */}
        <ScribbleArena
          open={isGamesOpen}
          onClose={() => setIsGamesOpen(false)}
          socket={socket}
        />

        {/* Floating Animated Reactions */}
        <FloatingReactions
          socket={socket}
          onLocalReactionRef={localReactionRef}
        />

        {/* Reaction Floating Bar on the Screen */}
        <ReactionPicker
          socket={socket}
          isHidden={isGamesOpen || isMembersOpen}
          onTriggerLocal={(data) => {
            localReactionRef.current?.({
              ...data,
              senderName: useAppStore.getState().displayName || 'You',
            });
          }}
        />

        {/* Floating / Docked Live Camera Strip */}
        <ErrorBoundary>
          <CameraStrip isHidden={isGamesOpen} />
        </ErrorBoundary>

        {/* Bottom Dock */}
        <RoomDock
          onOpenVoiceFx={() => setIsVoiceFxOpen(true)}
          onOpenGames={() => setIsGamesOpen(true)}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenQueue={() => setIsQueueOpen(true)}
          onToggleMembers={() => setIsMembersOpen((prev) => !prev)}
          onOpenSetWelcome={() => setIsSetWelcomeOpen(true)}
          queueCount={totalQueueCount}
          membersCount={Array.isArray(members) ? members.length : 1}
          isGameActive={Boolean(activeGameInfo)}
          isHidden={isGamesOpen}
        />

        {/* Full-Screen Welcome Announcement Celebration with Party Poppers */}
        {celebrationMessage && (
          <WelcomeCelebrationModal
            message={celebrationMessage.message}
            creatorDisplayName={celebrationMessage.creatorDisplayName}
            roomId={roomId}
            onClose={() => setCelebrationMessage(null)}
          />
        )}

        {/* Host Set/Edit Welcome Announcement Modal */}
        <SetWelcomeMessageModal
          isOpen={isSetWelcomeOpen}
          onClose={() => setIsSetWelcomeOpen(false)}
          socket={socket}
          currentMessage={useAppStore.getState().welcomeMessage || ''}
        />

        {/* Exit Confirmation Modal */}
        <ExitConfirmModal
          isOpen={isExitConfirmOpen}
          onConfirm={handleConfirmLeave}
          onCancel={() => setIsExitConfirmOpen(false)}
        />
      </div>
    </LiveKitVoiceProvider>
  );
}
