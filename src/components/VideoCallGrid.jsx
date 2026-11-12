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
  onToggleLayoutMode
}) {
  const [isInCall, setIsInCall] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [peers, setPeers] = useState({}); // { [peerId]: { stream, userName, avatarColor, isMuted, isCameraOff } }
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);

  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const peerConnections = useRef({}); // { [peerId]: RTCPeerConnection }
  const audioContextRef = useRef(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      leaveCall();
    };
  }, []);

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

    // Add local tracks to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
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
      const [remoteStream] = event.streams;
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

    socket.on('webrtc:peer-joined', handlePeerJoined);
    socket.on('webrtc:signal', handleSignal);
    socket.on('webrtc:media-state-updated', handleMediaStateUpdated);
    socket.on('webrtc:peer-left', handlePeerLeft);

    // Announce to room that we joined call
    socket.emit('webrtc:join-call');

    return () => {
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
        audio: true,
        video: withVideo ? { width: { ideal: 640 }, height: { ideal: 360 } } : false
      });

      localStreamRef.current = stream;
      setIsInCall(true);
      setIsMicOn(true);
      setIsCameraOn(withVideo);

      // Notify room of initial media state
      socket.emit('webrtc:media-state', {
        isMuted: false,
        isCameraOff: !withVideo,
        isScreenSharing: false
      });
    } catch (err) {
      console.warn('Camera/Mic permission failed:', err);
      // Fallback to audio only
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = audioStream;
        setIsInCall(true);
        setIsMicOn(true);
        setIsCameraOn(false);
      } catch (audioErr) {
        alert('Could not access microphone or camera. Please check browser permissions.');
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

  // Toggle Microphone
  const toggleMic = () => {
    if (!localStreamRef.current) return;
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
    if (!isInCall) {
      await joinCall(true);
      return;
    }

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
      // Turn on camera
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 360 } }
        });
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
      } catch (err) {
        alert('Could not start camera. Please check camera permissions.');
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

  // Count active video tiles
  const peerList = Object.entries(peers);
  const totalCallCount = isInCall ? peerList.length + 1 : peerList.length;

  return (
    <div className="w-full flex flex-col transition-all">
      
      {/* 1. CALL CONTROLS DOCK (Google Meet Style Bar) */}
      <div className="h-10 bg-[#1e1f22]/95 border-b border-[#2b2d31] px-4 flex items-center justify-between backdrop-blur-md">
        
        {/* Left: Call Status Badge */}
        <div className="flex items-center gap-2">
          {isInCall ? (
            <div className="flex items-center gap-1.5 text-xs text-[#23a55a] font-bold">
              <span className="w-2 h-2 rounded-full bg-[#23a55a] animate-ping" />
              <span>In Call ({totalCallCount})</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-[#949ba4]">
              <PhoneCall className="w-3.5 h-3.5 text-[#5865f2]" />
              <span className="hidden sm:inline">Voice &amp; Video Call</span>
            </div>
          )}
        </div>

        {/* Center: Meeting Action Buttons */}
        <div className="flex items-center gap-2">
          {!isInCall ? (
            <button
              onClick={() => joinCall(true)}
              className="flex items-center gap-1.5 text-xs bg-[#23a55a] hover:bg-[#1f924f] text-white px-3 py-1 rounded-full font-bold shadow-md transition-all active:scale-95"
            >
              <Video className="w-3.5 h-3.5" />
              <span>Join Voice &amp; Video</span>
            </button>
          ) : (
            <>
              {/* Mic Toggle */}
              <button
                onClick={toggleMic}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-white transition-all shadow-sm ${
                  isMicOn ? 'bg-[#35373c] hover:bg-[#404249]' : 'bg-[#f23f43] hover:bg-[#da373b]'
                }`}
                title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
              >
                {isMicOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
              </button>

              {/* Camera Toggle */}
              <button
                onClick={toggleCamera}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-white transition-all shadow-sm ${
                  isCameraOn ? 'bg-[#35373c] hover:bg-[#404249]' : 'bg-[#f23f43] hover:bg-[#da373b]'
                }`}
                title={isCameraOn ? 'Turn Camera Off' : 'Turn Camera On'}
              >
                {isCameraOn ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
              </button>

              {/* Screen Share */}
              <button
                onClick={toggleScreenShare}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-white transition-all shadow-sm ${
                  isScreenSharing ? 'bg-[#5865f2] hover:bg-[#4752c4]' : 'bg-[#35373c] hover:bg-[#404249]'
                }`}
                title={isScreenSharing ? 'Stop Screen Share' : 'Share Your Screen'}
              >
                <ScreenShare className="w-3.5 h-3.5" />
              </button>

              {/* Leave Call */}
              <button
                onClick={leaveCall}
                className="w-7 h-7 rounded-full bg-[#f23f43] hover:bg-[#da373b] flex items-center justify-center text-white transition-all shadow-sm"
                title="Leave Voice/Video Call"
              >
                <PhoneOff className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>

        {/* Right: Layout Switcher */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleLayoutMode}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              layoutMode === 'grid'
                ? 'bg-[#5865f2] text-white shadow-sm'
                : 'text-[#949ba4] hover:text-white hover:bg-[#35373c]'
            }`}
            title={layoutMode === 'grid' ? 'Switch to Watch Party View' : 'Switch to Full Google Meet Grid'}
          >
            {layoutMode === 'grid' ? (
              <>
                <Tv className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Stream View</span>
              </>
            ) : (
              <>
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Meet Grid</span>
              </>
            )}
          </button>
        </div>

      </div>

      {/* 2. VIDEO TILES CONTAINER */}
      {isInCall && (
        <div 
          className={`w-full bg-[#111214] p-2 transition-all ${
            layoutMode === 'grid' 
              ? 'flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 overflow-y-auto max-h-[75vh]' 
              : 'flex items-center gap-2 overflow-x-auto border-b border-[#2b2d31] custom-scrollbar'
          }`}
        >
          {/* USER'S OWN VIDEO TILE */}
          <div 
            className={`relative rounded-xl overflow-hidden bg-[#1e1f22] border-2 border-[#383a40] flex items-center justify-center shadow-lg transition-all ${
              layoutMode === 'grid' 
                ? 'w-full aspect-video min-h-[160px] sm:min-h-[180px]' 
                : 'w-32 h-20 sm:w-44 sm:h-28 flex-shrink-0'
            }`}
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
              <div className="flex flex-col items-center justify-center text-center p-3">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-white shadow-md mb-1"
                  style={{ backgroundColor: currentUser?.avatarColor || '#5865f2' }}
                >
                  {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <span className="text-[10px] text-[#949ba4]">Camera Off</span>
              </div>
            )}

            {/* Tile Info Bar */}
            <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[11px] font-semibold text-white pointer-events-none drop-shadow">
              <span className="bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded truncate max-w-[100px]">
                {currentUser?.name || 'You'} (You)
              </span>
              <div className="bg-black/60 backdrop-blur-sm p-1 rounded">
                {isMicOn ? (
                  <Mic className="w-3 h-3 text-[#23a55a]" />
                ) : (
                  <MicOff className="w-3 h-3 text-[#f23f43]" />
                )}
              </div>
            </div>
          </div>

          {/* REMOTE PEERS' VIDEO TILES */}
          {peerList.map(([peerId, peerData]) => (
            <RemotePeerTile
              key={peerId}
              peerId={peerId}
              peerData={peerData}
              layoutMode={layoutMode}
            />
          ))}

          {/* If alone in call message */}
          {peerList.length === 0 && layoutMode === 'grid' && (
            <div className="col-span-full py-8 text-center text-[#949ba4] text-xs">
              <Users className="w-8 h-8 opacity-40 mx-auto mb-2 text-[#5865f2]" />
              <span>Waiting for friends to join the video call... Share the invite link with them!</span>
            </div>
          )}
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
      className={`relative rounded-xl overflow-hidden bg-[#1e1f22] border-2 border-[#383a40] flex items-center justify-center shadow-lg transition-all ${
        layoutMode === 'grid' 
          ? 'w-full aspect-video min-h-[160px] sm:min-h-[180px]' 
          : 'w-32 h-20 sm:w-44 sm:h-28 flex-shrink-0'
      }`}
    >
      {hasVideoTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-center p-3">
          <div 
            className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-white shadow-md mb-1"
            style={{ backgroundColor: peerData.avatarColor || '#5865f2' }}
          >
            {peerData.userName?.charAt(0).toUpperCase() || 'P'}
          </div>
          <span className="text-[10px] text-[#949ba4]">Camera Off</span>
        </div>
      )}

      {/* Hidden audio element ensuring audio stream plays */}
      <audio
        ref={(el) => {
          if (el && peerData.stream) el.srcObject = peerData.stream;
        }}
        autoPlay
      />

      {/* Tile Info Bar */}
      <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[11px] font-semibold text-white pointer-events-none drop-shadow">
        <span className="bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded truncate max-w-[100px]">
          {peerData.userName || 'Member'}
        </span>
        <div className="bg-black/60 backdrop-blur-sm p-1 rounded">
          {peerData.isMuted ? (
            <MicOff className="w-3 h-3 text-[#f23f43]" />
          ) : (
            <Mic className="w-3 h-3 text-[#23a55a]" />
          )}
        </div>
      </div>
    </div>
  );
}

