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
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
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
  const [facingMode, setFacingMode] = useState('user'); // 'user' (front) | 'environment' (back)
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [peers, setPeers] = useState({}); // { [peerId]: { stream, userName, avatarColor, isMuted, isCameraOff } }
  const [copied, setCopied] = useState(false);
  const [, setLocalStreamTick] = useState(0);

  const localStreamRef = useRef(null);
  const peerConnections = useRef({}); // { [peerId]: RTCPeerConnection }
  const iceCandidatesQueue = useRef({}); // { [peerId]: RTCIceCandidateInit[] }

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

  // Helper to replace or add tracks on all active peer connections
  const attachLocalStreamToPeers = useCallback((stream) => {
    if (!stream) return;
    const tracks = stream.getTracks();

    Object.values(peerConnections.current).forEach(pc => {
      tracks.forEach(track => {
        // Find existing transceiver of the same kind
        const transceiver = pc.getTransceivers().find(t => 
          t.receiver.track.kind === track.kind || 
          (t.sender.track && t.sender.track.kind === track.kind)
        );

        if (transceiver && transceiver.sender) {
          transceiver.direction = 'sendrecv';
          transceiver.sender.replaceTrack(track).catch(err => {
            console.debug('[WebRTC] replaceTrack warning:', err);
          });
        } else {
          try {
            pc.addTrack(track, stream);
          } catch (e) {
            console.warn('[WebRTC] Could not add track to peer:', e);
          }
        }
      });
    });
  }, []);

  // Safe microphone acquisition with mobile fallbacks
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
      const newAudioTrack = stream.getAudioTracks()[0];
      if (localStreamRef.current) {
        if (newAudioTrack) localStreamRef.current.addTrack(newAudioTrack);
      } else {
        localStreamRef.current = stream;
      }

      setIsInCall(true);
      setIsMicOn(true);
      setLocalStreamTick(t => t + 1);
      attachLocalStreamToPeers(localStreamRef.current);

      socket.emit('webrtc:media-state', {
        isMuted: false,
        isCameraOff: !isCameraOn,
        isScreenSharing: false
      });

      // Announce ready to room peers
      socket.emit('webrtc:join-call');
    }
    return localStreamRef.current;
  }, [attachLocalStreamToPeers, isCameraOn]);

  // Robust Camera Acquisition with progressive constraints fallback
  const startCameraWithFacing = async (targetFacing) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('getUserMedia video not supported in this environment');
      return false;
    }

    // Stop existing video track if active
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => {
        t.stop();
        localStreamRef.current.removeTrack(t);
      });
    }

    const constraintsOptions = [
      { video: { facingMode: { ideal: targetFacing }, width: { ideal: 640 }, height: { ideal: 360 } }, audio: false },
      { video: { facingMode: targetFacing }, audio: false },
      { video: true, audio: false }
    ];

    let videoStream = null;
    for (const constraints of constraintsOptions) {
      try {
        videoStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoStream) break;
      } catch (err) {
        console.debug('[WebRTC] Camera constraint fallback:', constraints, err);
      }
    }

    if (!videoStream) {
      console.warn('[WebRTC] Unable to open camera on any supported constraints');
      setIsCameraOn(false);
      return false;
    }

    const newVideoTrack = videoStream.getVideoTracks()[0];
    if (!newVideoTrack) {
      setIsCameraOn(false);
      return false;
    }

    if (localStreamRef.current) {
      localStreamRef.current.addTrack(newVideoTrack);
    } else {
      localStreamRef.current = videoStream;
    }

    setIsCameraOn(true);
    setLocalStreamTick(t => t + 1);

    // Update all peer connections with the active video track
    Object.values(peerConnections.current).forEach(pc => {
      const videoTransceiver = pc.getTransceivers().find(t => 
        t.receiver.track.kind === 'video' || 
        (t.sender.track && t.sender.track.kind === 'video')
      );

      if (videoTransceiver && videoTransceiver.sender) {
        videoTransceiver.direction = 'sendrecv';
        videoTransceiver.sender.replaceTrack(newVideoTrack).catch(err => {
          console.warn('[WebRTC] replaceTrack error for video:', err);
        });
      } else {
        try {
          pc.addTrack(newVideoTrack, localStreamRef.current);
        } catch (e) {
          console.warn('[WebRTC] addTrack error for video:', e);
        }
      }
    });

    socket.emit('webrtc:media-state', {
      isMuted: !isMicOn,
      isCameraOff: false,
      isScreenSharing
    });

    return true;
  };

  // Flip Camera between front & back on mobile
  const flipCamera = async () => {
    if (!isCameraOn) {
      await toggleCamera();
      return;
    }
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacing);
    await startCameraWithFacing(nextFacing);
  };

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

  // Mobile browser autoplay policy unlocker
  useEffect(() => {
    const unlockAudio = () => {
      document.querySelectorAll('audio').forEach(audio => {
        if (audio.paused && audio.srcObject) {
          audio.play().catch(() => {});
        }
      });
    };

    window.addEventListener('click', unlockAudio, { passive: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  // Create Peer Connection for a specific remote peer
  const createPeerConnection = useCallback((peerId, peerName, peerColor, isInitiator = false) => {
    if (peerConnections.current[peerId]) {
      return peerConnections.current[peerId];
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current[peerId] = pc;
    iceCandidatesQueue.current[peerId] = [];

    // Pre-allocate audio & video transceivers to prevent negotiation race conditions
    let audioTransceiver = null;
    let videoTransceiver = null;
    try {
      audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
      videoTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
    } catch (e) {
      console.debug('[WebRTC] Transceivers fallback:', e);
    }

    // Attach local audio track if ready
    const localAudioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (localAudioTrack) {
      if (audioTransceiver?.sender) {
        audioTransceiver.sender.replaceTrack(localAudioTrack).catch(() => {});
      } else {
        try { pc.addTrack(localAudioTrack, localStreamRef.current); } catch (e) {}
      }
    }

    // Attach local video track if camera is on
    const localVideoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (localVideoTrack && isCameraOn) {
      if (videoTransceiver?.sender) {
        videoTransceiver.sender.replaceTrack(localVideoTrack).catch(() => {});
      } else {
        try { pc.addTrack(localVideoTrack, localStreamRef.current); } catch (e) {}
      }
    }

    // ICE Candidate generation
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc:signal', {
          to: peerId,
          signal: event.candidate,
          type: 'candidate'
        });
      }
    };

    // Auto-restart ICE if connection fails
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        try {
          pc.restartIce();
        } catch (e) {}
      }
    };

    // Handle incoming remote tracks (ensure audio & video tracks are merged into single stream)
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
            stream: new MediaStream(stream.getTracks()),
            userName: peerName || prev[peerId]?.userName || 'Member',
            avatarColor: peerColor || prev[peerId]?.avatarColor || '#5865f2'
          }
        };
      });
    };

    // Negotiation Needed Handler
    pc.onnegotiationneeded = async () => {
      try {
        if (pc.signalingState !== 'stable') return;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc:signal', {
          to: peerId,
          signal: pc.localDescription,
          type: 'offer'
        });
      } catch (err) {
        console.debug('[WebRTC] onnegotiationneeded handled:', err);
      }
    };

    // If initiator, create and send initial offer
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
        .catch(err => console.error('[WebRTC] Error creating offer:', err));
    }

    return pc;
  }, [isCameraOn]);

  // Socket signaling listeners with deterministic polite peer negotiation & candidate queueing
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
            console.warn('[WebRTC] Rollback error:', e);
          }
        } else {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
          } catch (e) {
            console.warn('[WebRTC] Error setting remote description:', e);
          }
        }

        // Flush any queued ICE candidates
        if (iceCandidatesQueue.current[from]?.length > 0) {
          for (const cand of iceCandidatesQueue.current[from]) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (e) {}
          }
          iceCandidatesQueue.current[from] = [];
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
          console.warn('[WebRTC] Error creating/setting answer:', e);
        }
      } else if (type === 'answer') {
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal)).catch(e => console.warn('[WebRTC] Answer set error:', e));

          // Flush any queued ICE candidates
          if (iceCandidatesQueue.current[from]?.length > 0) {
            for (const cand of iceCandidatesQueue.current[from]) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (e) {}
            }
            iceCandidatesQueue.current[from] = [];
          }
        }
      } else if (type === 'candidate') {
        if (pc && signal) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(signal));
            } catch (e) {
              console.warn('[WebRTC] Error adding ICE candidate:', e);
            }
          } else {
            // Buffer candidate until remote description is ready
            if (!iceCandidatesQueue.current[from]) {
              iceCandidatesQueue.current[from] = [];
            }
            iceCandidatesQueue.current[from].push(signal);
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
      delete iceCandidatesQueue.current[peerId];
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
    iceCandidatesQueue.current = {};

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
      // Turn camera OFF cleanly while preserving transceiver in SDP
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(t => {
          t.stop();
          localStreamRef.current.removeTrack(t);
        });
      }
      setIsCameraOn(false);
      setLocalStreamTick(t => t + 1);

      Object.values(peerConnections.current).forEach(pc => {
        const videoTransceiver = pc.getTransceivers().find(t => 
          t.receiver.track.kind === 'video' || 
          (t.sender.track && t.sender.track.kind === 'video')
        );
        if (videoTransceiver && videoTransceiver.sender) {
          videoTransceiver.sender.replaceTrack(null).catch(() => {});
        }
      });

      socket.emit('webrtc:media-state', {
        isMuted: !isMicOn,
        isCameraOff: true,
        isScreenSharing
      });
    } else {
      // Turn camera ON
      await startCameraWithFacing(facingMode);
    }
  };

  // Toggle Screen Share (Desktop)
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      const screenTrack = localStreamRef.current?.getVideoTracks()[0];
      if (screenTrack) screenTrack.stop();
      setIsScreenSharing(false);
      setIsCameraOn(false);
      setLocalStreamTick(t => t + 1);
    } else {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const screenTrack = displayStream.getVideoTracks()[0];

        Object.values(peerConnections.current).forEach(pc => {
          const videoTransceiver = pc.getTransceivers().find(t => 
            t.receiver.track.kind === 'video' || 
            (t.sender.track && t.sender.track.kind === 'video')
          );
          if (videoTransceiver && videoTransceiver.sender) {
            videoTransceiver.sender.replaceTrack(screenTrack).catch(() => {});
          } else {
            try { pc.addTrack(screenTrack, displayStream); } catch (e) {}
          }
        });

        screenTrack.onended = () => {
          setIsScreenSharing(false);
          setLocalStreamTick(t => t + 1);
        };

        if (localStreamRef.current) {
          const oldVideo = localStreamRef.current.getVideoTracks()[0];
          if (oldVideo) localStreamRef.current.removeTrack(oldVideo);
          localStreamRef.current.addTrack(screenTrack);
        } else {
          localStreamRef.current = displayStream;
        }

        setIsScreenSharing(true);
        setIsCameraOn(true);
        setLocalStreamTick(t => t + 1);
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
        {Object.entries(peers).map(([peerId, peerData]) => {
          if (!peerData.stream) return null;
          return (
            <RemoteAudioPlayer
              key={`audio-${peerId}`}
              stream={peerData.stream}
              isMuted={peerData.isMuted}
            />
          );
        })}
      </div>

      {/* 1. GOOGLE MEET TOP BAR */}
      <div className="h-14 px-4 flex items-center justify-between z-30 flex-shrink-0 bg-[#121212]">
        {/* Back / Leave circle button */}
        <button
          onClick={onLeaveRoom || leaveCall}
          className="w-10 h-10 rounded-full flex items-center justify-center text-[#e8eaed] hover:bg-[#3c4043]/60 active:scale-95 transition-all"
          title="Back to Lounge"
          aria-label="Back to Lounge"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Center Room Pill */}
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#202124] border border-[#3c4043]/50 text-xs font-medium text-[#e8eaed] shadow-sm max-w-[200px] sm:max-w-xs truncate">
          <span className="w-2 h-2 rounded-full bg-[#34a853] animate-pulse flex-shrink-0" />
          <span className="truncate">{isAlone ? "You're the only one here" : (room?.name || 'Meeting')}</span>
        </div>

        {/* Right audio indicator / View switcher */}
        <button
          onClick={onToggleLayoutMode}
          className="w-10 h-10 rounded-full flex items-center justify-center text-[#e8eaed] hover:bg-[#3c4043]/60 active:scale-95 transition-all"
          title={layoutMode === 'grid' ? "Theater Stage" : "Meet Grid"}
          aria-label="Toggle Layout"
        >
          {layoutMode === 'grid' ? <Tv className="w-5 h-5 text-[#8ab4f8]" /> : <LayoutGrid className="w-5 h-5 text-[#e8eaed]" />}
        </button>
      </div>

      {/* 2. MAIN CALL STAGE */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">

        {isAlone ? (
          /* CASE A: USER IS ALONE IN ROOM -> GOOGLE MEET WAITING SCREEN */
          <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 max-w-lg mx-auto w-full relative z-10 pb-28">
            
            <h1 className="text-2xl sm:text-3xl font-semibold text-[#e8eaed] tracking-tight mb-2">
              You're the only one here
            </h1>
            <p className="text-xs sm:text-sm text-[#9aa0a6] mb-6">
              Share this meeting link with others you want in the meeting
            </p>

            {/* Google Meet Invite Link Box */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#202124] border border-[#3c4043] text-xs sm:text-sm text-[#e8eaed] mb-4 shadow-lg">
              <span className="truncate pr-3 font-mono text-[#8ab4f8]">{inviteUrl || 'afterspot.vercel.app'}</span>
              <button
                onClick={copyInviteLink}
                className="p-1.5 rounded-lg hover:bg-[#3c4043] text-[#9aa0a6] hover:text-white transition-colors flex-shrink-0"
                title="Copy Link"
              >
                {copied ? <Check className="w-4 h-4 text-[#34a853]" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            {/* Coral Share Invite Pill */}
            <div>
              <button 
                onClick={shareInviteLink}
                className="flex items-center gap-2.5 px-6 py-3 rounded-full bg-[#f28b82] hover:bg-[#f6aea9] text-[#202124] font-bold text-xs sm:text-sm shadow-xl active:scale-95 transition-all"
              >
                <Share2 className="w-4 h-4" />
                <span>Share invite</span>
              </button>
            </div>

            {/* Floating Self Video PIP Tile (Google Meet PIP Tile) */}
            <div className="absolute bottom-24 sm:bottom-28 right-4 sm:right-8 w-32 h-44 sm:w-44 sm:h-56 rounded-2xl overflow-hidden shadow-2xl border-2 border-[#3c4043] bg-[#202124] flex items-center justify-center z-20">
              {isCameraOn || isScreenSharing ? (
                <LocalVideoView 
                  stream={localStreamRef.current} 
                  isScreenSharing={isScreenSharing} 
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
                onClick={flipCamera} 
                className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/80 shadow transition-transform active:scale-90"
                title={isCameraOn ? "Flip Camera" : "Turn On Camera"}
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
                {/* User's Own Tile */}
                <div className="relative rounded-xl overflow-hidden bg-[#202124] border border-[#3c4043] flex items-center justify-center shadow-md aspect-video min-h-[120px]">
                  {isCameraOn || isScreenSharing ? (
                    <LocalVideoView 
                      stream={localStreamRef.current} 
                      isScreenSharing={isScreenSharing} 
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

// Dedicated Local Video View ensuring proper autoPlay & playsInline
function LocalVideoView({ stream, isScreenSharing }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    el.play().catch(e => console.debug('[WebRTC] Local video play error:', e));
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={`w-full h-full object-cover ${!isScreenSharing ? 'scale-x-[-1]' : ''}`}
    />
  );
}

// Individual Remote Video Tile Component
function RemotePeerTile({ peerId, peerData, layoutMode }) {
  const videoRef = useRef(null);

  const hasVideoTrack = Boolean(
    peerData.stream && 
    peerData.stream.getVideoTracks().length > 0 && 
    peerData.stream.getVideoTracks().some(t => t.readyState === 'live') &&
    !peerData.isCameraOff
  );

  useEffect(() => {
    const el = videoRef.current;
    if (el && peerData.stream && hasVideoTrack) {
      el.srcObject = peerData.stream;
      el.play().catch(e => console.debug('[WebRTC] Remote video play error:', e));
    }
  }, [peerData.stream, hasVideoTrack]);

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

// Dedicated Remote Audio Player Component
function RemoteAudioPlayer({ stream, isMuted }) {
  const audioRef = useRef(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !stream) return;

    el.srcObject = stream;
    el.muted = Boolean(isMuted);

    const tryPlay = () => {
      const p = el.play();
      if (p !== undefined) {
        p.catch(err => {
          console.debug('[WebRTC] Remote audio autoplay deferred:', err?.name);
        });
      }
    };

    tryPlay();

    const handleTrackEvent = () => {
      el.srcObject = stream;
      tryPlay();
    };

    stream.addEventListener('addtrack', handleTrackEvent);
    stream.addEventListener('removetrack', handleTrackEvent);

    return () => {
      stream.removeEventListener('addtrack', handleTrackEvent);
      stream.removeEventListener('removetrack', handleTrackEvent);
    };
  }, [stream, isMuted]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
    />
  );
}
