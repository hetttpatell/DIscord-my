/**
 * PeerConnectionService
 * Manages WebRTC RTCPeerConnections using the W3C Perfect Negotiation Pattern.
 * Handles offer/answer exchange, glare resolution, candidate queueing,
 * track hot-swapping, ICE restarts, and connection stats.
 */

import socket, { getBackendUrl } from './socket';

// Default ICE server fallback in case backend endpoint is unreachable
const DEFAULT_ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelay',
      credential: 'openrelay'
    }
  ],
  iceCandidatePoolSize: 10
};

// Cap video sender bitrate to ~400kbps to protect client CPU and mesh bandwidth
async function applyVideoBitrateCap(sender, maxBitrate = 400000) {
  if (!sender || typeof sender.getParameters !== 'function') return;
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.encodings[0].maxBitrate = maxBitrate;
    await sender.setParameters(params);
  } catch (err) {
    console.debug('[WebRTC] setParameters maxBitrate error:', err);
  }
}

class PeerConnectionService {
  constructor() {
    this.peerConnections = new Map(); // peerId -> PeerRecord
    this.iceCandidatesQueue = new Map(); // peerId -> RTCIceCandidateInit[]
    this.iceConfig = null;
    this.localStream = null;
    this.isCallActive = false;

    this.listeners = new Set();
    this.remoteStreams = new Map(); // peerId -> MediaStream
    this.peerMediaStates = new Map(); // peerId -> { isMuted, isCameraOff, isSpeaking, connectionQuality }

    this.audioContext = null;
    this.remoteAnalysers = new Map(); // peerId -> { analyser, interval }

    this.autoplayBlocked = false;
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(event, payload) {
    this.listeners.forEach(cb => {
      try {
        cb(event, payload);
      } catch (e) {
        console.error('[WebRTC] Listener error:', e);
      }
    });
  }

  /**
   * Fetch dynamic STUN/TURN ICE configuration from backend
   */
  async loadIceConfig(sessionId = 'guest') {
    if (this.iceConfig) return this.iceConfig;
    try {
      const url = `${getBackendUrl()}/api/webrtc/ice-servers?sessionId=${encodeURIComponent(sessionId)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
          this.iceConfig = data;
          console.debug('[WebRTC] Loaded ICE servers from server:', data.iceServers.length);
          return this.iceConfig;
        }
      }
    } catch (e) {
      console.warn('[WebRTC] Could not fetch ICE config from backend, using default fallback:', e);
    }
    this.iceConfig = DEFAULT_ICE_CONFIG;
    return this.iceConfig;
  }

  /**
   * Join WebRTC Call in current room
   */
  async joinCall(localStream, initialMediaState = {}) {
    this.localStream = localStream;
    this.isCallActive = true;
    await this.loadIceConfig();

    this.bindSocketListeners();

    // Announce to room that we are joining the call
    socket.emit('webrtc:join-call', {
      isMuted: Boolean(initialMediaState.isMuted),
      isCameraOff: Boolean(initialMediaState.isCameraOff),
      isScreenSharing: Boolean(initialMediaState.isScreenSharing)
    });

    console.debug('[WebRTC] Joined call with localStream:', localStream?.id);
  }

  /**
   * Leave WebRTC Call and close all peer connections cleanly
   */
  leaveCall() {
    this.isCallActive = false;

    // Close all peer connections
    for (const [peerId, record] of this.peerConnections.entries()) {
      this.closePeerConnection(peerId, record);
    }

    this.peerConnections.clear();
    this.iceCandidatesQueue.clear();
    this.remoteStreams.clear();
    this.peerMediaStates.clear();

    // Clean up remote audio analysers
    for (const remote of this.remoteAnalysers.values()) {
      if (remote.interval) clearInterval(remote.interval);
    }
    this.remoteAnalysers.clear();

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.unbindSocketListeners();
    socket.emit('webrtc:leave-call');

    this.notify('peers-updated', {});
    console.debug('[WebRTC] Left call and cleaned up peer connections');
  }

  /**
   * Update local stream tracks across all active peer connections
   */
  updateLocalStream(newStream) {
    this.localStream = newStream;
    if (!this.isCallActive) return;

    const tracks = newStream ? newStream.getTracks() : [];

    let peerIndex = 0;
    for (const record of this.peerConnections.values()) {
      const pc = record.pc;
      if (!pc || pc.signalingState === 'closed') continue;

      const allowVideo = peerIndex < 4;
      peerIndex++;

      const senders = pc.getSenders();

      // Audio track sync
      const audioTrack = tracks.find(t => t.kind === 'audio' && t.readyState === 'live');
      const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
      if (audioSender) {
        audioSender.replaceTrack(audioTrack || null).catch(err => {
          console.warn('[WebRTC] Audio replaceTrack error:', err);
        });
      } else if (audioTrack) {
        try {
          pc.addTrack(audioTrack, newStream);
        } catch (e) {
          console.debug('[WebRTC] Add audio track error:', e);
        }
      }

      // Video track sync (capped at 4 peers, forced audio-only beyond 4, maxBitrate 400k)
      const videoTrack = tracks.find(t => t.kind === 'video' && t.readyState === 'live');
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      if (videoSender) {
        if (!allowVideo) {
          videoSender.replaceTrack(null).catch(() => {});
        } else {
          videoSender.replaceTrack(videoTrack || null).then(() => {
            applyVideoBitrateCap(videoSender, 400000);
          }).catch(err => {
            console.warn('[WebRTC] Video replaceTrack error:', err);
          });
        }
      } else if (videoTrack && allowVideo) {
        try {
          const sender = pc.addTrack(videoTrack, newStream);
          if (sender) applyVideoBitrateCap(sender, 400000);
        } catch (e) {
          console.debug('[WebRTC] Add video track error:', e);
        }
      }
    }
  }

  /**
   * Broadcast local media state (mute, camera, screen share) to room peers
   */
  sendMediaState(mediaState) {
    if (!this.isCallActive) return;
    socket.emit('webrtc:media-state', mediaState);
  }

  /**
   * Bind Socket.IO signaling event listeners
   */
  bindSocketListeners() {
    this.unbindSocketListeners();

    this.handleExistingPeers = this.handleExistingPeers.bind(this);
    this.handlePeerJoined = this.handlePeerJoined.bind(this);
    this.handleSignal = this.handleSignal.bind(this);
    this.handleMediaStateUpdated = this.handleMediaStateUpdated.bind(this);
    this.handlePeerLeft = this.handlePeerLeft.bind(this);
    this.handleSocketReconnect = this.handleSocketReconnect.bind(this);

    socket.on('webrtc:existing-peers', this.handleExistingPeers);
    socket.on('webrtc:peer-joined', this.handlePeerJoined);
    socket.on('webrtc:signal', this.handleSignal);
    socket.on('webrtc:media-state-updated', this.handleMediaStateUpdated);
    socket.on('webrtc:peer-left', this.handlePeerLeft);
    socket.on('connect', this.handleSocketReconnect);
  }

  unbindSocketListeners() {
    if (this.handleExistingPeers) {
      socket.off('webrtc:existing-peers', this.handleExistingPeers);
      socket.off('webrtc:peer-joined', this.handlePeerJoined);
      socket.off('webrtc:signal', this.handleSignal);
      socket.off('webrtc:media-state-updated', this.handleMediaStateUpdated);
      socket.off('webrtc:peer-left', this.handlePeerLeft);
      socket.off('connect', this.handleSocketReconnect);
    }
  }

  /**
   * Handle socket reconnection — re-join call seamlessly
   */
  handleSocketReconnect() {
    if (this.isCallActive) {
      console.debug('[WebRTC] Socket reconnected, re-announcing join-call');
      socket.emit('webrtc:join-call', {
        isMuted: !this.localStream?.getAudioTracks().some(t => t.enabled),
        isCameraOff: !this.localStream?.getVideoTracks().some(t => t.enabled && t.readyState === 'live')
      });
    }
  }

  handleExistingPeers({ peers }) {
    if (!Array.isArray(peers)) return;
    console.debug('[WebRTC] Received existing peers list:', peers.length);

    peers.forEach(peer => {
      if (peer.peerId && peer.peerId !== socket.id) {
        this.getOrCreatePeerConnection(peer.peerId, peer.userName, peer.avatarColor, {
          isMuted: peer.isMuted,
          isCameraOff: peer.isCameraOff
        });
      }
    });
  }

  handlePeerJoined(peer) {
    if (!peer || !peer.peerId || peer.peerId === socket.id) return;
    console.debug('[WebRTC] Peer joined call:', peer.peerId, peer.userName);

    this.getOrCreatePeerConnection(peer.peerId, peer.userName, peer.avatarColor, {
      isMuted: peer.isMuted,
      isCameraOff: peer.isCameraOff
    });
  }

  /**
   * Handle incoming WebRTC signaling messages with Perfect Negotiation
   */
  async handleSignal({ from, fromName, signal, type }) {
    if (!from || from === socket.id || !this.isCallActive) return;

    let record = this.peerConnections.get(from);
    if (!record) {
      record = this.getOrCreatePeerConnection(from, fromName, '#5865f2');
    }

    const pc = record.pc;

    try {
      if (type === 'offer') {
        const offerCollision = record.makingOffer || pc.signalingState !== 'stable';
        record.ignoreOffer = !record.polite && offerCollision;

        if (record.ignoreOffer) {
          console.debug('[WebRTC] Impolite peer ignoring colliding offer from', from);
          return;
        }

        if (offerCollision) {
          console.debug('[WebRTC] Polite peer rolling back local description for', from);
          await pc.setLocalDescription({ type: 'rollback' });
        }

        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        await this.drainQueuedCandidates(from, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('webrtc:signal', {
          to: from,
          signal: pc.localDescription,
          type: 'answer'
        });
      } else if (type === 'answer') {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          await this.drainQueuedCandidates(from, pc);
        } else {
          console.debug('[WebRTC] Received answer in unexpected state:', pc.signalingState);
        }
      } else if (type === 'candidate') {
        if (signal && signal.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(signal));
            } catch (err) {
              if (!record.ignoreOffer) {
                console.warn('[WebRTC] addIceCandidate error:', err);
              }
            }
          } else {
            // Buffer candidate until remote description is established
            if (!this.iceCandidatesQueue.has(from)) {
              this.iceCandidatesQueue.set(from, []);
            }
            this.iceCandidatesQueue.get(from).push(signal);
          }
        }
      }
    } catch (err) {
      console.error('[WebRTC] Error handling signal:', type, err);
    }
  }

  handleMediaStateUpdated({ peerId, isMuted, isCameraOff, isScreenSharing }) {
    if (!peerId || peerId === socket.id) return;

    const current = this.peerMediaStates.get(peerId) || {};
    this.peerMediaStates.set(peerId, {
      ...current,
      isMuted: isMuted !== undefined ? Boolean(isMuted) : current.isMuted,
      isCameraOff: isCameraOff !== undefined ? Boolean(isCameraOff) : current.isCameraOff,
      isScreenSharing: isScreenSharing !== undefined ? Boolean(isScreenSharing) : current.isScreenSharing
    });

    this.notify('peers-updated', this.getAllPeers());
  }

  handlePeerLeft({ peerId }) {
    if (!peerId) return;
    console.debug('[WebRTC] Peer left call:', peerId);

    const record = this.peerConnections.get(peerId);
    if (record) {
      this.closePeerConnection(peerId, record);
      this.peerConnections.delete(peerId);
    }

    this.iceCandidatesQueue.delete(peerId);
    this.remoteStreams.delete(peerId);
    this.peerMediaStates.delete(peerId);

    const analyserData = this.remoteAnalysers.get(peerId);
    if (analyserData?.interval) {
      clearInterval(analyserData.interval);
      this.remoteAnalysers.delete(peerId);
    }

    this.notify('peers-updated', this.getAllPeers());
  }

  /**
   * Drain queued ICE candidates once remote description is set
   */
  async drainQueuedCandidates(peerId, pc) {
    const queue = this.iceCandidatesQueue.get(peerId);
    if (queue && queue.length > 0) {
      for (const cand of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.debug('[WebRTC] Drain candidate warning:', e);
        }
      }
      this.iceCandidatesQueue.set(peerId, []);
    }
  }

  /**
   * Get existing RTCPeerConnection or create a new one using Perfect Negotiation
   */
  getOrCreatePeerConnection(peerId, peerName = 'Member', peerColor = '#5865f2', initialMediaState = {}) {
    if (this.peerConnections.has(peerId)) {
      return this.peerConnections.get(peerId);
    }

    const config = this.iceConfig || DEFAULT_ICE_CONFIG;
    const pc = new RTCPeerConnection(config);

    // Polite role assignment: lexicographical comparison ensures one polite, one impolite
    const polite = socket.id < peerId;

    const record = {
      peerId,
      peerName,
      peerColor,
      pc,
      polite,
      makingOffer: false,
      ignoreOffer: false,
      connectionState: 'new',
      iceState: 'new',
      statsInterval: null
    };

    this.peerConnections.set(peerId, record);

    if (!this.peerMediaStates.has(peerId)) {
      this.peerMediaStates.set(peerId, {
        userName: peerName,
        avatarColor: peerColor,
        isMuted: initialMediaState.isMuted ?? false,
        isCameraOff: initialMediaState.isCameraOff ?? true,
        isSpeaking: false,
        connectionQuality: 'good'
      });
    }

    // Attach local tracks or pre-allocate transceivers (at most 4 video peers in mesh)
    const peerOrder = Array.from(this.peerConnections.keys()).indexOf(peerId);
    const allowVideo = peerOrder === -1 ? this.peerConnections.size <= 4 : peerOrder < 4;

    if (this.localStream && this.localStream.getTracks().length > 0) {
      this.localStream.getTracks().forEach(track => {
        if (track.kind === 'video' && !allowVideo) {
          console.debug(`[WebRTC] Mesh peer video limit exceeded, forcing audio-only for ${peerId}`);
          return;
        }
        try {
          const sender = pc.addTrack(track, this.localStream);
          if (track.kind === 'video' && sender) {
            applyVideoBitrateCap(sender, 400000);
          }
        } catch (e) {
          console.debug('[WebRTC] addTrack initial error:', e);
        }
      });
    } else {
      // Pre-add transceivers with sendrecv direction so incoming media flows immediately
      try {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
        pc.addTransceiver('video', { direction: allowVideo ? 'sendrecv' : 'inactive' });
      } catch (e) {
        console.debug('[WebRTC] addTransceiver fallback:', e);
      }
    }

    // Perfect Negotiation: negotiationneeded handler
    pc.onnegotiationneeded = async () => {
      try {
        record.makingOffer = true;
        await pc.setLocalDescription();
        socket.emit('webrtc:signal', {
          to: peerId,
          signal: pc.localDescription,
          type: 'offer'
        });
      } catch (err) {
        console.error('[WebRTC] onnegotiationneeded error:', err);
      } finally {
        record.makingOffer = false;
      }
    };

    // ICE candidate generation
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc:signal', {
          to: peerId,
          signal: event.candidate,
          type: 'candidate'
        });
      }
    };

    // ICE Connection state monitoring
    pc.oniceconnectionstatechange = () => {
      record.iceState = pc.iceConnectionState;
      console.debug(`[WebRTC] ICE state (${peerId}):`, pc.iceConnectionState);

      if (pc.iceConnectionState === 'failed') {
        console.warn(`[WebRTC] ICE failed with ${peerId}, triggering ICE restart...`);
        try {
          pc.restartIce();
        } catch (e) {
          console.warn('[WebRTC] restartIce error:', e);
        }
      }
      this.notify('peers-updated', this.getAllPeers());
    };

    pc.onconnectionstatechange = () => {
      record.connectionState = pc.connectionState;
      if (pc.connectionState === 'failed') {
        console.warn(`[WebRTC] Peer connection failed with ${peerId}`);
        try {
          pc.restartIce();
        } catch (e) {}
      }
      this.notify('peers-updated', this.getAllPeers());
    };

    // Incoming remote media track handler (max 4 video peers in mesh)
    pc.ontrack = (event) => {
      console.debug(`[WebRTC] Received remote track (${event.track.kind}) from ${peerId}`);

      const peerIndex = Array.from(this.peerConnections.keys()).indexOf(peerId);
      if (event.track.kind === 'video' && peerIndex >= 4) {
        console.debug(`[WebRTC] Mesh peer video limit exceeded, dropping remote video from ${peerId} (forced audio-only)`);
        return;
      }

      let stream = this.remoteStreams.get(peerId);
      if (!stream) {
        stream = event.streams[0] || new MediaStream();
        this.remoteStreams.set(peerId, stream);
      }

      if (!stream.getTracks().some(t => t.id === event.track.id)) {
        stream.addTrack(event.track);
      }

      // If audio track, attach remote speaking detector
      if (event.track.kind === 'audio') {
        this.initRemoteSpeakingDetector(peerId, event.track);
      }

      event.track.onended = () => {
        console.debug(`[WebRTC] Remote track ${event.track.kind} ended for ${peerId}`);
        this.notify('peers-updated', this.getAllPeers());
      };

      this.notify('peers-updated', this.getAllPeers());
    };

    // WebRTC connection quality monitor using getStats()
    record.statsInterval = setInterval(async () => {
      if (pc.connectionState !== 'connected') return;
      try {
        const stats = await pc.getStats();
        let rtt = null;
        let packetsLost = 0;

        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : null;
          }
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            packetsLost = report.packetsLost || 0;
          }
        });

        let quality = 'good';
        if (rtt && (rtt > 300 || packetsLost > 20)) {
          quality = 'poor';
        } else if (rtt && (rtt > 150 || packetsLost > 5)) {
          quality = 'fair';
        }

        const media = this.peerMediaStates.get(peerId);
        if (media && media.connectionQuality !== quality) {
          media.connectionQuality = quality;
          this.notify('peers-updated', this.getAllPeers());
        }
      } catch (e) {}
    }, 5000);

    this.notify('peers-updated', this.getAllPeers());
    return record;
  }

  /**
   * Voice Activity Detection for incoming remote peer audio
   */
  initRemoteSpeakingDetector(peerId, audioTrack) {
    if (typeof window === 'undefined' || !audioTrack) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioContextClass();
      }

      const mediaStream = new MediaStream([audioTrack]);
      const source = this.audioContext.createMediaStreamSource(mediaStream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      let speakingFrames = 0;

      const interval = setInterval(() => {
        if (!audioTrack.enabled || audioTrack.readyState !== 'live') {
          const media = this.peerMediaStates.get(peerId);
          if (media && media.isSpeaking) {
            media.isSpeaking = false;
            this.notify('peers-updated', this.getAllPeers());
          }
          return;
        }

        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length / 255;

        const media = this.peerMediaStates.get(peerId);
        if (!media) return;

        if (avg > 0.035) {
          speakingFrames++;
          if (speakingFrames >= 2 && !media.isSpeaking) {
            media.isSpeaking = true;
            this.notify('peers-updated', this.getAllPeers());
          }
        } else {
          speakingFrames = 0;
          if (media.isSpeaking) {
            media.isSpeaking = false;
            this.notify('peers-updated', this.getAllPeers());
          }
        }
      }, 150);

      this.remoteAnalysers.set(peerId, { analyser, interval });
    } catch (e) {
      console.debug('[WebRTC] Remote speaking detector fallback:', e);
    }
  }

  closePeerConnection(peerId, record) {
    if (record.statsInterval) {
      clearInterval(record.statsInterval);
    }
    if (record.pc) {
      record.pc.onicecandidate = null;
      record.pc.ontrack = null;
      record.pc.onnegotiationneeded = null;
      record.pc.oniceconnectionstatechange = null;
      record.pc.onconnectionstatechange = null;
      try {
        record.pc.close();
      } catch (e) {}
    }
  }

  /**
   * Return formatted dictionary of all remote peers
   */
  getAllPeers() {
    const peers = {};
    for (const [peerId, record] of this.peerConnections.entries()) {
      const media = this.peerMediaStates.get(peerId) || {};
      const stream = this.remoteStreams.get(peerId) || null;

      peers[peerId] = {
        peerId,
        userName: record.peerName || media.userName || 'Member',
        avatarColor: record.peerColor || media.avatarColor || '#5865f2',
        isMuted: Boolean(media.isMuted),
        isCameraOff: Boolean(media.isCameraOff),
        isSpeaking: Boolean(media.isSpeaking),
        connectionQuality: media.connectionQuality || 'good',
        iceState: record.iceState,
        stream
      };
    }
    return peers;
  }

  /**
   * Autoplay unlocker: Resumes Web Audio Context & triggers playback on all audio elements
   */
  async unlockAudio() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {}
    }

    document.querySelectorAll('audio').forEach(audio => {
      if (audio.paused && audio.srcObject) {
        audio.play().catch(e => console.debug('[WebRTC] Unlock audio catch:', e));
      }
    });

    this.autoplayBlocked = false;
    this.notify('autoplay-changed', false);
  }
}

export const peerConnectionService = new PeerConnectionService();
export default peerConnectionService;
