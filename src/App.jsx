import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import CommonScreen from './components/CommonScreen';
import JoinCreateModal from './components/JoinCreateModal';
import socket, { getBackendUrl } from './services/socket';
import { getClientId } from './services/clientId';
import { Radio } from 'lucide-react';

function getSessionId() {
  let sid = sessionStorage.getItem('togetherTune_sessionId');
  if (!sid) {
    sid = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem('togetherTune_sessionId', sid);
  }
  return sid;
}

export default function App() {
  // Room & User State
  const [room, setRoom] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [initialRoomId, setInitialRoomId] = useState('');

  // Player State
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);

  // Members & Waiting List
  const [members, setMembers] = useState([]);
  const [waitingList, setWaitingList] = useState([]);

  // Queue & Room Chat
  const [queue, setQueue] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [floatingReactions, setFloatingReactions] = useState([]);

  // Local Audio Settings
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('togetherTune_volume');
    return saved !== null ? parseInt(saved, 10) : 80;
  });
  const [isMuted, setIsMuted] = useState(false);

  // YouTube API Key & Guide Toggle
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem('togetherTune_ytApiKey') || '';
  });
  const [showApiKeyGuide, setShowApiKeyGuide] = useState(false);

  // Toast notifications
  const [toast, setToast] = useState(null);

  const showToast = (message) => {
    setToast({ message, id: Date.now() });
    setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 3000);
  };

  const handleRoomJoined = (roomData, userData, resumeToken = null) => {
    setRoom(roomData);
    setCurrentUser(userData);
    setCurrentTrack(roomData.currentTrack || null);
    setIsPlaying(Boolean(roomData.isPlaying));
    setPlaybackPosition(roomData.playbackPosition || 0);
    setMembers(roomData.members || []);
    setWaitingList(roomData.waitingList || []);
    setQueue(roomData.queue || []);
    setChatMessages(roomData.chatMessages || []);

    // Save active session with stable clientId and server-issued resumeToken (never store raw password)
    const myClientId = getClientId();
    let storedToken = resumeToken;
    if (!storedToken) {
      try {
        const prev = JSON.parse(localStorage.getItem('togetherTune_activeSession') || '{}');
        if (prev.roomId === roomData.id && prev.resumeToken) {
          storedToken = prev.resumeToken;
        }
      } catch {}
    }

    localStorage.setItem('togetherTune_activeSession', JSON.stringify({
      roomId: roomData.id,
      clientId: myClientId,
      userName: userData.name,
      isHost: Boolean(userData.isHost),
      resumeToken: storedToken || null
    }));

    const newUrl = `${window.location.pathname}?room=${roomData.id}`;
    window.history.pushState({ path: newUrl }, '', newUrl);

    showToast(`Connected: ${roomData.name}`);
  };

  // Parse invite URL or restore active session on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setInitialRoomId(roomParam.toUpperCase());
    }

    // Auto-resume active session after browser refresh or server restart
    const savedSessionRaw = localStorage.getItem('togetherTune_activeSession');
    if (savedSessionRaw) {
      try {
        const savedSession = JSON.parse(savedSessionRaw);
        const myClientId = savedSession.clientId || getClientId();

        if (savedSession.roomId) {
          socket.emit('room:resume', {
            roomId: savedSession.roomId,
            clientId: myClientId,
            sessionId: myClientId,
            userName: savedSession.userName,
            resumeToken: savedSession.resumeToken
          }, (response) => {
            if (response && response.success) {
              handleRoomJoined(response.room, response.user, response.resumeToken || savedSession.resumeToken);
            } else {
              localStorage.removeItem('togetherTune_activeSession');
            }
          });
        }
      } catch (e) {
        localStorage.removeItem('togetherTune_activeSession');
      }
    }

    // Check if backend already has an API key
    fetch(`${getBackendUrl()}/api/health`)
      .then(r => r.json())
      .then(data => {
        if (data.hasApiKey && !apiKey) {
          setApiKey('CONFIGURED_ON_SERVER');
        }
      })
      .catch(() => {});
  }, []);

  // Socket Events
  useEffect(() => {
    const handlePlayerSync = ({ isPlaying: serverPlaying, playbackPosition: serverPos, triggeredBy }) => {
      setIsPlaying(serverPlaying);
      if (typeof serverPos === 'number') {
        setPlaybackPosition(serverPos);
      }
      if (triggeredBy) {
        showToast(`${triggeredBy} ${serverPlaying ? 'played' : 'paused'} playback`);
      }
    };

    const handleTrackChange = ({ currentTrack: newTrack, isPlaying: newPlaying, playbackPosition: newPos, triggeredBy }) => {
      setCurrentTrack(newTrack);
      setIsPlaying(Boolean(newPlaying));
      setPlaybackPosition(newPos || 0);
      if (newTrack) {
        showToast(`Now playing: ${newTrack.title}`);
      }
    };

    const handlePlayerSeek = ({ playbackPosition: newPos, triggeredBy }) => {
      setPlaybackPosition(newPos);
      if (triggeredBy) {
        showToast(`${triggeredBy} scrubbed playback`);
      }
    };

    // Server periodic heartbeat — keeps all clients in perfect theater sync
    const handleTimeSync = ({ playbackPosition: serverPos, isPlaying: serverPlaying }) => {
      if (typeof serverPos === 'number') {
        setPlaybackPosition(serverPos);
      }
      // Also enforce play state in case it drifted
      setIsPlaying(serverPlaying);
    };

    const handleMembersUpdated = ({ members: newMembers, waitingList: newWaiting }) => {
      if (newMembers) setMembers(newMembers);
      if (newWaiting) setWaitingList(newWaiting);
    };

    const handleWaitingListUpdated = ({ waitingList: newWaiting }) => {
      if (newWaiting) {
        setWaitingList(newWaiting);
        if (newWaiting.length > 0) {
          showToast(`${newWaiting.length} friend(s) in waiting list`);
        }
      }
    };

    const handleQueueUpdated = ({ queue: newQueue, addedTrack }) => {
      if (newQueue) setQueue(newQueue);
      if (addedTrack) {
        showToast(`Added to queue: ${addedTrack.title}`);
      }
    };

    const handleChatMessage = (msg) => {
      setChatMessages(prev => [...prev.slice(-150), msg]);
    };

    const handleReactionReceived = (reaction) => {
      const id = Date.now() + Math.random();
      const left = Math.floor(Math.random() * 75) + 12;
      setFloatingReactions(prev => [...prev.slice(-20), { ...reaction, id, left }]);
      setTimeout(() => {
        setFloatingReactions(prev => prev.filter(r => r.id !== id));
      }, 2500);
    };

    const handleRoomNameUpdated = ({ name }) => {
      setRoom(prev => prev ? ({ ...prev, name }) : null);
      showToast(`Room renamed: ${name}`);
    };

    const handleUserUpdated = ({ user }) => {
      setCurrentUser(user);
      const raw = localStorage.getItem('togetherTune_activeSession');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          parsed.userName = user.name;
          localStorage.setItem('togetherTune_activeSession', JSON.stringify(parsed));
        } catch (e) {}
      }
    };

    socket.on('player:sync', handlePlayerSync);
    socket.on('player:track-change', handleTrackChange);
    socket.on('player:seek', handlePlayerSeek);
    socket.on('player:time-sync', handleTimeSync);
    socket.on('room:members-updated', handleMembersUpdated);
    socket.on('room:waiting-list-updated', handleWaitingListUpdated);
    socket.on('room:name-updated', handleRoomNameUpdated);
    socket.on('user:updated', handleUserUpdated);
    socket.on('queue:updated', handleQueueUpdated);
    socket.on('chat:message', handleChatMessage);
    socket.on('reaction:received', handleReactionReceived);

    // Handle socket reconnection — automatically rejoin the room
    const handleReconnect = () => {
      const savedSessionRaw = localStorage.getItem('togetherTune_activeSession');
      if (savedSessionRaw) {
        try {
          const savedSession = JSON.parse(savedSessionRaw);
          const myClientId = savedSession.clientId || getClientId();
          if (savedSession.roomId) {
            socket.emit('room:resume', {
              roomId: savedSession.roomId,
              clientId: myClientId,
              sessionId: myClientId,
              userName: savedSession.userName,
              resumeToken: savedSession.resumeToken
            }, (response) => {
              if (response && response.success) {
                handleRoomJoined(response.room, response.user, response.resumeToken || savedSession.resumeToken);
              } else {
                localStorage.removeItem('togetherTune_activeSession');
                setRoom(null);
                setCurrentUser(null);
              }
            });
          }
        } catch (e) {}
      }
    };
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('player:sync', handlePlayerSync);
      socket.off('player:track-change', handleTrackChange);
      socket.off('player:seek', handlePlayerSeek);
      socket.off('player:time-sync', handleTimeSync);
      socket.off('room:members-updated', handleMembersUpdated);
      socket.off('room:waiting-list-updated', handleWaitingListUpdated);
      socket.off('room:name-updated', handleRoomNameUpdated);
      socket.off('user:updated', handleUserUpdated);
      socket.off('queue:updated', handleQueueUpdated);
      socket.off('chat:message', handleChatMessage);
      socket.off('reaction:received', handleReactionReceived);
      socket.off('connect', handleReconnect);
    };
  }, []);

  const handleLeaveRoom = () => {
    socket.emit('room:leave');
    localStorage.removeItem('togetherTune_activeSession');
    socket.disconnect();
    socket.connect();
    setRoom(null);
    setCurrentUser(null);
    setCurrentTrack(null);
    setIsPlaying(false);
    setMembers([]);
    setWaitingList([]);
    setQueue([]);
    setChatMessages([]);
    setFloatingReactions([]);
    window.history.pushState({}, '', window.location.pathname);
    showToast('You left the room');
  };

  const handleSaveApiKey = async (newKey) => {
    setApiKey(newKey);
    localStorage.setItem('togetherTune_ytApiKey', newKey);

    // Also persist to backend .env
    try {
      await fetch('/api/youtube/save-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newKey })
      });
    } catch (e) {}

    showToast('YouTube API Key saved successfully!');
  };

  const isHost = Boolean(currentUser?.isHost);

  return (
    <div className="fixed inset-0 h-full h-[100dvh] w-full bg-[#1e1f22] text-[#dbdee1] flex flex-col antialiased overflow-hidden overscroll-none select-none">
      {/* Toast Alert */}
      {toast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 animate-fade-in pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#111214]/90 backdrop-blur-md border border-[#3f4147] text-[#f2f3f5] text-xs font-semibold shadow-2xl">
            <Radio className="w-3.5 h-3.5 text-[#5865f2] animate-pulse" />
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Main Body */}
      {room ? (
        <main className="flex-1 w-full h-full overflow-hidden flex flex-col">
          <CommonScreen
            room={room}
            currentUser={currentUser}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            playbackPosition={playbackPosition}
            members={members}
            waitingList={waitingList}
            queue={queue}
            chatMessages={chatMessages}
            floatingReactions={floatingReactions}
            isHost={isHost}
            hasApiKey={Boolean(apiKey)}
            apiKey={apiKey === 'CONFIGURED_ON_SERVER' ? '' : apiKey}
            onSaveApiKey={handleSaveApiKey}
            showApiKeyGuide={showApiKeyGuide}
            onToggleApiKeyGuide={() => setShowApiKeyGuide(prev => !prev)}
            onCloseApiKeyGuide={() => setShowApiKeyGuide(false)}
            onLeaveRoom={handleLeaveRoom}
            volume={volume}
            setVolume={setVolume}
            isMuted={isMuted}
            setIsMuted={setIsMuted}
          />
        </main>
      ) : (
        /* Create or Join Entry Modal */
        <JoinCreateModal
          onRoomJoined={handleRoomJoined}
          initialRoomId={initialRoomId}
        />
      )}
    </div>
  );
}
