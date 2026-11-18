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
import { Gamepad2 } from 'lucide-react';
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

  // Validate session on mount
  useEffect(() => {
    if (!token || !roomId || roomId !== urlRoomId) {
      navigate('/');
    }
  }, [token, roomId, urlRoomId, navigate]);

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

    socket.on('room:members', handleMembers);
    socket.on('voice:state', handleVoiceState);
    socket.on('camera:state', handleCameraState);
    socket.on('queue:update', handleQueueUpdate);
    socket.on('queue:error', handleQueueError);
    socket.on('media:state', handleMediaState);
    socket.on('game:started', handleGameStarted);
    socket.on('game:state', handleGameState);
    socket.on('game:match_end', handleMatchEnd);

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
    };
  }, [socket, setMediaState]);

  const handleLeave = () => {
    disconnectSocket();
    stopMicrophone();
    stopCamera();
    clearSession();
    navigate('/');
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

  return (
    <LiveKitVoiceProvider>
      <div className="relative min-h-dvh w-full flex flex-col bg-[#0B0B10] text-[#F4F1EA] select-none overflow-hidden pb-20">
        {/* Top Bar */}
        <RoomTopBar
          roomId={roomId || urlRoomId || ''}
          membersCount={Array.isArray(members) ? members.length : 1}
          onLeave={handleLeave}
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
          queueCount={totalQueueCount}
          membersCount={Array.isArray(members) ? members.length : 1}
          isGameActive={Boolean(activeGameInfo)}
          isHidden={isGamesOpen}
        />
      </div>
    </LiveKitVoiceProvider>
  );
}
