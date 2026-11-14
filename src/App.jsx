import React, { useState, useEffect, useCallback, useRef } from 'react';
import socket from './services/socket';
import { getClientId } from './services/clientId';
import mediaController from './services/mediaController';
import peerConnectionService from './services/peerConnectionService';
import livekitService from './services/livekitService';
import { useWebRTC } from './hooks/useWebRTC';
import YouTubePlayer from './components/YouTubePlayer';
import YouTubeSearchSheet from './components/YouTubeSearchSheet';
import YouTubeQueue from './components/YouTubeQueue';
import MembersStrip from './components/MembersStrip';
import AudioControls from './components/AudioControls';
import RoomTopBar from './components/RoomTopBar';
import PlaybackOverlay from './components/PlaybackOverlay';
import VoiceActionBar from './components/VoiceActionBar';
import LandingAccessCard from './components/LandingAccessCard';
import StartListeningGate from './components/StartListeningGate';
import MicPermissionModal from './components/MicPermissionModal';
import HeadphoneTip from './components/HeadphoneTip';
import RemoteAudioLayer from './components/RemoteAudioLayer';
import InsecureContextBanner from './components/InsecureContextBanner';
import MediaDebugPanel from './components/MediaDebugPanel';

export default function App() {
  const [room, setRoom] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [members, setMembers] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0); // Synchronized room position
  const [localCurrentTime, setLocalCurrentTime] = useState(0); // Smooth local UI position
  const [duration, setDuration] = useState(0);

  const youtubePlayerRef = useRef(null);

  // Audio & Voice States
  const [micState, setMicState] = useState(() => mediaController.micState);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMusicMuted, setIsMusicMuted] = useState(false);
  const [musicVolume, setMusicVolume] = useState(() => {
    if (typeof window === 'undefined') return 80;
    try {
      const v = localStorage.getItem('afterspot_music_vol');
      return v !== null ? Number(v) : 80;
    } catch {
      return 80;
    }
  });
  const [voicesVolume, setVoicesVolume] = useState(() => {
    if (typeof window === 'undefined') return 100;
    try {
      const v = localStorage.getItem('afterspot_voices_vol');
      return v !== null ? Number(v) : 100;
    } catch {
      return 100;
    }
  });

  const [hasAudioUnlocked, setHasAudioUnlocked] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isMicModalOpen, setIsMicModalOpen] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const [toast, setToast] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Host-only stored plain password for this tab session
  const [hostPassword, setHostPassword] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      return sessionStorage.getItem('afterspot_hostPassword') || '';
    } catch {
      return '';
    }
  });

  // Join / Create form inputs
  const [roomIdInput, setRoomIdInput] = useState(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return (params.get('room') || '').toUpperCase();
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [userNameInput, setUserNameInput] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('afterspot_userName') || '';
  });
  const [roomNameInput, setRoomNameInput] = useState('');
  const [mode, setMode] = useState(() => {
    if (typeof window === 'undefined') return 'join';
    const params = new URLSearchParams(window.location.search);
    return params.get('room') ? 'join' : 'create';
  });

  const isInviteMode = Boolean(typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('room'));

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => {
      setToast(curr => (curr === msg ? null : curr));
    }, 3000);
  }, []);

  // WebRTC Audio Connection
  const { peers } = useWebRTC({
    roomId: room?.id,
    userName: currentUser?.name,
    sessionId: getClientId(),
    localStream: mediaController.stream,
    isCallActive: Boolean(room)
  });

  // Track mic changes & permission status
  useEffect(() => {
    const unsub = mediaController.subscribe((_event, payload, state) => {
      const current = state || payload || mediaController.getState();
      if (current) {
        setMicState(current.micState);
        setIsSpeaking(Boolean(current.isSpeaking));
        if (current.micState === 'blocked') {
          setIsMicModalOpen(true);
        } else if (current.micState === 'insecure') {
          showToast('Microphone requires HTTPS or localhost');
        } else if (current.micState === 'error' && current.error?.message) {
          showToast(current.error.message);
        }
      }
    });
    return () => unsub();
  }, [showToast]);

  const handleRoomJoined = useCallback((roomData, userData, resumeToken = null, plainPassword = null) => {
    setRoom(roomData);
    setCurrentUser(userData);
    setCurrentTrack(roomData.currentTrack || null);
    setIsPlaying(Boolean(roomData.isPlaying));
    const startPos = roomData.playbackPosition || 0;
    setPlaybackPosition(startPos);
    setLocalCurrentTime(startPos);
    setMembers(roomData.members || []);
    setQueue(roomData.queue || []);
    setErrorMsg('');
    setIsReconnecting(false);

    const clientId = getClientId();
    let storedToken = resumeToken;
    if (!storedToken) {
      try {
        const prev = JSON.parse(sessionStorage.getItem('afterspot_activeSession') || '{}');
        if (prev.roomId === roomData.id && prev.resumeToken) {
          storedToken = prev.resumeToken;
        }
      } catch {}
    }

    try {
      sessionStorage.setItem('afterspot_activeSession', JSON.stringify({
        roomId: roomData.id,
        clientId,
        userName: userData.name,
        isHost: Boolean(userData.isHost),
        resumeToken: storedToken || null
      }));
    } catch {}

    if (userData.name) {
      try {
        localStorage.setItem('afterspot_userName', userData.name);
      } catch {}
    }

    if (userData.isHost && plainPassword) {
      setHostPassword(plainPassword);
      try {
        sessionStorage.setItem('afterspot_hostPassword', plainPassword);
      } catch {}
    }

    const newUrl = `${window.location.pathname}?room=${roomData.id}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
    showToast(`Joined: ${roomData.name || roomData.id}`);
  }, [showToast]);

  // Auto-resume active session on refresh
  useEffect(() => {
    try {
      const savedRaw = sessionStorage.getItem('afterspot_activeSession');
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        const clientId = saved.clientId || getClientId();
        if (saved.roomId && saved.resumeToken) {
          socket.emit('room:resume', {
            roomId: saved.roomId,
            clientId,
            sessionId: clientId,
            userName: saved.userName,
            resumeToken: saved.resumeToken
          }, (res) => {
            if (res?.success) {
              handleRoomJoined(res.room, res.user, res.resumeToken || saved.resumeToken);
            } else {
              sessionStorage.removeItem('afterspot_activeSession');
            }
          });
        }
      }
    } catch {
      sessionStorage.removeItem('afterspot_activeSession');
    }
  }, [handleRoomJoined]);

  // Socket event listeners and reconnection
  useEffect(() => {
    const onPlayerSync = ({ isPlaying: p, playbackPosition: pos }) => {
      setIsPlaying(p);
      if (typeof pos === 'number') {
        setPlaybackPosition(pos);
        setLocalCurrentTime(pos);
      }
    };

    const onTrackChange = ({ currentTrack: t, isPlaying: p, playbackPosition: pos }) => {
      setCurrentTrack(t);
      setIsPlaying(Boolean(p));
      const startingPos = typeof pos === 'number' ? pos : 0;
      setPlaybackPosition(startingPos);
      setLocalCurrentTime(startingPos);
      if (t) showToast(`Now playing: ${t.title}`);
    };

    const onSeek = ({ playbackPosition: pos }) => {
      if (typeof pos === 'number') {
        setPlaybackPosition(pos);
        setLocalCurrentTime(pos);
      }
    };

    const onTimeSync = ({ playbackPosition: pos, isPlaying: p }) => {
      if (typeof pos === 'number') {
        setPlaybackPosition(pos);
      }
      setIsPlaying(p);
    };

    const onMembersUpdated = ({ members: m }) => {
      if (m) setMembers(m);
    };

    const onQueueUpdated = ({ queue: q }) => {
      if (q) setQueue(q);
    };

    const onDisconnect = () => {
      setIsReconnecting(true);
    };

    const onConnect = () => {
      setIsReconnecting(false);
      try {
        const savedRaw = sessionStorage.getItem('afterspot_activeSession');
        if (savedRaw) {
          const saved = JSON.parse(savedRaw);
          const clientId = saved.clientId || getClientId();
          if (saved.roomId && saved.resumeToken) {
            socket.emit('room:resume', {
              roomId: saved.roomId,
              clientId,
              sessionId: clientId,
              userName: saved.userName,
              resumeToken: saved.resumeToken
            }, (res) => {
              if (res?.success) {
                handleRoomJoined(res.room, res.user, res.resumeToken || saved.resumeToken);
              }
            });
          }
        }
      } catch {}
    };

    socket.on('player:sync', onPlayerSync);
    socket.on('player:track-change', onTrackChange);
    socket.on('player:seek', onSeek);
    socket.on('player:time-sync', onTimeSync);
    socket.on('room:members-updated', onMembersUpdated);
    socket.on('queue:updated', onQueueUpdated);
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);

    return () => {
      socket.off('player:sync', onPlayerSync);
      socket.off('player:track-change', onTrackChange);
      socket.off('player:seek', onSeek);
      socket.off('player:time-sync', onTimeSync);
      socket.off('room:members-updated', onMembersUpdated);
      socket.off('queue:updated', onQueueUpdated);
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
    };
  }, [handleRoomJoined, showToast]);

  const handleStartListening = async () => {
    try {
      youtubePlayerRef.current?.unmuteAndPlay();
      await peerConnectionService.unlockAudio();
      await livekitService.startAudio();
      document.querySelectorAll('audio').forEach(a => {
        if (a.paused && a.srcObject) a.play().catch(() => {});
      });
      setHasAudioUnlocked(true);
      showToast('Audio & Voice unlocked!');
    } catch {
      setHasAudioUnlocked(true);
    }
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (!userNameInput.trim()) {
      setErrorMsg('Please enter your display name.');
      return;
    }
    if (!roomIdInput.trim()) {
      setErrorMsg('Please enter a 6-character room code.');
      return;
    }
    if (!passwordInput.trim() || passwordInput.trim().length < 4) {
      setErrorMsg('Room password must be at least 4 characters.');
      return;
    }

    setErrorMsg('');
    socket.emit('room:join', {
      roomId: roomIdInput.trim().toUpperCase(),
      password: passwordInput.trim(),
      userName: userNameInput.trim(),
      clientId: getClientId(),
      sessionId: getClientId()
    }, (res) => {
      if (res?.success) {
        handleRoomJoined(res.room, res.user, res.resumeToken);
      } else {
        setErrorMsg(res?.message || 'Failed to join room.');
      }
    });
  };

  const handleCreate = (e) => {
    e.preventDefault();
    if (!userNameInput.trim()) {
      setErrorMsg('Please enter your display name.');
      return;
    }
    if (!passwordInput.trim() || passwordInput.trim().length < 4) {
      setErrorMsg('Password must be at least 4 characters.');
      return;
    }

    const plainPass = passwordInput.trim();
    setErrorMsg('');
    socket.emit('room:create', {
      roomName: roomNameInput.trim() || 'Music Room',
      password: plainPass,
      userName: userNameInput.trim(),
      clientId: getClientId(),
      sessionId: getClientId()
    }, (res) => {
      if (res?.success) {
        handleRoomJoined(res.room, res.user, res.resumeToken, plainPass);
      } else {
        setErrorMsg(res?.message || 'Failed to create room.');
      }
    });
  };

  const handleLeave = () => {
    mediaController.cleanupOnLeaveRoom();
    socket.emit('room:leave');
    try {
      sessionStorage.removeItem('afterspot_activeSession');
      sessionStorage.removeItem('afterspot_hostPassword');
    } catch {}
    setRoom(null);
    setCurrentUser(null);
    setCurrentTrack(null);
    setIsPlaying(false);
    setMembers([]);
    setQueue([]);
    setHostPassword('');
    setIsSearchOpen(false);
    setIsQueueOpen(false);
    setHasAudioUnlocked(false);
    window.history.pushState({}, '', window.location.pathname);
    showToast('Left the room');
  };

  const handleCopyInvite = () => {
    if (!room?.id) return;
    const link = `${window.location.origin}/?room=${room.id}`;
    navigator.clipboard.writeText(link).then(() => {
      showToast('Invite link copied! (Password is never in the URL)');
    }).catch(() => {
      showToast('Could not copy link to clipboard');
    });
  };

  const handleCopyPassword = () => {
    if (!hostPassword) {
      showToast('Host password unavailable');
      return;
    }
    navigator.clipboard.writeText(hostPassword).then(() => {
      showToast('Room password copied to clipboard!');
    }).catch(() => {
      showToast('Could not copy password to clipboard');
    });
  };

  const handleTogglePlay = () => {
    if (!room) return;
    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);
    if (nextPlaying) {
      socket.emit('player:play', { currentTime: localCurrentTime });
    } else {
      socket.emit('player:pause', { currentTime: localCurrentTime });
    }
    socket.emit('player:sync', { isPlaying: nextPlaying, playbackPosition: localCurrentTime });
  };

  const handleSkip = () => {
    if (!room) return;
    socket.emit('queue:skip', { entryId: currentTrack?.entryId });
  };

  const handleSeek = (pos) => {
    setPlaybackPosition(pos);
    setLocalCurrentTime(pos);
    socket.emit('player:seek', { currentTime: pos });
  };

  const handleToggleMute = () => {
    setIsMusicMuted(prev => {
      const next = !prev;
      if (!next) {
        youtubePlayerRef.current?.unmute();
      }
      return next;
    });
  };

  const handlePlayNow = (track) => {
    setIsSearchOpen(false);
    socket.emit('player:set-track', { track });
    showToast(`Playing: ${track.title}`);
  };

  const handleAddToQueue = (track) => {
    setIsSearchOpen(false);
    socket.emit('queue:add', { track });
    showToast(`Added to queue: ${track.title}`);
  };

  const handleRemoveFromQueue = (entryId) => {
    socket.emit('queue:remove', { entryId });
  };

  const handlePlayTrackFromQueue = (track) => {
    socket.emit('player:set-track', { track });
  };

  const handleToggleMic = async () => {
    try {
      const track = await mediaController.toggleMic();
      if (!track && mediaController.micState === 'blocked') {
        setIsMicModalOpen(true);
      } else if (!track && mediaController.micState === 'insecure') {
        showToast('Microphone requires HTTPS or localhost');
      } else if (!track && mediaController.micState === 'error' && mediaController.error?.message) {
        showToast(mediaController.error.message);
      }
    } catch (err) {
      console.error('[App] toggleMic error:', err);
      if (mediaController.micState === 'blocked') {
        setIsMicModalOpen(true);
      } else {
        showToast(err?.message || 'Unable to access microphone');
      }
    }
  };

  const handleMusicVolumeChange = (newVol) => {
    setMusicVolume(newVol);
    try { localStorage.setItem('afterspot_music_vol', String(newVol)); } catch {}
  };

  const handleVoicesVolumeChange = (newVol) => {
    setVoicesVolume(newVol);
    try { localStorage.setItem('afterspot_voices_vol', String(newVol)); } catch {}
  };

  const isRoomActive = Boolean(room);
  const isHost = Boolean(currentUser?.isHost);

  const activeRemotePeer = Object.values(peers).find(p => p && p.isSpeaking);
  const activeSpeakerName = activeRemotePeer?.userName || null;

  return (
    <div className="min-h-screen bg-[#0B0B10] text-[#F4F1EA] flex flex-col font-sans select-none antialiased">
      <InsecureContextBanner />
      <MediaDebugPanel />
      <RemoteAudioLayer voicesVolume={voicesVolume} />

      {/* Mic Permission Guidance Modal */}
      <MicPermissionModal
        isOpen={isMicModalOpen}
        onClose={() => setIsMicModalOpen(false)}
        onRetry={async () => {
          setIsMicModalOpen(false);
          await mediaController.retryPermission();
        }}
      />

      {/* YouTube Search Sheet (Touch-friendly & Visual Viewport Adapted) */}
      <YouTubeSearchSheet
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onPlayNow={handlePlayNow}
        onAddToQueue={handleAddToQueue}
      />

      {/* Start Listening Autoplay Gate */}
      <StartListeningGate
        isVisible={isRoomActive && !hasAudioUnlocked}
        onUnlock={handleStartListening}
      />

      {/* Reconnection Banner */}
      {isReconnecting && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 bg-[#FF9F1C] text-black text-xs font-bold rounded-full shadow-2xl animate-pulse">
          Reconnecting to room...
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-[#1C1C24]/90 backdrop-blur-md border border-white/20 rounded-full text-xs font-medium text-white shadow-xl">
          {toast}
        </div>
      )}

      {/* Main View Area */}
      {isRoomActive ? (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Top Bar */}
          <RoomTopBar
            roomName={room.name}
            roomId={room.id}
            membersCount={members.length}
            isHost={isHost}
            hasHostPassword={Boolean(hostPassword)}
            onCopyInvite={handleCopyInvite}
            onCopyPassword={handleCopyPassword}
            onLeaveRoom={handleLeave}
          />

          {/* Room Body */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
            <div className="w-full max-w-2xl mx-auto space-y-4">
              <HeadphoneTip />

              {/* Permanent YouTube Player Stage - Rule 4: never unmounts, never display:none */}
              <div className={`transition-all duration-300 ${
                currentTrack
                  ? 'w-full aspect-video min-h-[200px] rounded-2xl overflow-hidden shadow-2xl bg-black border border-white/10'
                  : 'fixed -top-[9999px] -left-[9999px] w-[320px] h-[180px] opacity-0 pointer-events-none'
              }`}>
                <YouTubePlayer
                  ref={youtubePlayerRef}
                  currentTrack={currentTrack}
                  isPlaying={isPlaying}
                  playbackPosition={playbackPosition}
                  volume={musicVolume}
                  isMuted={isMusicMuted}
                  onDurationChange={(d) => setDuration(d)}
                  onCurrentTimeChange={(pos) => setLocalCurrentTime(pos)}
                  onPlayerError={(msg) => showToast(msg || "That video can't be played here, skipped")}
                  onTapToPlayNeeded={() => showToast('Tap player to start sound')}
                  onTogglePlay={handleTogglePlay}
                />
              </div>

              {/* Minimalist Playback Overlay with scrub */}
              <PlaybackOverlay
                currentTrack={currentTrack}
                isPlaying={isPlaying}
                playbackPosition={localCurrentTime}
                duration={duration}
                isMuted={isMusicMuted}
                onTogglePlay={handleTogglePlay}
                onSkip={handleSkip}
                onSeek={handleSeek}
                onToggleMute={handleToggleMute}
                onOpenSearch={() => setIsSearchOpen(true)}
              />

              {/* Voice Action Bar: prominent mobile phone-call mic toggle, search button, queue toggle */}
              <VoiceActionBar
                micState={micState}
                isSpeaking={isSpeaking}
                queueCount={queue.length}
                activeSpeakerName={activeSpeakerName}
                peersCount={Object.keys(peers).length}
                onToggleMic={handleToggleMic}
                onOpenSearch={() => setIsSearchOpen(true)}
                onToggleQueue={() => setIsQueueOpen(prev => !prev)}
                isQueueOpen={isQueueOpen}
              />

              {/* Members Strip */}
              <MembersStrip
                members={members}
                peers={peers}
                currentUserId={currentUser?.clientId || getClientId()}
                localMicOn={micState === 'on'}
                localSpeaking={isSpeaking}
              />

              {/* Audio Balance Dual Sliders */}
              <AudioControls
                musicVolume={musicVolume}
                voicesVolume={voicesVolume}
                onMusicVolumeChange={handleMusicVolumeChange}
                onVoicesVolumeChange={handleVoicesVolumeChange}
              />

              {/* Up Next Queue (Slide-over / Collapsible Panel) */}
              {isQueueOpen && (
                <YouTubeQueue
                  queue={queue}
                  currentTrack={currentTrack}
                  onRemoveTrack={handleRemoveFromQueue}
                  onPlayTrack={handlePlayTrackFromQueue}
                  onSkip={handleSkip}
                />
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Landing & Access Screens */
        <div className="flex-1 flex items-center justify-center p-4">
          <LandingAccessCard
            mode={mode}
            onModeChange={setMode}
            userNameInput={userNameInput}
            onUserNameChange={setUserNameInput}
            roomIdInput={roomIdInput}
            onRoomIdChange={setRoomIdInput}
            roomNameInput={roomNameInput}
            onRoomNameChange={setRoomNameInput}
            passwordInput={passwordInput}
            onPasswordChange={setPasswordInput}
            onSubmitJoin={handleJoin}
            onSubmitCreate={handleCreate}
            errorMessage={errorMsg}
            isInviteMode={isInviteMode}
          />
        </div>
      )}
    </div>
  );
}
