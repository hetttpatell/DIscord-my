import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  SwitchCamera, 
  Settings, 
  ArrowRight, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Sparkles,
  Volume2
} from 'lucide-react';
import mediaService from '../services/mediaService';
import peerConnectionService from '../services/peerConnectionService';
import livekitService from '../services/livekitService';

export default function MeetingLobby({
  initialRoomId = '',
  roomInfo = null,
  onJoin,
  onSwitchToClassic,
  isLoading = false,
  errorMessage = null
}) {
  const [userName, setUserName] = useState(() => {
    return localStorage.getItem('togetherTune_savedNickname') || '';
  });
  const [roomId, setRoomId] = useState(initialRoomId);
  const [password, setPassword] = useState('');

  const [isMicOn, setIsMicOn] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [permissionError, setPermissionError] = useState(null);
  const [isSecureContext, setIsSecureContext] = useState(
    typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false
  );

  const previewVideoRef = useRef(null);

  // Initialize and subscribe to mediaService
  useEffect(() => {
    setIsSecureContext(typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false);

    const unsub = mediaService.subscribe((event, payload, state) => {
      if (event === 'state-changed') {
        setIsMicOn(state.isMicOn);
        setIsCameraOn(state.isCameraOn);
      } else if (event === 'speaking') {
        setIsSpeaking(Boolean(payload.isSpeaking));
      } else if (event === 'stream-changed') {
        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = state.stream;
          if (state.isCameraOn) {
            previewVideoRef.current.play().catch(() => {});
          }
        }
      } else if (event === 'error') {
        setPermissionError(payload.message);
      }
    });

    return () => unsub();
  }, []);

  // Update video element on camera toggle
  useEffect(() => {
    if (previewVideoRef.current) {
      if (isCameraOn && mediaService.localStream) {
        previewVideoRef.current.srcObject = mediaService.localStream;
        previewVideoRef.current.play().catch(() => {});
      } else {
        previewVideoRef.current.srcObject = null;
      }
    }
  }, [isCameraOn]);

  const handleToggleMic = async () => {
    setPermissionError(null);
    try {
      const track = await mediaService.toggleMic();
      if (track) {
        setIsMicOn(track.enabled);
      } else if (mediaService.lastError) {
        setPermissionError(mediaService.lastError.message);
      }
    } catch (e) {
      setPermissionError(e.message);
    }
  };

  const handleToggleCamera = async () => {
    setPermissionError(null);
    try {
      const track = await mediaService.toggleCamera();
      if (track) {
        setIsCameraOn(true);
      } else {
        setIsCameraOn(false);
        if (mediaService.lastError) {
          setPermissionError(mediaService.lastError.message);
        }
      }
    } catch (e) {
      setPermissionError(e.message);
    }
  };

  const handleFlipCamera = async () => {
    setPermissionError(null);
    try {
      await mediaService.switchCamera();
    } catch (e) {
      setPermissionError(e.message);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!userName.trim() || !roomId.trim()) return;

    // Resume shared audio context on user gesture
    peerConnectionService.unlockAudio();
    livekitService.startAudio();

    localStorage.setItem('togetherTune_savedNickname', userName.trim());

    onJoin({
      roomId: roomId.trim().toUpperCase(),
      userName: userName.trim(),
      password: password.trim(),
      isMicOn,
      isCameraOn
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#121212] text-[#e8eaed] overflow-y-auto">
      <div className="w-full max-w-4xl mx-auto flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-10 py-6">
        
        {/* LEFT COLUMN: INTERACTIVE GOOGLE MEET CAMERA PREVIEW STAGE */}
        <div className="w-full lg:w-3/5 flex flex-col items-center">
          <div className="relative w-full aspect-video rounded-3xl overflow-hidden bg-[#202124] border border-[#3c4043] shadow-2xl flex items-center justify-center">
            
            {/* Live Camera Preview */}
            {isCameraOn ? (
              <video
                ref={previewVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
            ) : (
              /* Camera Off Placeholder */
              <div className="flex flex-col items-center justify-center text-center p-4">
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-xl mb-3 ring-4 transition-all ${
                    isSpeaking
                      ? 'ring-[#34a853] scale-105'
                      : isMicOn
                      ? 'ring-[#34a853]/40'
                      : 'ring-white/10'
                  }`}
                  style={{ backgroundColor: '#5865f2' }}
                >
                  {userName?.charAt(0).toUpperCase() || 'U'}
                </div>
                <span className="text-sm font-semibold text-white">Camera is off</span>
                <span className="text-xs text-[#9aa0a6] mt-0.5">Click camera button below to turn on</span>
              </div>
            )}

            {/* Audio Waveform Speaking Ring Overlay */}
            {isSpeaking && (
              <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-[#34a853] text-[#34a853] text-xs font-bold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-[#34a853]" />
                <span>Microphone active</span>
              </div>
            )}

            {/* Mobile Flip Camera */}
            {isCameraOn && (
              <button
                type="button"
                onClick={handleFlipCamera}
                className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/70 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/90 active:scale-95 shadow"
                title="Flip Camera"
              >
                <SwitchCamera className="w-4 h-4" />
              </button>
            )}

            {/* Floating Audio & Video Toggle Controls */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-full bg-[#202124]/90 backdrop-blur-md border border-[#3c4043] shadow-xl">
              {/* Mic Button */}
              <button
                type="button"
                onClick={handleToggleMic}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow active:scale-95 touch-manipulation ${
                  isMicOn
                    ? 'bg-[#3c4043] text-white hover:bg-[#4a4e52] border border-[#5f6368]/30'
                    : 'bg-[#ea4335] text-white shadow-md shadow-[#ea4335]/30'
                }`}
                title={isMicOn ? "Turn off microphone" : "Turn on microphone"}
              >
                {isMicOn ? <Mic className="w-5 h-5 text-white" /> : <MicOff className="w-5 h-5 text-white" />}
              </button>

              {/* Camera Button */}
              <button
                type="button"
                onClick={handleToggleCamera}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow active:scale-95 ${
                  isCameraOn
                    ? 'bg-[#3c4043] text-white hover:bg-[#4a4e52] border border-[#5f6368]/30'
                    : 'bg-[#ea4335] text-white shadow-md shadow-[#ea4335]/30'
                }`}
                title={isCameraOn ? "Turn off camera" : "Turn on camera"}
              >
                {isCameraOn ? <Video className="w-5 h-5 text-white" /> : <VideoOff className="w-5 h-5 text-white" />}
              </button>
            </div>
          </div>

          {/* Device Diagnostics & Status */}
          <div className="w-full mt-3 flex items-center justify-between px-2 text-xs text-[#9aa0a6]">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isMicOn ? 'bg-[#34a853]' : 'bg-[#ea4335]'}`} />
              <span>{isMicOn ? 'Microphone ready' : 'Microphone muted'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isCameraOn ? 'bg-[#34a853]' : 'bg-[#9aa0a6]'}`} />
              <span>{isCameraOn ? 'Camera active' : 'Camera off'}</span>
            </div>
          </div>

          {permissionError && (
            <div className="w-full mt-2 p-3 rounded-xl bg-[#ea4335]/15 border border-[#ea4335]/30 text-xs text-[#f28b82] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{permissionError}</span>
            </div>
          )}

          {!isSecureContext && (
            <div className="w-full mt-2 p-3 rounded-xl bg-[#f2994a]/15 border border-[#f2994a]/30 text-xs text-[#f2994a] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>LAN HTTP Detected: Mobile browsers require HTTPS for camera and microphone outside localhost.</span>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: MEETING DETAILS & JOIN FORM */}
        <div className="w-full lg:w-2/5 flex flex-col justify-center">
          <div className="p-6 sm:p-8 rounded-3xl bg-[#202124] border border-[#3c4043] shadow-2xl">
            
            {/* Room Brand Title */}
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#8ab4f8]/10 border border-[#8ab4f8]/30 text-[#8ab4f8] text-xs font-bold mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Ready to join?</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {roomInfo?.name || 'afterspot Lounge'}
              </h1>
              <p className="text-xs text-[#9aa0a6] mt-1 font-mono">
                Meeting Room: {roomId || 'READY'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-white block mb-1">
                  Your Name / Nickname
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Alex, Sam, DJ Panda"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full bg-[#303134] border border-[#5f6368] rounded-xl px-4 py-2.5 text-xs text-white placeholder-[#9aa0a6] focus:outline-none focus:border-[#8ab4f8]"
                />
              </div>

              {!initialRoomId && (
                <div>
                  <label className="text-xs font-bold text-white block mb-1">
                    Room ID
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ROOM99"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    className="w-full bg-[#303134] border border-[#5f6368] rounded-xl px-4 py-2.5 text-xs text-white uppercase font-mono font-bold placeholder-[#9aa0a6] focus:outline-none focus:border-[#8ab4f8]"
                  />
                </div>
              )}

              {roomInfo?.hasPassword && (
                <div>
                  <label className="text-xs font-bold text-white block mb-1">
                    Room Passcode
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Enter room password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[#303134] border border-[#5f6368] rounded-xl px-4 py-2.5 text-xs text-white placeholder-[#9aa0a6] focus:outline-none focus:border-[#8ab4f8]"
                  />
                </div>
              )}

              {errorMessage && (
                <div className="p-3 rounded-xl bg-[#ea4335]/15 border border-[#ea4335]/30 text-xs text-[#f28b82] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !userName.trim() || !roomId.trim()}
                className="w-full py-3 rounded-xl bg-[#8ab4f8] hover:bg-[#aecbfa] disabled:opacity-50 text-[#202124] text-xs font-bold shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
              >
                {isLoading ? (
                  <span>Connecting to room...</span>
                ) : (
                  <>
                    <span>Join Meeting</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {onSwitchToClassic && (
                <button
                  type="button"
                  onClick={onSwitchToClassic}
                  className="w-full text-center text-xs text-[#9aa0a6] hover:text-white underline underline-offset-4 pt-1"
                >
                  Or use classic lounge room creator
                </button>
              )}
            </form>

            <div className="mt-4 pt-4 border-t border-[#3c4043]/50 flex items-center justify-between text-[11px] text-[#9aa0a6]">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#34a853]" />
                <span>End-to-End Encrypted Call</span>
              </span>
              <span>No signup needed</span>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
