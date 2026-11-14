import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/useAppStore';
import { createSocket } from '../lib/socket';
import { RoomTopBar } from '../features/room/RoomTopBar';
import { RoomDock } from '../features/room/RoomDock';
import { MemberList } from '../features/room/MemberList';
import { YouTubePlayer } from '../features/player/YouTubePlayer';
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
  const [isMuted, setIsMuted] = useState(true);

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

    socket.on('room:members', handleMembers);
    socket.connect();

    return () => {
      socket.off('room:members', handleMembers);
      socket.disconnect();
    };
  }, [socket, setMembers]);

  const handleLeave = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    clearSession();
    navigate('/');
  };

  const handleToggleMic = () => {
    setIsMuted((prev) => !prev);
  };

  return (
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

      {/* Search Sheet / Panel */}
      <Sheet
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        title="Search YouTube"
        description="Search for videos to play in sync"
      >
        <div className="p-4 text-center text-xs text-[#9A978F]">
          YouTube Search
        </div>
      </Sheet>

      {/* Bottom Dock */}
      <RoomDock
        isMuted={isMuted}
        onToggleMic={handleToggleMic}
        onOpenSearch={() => setIsSearchOpen(true)}
        onToggleMembers={() => setIsMembersOpen((prev) => !prev)}
        membersCount={members.length || 1}
      />
    </div>
  );
}
