import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/useAppStore';
import { createSocket } from '../lib/socket';
import { RoomTopBar } from '../features/room/RoomTopBar';
import { RoomDock } from '../features/room/RoomDock';
import { MemberList } from '../features/room/MemberList';
import { YouTubePlayer } from '../features/player/YouTubePlayer';
import { YouTubeSearchSheet } from '../features/search/YouTubeSearchSheet';
import { LiveKitVoiceProvider } from '../features/voice/LiveKitVoiceProvider';
import { Sheet } from '../components/Sheet';

export default function RoomPage() {
  const { roomId: urlRoomId } = useParams();
  const navigate = useNavigate();
  const {
    token,
    roomId,
    memberId,
    members,
    setMembers,
    clearSession,
  } = useAppStore();

  const socket = useMemo(() => (token ? createSocket(token) : null), [token]);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Validate session on mount
  useEffect(() => {
    if (!token || !roomId || roomId !== urlRoomId) {
      navigate('/');
    }
  }, [token, roomId, urlRoomId, navigate]);

  // Connect Socket.IO
  useEffect(() => {
    if (!socket) return;

    if (typeof window !== 'undefined') {
      window.__socket = socket;
    }

    const handleMembers = (updatedMembers) => {
      setMembers(updatedMembers);
    };

    const handleVoiceState = ({ memberId: targetId, isMicEnabled }) => {
      if (typeof window !== 'undefined' && isMicEnabled) {
        window.__remoteAudioSubscribed = true;
      }
      useAppStore.setState((prev) => ({
        members: prev.members.map((m) =>
          m.memberId === targetId ? { ...m, isMicEnabled, isSpeaking: isMicEnabled } : m
        ),
      }));
    };

    socket.on('room:members', handleMembers);
    socket.on('voice:state', handleVoiceState);
    socket.connect();

    return () => {
      socket.off('room:members', handleMembers);
      socket.off('voice:state', handleVoiceState);
      socket.disconnect();
    };
  }, [socket, setMembers]);

  const handleLeave = () => {
    clearSession();
    navigate('/');
  };

  return (
    <LiveKitVoiceProvider>
      <div className="relative min-h-dvh w-full flex flex-col bg-[#0B0B10] text-[#F4F1EA] select-none overflow-hidden pb-20">
        {/* Top Bar */}
        <RoomTopBar
          roomId={roomId || urlRoomId || ''}
          membersCount={members.length || 1}
          onLeave={handleLeave}
        />

        {/* Main Content Area */}
        <main className="flex-1 w-full max-w-6xl mx-auto p-4 flex flex-col lg:flex-row gap-6 items-start justify-center overflow-y-auto">
          {/* Left: Video Player */}
          <section
            aria-label="Synchronized YouTube Player"
            className="w-full lg:flex-1 max-w-3xl mx-auto flex flex-col gap-4"
          >
            <YouTubePlayer
              socket={socket}
              onOpenSearch={() => setIsSearchOpen(true)}
            />
          </section>

          {/* Right column on Desktop: Members */}
          <aside
            aria-label="Room Participants"
            className="hidden lg:block w-80 h-[500px] rounded-2xl bg-[#141419]/90 border border-white/10 backdrop-blur-md overflow-hidden shrink-0"
          >
            <MemberList
              members={members}
              currentMemberId={memberId}
            />
          </aside>
        </main>

        {/* Mobile Members Bottom Sheet */}
        <Sheet
          open={isMembersOpen}
          onOpenChange={setIsMembersOpen}
          title="Room Members"
          description={`${members.length} participant(s) in this lounge`}
        >
          <div className="h-64">
            <MemberList
              members={members}
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

        {/* Bottom Dock */}
        <RoomDock
          onOpenSearch={() => setIsSearchOpen(true)}
          onToggleMembers={() => setIsMembersOpen((prev) => !prev)}
          membersCount={members.length || 1}
        />
      </div>
    </LiveKitVoiceProvider>
  );
}
