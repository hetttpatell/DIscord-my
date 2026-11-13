import React, { useState, useEffect } from 'react';
import { 
  ArrowRight, 
  Loader2, 
  AlertCircle, 
  Clock, 
  CheckCircle2,
  Mic
} from 'lucide-react';
import socket from '../services/socket';
import { getClientId } from '../services/clientId';
import mediaService from '../services/mediaService';
import peerConnectionService from '../services/peerConnectionService';
import livekitService from '../services/livekitService';
import MeetingLobby from './MeetingLobby';

function getSessionId() {
  let sid = sessionStorage.getItem('togetherTune_sessionId');
  if (!sid) {
    sid = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem('togetherTune_sessionId', sid);
  }
  return sid;
}

export default function JoinCreateModal({
  onRoomJoined,
  initialRoomId = ''
}) {
  const [useMeetLobby, setUseMeetLobby] = useState(Boolean(initialRoomId));
  const [mode, setMode] = useState(initialRoomId ? 'join' : 'create'); // 'create' | 'join'
  
  // Create Room fields
  const [createRoomName, setCreateRoomName] = useState('');
  const [createUserName, setCreateUserName] = useState('');
  const [createRoomId, setCreateRoomId] = useState('');
  const [createPassword, setCreatePassword] = useState('');

  // Join Room fields
  const [joinRoomId, setJoinRoomId] = useState(initialRoomId);
  const [joinUserName, setJoinUserName] = useState('');
  const [joinPassword, setJoinPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [waitingStatus, setWaitingStatus] = useState(false);

  // Pre-join Audio & Microphone state
  const [isMicReady, setIsMicReady] = useState(() => 
    Boolean(mediaService.localStream?.getAudioTracks().some(t => t.readyState === 'live'))
  );
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micErrorMessage, setMicErrorMessage] = useState(null);

  useEffect(() => {
    if (mediaService.isMicOn && mediaService.localStream?.getAudioTracks().length > 0) {
      setIsMicReady(true);
    }

    const unsubscribe = mediaService.subscribe((event, payload, state) => {
      if (event === 'state-changed') {
        setIsMicReady(state.isMicOn);
      } else if (event === 'speaking') {
        setIsSpeaking(Boolean(payload.isSpeaking));
      } else if (event === 'error' && payload?.device === 'audio') {
        setMicErrorMessage(payload.message);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleEnableMic = async () => {
    setMicErrorMessage(null);
    peerConnectionService.unlockAudio();
    livekitService.startAudio();
    try {
      const track = await mediaService.acquireAudioTrack();
      if (track) {
        setIsMicReady(true);
      } else if (mediaService.lastError) {
        setMicErrorMessage(mediaService.lastError.message);
      }
    } catch (err) {
      setMicErrorMessage(err.message || 'Could not access microphone.');
    }
  };

  const handleLobbyJoin = ({ roomId, userName, password }) => {
    setIsLoading(true);
    setErrorMessage(null);
    const sessionId = getSessionId();
    const clientId = getClientId();

    peerConnectionService.unlockAudio();
    livekitService.startAudio();

    socket.emit('room:join', {
      roomId,
      password,
      userName,
      sessionId,
      clientId
    }, (response) => {
      if (response && response.success) {
        if (response.waiting) {
          setWaitingStatus(true);
          setIsLoading(false);
          setUseMeetLobby(false);
        } else {
          setIsLoading(false);
          onRoomJoined(response.room, response.user, response.resumeToken);
        }
      } else {
        // If room does not exist, auto-create it with this room ID
        socket.emit('room:create', {
          roomId,
          roomName: `${userName}'s Lounge`,
          password,
          userName,
          sessionId,
          clientId,
          requireApproval: false
        }, (createRes) => {
          setIsLoading(false);
          if (createRes && createRes.success) {
            onRoomJoined(createRes.room, createRes.user, createRes.resumeToken);
          } else {
            setErrorMessage(response?.message || createRes?.message || 'Could not join or create room.');
          }
        });
      }
    });
  };

  useEffect(() => {
    if (initialRoomId) {
      setJoinRoomId(initialRoomId.toUpperCase());
      setMode('join');
    }
  }, [initialRoomId]);

  // Listen for host admission approval while in the waiting room
  useEffect(() => {
    const handleApproved = ({ room, user }) => {
      setWaitingStatus(false);
      onRoomJoined(room, user);
    };

    const handleRejected = ({ message }) => {
      setWaitingStatus(false);
      setIsLoading(false);
      setErrorMessage(message || 'The host declined your join request.');
    };

    socket.on('room:approved', handleApproved);
    socket.on('room:rejected', handleRejected);

    return () => {
      socket.off('room:approved', handleApproved);
      socket.off('room:rejected', handleRejected);
    };
  }, [onRoomJoined]);

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    // Pre-request microphone access on this direct user click gesture (keeps stream alive for the call)
    peerConnectionService.unlockAudio();
    livekitService.startAudio();
    if (!mediaService.isMicOn) {
      try {
        await mediaService.acquireAudioTrack();
      } catch (err) {
        console.debug('Microphone acquisition error:', err);
      }
    }

    const generatedId = createRoomId.trim() || Math.random().toString(36).substring(2, 8).toUpperCase();

    const sessionId = getSessionId();
    const clientId = getClientId();

    socket.emit('room:create', {
      roomId: generatedId,
      roomName: createRoomName.trim() || 'afterspot Lounge',
      password: createPassword.trim(),
      userName: createUserName.trim() || 'Host',
      sessionId,
      clientId,
      requireApproval: true
    }, (response) => {
      setIsLoading(false);
      if (response.success) {
        onRoomJoined(response.room, response.user, response.resumeToken);
      } else {
        setErrorMessage(response.message || 'Failed to create room.');
      }
    });
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!joinRoomId.trim()) {
      setErrorMessage('Please enter a Room ID.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    // Pre-request microphone access on this direct user click gesture (keeps stream alive for the call)
    peerConnectionService.unlockAudio();
    livekitService.startAudio();
    if (!mediaService.isMicOn) {
      try {
        await mediaService.acquireAudioTrack();
      } catch (err) {
        console.debug('Microphone acquisition error:', err);
      }
    }

    const sessionId = getSessionId();
    const clientId = getClientId();

    socket.emit('room:join', {
      roomId: joinRoomId.trim(),
      password: joinPassword.trim(),
      userName: joinUserName.trim() || 'Guest',
      sessionId,
      clientId
    }, (response) => {
      if (response.success) {
        if (response.waiting) {
          setWaitingStatus(true);
          setIsLoading(false);
        } else {
          setIsLoading(false);
          onRoomJoined(response.room, response.user, response.resumeToken);
        }
      } else {
        setIsLoading(false);
        setErrorMessage(response.message || 'Failed to join room.');
      }
    });
  };

  if (useMeetLobby) {
    return (
      <MeetingLobby
        initialRoomId={initialRoomId || joinRoomId}
        onJoin={handleLobbyJoin}
        onSwitchToClassic={() => setUseMeetLobby(false)}
        isLoading={isLoading}
        errorMessage={errorMessage}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-[#313338] border border-[#383a40] rounded-3xl shadow-2xl p-6 md:p-8 text-[#dbdee1]">
        
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-3xl bg-gradient-to-tr from-[#5865f2] to-[#4752c4] text-white shadow-xl shadow-[#5865f2]/25 mb-3 ring-4 ring-[#5865f2]/20">
            {/* afterspot Custom Logo */}
            <svg className="w-8 h-8" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 46L32 15L45 46" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M24 35H40" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
              <circle cx="46" cy="17" r="7.5" fill="#23A55A" stroke="#1E1F22" strokeWidth="2.5" />
              <circle cx="46" cy="17" r="3" fill="#FFFFFF" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            after<span className="text-[#5865f2]">spot</span>
          </h1>
          <p className="text-xs text-[#949ba4] mt-1">
            Discord-Style Real-Time Watch &amp; Listening Lounge
          </p>

          <button
            type="button"
            onClick={() => setUseMeetLobby(true)}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#8ab4f8]/10 hover:bg-[#8ab4f8]/20 border border-[#8ab4f8]/30 text-[#8ab4f8] text-xs font-bold transition-all shadow-sm"
          >
            <span>Switch to Google Meet-Style Lobby Preview</span>
          </button>
        </div>

        {/* WAITING ROOM SCREEN */}
        {waitingStatus ? (
          <div className="text-center py-6 space-y-4 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-[#f0b232]/20 border border-[#f0b232]/40 mx-auto flex items-center justify-center text-[#f0b232] animate-pulse">
              <Clock className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">You're in the Waiting Room</h3>
              <p className="text-xs text-[#949ba4] mt-1 max-w-xs mx-auto leading-relaxed">
                We've notified the room host. Your screen will open automatically as soon as you're admitted.
              </p>
            </div>
            <div className="pt-2">
              <button
                onClick={() => setWaitingStatus(false)}
                className="text-xs text-[#949ba4] hover:text-white font-semibold underline underline-offset-2"
              >
                Cancel and return
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Mode Tabs */}
            <div className="grid grid-cols-2 p-1 bg-[#1e1f22] border border-[#383a40] rounded-xl mb-6">
              <button
                onClick={() => { setMode('create'); setErrorMessage(null); }}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${
                  mode === 'create'
                    ? 'bg-[#5865f2] text-white shadow-sm'
                    : 'text-[#949ba4] hover:text-white'
                }`}
              >
                Create Room
              </button>
              <button
                onClick={() => { setMode('join'); setErrorMessage(null); }}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${
                  mode === 'join'
                    ? 'bg-[#5865f2] text-white shadow-sm'
                    : 'text-[#949ba4] hover:text-white'
                }`}
              >
                Join Room
              </button>
            </div>

            {errorMessage && (
              <div className="mb-4 p-3 rounded-xl bg-[#f23f43]/15 border border-[#f23f43]/30 text-xs text-[#f23f43] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* CREATE FORM */}
            {mode === 'create' && (
              <form onSubmit={handleCreateRoom} className="space-y-3.5">
                <div>
                  <label className="text-xs font-bold text-white block mb-1">
                    Room / Stage Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Study &amp; Chill, Anime Lounge, DJ Beats"
                    value={createRoomName}
                    onChange={(e) => setCreateRoomName(e.target.value)}
                    className="w-full bg-[#1e1f22] border border-[#383a40] rounded-xl px-4 py-2.5 text-xs text-white placeholder-[#80848e] focus:outline-none focus:border-[#5865f2]"
                  />
                  <p className="text-[10px] text-[#949ba4] mt-1">
                    The name of the room (independent from your user nickname).
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-white block mb-1">
                    Your Personal Username / Nickname
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex, Sam, DJ Panda"
                    value={createUserName}
                    onChange={(e) => setCreateUserName(e.target.value)}
                    className="w-full bg-[#1e1f22] border border-[#383a40] rounded-xl px-4 py-2.5 text-xs text-white placeholder-[#80848e] focus:outline-none focus:border-[#5865f2]"
                  />
                  <p className="text-[10px] text-[#949ba4] mt-1">
                    Your personal display name visible in video calls, voice, and chat.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs font-bold text-white block mb-1">
                      Room ID (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. ROOM99"
                      value={createRoomId}
                      onChange={(e) => setCreateRoomId(e.target.value.toUpperCase())}
                      className="w-full bg-[#1e1f22] border border-[#383a40] rounded-xl px-4 py-2.5 text-xs text-white uppercase font-mono placeholder-[#949ba4] focus:outline-none focus:border-[#5865f2]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-white block mb-1">
                      Password (Optional)
                    </label>
                    <input
                      type="password"
                      placeholder="Passcode"
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      className="w-full bg-[#1e1f22] border border-[#383a40] rounded-xl px-4 py-2.5 text-xs text-white placeholder-[#949ba4] focus:outline-none focus:border-[#5865f2]"
                    />
                  </div>
                </div>

                {/* Starting Microphone & Audio Permission Setup */}
                <div className="p-3 rounded-2xl bg-[#1e1f22] border border-[#383a40]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                        isMicReady ? 'bg-[#23a55a]/20 text-[#23a55a]' : 'bg-[#5865f2]/20 text-[#5865f2]'
                      }`}>
                        <Mic className={`w-4 h-4 ${isSpeaking ? 'animate-bounce text-[#23a55a]' : ''}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white">Microphone</span>
                          {isMicReady && (
                            <span className="text-[10px] bg-[#23a55a]/15 text-[#23a55a] font-bold px-1.5 py-0.2 rounded-full border border-[#23a55a]/30">
                              Ready
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[#949ba4] block leading-tight">
                          {isMicReady
                            ? (isSpeaking ? 'Voice detected! 🔊' : 'Connected & ready to talk')
                            : 'Click to allow microphone access'}
                        </span>
                      </div>
                    </div>

                    {!isMicReady ? (
                      <button
                        type="button"
                        onClick={handleEnableMic}
                        className="px-3 py-1.5 rounded-lg bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-1.5 touch-manipulation cursor-pointer flex-shrink-0"
                      >
                        <Mic className="w-3.5 h-3.5" />
                        <span>Allow Mic</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 text-[#23a55a] text-xs font-semibold px-2 py-1 bg-[#23a55a]/10 rounded-lg border border-[#23a55a]/20">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span className="text-[11px]">Active</span>
                      </div>
                    )}
                  </div>

                  {micErrorMessage && (
                    <div className="mt-2 text-[11px] text-[#f23f43] bg-[#f23f43]/10 border border-[#f23f43]/20 p-2 rounded-lg leading-relaxed">
                      {micErrorMessage}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !createUserName.trim()}
                  className="w-full mt-3 py-3 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white text-xs font-bold shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer touch-manipulation"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Create Stage &amp; Enter</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* JOIN FORM */}
            {mode === 'join' && (
              <form onSubmit={handleJoinRoom} className="space-y-3.5">
                <div>
                  <label className="text-xs font-bold text-white block mb-1">
                    Room ID
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ROOM99"
                    value={joinRoomId}
                    onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                    className="w-full bg-[#1e1f22] border border-[#383a40] rounded-xl px-4 py-2.5 text-xs text-white uppercase font-mono font-bold placeholder-[#949ba4] focus:outline-none focus:border-[#5865f2]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-white block mb-1">
                    Your Nickname
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sam"
                    value={joinUserName}
                    onChange={(e) => setJoinUserName(e.target.value)}
                    className="w-full bg-[#1e1f22] border border-[#383a40] rounded-xl px-4 py-2.5 text-xs text-white placeholder-[#949ba4] focus:outline-none focus:border-[#5865f2]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-white block mb-1">
                    Room Password (If required)
                  </label>
                  <input
                    type="password"
                    placeholder="Room passcode"
                    value={joinPassword}
                    onChange={(e) => setJoinPassword(e.target.value)}
                    className="w-full bg-[#1e1f22] border border-[#383a40] rounded-xl px-4 py-2.5 text-xs text-white placeholder-[#949ba4] focus:outline-none focus:border-[#5865f2]"
                  />
                </div>

                {/* Starting Microphone & Audio Permission Setup */}
                <div className="p-3 rounded-2xl bg-[#1e1f22] border border-[#383a40]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                        isMicReady ? 'bg-[#23a55a]/20 text-[#23a55a]' : 'bg-[#5865f2]/20 text-[#5865f2]'
                      }`}>
                        <Mic className={`w-4 h-4 ${isSpeaking ? 'animate-bounce text-[#23a55a]' : ''}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white">Microphone</span>
                          {isMicReady && (
                            <span className="text-[10px] bg-[#23a55a]/15 text-[#23a55a] font-bold px-1.5 py-0.2 rounded-full border border-[#23a55a]/30">
                              Ready
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[#949ba4] block leading-tight">
                          {isMicReady
                            ? (isSpeaking ? 'Voice detected! 🔊' : 'Connected & ready to talk')
                            : 'Click to allow microphone access'}
                        </span>
                      </div>
                    </div>

                    {!isMicReady ? (
                      <button
                        type="button"
                        onClick={handleEnableMic}
                        className="px-3 py-1.5 rounded-lg bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-1.5 touch-manipulation cursor-pointer flex-shrink-0"
                      >
                        <Mic className="w-3.5 h-3.5" />
                        <span>Allow Mic</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 text-[#23a55a] text-xs font-semibold px-2 py-1 bg-[#23a55a]/10 rounded-lg border border-[#23a55a]/20">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span className="text-[11px]">Active</span>
                      </div>
                    )}
                  </div>

                  {micErrorMessage && (
                    <div className="mt-2 text-[11px] text-[#f23f43] bg-[#f23f43]/10 border border-[#f23f43]/20 p-2 rounded-lg leading-relaxed">
                      {micErrorMessage}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !joinRoomId.trim() || !joinUserName.trim()}
                  className="w-full mt-3 py-3 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white text-xs font-bold shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer touch-manipulation"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Join Discord Stage</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
