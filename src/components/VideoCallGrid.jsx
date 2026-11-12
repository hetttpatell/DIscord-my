import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  ScreenShare, 
  StopCircle, 
  LayoutGrid, 
  Tv, 
  Users, 
  Volume2, 
  PhoneOff, 
  PhoneCall, 
  Sparkles 
} from 'lucide-react';
import socket from '../services/socket';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

export default function VideoCallGrid({
  room,
  currentUser,
  members = [],
  layoutMode = 'strip', // 'strip' (above video player) | 'grid' (Google Meet full grid)
  onToggleLayoutMode,
  onLeaveRoom,
  children
}) {
  const [isInCall, setIsInCall] = useState(true); // Always in call by default
  const [isMicOn, setIsMicOn] = useState(true);   // Mic on by default
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [peers, setPeers] = useState({}); // { [peerId]: { stream, userName, avatarColor, isMuted, isCameraOff } }
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);

  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const peerConnections = useRef({}); // { [peerId]: RTCPeerConnection }
  const audioContextRef = useRef(null);

  // Attach local media tracks to all existing peer connections
  const attachLocalStreamToPeers = useCallback((stream) => {
    if (!stream) return;
    const tracks = stream.getTracks();
    Object.values(peerConnections.current).forEach(pc => {
      tracks.forEach(track => {
        const senders = pc.getSenders();
        const existingSender = senders.find(s => s.track && s.track.kind === track.kind);
        if (existingSender) {
          existingSender.replaceTrack(track).catch(() => {});
        } else {
          try {
            pc.addTrack(track, stream);
          } catch (e) {
            console.warn('Could not add track to peer:', e);
          }
        }
      });
    });
  }, []);

  // Safe microphone acquisition with mobile fallbacks (No native alert popups!)
  const startVoice = useCallback(async () => {
    if (localStreamRef.current && localStreamRef.current.getAudioTracks().length > 0) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      audioTrack.enabled = true;
      setIsMicOn(true);
      return localStreamRef.current;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('getUserMedia not supported or not in secure context');
      return null;
    }

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
    } catch (e1) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (e2) {
        console.warn('Microphone permission deferred or denied:', e2);
      }
    }

    if (stream) {
      localStreamRef.current = stream;
      setIsInCall(true);
      setIsMicOn(true);
      attachLocalStreamToPeers(stream);

      socket.emit('webrtc:media-state', {
        isMuted: false,
        isCameraOff: !isCameraOn,
        isScreenSharing: false
      });

      // Announce ready to room peers
      socket.emit('webrtc:join-call');
    }
    return stream;
  }, [attachLocalStreamToPeers, isCameraOn]);

  // Auto-join voice call immediately when entering the room
  useEffect(() => {
    let isMounted = true;

    startVoice().then(stream => {
      if (!isMounted) return;
      if (!stream) {
        // Connected to voice lounge, user can tap Mic button to grant permission
        setIsInCall(true);
        setIsMicOn(false);
      }
    });

    return () => {
      isMounted = false;
      leaveCall();
    };
  }, [startVoice]);

  // Update local video element when local stream changes
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [isCameraOn, isScreenSharing, isInCall]);

  // Create Peer Connection for a specific remote peer
  const createPeerConnection = useCallback((peerId, peerName, peerColor, isInitiator = false) => {
    if (peerConnections.current[peerId]) {
      return peerConnections.current[peerId];
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current[peerId] = pc;

    // Upfront audio & video transceivers prevent renegotiation race conditions on mobile
    try {
      pc.addTransceiver('audio', { direction: 'sendrecv' });
      pc.addTransceiver('video', { direction: 'sendrecv' });
    } catch (e) {
      console.debug('Transceivers initialization fallback:', e);
    }

    // Add local tracks to peer connection if available
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        const senders = pc.getSenders();
        const existing = senders.find(s => s.track && s.track.kind === track.kind);
        if (existing) {
          existing.replaceTrack(track).catch(() => {});
        } else {
          try {
            pc.addTrack(track, localStreamRef.current);
          } catch (e) {}
        }
      });
    }

    // Handle ICE candidate generation
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc:signal', {
          to: peerId,
          signal: event.candidate,
          type: 'candidate'
        });
      }
    };

    // Handle incoming remote track
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      setPeers(prev => ({
        ...prev,
        [peerId]: {
          ...prev[peerId],
          stream: remoteStream,
          userName: peerName || prev[peerId]?.userName || 'Member',
          avatarColor: peerColor || prev[peerId]?.avatarColor || '#5865f2'
        }
      }));
    };

    // If initiator, create and send offer
    if (isInitiator) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('webrtc:signal', {
            to: peerId,
            signal: pc.localDescription,
            type: 'offer'
          });
        })
        .catch(err => console.error('Error creating offer:', err));
    }

    return pc;
  }, []);

  // Socket signaling listeners
  useEffect(() => {
    if (!isInCall) return;

    // Existing peers already in the room when we joined
    const handleExistingPeers = ({ peers: existingPeersList }) => {
      if (!Array.isArray(existingPeersList)) return;
      existingPeersList.forEach(peer => {
        if (peer.peerId && peer.peerId !== socket.id) {
          createPeerConnection(peer.peerId, peer.userName, peer.avatarColor, true);
        }
      });
    };

    // Another peer joined the call -> initiator sends offer
    const handlePeerJoined = ({ peerId, userName, avatarColor }) => {
      if (peerId === socket.id) return;
      createPeerConnection(peerId, userName, avatarColor, true);
    };

    // Receive WebRTC signal (offer, answer, or candidate)
    const handleSignal = async ({ from, fromName, signal, type }) => {
      if (from === socket.id) return;

      let pc = peerConnections.current[from];

      if (type === 'offer') {
        if (!pc) {
          pc = createPeerConnection(from, fromName, '#5865f2', false);
        }
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('webrtc:signal', {
          to: from,
          signal: answer,
          type: 'answer'
        });
      } else if (type === 'answer') {
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
        }
      } else if (type === 'candidate') {
        if (pc && signal) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal));
          } catch (e) {
            console.warn('Error adding ICE candidate:', e);
          }
        }
      }
    };

    // Peer toggled mic/camera
    const handleMediaStateUpdated = ({ peerId, isMuted, isCameraOff }) => {
      setPeers(prev => {
        if (!prev[peerId]) return prev;
        return {
          ...prev,
          [peerId]: {
            ...prev[peerId],
            isMuted,
            isCameraOff
          }
        };
      });
    };

    // Peer left call
    const handlePeerLeft = ({ peerId }) => {
      if (peerConnections.current[peerId]) {
        peerConnections.current[peerId].close();
        delete peerConnections.current[peerId];
      }
      setPeers(prev => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    };

    socket.on('webrtc:existing-peers', handleExistingPeers);
    socket.on('webrtc:peer-joined', handlePeerJoined);
    socket.on('webrtc:signal', handleSignal);
    socket.on('webrtc:media-state-updated', handleMediaStateUpdated);
    socket.on('webrtc:peer-left', handlePeerLeft);

    // Announce to room that we joined call
    socket.emit('webrtc:join-call');

    return () => {
      socket.off('webrtc:existing-peers', handleExistingPeers);
      socket.off('webrtc:peer-joined', handlePeerJoined);
      socket.off('webrtc:signal', handleSignal);
      socket.off('webrtc:media-state-updated', handleMediaStateUpdated);
      socket.off('webrtc:peer-left', handlePeerLeft);
    };
  }, [isInCall, createPeerConnection]);

  // Join Call (Start Mic or Video)
  const joinCall = async (withVideo = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: withVideo ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 360 } } : false
      });

      localStreamRef.current = stream;
      setIsInCall(true);
      setIsMicOn(true);
      setIsCameraOn(withVideo);
      attachLocalStreamToPeers(stream);

      // Notify room of initial media state
      socket.emit('webrtc:media-state', {
        isMuted: false,
        isCameraOff: !withVideo,
        isScreenSharing: false
      });
    } catch (err) {
      console.warn('Camera/Mic permission fallback:', err);
      // Fallback to audio only if video failed
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = audioStream;
        setIsInCall(true);
        setIsMicOn(true);
        setIsCameraOn(false);
        attachLocalStreamToPeers(audioStream);
      } catch (audioErr) {
        console.warn('Microphone permission deferred or denied:', audioErr);
        setIsInCall(true);
        setIsMicOn(false);
        setIsCameraOn(false);
      }
    }
  };

  // Leave Call
  const leaveCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    Object.values(peerConnections.current).forEach(pc => pc.close());
    peerConnections.current = {};

    setIsInCall(false);
    setIsMicOn(false);
    setIsCameraOn(false);
    setIsScreenSharing(false);
    setPeers({});

    socket.emit('webrtc:leave-call');
  };

  // Toggle Microphone (with auto-request fallback on user gesture)
  const toggleMic = async () => {
    if (!localStreamRef.current || localStreamRef.current.getAudioTracks().length === 0) {
      const stream = await startVoice();
      if (!stream) {
        setIsMicOn(false);
      }
      return;
    }

    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMicOn(audioTrack.enabled);
      socket.emit('webrtc:media-state', {
        isMuted: !audioTrack.enabled,
        isCameraOff: !isCameraOn,
        isScreenSharing
      });
    }
  };

  // Toggle Camera (with mobile-friendly constraints and no alert popups)
  const toggleCamera = async () => {
    if (isCameraOn) {
      // Turn off camera
      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.stop();
        localStreamRef.current.removeTrack(videoTrack);
      }
      setIsCameraOn(false);

      // Update peer connections
      Object.values(peerConnections.current).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) pc.removeTrack(sender);
      });

      socket.emit('webrtc:media-state', {
        isMuted: !isMicOn,
        isCameraOff: true,
        isScreenSharing
      });
    } else {
      // Turn on camera with mobile-friendly constraints
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;

      let videoStream = null;
      try {
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 360 } }
        });
      } catch (e1) {
        try {
          videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (e2) {
          console.warn('Camera permission denied or camera unavailable:', e2);
          return;
        }
      }

      if (videoStream) {
        const newVideoTrack = videoStream.getVideoTracks()[0];

        if (localStreamRef.current) {
          localStreamRef.current.addTrack(newVideoTrack);
        } else {
          localStreamRef.current = videoStream;
        }

        setIsCameraOn(true);

        // Add track to existing peer connections
        Object.values(peerConnections.current).forEach(pc => {
          pc.addTrack(newVideoTrack, localStreamRef.current);
        });

        socket.emit('webrtc:media-state', {
          isMuted: !isMicOn,
          isCameraOff: false,
          isScreenSharing
        });
      }
    }
  };

  // Toggle Screen Share
  const toggleScreenShare = async () => {
    if (!isInCall) {
      await joinCall(false);
    }

    if (isScreenSharing) {
      // Stop screen share -> revert to camera if it was on
      const screenTrack = localStreamRef.current?.getVideoTracks()[0];
      if (screenTrack) screenTrack.stop();
      setIsScreenSharing(false);
      setIsCameraOn(false);
    } else {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const screenTrack = displayStream.getVideoTracks()[0];

        // Replace or add track to peers
        Object.values(peerConnections.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          } else {
            pc.addTrack(screenTrack, displayStream);
          }
        });

        screenTrack.onended = () => {
          setIsScreenSharing(false);
        };

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = displayStream;
        }

        setIsScreenSharing(true);
        setIsCameraOn(true);
      } catch (err) {
        console.warn('Screen share canceled:', err);
      }
    }
  };

  // Derive full participants list from room members (so all room members always appear in Meet grid)
  const currentUserId = currentUser?.id || socket.id;
  const remoteMemberList = (members || []).filter(m => 
    m.id !== currentUserId && 
    m.id !== socket.id &&
    (!currentUser?.sessionId || m.sessionId !== currentUser.sessionId)
  );

  // Merge any WebRTC peers that might not yet be in members array
  const remotePeerIds = new Set(remoteMemberList.map(m => m.id));
  const extraPeers = Object.entries(peers)
    .filter(([peerId]) => !remotePeerIds.has(peerId) && peerId !== socket.id)
    .map(([peerId, data]) => ({
      id: peerId,
      name: data.userName || 'Member',
      avatarColor: data.avatarColor || '#5865f2',
      isMuted: data.isMuted,
      isCameraOff: data.isCameraOff
    }));

  const allRemoteParticipants = [...remoteMemberList, ...extraPeers];
  const totalCallCount = allRemoteParticipants.length + 1;
  const hasActiveVideo = isCameraOn || isScreenSharing || Object.values(peers).some(p => !p.isCameraOff && p.stream?.getVideoTracks().length > 0);

  return (
    <div className="w-full flex flex-col transition-all flex-shrink-0 z-20">
      
      {/* Permanent hidden audio elements for remote peers: guarantees uninterrupted mobile voice lounge */}
      <div className="hidden" aria-hidden="true">
        {Object.entries(peers).map(([peerId, peerData]) => (
          <audio
            key={`audio-${peerId}`}
            ref={(el) => {
              if (el && peerData.stream) {
                if (el.srcObject !== peerData.stream) {
                  el.srcObject = peerData.stream;
                }
                el.play().catch(err => {
                  console.debug('Autoplay deferred until interaction:', err);
                });
              }
            }}
            autoPlay
            playsInline
          />
        ))}
      </div>

      {/* 1. GOOGLE MEET FLOATING CALL CONTROL DOCK */}
      <div className="h-12 bg-[#202124]/95 border-b border-[#3c4043]/50 px-2.5 sm:px-4 flex items-center justify-between backdrop-blur-md select-none">
        
        {/* Left: Voice Status & Participant Avatars */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-[#34a853] animate-pulse" />
            <span className="text-xs font-semibold text-[#e8eaed] hidden xs:inline tracking-wide">
              Voice Lounge
            </span>
            <span className="text-[11px] font-mono font-bold bg-[#34a853]/15 text-[#34a853] px-2 py-0.5 rounded-full border border-[#34a853]/30">
              {totalCallCount}
            </span>
          </div>

          <div className="hidden sm:block h-4 w-[1px] bg-[#3c4043]" />

          {/* Connected Voice Members Facepile */}
          <div className="flex items-center -space-x-2 overflow-hidden">
            {/* Current user's avatar */}
            <div 
              className={`relative w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow ring-2 flex-shrink-0 transition-all ${
                isMicOn ? 'ring-[#34a853]' : 'ring-[#ea4335]'
              }`}
              style={{ backgroundColor: currentUser?.avatarColor || '#5865f2' }}
              title={`${currentUser?.name || 'You'} (${isMicOn ? 'Microphone Active' : 'Microphone Muted'})`}
            >
              {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
              {!isMicOn && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#ea4335] rounded-full border border-[#202124]" />
              )}
            </div>

            {/* Remote members' avatars */}
            {allRemoteParticipants.map((member) => {
              const peerData = peers[member.id] || {};
              const isMuted = peerData.isMuted ?? member.isMuted ?? false;
              return (
                <div 
                  key={member.id}
                  className={`relative w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow ring-2 flex-shrink-0 transition-all ${
                    isMuted ? 'ring-[#ea4335]' : 'ring-[#34a853]'
                  }`}
                  style={{ backgroundColor: member.avatarColor || '#5865f2' }}
                  title={`${member.name || 'Member'} (${isMuted ? 'Muted' : 'Speaking'})`}
                >
                  {member.name?.charAt(0).toUpperCase() || 'P'}
                </div>
              );
            })}
          </div>
        </div>

        {/* Center / Right: Google Meet Style Rounded Action Pill Bar */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          
          {/* Mic Button */}
          <button
            onClick={toggleMic}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all shadow-sm active:scale-95 ${
              isMicOn
                ? 'bg-[#3c4043] hover:bg-[#4a4e52] text-white border border-[#5f6368]/30'
                : 'bg-[#ea4335] hover:bg-[#d93025] text-white shadow-md shadow-[#ea4335]/30 animate-pulse'
            }`}
            title={isMicOn ? 'Turn off microphone' : 'Turn on microphone'}
            aria-label={isMicOn ? 'Turn off microphone' : 'Turn on microphone'}
          >
            {isMicOn ? <Mic className="w-4 h-4 text-white" /> : <MicOff className="w-4 h-4 text-white" />}
          </button>

          {/* Camera Button */}
          <button
            onClick={toggleCamera}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all shadow-sm active:scale-95 ${
              isCameraOn
                ? 'bg-[#3c4043] hover:bg-[#4a4e52] text-white border border-[#5f6368]/30 ring-2 ring-[#34a853]/50'
                : 'bg-[#3c4043] hover:bg-[#4a4e52] text-[#9aa0a6] hover:text-white border border-[#5f6368]/20'
            }`}
            title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
            aria-label={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
          >
            {isCameraOn ? <Video className="w-4 h-4 text-[#34a853]" /> : <VideoOff className="w-4 h-4" />}
          </button>

          {/* Screen Share Button (Desktop Only) */}
          <button
            onClick={toggleScreenShare}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full hidden sm:flex items-center justify-center transition-all border border-[#5f6368]/30 active:scale-95 ${
              isScreenSharing
                ? 'bg-[#1a73e8] hover:bg-[#1557b0] text-white ring-2 ring-[#8ab4f8]'
                : 'bg-[#3c4043] hover:bg-[#4a4e52] text-white'
            }`}
            title={isScreenSharing ? 'Stop screen sharing' : 'Present screen'}
            aria-label={isScreenSharing ? 'Stop screen sharing' : 'Present screen'}
          >
            <ScreenShare className="w-4 h-4" />
          </button>

          {/* Layout Mode Switcher */}
          <button
            onClick={onToggleLayoutMode}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all border border-[#5f6368]/30 active:scale-95 ${
              layoutMode === 'grid'
                ? 'bg-[#1a73e8] hover:bg-[#1557b0] text-white'
                : 'bg-[#3c4043] hover:bg-[#4a4e52] text-white'
            }`}
            title={layoutMode === 'grid' ? 'Switch to Theater Mode' : 'Switch to Grid View'}
            aria-label={layoutMode === 'grid' ? 'Switch to Theater Mode' : 'Switch to Grid View'}
          >
            {layoutMode === 'grid' ? <Tv className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
          </button>

          {/* Leave Call Button (Red Google Meet Pill) */}
          <button
            onClick={onLeaveRoom || leaveCall}
            className="h-9 sm:h-10 px-3.5 sm:px-4 rounded-full bg-[#ea4335] hover:bg-[#d93025] text-white flex items-center gap-1.5 shadow-md shadow-[#ea4335]/30 active:scale-95 transition-all flex-shrink-0"
            title="Leave call"
            aria-label="Leave call"
          >
            <PhoneOff className="w-4 h-4 text-white" />
            <span className="text-xs font-bold hidden md:inline">Leave</span>
          </button>
        </div>

      </div>

      {/* 2. MAIN CONTENT: THEATER VIEW vs GOOGLE MEET VIEW */}
      {layoutMode === 'grid' ? (
        /* GOOGLE MEET FULL VIEW: Shared Music Video Stage + All Participants Meet Grid Side-by-Side */
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden bg-[#111214] p-0 sm:p-2.5 gap-2 sm:gap-2.5">
          
          {/* Main: Shared Music Video Stage */}
          {children ? (
            <div className="flex-1 min-h-[180px] sm:min-h-[250px] lg:min-h-0 w-full relative flex items-center justify-center bg-black rounded-none sm:rounded-xl overflow-hidden shadow-2xl border-0 sm:border border-[#3c4043]/40">
              {children}
            </div>
          ) : null}

          {/* Side: Google Meet Participants Grid (All room members visible!) */}
          <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 flex flex-col min-h-[160px] lg:min-h-0 bg-[#1e1f22] rounded-xl border border-[#3c4043]/40 overflow-hidden shadow-xl">
            <div className="h-8 px-3 bg-[#202124] border-b border-[#3c4043]/40 flex items-center justify-between flex-shrink-0 select-none">
              <span className="text-[11px] font-bold text-[#e8eaed] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#34a853]" />
                <span>Meeting Grid ({totalCallCount})</span>
              </span>
              <span className="text-[10px] text-[#34a853] bg-[#34a853]/15 border border-[#34a853]/30 px-2 py-0.5 rounded-full font-bold">
                Live
              </span>
            </div>

            <div className="flex-1 p-2 grid grid-cols-2 lg:grid-cols-1 gap-2 overflow-y-auto no-scrollbar">
              {/* USER'S OWN VIDEO TILE */}
              <div 
                className="relative rounded-xl overflow-hidden bg-[#202124] border border-[#3c4043] flex items-center justify-center shadow-md aspect-video min-h-[120px]"
              >
                {isCameraOn || isScreenSharing ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${!isScreenSharing ? 'scale-x-[-1]' : ''}`}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-2 select-none">
                    <div 
                      className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-md mb-1 ring-2 ${
                        isMicOn ? 'ring-[#34a853]' : 'ring-[#ea4335]'
                      }`}
                      style={{ backgroundColor: currentUser?.avatarColor || '#5865f2' }}
                    >
                      {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <span className="text-[10px] text-[#9aa0a6] font-medium">Camera Off</span>
                  </div>
                )}

                {/* Tile Info Bar */}
                <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[11px] font-semibold text-white pointer-events-none drop-shadow">
                  <span className="bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded truncate max-w-[100px]">
                    {currentUser?.name || 'You'} (You)
                  </span>
                  <div className="bg-black/70 backdrop-blur-sm p-1 rounded-full">
                    {isMicOn ? (
                      <Mic className="w-3 h-3 text-[#34a853]" />
                    ) : (
                      <MicOff className="w-3 h-3 text-[#ea4335]" />
                    )}
                  </div>
                </div>
              </div>

              {/* REMOTE MEMBERS' VIDEO TILES */}
              {allRemoteParticipants.map((member) => {
                const peerData = peers[member.id] || {
                  userName: member.name,
                  avatarColor: member.avatarColor,
                  isMuted: member.isMuted ?? false,
                  isCameraOff: true,
                  stream: null
                };
                return (
                  <RemotePeerTile
                    key={member.id}
                    peerId={member.id}
                    peerData={peerData}
                    layoutMode={layoutMode}
                  />
                );
              })}
            </div>
          </div>

        </div>
      ) : (
        /* THEATER VIEW: Focus on big screen, with optional camera strip at top */
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          {hasActiveVideo && (
            <div className="flex items-center gap-2 overflow-x-auto border-b border-[#2b2d31] p-2 bg-[#111214] no-scrollbar max-h-28 flex-shrink-0">
              {/* Compact local tile */}
              <div className="w-32 h-20 sm:w-44 sm:h-28 flex-shrink-0 relative rounded-xl overflow-hidden bg-[#202124] border border-[#3c4043] flex items-center justify-center shadow-lg">
                {isCameraOn || isScreenSharing ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${!isScreenSharing ? 'scale-x-[-1]' : ''}`}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-2 select-none">
                    <div 
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shadow ring-2 ${
                        isMicOn ? 'ring-[#34a853]' : 'ring-[#ea4335]'
                      }`}
                      style={{ backgroundColor: currentUser?.avatarColor || '#5865f2' }}
                    >
                      {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  </div>
                )}
                <div className="absolute bottom-1 left-1.5 right-1.5 flex items-center justify-between text-[10px] font-semibold text-white pointer-events-none drop-shadow">
                  <span className="bg-black/70 px-1.5 py-0.2 rounded truncate max-w-[80px]">
                    {currentUser?.name || 'You'} (You)
                  </span>
                  <div className="bg-black/70 p-0.5 rounded-full">
                    {isMicOn ? <Mic className="w-2.5 h-2.5 text-[#34a853]" /> : <MicOff className="w-2.5 h-2.5 text-[#ea4335]" />}
                  </div>
                </div>
              </div>

              {/* Compact remote tiles */}
              {allRemoteParticipants.map((member) => {
                const peerData = peers[member.id] || {
                  userName: member.name,
                  avatarColor: member.avatarColor,
                  isMuted: member.isMuted ?? false,
                  isCameraOff: true,
                  stream: null
                };
                return (
                  <RemotePeerTile
                    key={member.id}
                    peerId={member.id}
                    peerData={peerData}
                    layoutMode="strip"
                  />
                );
              })}
            </div>
          )}

          {/* Theater Screen Container - Full width and non-scrollable on mobile */}
          <div className="flex-1 min-h-0 relative flex items-center justify-center bg-[#111214] p-0 sm:p-3 overflow-hidden w-full select-none touch-none">
            {children}
          </div>
        </div>
      )}

    </div>
  );
}

// Individual Remote Video Tile Component
function RemotePeerTile({ peerId, peerData, layoutMode }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && peerData.stream) {
      videoRef.current.srcObject = peerData.stream;
    }
  }, [peerData.stream]);

  const hasVideoTrack = peerData.stream && peerData.stream.getVideoTracks().length > 0 && !peerData.isCameraOff;

  return (
    <div 
      className={`relative rounded-xl overflow-hidden bg-[#202124] border border-[#3c4043] flex items-center justify-center shadow-lg transition-all ${
        layoutMode === 'grid' 
          ? 'w-full aspect-video min-h-[120px]' 
          : 'w-32 h-20 sm:w-44 sm:h-28 flex-shrink-0'
      }`}
    >
      {hasVideoTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-center p-2 select-none">
          <div 
            className={`rounded-full flex items-center justify-center font-bold text-white shadow-md mb-1 ring-2 ${
              layoutMode === 'grid' ? 'w-11 h-11 text-sm' : 'w-9 h-9 text-xs'
            } ${peerData.isMuted ? 'ring-[#ea4335]' : 'ring-[#34a853]'}`}
            style={{ backgroundColor: peerData.avatarColor || '#5865f2' }}
          >
            {peerData.userName?.charAt(0).toUpperCase() || 'P'}
          </div>
          {layoutMode === 'grid' && (
            <span className="text-[10px] text-[#9aa0a6] font-medium">Camera Off</span>
          )}
        </div>
      )}

      {/* Tile Info Bar */}
      <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[11px] font-semibold text-white pointer-events-none drop-shadow">
        <span className="bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded truncate max-w-[100px]">
          {peerData.userName || 'Member'}
        </span>
        <div className="bg-black/70 backdrop-blur-sm p-1 rounded-full">
          {peerData.isMuted ? (
            <MicOff className="w-3 h-3 text-[#ea4335]" />
          ) : (
            <Mic className="w-3 h-3 text-[#34a853]" />
          )}
        </div>
      </div>
    </div>
  );
}

