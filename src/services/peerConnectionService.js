/**
 * PeerConnectionService
 * Manages WebRTC audio RTCPeerConnections using the W3C Perfect Negotiation Pattern.
 * Audio-only mesh fallback with pre-allocated sendrecv transceivers.
 */

import socket, { getBackendUrl } from './socket.js';

// Default ICE server fallback in case backend endpoint is unreachable (STUN only)
const DEFAULT_ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ],
  iceCandidatePoolSize: 10
};

export function isDebug() {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('debug') === '1';
  } catch {
    return false;
  }
}

function traceLog(...args) {
  if (isDebug()) {
    console.log('[webrtc][trace]', ...args);
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
    this.peerMediaStates = new Map(); // peerId -> { isMuted, isSpeaking, connectionQuality }

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
      } catch (err) {
        console.error('[WebRTC] Listener error:', err);
      }
    });
  }

  async fetchIceServers(sessionId) {
    try {
      const backendUrl = getBackendUrl();
      const res = await fetch(`${backendUrl}/api/webrtc/ice-config?sessionId=${encodeURIComponent(sessionId || 'anon')}`);
      if (res.ok) {
        const config = await res.json();
        if (config && config.iceServers) {
          this.iceConfig = config;
          return config;
        }
      }
    } catch (err) {
      console.warn('[WebRTC] Could not fetch dynamic ICE config from backend, using fallback:', err.message);
    }
    this.iceConfig = DEFAULT_ICE_CONFIG;
    return DEFAULT_ICE_CONFIG;
  }

  async initiateCall({ localStream, sessionId = 'user', initialMediaState = {} }) {
    this.localStream = localStream;
    this.isCallActive = true;

    await this.fetchIceServers(sessionId);
    this.bindSocketListeners();

    const audioTrack = localStream?.getAudioTracks().find(t => t.readyState === 'live');
    const audioLive = Boolean(audioTrack && audioTrack.enabled);

    socket.emit('webrtc:join-call', {
      isMuted: initialMediaState.isMuted !== undefined ? Boolean(initialMediaState.isMuted) : !audioLive
    });

    console.log('[WebRTC] Initiated audio mesh call');
  }

  leaveCall() {
    this.isCallActive = false;

    for (const [peerId, record] of this.peerConnections.entries()) {
      try {
        if (record.statsInterval) clearInterval(record.statsInterval);
        if (record.disconnectedTimeout) clearTimeout(record.disconnectedTimeout);
        if (record.iceCheckingTimer) clearTimeout(record.iceCheckingTimer);
        record.pc.close();
      } catch (e) {
        console.debug('[WebRTC] Error closing pc for peer', peerId, e);
      }
    }

    this.peerConnections.clear();
    this.iceCandidatesQueue.clear();
    this.remoteStreams.clear();
    this.peerMediaStates.clear();

    for (const [, analyserData] of this.remoteAnalysers.entries()) {
      if (analyserData.interval) clearInterval(analyserData.interval);
    }
    this.remoteAnalysers.clear();

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try { this.audioContext.close(); } catch {}
      this.audioContext = null;
    }

    this.unbindSocketListeners();
    socket.emit('webrtc:leave-call');

    this.notify('peers-updated', {});
    console.debug('[WebRTC] Left call and cleaned up peer connections');
  }

  async updateLocalStream(newStream) {
    this.localStream = newStream;
    if (!this.isCallActive) return;

    const audioTrack = newStream?.getAudioTracks().find(t => t.readyState === 'live') || null;

    for (const [peerId, record] of this.peerConnections.entries()) {
      const pc = record.pc;
      if (!pc || pc.signalingState === 'closed') continue;

      const audioTransceiver = typeof pc.getTransceivers === 'function' ? pc.getTransceivers().find(t =>
        (t.sender?.track?.kind === 'audio') || (t.receiver?.track?.kind === 'audio')
      ) : null;

      if (audioTransceiver && audioTransceiver.sender.track !== audioTrack) {
        try {
          await audioTransceiver.sender.replaceTrack(audioTrack);
          traceLog(`Audio replaceTrack resolved for peer ${peerId}`);
        } catch (err) {
          console.warn('[WebRTC] Audio replaceTrack error:', err);
        }
      }
    }

    const audioLive = Boolean(audioTrack && audioTrack.enabled);
    this.sendMediaState({
      isMuted: !audioLive
    });
  }

  async replaceLocalTrack(oldTrack, newTrack) {
    this.localStream = newStream => newStream;
    const kind = newTrack?.kind || oldTrack?.kind;
    if (kind !== 'audio') return;

    for (const [peerId, record] of this.peerConnections.entries()) {
      const pc = record.pc;
      if (!pc || pc.signalingState === 'closed') continue;

      const transceiver = typeof pc.getTransceivers === 'function' ? pc.getTransceivers().find(t =>
        (t.sender.track && t.sender.track.id === oldTrack?.id) ||
        (t.sender?.track?.kind === 'audio') ||
        (t.receiver?.track && t.receiver.track.kind === 'audio')
      ) : null;

      if (transceiver) {
        try {
          await transceiver.sender.replaceTrack(newTrack || null);
        } catch (err) {
          console.warn(`[WebRTC] replaceLocalTrack error on peer ${peerId}:`, err);
        }
      }
    }

    const audioLive = this.localStream?.getAudioTracks().some(t => t.readyState === 'live' && t.enabled);
    this.sendMediaState({
      isMuted: !audioLive
    });
  }

  sendMediaState({ isMuted }) {
    if (!this.isCallActive) return;
    socket.emit('webrtc:media-state', {
      isMuted: Boolean(isMuted)
    });
  }

  bindSocketListeners() {
    this.unbindSocketListeners();

    socket.on('webrtc:peer-joined', this.handlePeerJoined);
    socket.on('webrtc:signal', this.handleSignal);
    socket.on('webrtc:media-state-updated', this.handleMediaStateUpdated);
    socket.on('webrtc:peer-left', this.handlePeerLeft);
  }

  unbindSocketListeners() {
    socket.off('webrtc:peer-joined', this.handlePeerJoined);
    socket.off('webrtc:signal', this.handleSignal);
    socket.off('webrtc:media-state-updated', this.handleMediaStateUpdated);
    socket.off('webrtc:peer-left', this.handlePeerLeft);
  }

  handlePeerJoined = ({ peerId, userName, avatarColor, mediaState }) => {
    if (!this.isCallActive || peerId === socket.id) return;
    console.log(`[WebRTC] Peer joined: ${peerId} (${userName})`);
    this.getOrCreatePeerConnection(peerId, userName, avatarColor, mediaState);
    this.notify('peers-updated', this.getAllPeers());
  };

  handleSignal = async ({ from, signal, type }) => {
    if (!this.isCallActive) return;
    const record = this.getOrCreatePeerConnection(from);
    const pc = record.pc;

    try {
      if (type === 'candidate' || (signal && signal.candidate)) {
        const cand = signal.candidate ? signal : signal;
        if (!pc.remoteDescription || !pc.remoteDescription.type) {
          if (!this.iceCandidatesQueue.has(from)) {
            this.iceCandidatesQueue.set(from, []);
          }
          this.iceCandidatesQueue.get(from).push(cand);
        } else {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch (e) {
            console.debug('[WebRTC] Candidate error:', e);
          }
        }
      } else if (type === 'offer' || (signal && signal.type === 'offer')) {
        const offer = signal.type ? signal : { type: 'offer', sdp: signal.sdp || signal };
        const readyForOffer = !record.makingOffer && (pc.signalingState === 'stable' || record.isSettingRemoteAnswerPending);
        const offerCollision = !readyForOffer;

        record.ignoreOffer = !record.polite && offerCollision;
        if (record.ignoreOffer) {
          console.warn(`[WebRTC] Glare detected with ${from}: Impolite peer ignoring incoming offer.`);
          return;
        }

        record.isSettingRemoteAnswerPending = false;
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await this.drainQueuedCandidates(from, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('webrtc:signal', {
          to: from,
          signal: pc.localDescription,
          type: 'answer'
        });
      } else if (type === 'answer' || (signal && signal.type === 'answer')) {
        const answer = signal.type ? signal : { type: 'answer', sdp: signal.sdp || signal };
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          await this.drainQueuedCandidates(from, pc);
        }
      }
    } catch (err) {
      console.error(`[WebRTC] Error handling signal from ${from}:`, err);
    }
  };

  handleMediaStateUpdated = ({ peerId, isMuted }) => {
    if (!this.isCallActive) return;
    const current = this.peerMediaStates.get(peerId) || {};
    this.peerMediaStates.set(peerId, {
      ...current,
      isMuted: isMuted !== undefined ? Boolean(isMuted) : current.isMuted
    });
    this.notify('peers-updated', this.getAllPeers());
  };

  handlePeerLeft = ({ peerId }) => {
    if (!this.peerConnections.has(peerId)) return;
    console.log(`[WebRTC] Peer left: ${peerId}`);

    const record = this.peerConnections.get(peerId);
    if (record) {
      if (record.statsInterval) clearInterval(record.statsInterval);
      if (record.disconnectedTimeout) clearTimeout(record.disconnectedTimeout);
      if (record.iceCheckingTimer) clearTimeout(record.iceCheckingTimer);
      try { record.pc.close(); } catch {}
    }

    this.peerConnections.delete(peerId);
    this.iceCandidatesQueue.delete(peerId);
    this.remoteStreams.delete(peerId);
    this.peerMediaStates.delete(peerId);

    const analyserData = this.remoteAnalysers.get(peerId);
    if (analyserData?.interval) {
      clearInterval(analyserData.interval);
      this.remoteAnalysers.delete(peerId);
    }

    this.notify('peers-updated', this.getAllPeers());
  };

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

  getOrCreatePeerConnection(peerId, peerName = 'Member', peerColor = '#5865f2', initialMediaState = {}) {
    if (this.peerConnections.has(peerId)) {
      if (initialMediaState.isMuted !== undefined) {
        const current = this.peerMediaStates.get(peerId) || {};
        this.peerMediaStates.set(peerId, {
          ...current,
          userName: peerName || current.userName,
          avatarColor: peerColor || current.avatarColor,
          isMuted: Boolean(initialMediaState.isMuted)
        });
      }
      return this.peerConnections.get(peerId);
    }

    const config = this.iceConfig || DEFAULT_ICE_CONFIG;
    const pc = new RTCPeerConnection(config);

    const localId = socket.id || '';
    const polite = localId < peerId;

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
      iceGatheringState: 'new',
      localCandidateTypes: new Set(),
      selectedCandidatePairType: 'none',
      selectedPairDetails: '',
      hasRestartedIce: false,
      disconnectedTimeout: null,
      iceCheckingTimer: null,
      troubleConnecting: false,
      statsInterval: null
    };

    this.peerConnections.set(peerId, record);

    if (!this.peerMediaStates.has(peerId)) {
      this.peerMediaStates.set(peerId, {
        userName: peerName,
        avatarColor: peerColor,
        isMuted: initialMediaState.isMuted ?? false,
        isSpeaking: false,
        connectionQuality: 'good'
      });
    }

    // Attach local audio track or pre-allocate sendrecv audio transceiver
    const audioTrack = this.localStream?.getAudioTracks().find(t => t.readyState === 'live') || null;
    let audioTransceiver = typeof pc.getTransceivers === 'function' ? pc.getTransceivers().find(t =>
      (t.sender?.track?.kind === 'audio') || (t.receiver?.track?.kind === 'audio')
    ) : null;

    if (!audioTransceiver) {
      try {
        if (audioTrack) {
          audioTransceiver = pc.addTransceiver(audioTrack, { direction: 'sendrecv', streams: this.localStream ? [this.localStream] : [] });
        } else {
          audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
        }
      } catch (e) {
        console.debug('[WebRTC] addTransceiver audio fallback:', e);
      }
    } else if (audioTrack && audioTransceiver.sender.track !== audioTrack) {
      audioTransceiver.sender.replaceTrack(audioTrack).catch(() => {});
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
        console.warn(`[WebRTC] Error during negotiation offer for ${peerId}:`, err);
      } finally {
        record.makingOffer = false;
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc:signal', {
          to: peerId,
          signal: event.candidate,
          type: 'candidate'
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      record.iceState = pc.iceConnectionState;
      if (pc.iceConnectionState === 'failed') {
        if (!record.hasRestartedIce) {
          record.hasRestartedIce = true;
          try {
            if (typeof pc.restartIce === 'function') {
              pc.restartIce();
            }
          } catch {}
        }
      }
      this.notify('peers-updated', this.getAllPeers());
    };

    pc.onconnectionstatechange = () => {
      record.connectionState = pc.connectionState;
      this.notify('peers-updated', this.getAllPeers());
    };

    // Incoming remote media track handler (audio-only)
    pc.ontrack = (event) => {
      if (event.track.kind !== 'audio') return;

      console.debug(`[WebRTC] Received remote audio track from ${peerId}`);
      let stream = this.remoteStreams.get(peerId);
      if (!stream) {
        stream = event.streams[0] || new MediaStream();
        this.remoteStreams.set(peerId, stream);
      }

      if (!stream.getTracks().some(t => t.id === event.track.id)) {
        stream.addTrack(event.track);
      }

      this.initRemoteSpeakingDetector(peerId, event.track);

      event.track.onended = () => {
        this.notify('peers-updated', this.getAllPeers());
      };
      event.track.onmute = () => {
        this.notify('peers-updated', this.getAllPeers());
      };
      event.track.onunmute = () => {
        this.notify('peers-updated', this.getAllPeers());
      };

      this.notify('peers-updated', this.getAllPeers());
    };

    return record;
  }

  initRemoteSpeakingDetector(peerId, audioTrack) {
    if (typeof window === 'undefined') return;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioContextClass();
      }

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      const stream = new MediaStream([audioTrack]);
      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);

      if (this.remoteAnalysers.has(peerId)) {
        clearInterval(this.remoteAnalysers.get(peerId).interval);
      }

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      let speakingFrames = 0;

      const interval = setInterval(() => {
        const media = this.peerMediaStates.get(peerId);
        if (!media) return;

        if (media.isMuted || !audioTrack.enabled || audioTrack.readyState !== 'live') {
          if (media.isSpeaking) {
            media.isSpeaking = false;
            this.notify('peers-updated', this.getAllPeers());
          }
          return;
        }

        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const average = sum / buffer.length / 255;

        if (average > 0.035) {
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
      }, 120);

      this.remoteAnalysers.set(peerId, { analyser, interval });
    } catch (e) {
      console.debug('[WebRTC] Remote speaking detector fallback:', e);
    }
  }

  unlockAudio() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    this.autoplayBlocked = false;
    this.notify('autoplay-unblocked');
  }

  getAllPeers() {
    const peers = {};
    for (const [peerId, record] of this.peerConnections.entries()) {
      const media = this.peerMediaStates.get(peerId) || {};
      const stream = this.remoteStreams.get(peerId) || null;

      const audioTracks = stream ? stream.getAudioTracks() : [];
      let isMuted = Boolean(media.isMuted);
      if (audioTracks.length > 0) {
        const hasLiveAudio = audioTracks.some(t => t.readyState === 'live' && t.enabled);
        isMuted = !hasLiveAudio;
      }

      peers[peerId] = {
        peerId,
        userName: record.peerName || media.userName || 'Member',
        avatarColor: record.peerColor || media.avatarColor || '#5865f2',
        isMuted,
        isSpeaking: Boolean(media.isSpeaking),
        connectionQuality: media.connectionQuality || 'good',
        iceState: record.iceState,
        troubleConnecting: Boolean(record.troubleConnecting),
        stream
      };
    }
    return peers;
  }
}

export const peerConnectionService = new PeerConnectionService();
export default peerConnectionService;
