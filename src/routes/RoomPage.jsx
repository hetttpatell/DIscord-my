import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/useAppStore';
import { Button } from '../components/Button';
import { Radio, ArrowLeft } from 'lucide-react';

export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { token, displayName, clearSession } = useAppStore();

  const handleLeave = () => {
    clearSession();
    navigate('/');
  };

  return (
    <div className="relative min-h-dvh w-full flex flex-col bg-[#0B0B10] text-[#F4F1EA] select-none">
      <header className="h-14 border-b border-white/10 px-4 flex items-center justify-between bg-[#141419]">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLeave}
            aria-label="Leave room"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Lobby
          </Button>
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#FF9F1C]" />
            <span className="font-semibold text-sm">Room: {roomId}</span>
          </div>
        </div>
        <div className="text-xs text-[#9A978F]">
          Signed in as: <span className="text-[#F4F1EA] font-medium">{displayName || 'Guest'}</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <p className="text-sm text-[#9A978F]">
            {token ? `Connected to room ${roomId}` : 'No active session token. Please join from lobby.'}
          </p>
        </div>
      </main>
    </div>
  );
}

