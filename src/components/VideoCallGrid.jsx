import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  ScreenShare, 
  LayoutGrid, 
  Tv, 
  Users, 
  PhoneOff, 
  ArrowLeft,
  Copy,
  Check,
  Share2,
  SwitchCamera
} from 'lucide-react';
import socket from '../services/socket';

// STUN + OpenRelay TURN servers (guarantees WebRTC mobile carrier / symmetric NAT traversal)
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelay',
      credential: 'openrelay'
    }
  ]
};

export default function VideoCallGrid({
  room,
  currentUser,
  members = [],
  layoutMode = 'grid', // 'grid' (Google Meet full view) | 'strip' (Theater stage)
  onToggleLayoutMode,
  onLeaveRoom,
  children
}) {
  const [isInCall, setIsInCall] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [peers, setPeers] = useState({}); // { [peerId]: { stream, userName, avatarColor, isMuted, isCameraOff } }
  const [copied, setCopied] = useState(false);

  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const peerConnections = useRef({}); // { [peerId]: RTCPeerConnection }

  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/?room=${room?.id || ''}` : '';

  const copyInviteLink = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareInviteLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join my meeting on afterspot: ${room?.name || 'Meeting'}`,
          url: inviteUrl
        });
        return;
      } catch (e) {}
    }
    copyInviteLink();
  };

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

    // Upfront audio & video transceivers prevent renegotiation race conditions
    try {
      pc.addTransceiver('audio', { direction: 'sendrecv' });
      pc.addTransceiver('video', { direction: 'sendrecv' });
    } catch (e) {
      console.debug('Transceivers fallback:', e);
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

    // Handle incoming remote track (ensure audio & video tracks are merged into single stream)
    pc.ontrack = (event) => {
      setPeers(prev => {
        let stream = prev[peerId]?.stream;
        if (!stream) {
          stream = event.streams[0] || new MediaStream();
        }
        if (!stream.getTracks().some(t => t.id === event.track.id)) {
          stream.addTrack(event.track);
        }
        return {
          ...prev,
          [peerId]: {
            ...prev[peerId],
            stream,
            userName: peerName || prev[peerId]?.userName || 'Member',
            avatarColor: peerColor || prev[peerId]?.avatarColor || '#5865f2'
          }
        };
      });
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

  // Socket signaling listeners with deterministic polite peer negotiation
  useEffect(() => {
    if (!isInCall) return;

    // Existing peers already in the room when we joined
    const handleExistingPeers = ({ peers: existingPeersList }) => {
      if (!Array.isArray(existingPeersList)) return;
      existingPeersList.forEach(peer => {
        if (peer.peerId && peer.peerId !== socket.id) {
          // Deterministic initiator: only one side initiates to prevent glare
          const isInitiator = socket.id > peer.peerId;
          createPeerConnection(peer.peerId, peer.userName, peer.avatarColor, isInitiator);
        }
      });
    };

    // Another peer joined the call
    const handlePeerJoined = ({ peerId, userName, avatarColor }) => {
      if (peerId === socket.id) return;
      const isInitiator = socket.id > peerId;
      createPeerConnection(peerId, userName, avatarColor, isInitiator);
    };

    // Receive WebRTC signal (offer, answer, or candidate)
    const handleSignal = async ({ from, fromName, signal, type }) => {
      if (from === socket.id) return;

      let pc = peerConnections.current[from];

      if (type === 'offer') {
        if (!pc) {
          pc = createPeerConnection(from, fromName, '#5865f2', false);
        }

        // Resolving glare with rollback if we also sent an offer
        if (pc.signalingState !== 'stable') {
          try {
            await Promise.all([
              pc.setLocalDescription({ type: 'rollback' }).catch(() => {}),
              pc.setRemoteDescription(new RTCSessionDescription(signal))
            ]);
          } catch (e) {
            console.warn('Rollback error:', e);
          }
        } else {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
          } catch (e) {
            console.warn('Error setting remote description:', e);
          }
        }

        try {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit('webrtc:signal', {
            to: from,
            signal: answer,
            type: 'answer'
          });
        } catch (e) {
          console.warn('Error creating/setting answer:', e);
        }
      } else if (type === 'answer') {
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal)).catch(e => console.warn('Answer set error:', e));
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

  // Toggle Microphone
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

  // Toggle Camera
  const toggleCamera = async () => {
    if (isCameraOn) {
      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.stop();
        localStreamRef.current.removeTrack(videoTrack);
      }
      setIsCameraOn(false);

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
          console.warn('Camera permission denied:', e2);
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

        Object.values(peerConnections.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(newVideoTrack).catch(() => {});
          } else {
            try {
              pc.addTrack(newVideoTrack, localStreamRef.current);
            } catch (e) {}
          }
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
    if (isScreenSharing) {
      const screenTrack = localStreamRef.current?.getVideoTracks()[0];
      if (screenTrack) screenTrack.stop();
      setIsScreenSharing(false);
      setIsCameraOn(false);
    } else {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const screenTrack = displayStream.getVideoTracks()[0];

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

  // Derive remote participants list from room members
  const currentUserId = currentUser?.id || socket.id;
  const remoteMemberList = (members || []).filter(m => 
    m.id !== currentUserId && 
    m.id !== socket.id &&
    (!currentUser?.sessionId || m.sessionId !== currentUser.sessionId)
  );

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
  const isAlone = allRemoteParticipants.length === 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#121212] overflow-hidden relative select-none">
      
      {/* Permanent rendered audio elements for remote peers (offscreen so mobile browsers never suspend playback) */}
      <div className="fixed -top-96 -left-96 w-1 h-1 opacity-0 pointer-events-none" aria-hidden="true">
        {Object.entries(peers).map(([peerId, peerData]) => (
          <audio
            key={`audio-${peerId}`}
            ref={(el) => {
              if (el && peerData.stream) {
                if (el.srcObject !== peerData.stream) {
                  el.srcObject = peerData.stream;
                }
                el.play().catch(err => {
                  console.debug('Autoplay deferred:', err);
                });
              }
            }}
            autoPlay
            playsInline
          />
        ))}
      </div>

      {/* 1. GOOGLE MEET TOP HEADER BAR */}
      <div className="h-14 px-4 bg-[#121212] flex items-center justify-between flex-shrink-0 z-30 select-none">
        <button 
          onClick={onLeaveRoom}
          className="w-10 h-10 rounded-full bg-[#202124] hover:bg-[#3c4043] text-white flex items-center justify-center transition-all active:scale-95 shadow-sm"
          title="Exit meeting"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Center Pill: "You're the only one here" or Room Title */}
        <div className="px-4 py-1.5 rounded-full bg-[#202124] border border-[#3c4043]/50 text-[#e8eaed] text-xs font-semibold flex items-center gap-2 shadow-sm">
          <span className={`w-2 h-2 rounded-full ${isMicOn ? 'bg-[#34a853] animate-pulse' : 'bg-[#ea4335]'}`} />
          <span className="truncate max-w-[200px]">
            {isAlone ? "You're the only one here" : `${room?.name || 'Meeting'} (${totalCallCount})`}
          </span>
        </div>

        {/* View Switcher: Theater View vs Meet Grid View */}
        <button 
          onClick={onToggleLayoutMode}
          className="w-10 h-10 rounded-full bg-[#202124] hover:bg-[#3c4043] text-white flex items-center justify-center transition-all active:scale-95 shadow-sm"
          title={layoutMode === 'grid' ? "Switch to Theater Stage" : "Switch to Google Meet Grid"}
        >
          {layoutMode === 'grid' ? <Tv className="w-5 h-5 text-[#8ab4f8]" /> : <LayoutGrid className="w-5 h-5 text-white" />}
        </button>
      </div>

      {/* 2. MAIN BODY (GOOGLE MEET UI) */}
      <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
        
        {/* CASE A: ALONE IN ROOM -> EXACT GOOGLE MEET EMPTY STATE */}
        {isAlone ? (
          <div className="flex-1 min-h-0 relative flex flex-col justify-center px-6 sm:px-12 bg-[#121212] overflow-hidden">
            
            {/* Google Meet Share Invite Card */}
            <div className="max-w-md w-full animate-fade-in z-10 pb-16">
              <h2 className="text-2xl sm:text-3xl font-medium text-white mb-2 tracking-tight">
                You're the only one here
              </h2>
              <p className="text-xs sm:text-sm text-[#9aa0a6] mb-5 leading-relaxed max-w-sm">
                Share this meeting link with others you want in the meeting
              </p>

              {/* Meeting Link Pill Box with Copy Action */}
              <div 
                onClick={copyInviteLink}
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#202124] border border-[#3c4043] text-[#e8eaed] text-xs sm:text-sm font-mono cursor-pointer hover:border-[#5f6368] active:scale-98 transition-all mb-4 shadow-md group"
              >
                <span className="truncate mr-2 text-[#8ab4f8]">{inviteUrl}</span>
                {copied ? <Check className="w-5 h-5 text-[#34a853] flex-shrink-0" /> : <Copy className="w-5 h-5 text-[#9aa0a6] group-hover:text-white flex-shrink-0" />}
              </div>

              {/* Google Meet Coral Pill Share Button */}
              <button 
                onClick={shareInviteLink}
                className="flex items-center gap-2.5 px-6 py-3 rounded-full bg-[#f28b82] hover:bg-[#f6aea9] text-[#202124] font-bold text-xs sm:text-sm shadow-xl active:scale-95 transition-all"
              >
                <Share2 className="w-4 h-4" />
                <span>Share invite</span>
              </button>
            </div>

            {/* Floating Self Video PIP Tile (bottom-right, exactly like Google Meet!) */}
            <div className="absolute bottom-24 sm:bottom-28 right-4 sm:right-8 w-32 h-44 sm:w-44 sm:h-56 rounded-2xl overflow-hidden shadow-2xl border-2 border-[#3c4043] bg-[#202124] flex items-center justify-center z-20">
              {isCameraOn || isScreenSharing ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${!isScreenSharing ? 'scale-x-[-1]' : ''}`}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-3 select-none">
                  <div 
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white shadow-md mb-1.5 ring-2 ${
                      isMicOn ? 'ring-[#34a853]' : 'ring-[#ea4335]'
                    }`}
                    style={{ backgroundColor: currentUser?.avatarColor || '#5865f2' }}
                  >
                    {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <span className="text-[10px] text-[#9aa0a6]">Camera Off</span>
                </div>
              )}

              {/* Camera Flip Button */}
              <button 
                onClick={toggleCamera} 
                className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/80 shadow transition-transform active:scale-90"
                title="Toggle / Flip Camera"
              >
                <SwitchCamera className="w-3.5 h-3.5" />
              </button>

              <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-semibold text-white">
                You
              </div>
            </div>

          </div>
        ) : (
          /* CASE B: MULTIPLE MEMBERS CONNECTED -> FULL GOOGLE MEET TILES */
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden bg-[#121212] p-2 gap-2">
            
            {/* If video/music is shared: Pinned Shared Stage */}
            {children ? (
              <div className="flex-1 min-h-[180px] sm:min-h-[240px] lg:min-h-0 w-full relative flex items-center justify-center bg-black rounded-xl overflow-hidden shadow-2xl border border-[#3c4043]/40">
                {children}
              </div>
            ) : null}

            {/* Google Meet Participant Grid */}
            <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 flex flex-col min-h-0 bg-[#1e1f22] rounded-xl border border-[#3c4043]/40 overflow-hidden shadow-xl">
              <div className="h-8 px-3 bg-[#202124] border-b border-[#3c4043]/40 flex items-center justify-between flex-shrink-0">
                <span className="text-[11px] font-bold text-[#e8eaed] flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#34a853]" />
                  <span>Participants ({totalCallCount})</span>
                </span>
                <span className="text-[10px] text-[#34a853] bg-[#34a853]/15 border border-[#34a853]/30 px-2 py-0.5 rounded-full font-bold">
                  Live
                </span>
              </div>

              <div className="flex-1 p-2 grid grid-cols-2 lg:grid-cols-1 gap-2 overflow-y-auto no-scrollbar">
                {/* User Tile */}
                <div className="relative rounded-xl overflow-hidden bg-[#202124] border border-[#3c4043] flex items-center justify-center shadow-md aspect-video min-h-[120px]">
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
                      <span className="text-[10px] text-[#9aa0a6]">Camera Off</span>
                    </div>
                  )}

                  <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[11px] font-semibold text-white pointer-events-none drop-shadow">
                    <span className="bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded truncate max-w-[100px]">
                      {currentUser?.name || 'You'} (You)
                    </span>
                    <div className="bg-black/70 backdrop-blur-sm p-1 rounded-full">
                      {isMicOn ? <Mic className="w-3 h-3 text-[#34a853]" /> : <MicOff className="w-3 h-3 text-[#ea4335]" />}
                    </div>
                  </div>
                </div>

                {/* Remote Member Tiles */}
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
                      layoutMode="grid"
                    />
                  );
                })}
              </div>
            </div>

          </div>
        )}

      </div>

      {/* 3. GOOGLE MEET FLOATING BOTTOM ACTION DOCK */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 sm:gap-3 px-4 py-2.5 rounded-full bg-[#202124]/95 backdrop-blur-md border border-[#3c4043] shadow-2xl">
        {/* Camera Toggle Button */}
        <button
          onClick={toggleCamera}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow active:scale-95 ${
            isCameraOn
              ? 'bg-[#3c4043] text-white hover:bg-[#4a4e52] border border-[#5f6368]/30'
              : 'bg-[#ea4335] text-white shadow-md shadow-[#ea4335]/30'
          }`}
          title={isCameraOn ? "Turn off camera" : "Turn on camera"}
          aria-label={isCameraOn ? "Turn off camera" : "Turn on camera"}
        >
          {isCameraOn ? <Video className="w-5 h-5 text-white" /> : <VideoOff className="w-5 h-5 text-white" />}
        </button>

        {/* Mic Toggle Button */}
        <button
          onClick={toggleMic}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow active:scale-95 ${
            isMicOn
              ? 'bg-[#3c4043] text-white hover:bg-[#4a4e52] border border-[#5f6368]/30'
              : 'bg-[#ea4335] text-white shadow-md shadow-[#ea4335]/30 animate-pulse'
          }`}
          title={isMicOn ? "Turn off microphone" : "Turn on microphone"}
          aria-label={isMicOn ? "Turn off microphone" : "Turn on microphone"}
        >
          {isMicOn ? <Mic className="w-5 h-5 text-white" /> : <MicOff className="w-5 h-5 text-white" />}
        </button>

        {/* Screen Share (Desktop only) */}
        <button
          onClick={toggleScreenShare}
          className={`w-11 h-11 rounded-full hidden sm:flex items-center justify-center transition-all border border-[#5f6368]/30 active:scale-95 ${
            isScreenSharing ? 'bg-[#1a73e8] text-white' : 'bg-[#3c4043] hover:bg-[#4a4e52] text-white'
          }`}
          title="Share screen"
          aria-label="Share screen"
        >
          <ScreenShare className="w-5 h-5" />
        </button>

        {/* Layout Switcher */}
        <button
          onClick={onToggleLayoutMode}
          className="w-11 h-11 rounded-full bg-[#3c4043] hover:bg-[#4a4e52] text-white flex items-center justify-center transition-all border border-[#5f6368]/30 active:scale-95"
          title={layoutMode === 'grid' ? "Switch to Theater Mode" : "Switch to Meet Grid"}
          aria-label="Switch Layout"
        >
          {layoutMode === 'grid' ? <Tv className="w-5 h-5 text-[#8ab4f8]" /> : <LayoutGrid className="w-5 h-5 text-white" />}
        </button>

        {/* Red End Call / Leave Button */}
        <button
          onClick={onLeaveRoom || leaveCall}
          className="h-11 px-5 rounded-full bg-[#ea4335] hover:bg-[#d93025] text-white flex items-center justify-center shadow-lg shadow-[#ea4335]/30 active:scale-95 transition-all"
          title="Leave meeting"
          aria-label="Leave meeting"
        >
          <PhoneOff className="w-5 h-5 text-white" />
        </button>
      </div>

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
      className="relative rounded-xl overflow-hidden bg-[#202124] border border-[#3c4043] flex items-center justify-center shadow-md aspect-video min-h-[120px]"
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
            className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-white shadow-md mb-1 ring-2 ${
              peerData.isMuted ? 'ring-[#ea4335]' : 'ring-[#34a853]'
            }`}
            style={{ backgroundColor: peerData.avatarColor || '#5865f2' }}
          >
            {peerData.userName?.charAt(0).toUpperCase() || 'P'}
          </div>
          <span className="text-[10px] text-[#9aa0a6] font-medium">Camera Off</span>
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
