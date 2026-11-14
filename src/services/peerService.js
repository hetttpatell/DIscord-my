/**
 * PeerService
 * Lightweight one-to-one voice calling service powered by PeerJS.
 *
 * Capabilities:
 * - PeerJS WebRTC abstraction with dynamic backend STUN/TURN ICE configuration
 * - 1-to-1 voice calling lifecycle: start, accept, reject, end, mute/unmute
 * - Call states: 'idle' | 'calling' | 'ringing' | 'connected' | 'disconnected' | 'error'
 * - Clean microphone acquisition & permission handling via mediaController/mediaService
 * - Dual-path audio playback: Web Audio API GainNode (for iOS/Android volume & ducking)
 *   plus HTMLAudioElement with playsInline autoPlay
 * - Speech detection via Web Audio AnalyserNode to drive UI visualizers & music ducking
 * - Complete teardown and memory cleanup on call termination and room departure
 */

import PeerJS from 'peerjs';
import socket, { getBackendUrl } from './socket.js';
import mediaController from './mediaController.js';

// Resolve Peer constructor across ESM / CommonJS / bundler variants
const Peer = typeof PeerJS === 'function' ? PeerJS : (PeerJS?.Peer || PeerJS?.default || PeerJS);

// Default STUN servers fallback if backend ICE endpoint is unreachable
const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

export function sanitizePeerId(str) {
  if (!str) return `peer_${Math.random().toString(36).substring(2, 9)}`;
  return String(str).replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function formatPeerId(roomId, clientId) {
  const cleanRoom = sanitizePeerId(roomId).toLowerCase();
  const cleanClient = sanitizePeerId(clientId);
  return `afterspot-${cleanRoom}-${cleanClient}`;
}

class PeerService {
  constructor() {
    this.peer = null;
    this.peerId = null;
    this.roomId = null;
    this.user = null;
    this.isReady = false;

    // Call state: 'idle' | 'calling' | 'ringing' | 'connected' | 'disconnected' | 'error'
    this.callState = 'idle';
    this.currentCall = null;
    this.remoteUser = null; // { id, clientId, name, avatarColor }
    this.remoteStream = null;
    this.callDuration = 0;
    this.callTimer = null;
    this.callingTimeoutTimer = null;
    this.error = null;

    // Audio & speech analysis
    this.audioContext = null;
    this.remoteSourceNode = null;
    this.gainNode = null;
    this.analyserNode = null;
    this.analyserInterval = null;
    this.audioElement = null;
    this.voicesVolume = 100;
    this.isRemoteSpeaking = false;

    // Listeners for React subscribers
    this.listeners = new Set();

    // Auto-bind methods
    this.init = this.init.bind(this);
    this.startCall = this.startCall.bind(this);
    this.acceptCall = this.acceptCall.bind(this);
    this.rejectCall = this.rejectCall.bind(this);
    this.endCall = this.endCall.bind(this);
    this.toggleMute = this.toggleMute.bind(this);
    this.setVoicesVolume = this.setVoicesVolume.bind(this);
    this.unlockAudio = this.unlockAudio.bind(this);
    this.destroy = this.destroy.bind(this);
  }

  // ==========================================
  // SUBSCRIPTION & STATE NOTIFICATION
  // ==========================================

  subscribe(callback) {
    if (typeof callback !== 'function') return () => {};
    this.listeners.add(callback);
    // Initial notification with current state
    try {
      callback('state-changed', this.getState());
    } catch (err) {
      console.error('[PeerService] Subscriber error:', err);
    }
    return () => this.listeners.delete(callback);
  }

  notify(event, payload) {
    const state = this.getState();
    const effPayload = payload !== undefined ? payload : state;
    this.listeners.forEach(cb => {
      try {
        cb(event, effPayload, state);
      } catch (err) {
        console.error('[PeerService] Listener notification error:', err);
      }
    });
  }

  getState() {
    const isMuted = mediaController.micState !== 'on';
    return {
      isReady: this.isReady,
      peerId: this.peerId,
      callState: this.callState,
      remoteUser: this.remoteUser ? {
        ...this.remoteUser,
        isSpeaking: this.isRemoteSpeaking,
        stream: this.remoteStream
      } : null,
      remoteStream: this.remoteStream,
      callDuration: this.callDuration,
      isMuted,
      isSpeaking: mediaController.isSpeaking,
      error: this.error,
      voicesVolume: this.voicesVolume
    };
  }

  getPeers() {
    if (this.callState === 'connected' && this.remoteUser) {
      const pid = this.remoteUser.clientId || this.remoteUser.id;
      return {
        [pid]: {
          peerId: pid,
          id: pid,
          clientId: pid,
          userName: this.remoteUser.name || 'Member',
          avatarColor: this.remoteUser.avatarColor || '#5865f2',
          isMuted: false,
          isSpeaking: this.isRemoteSpeaking,
          stream: this.remoteStream,
          connectionQuality: 'good'
        }
      };
    }
    return {};
  }

  getAllPeers() {
    return this.getPeers();
  }

  // ==========================================
  // INITIALIZATION & PEER INSTANCE
  // ==========================================

  async fetchIceServers(sessionId) {
    try {
      const backendUrl = getBackendUrl();
      const res = await fetch(`${backendUrl}/api/webrtc/ice-config?sessionId=${encodeURIComponent(sessionId || 'guest')}`);
      if (res.ok) {
        const config = await res.json();
        if (config && Array.isArray(config.iceServers) && config.iceServers.length > 0) {
          return config.iceServers;
        }
      }
    } catch (err) {
      console.warn('[PeerService] Could not fetch dynamic ICE servers, using fallback:', err.message);
    }
    return DEFAULT_ICE_SERVERS;
  }

  async init({ roomId, user, sessionId }) {
    if (!roomId || !user) return;

    const clientId = user.clientId || sessionId || user.id;
    const computedPeerId = formatPeerId(roomId, clientId);

    // If already initialized for this same user and room, keep it active
    if (this.peer && this.peerId === computedPeerId && !this.peer.destroyed) {
      return;
    }

    // Clean up any previous Peer instance
    if (this.peer) {
      this.destroy();
    }

    this.roomId = roomId;
    this.user = {
      ...user,
      clientId
    };
    this.peerId = computedPeerId;
    this.error = null;

    try {
      const iceServers = await this.fetchIceServers(clientId);

      const peerOptions = {
        config: {
          iceServers,
          iceCandidatePoolSize: 10
        },
        debug: 1
      };

      this.peer = new Peer(this.peerId, peerOptions);

      this.peer.on('open', (id) => {
        this.peerId = id;
        this.isReady = true;
        this.notify('open', { peerId: id });
        this.notify('state-changed');
      });

      this.peer.on('call', (incomingCall) => {
        this.handleIncomingCall(incomingCall);
      });

      this.peer.on('error', (err) => {
        console.warn('[PeerService] PeerJS error:', err?.type || err?.message);
        this.handlePeerError(err);
      });

      this.peer.on('disconnected', () => {
        this.isReady = false;
        this.notify('disconnected');
        // Attempt silent reconnection to PeerJS server if not deliberately destroyed
        if (this.peer && !this.peer.destroyed) {
          try {
            this.peer.reconnect();
          } catch {}
        }
      });

      this.peer.on('close', () => {
        this.isReady = false;
        this.notify('close');
      });

    } catch (err) {
      console.error('[PeerService] Failed to initialize PeerJS:', err);
      this.error = { code: 'INIT_FAILED', message: err.message };
      this.notify('error', this.error);
    }
  }

  // ==========================================
  // INCOMING CALL HANDLING
  // ==========================================

  handleIncomingCall(incomingCall) {
    // If we are already connected or in an outgoing/incoming call, reject busy
    if (this.callState === 'connected' || this.callState === 'calling' || this.callState === 'ringing') {
      try {
        incomingCall.close();
      } catch {}
      return;
    }

    const metadata = incomingCall.metadata || {};
    this.currentCall = incomingCall;
    this.remoteUser = {
      id: metadata.callerId || incomingCall.peer,
      clientId: metadata.callerId || incomingCall.peer,
      name: metadata.callerName || 'Member',
      avatarColor: metadata.callerAvatar || '#5865f2'
    };
    this.callState = 'ringing';
    this.error = null;

    // Set up ringtone / vibration if mobile
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate([100, 100, 100]); } catch {}
    }

    // Bind incoming call events
    incomingCall.on('close', () => {
      this.handleCallEnded('Call ended by remote user');
    });

    incomingCall.on('error', (err) => {
      this.handleCallError(err);
    });

    this.notify('incoming-call', this.remoteUser);
    this.notify('state-changed');
  }

  // ==========================================
  // CALL CONTROLS: START, ACCEPT, REJECT, END
  // ==========================================

  async startCall(targetMember) {
    if (!targetMember) return;
    if (this.callState === 'connected' || this.callState === 'calling') {
      console.warn('[PeerService] Cannot start call: already in a call');
      return;
    }

    if (!this.peer || this.peer.destroyed) {
      await this.init({ roomId: this.roomId, user: this.user, sessionId: this.user?.clientId });
    }

    const targetClientId = targetMember.clientId || targetMember.id;
    const targetPeerId = formatPeerId(this.roomId, targetClientId);

    this.callState = 'calling';
    this.remoteUser = {
      id: targetClientId,
      clientId: targetClientId,
      name: targetMember.name || 'Member',
      avatarColor: targetMember.avatarColor || '#5865f2'
    };
    this.error = null;
    this.notify('state-changed');

    try {
      // 1. Acquire local microphone stream via mediaController
      let stream = mediaController.stream;
      if (!stream || !stream.getAudioTracks().some(t => t.readyState === 'live')) {
        await mediaController.toggleMic();
        stream = mediaController.stream;
      }

      if (!stream || !stream.getAudioTracks().some(t => t.readyState === 'live')) {
        if (mediaController.micState === 'blocked') {
          throw new Error('Microphone permission blocked. Please allow microphone access to make a call.');
        } else {
          throw new Error('Microphone unavailable.');
        }
      }

      // Ensure local audio track is enabled
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) audioTrack.enabled = true;

      // 2. Initiate PeerJS call
      const call = this.peer.call(targetPeerId, stream, {
        metadata: {
          callerId: this.user.clientId,
          callerName: this.user.name,
          callerAvatar: this.user.avatarColor
        }
      });

      if (!call) {
        throw new Error('Failed to create call connection');
      }

      this.currentCall = call;

      call.on('stream', (remoteStream) => {
        this.handleRemoteStreamConnected(remoteStream);
      });

      call.on('close', () => {
        this.handleCallEnded('Call ended');
      });

      call.on('error', (err) => {
        this.handleCallError(err);
      });

      // 30s timeout if unaccepted
      if (this.callingTimeoutTimer) clearTimeout(this.callingTimeoutTimer);
      this.callingTimeoutTimer = setTimeout(() => {
        if (this.callState === 'calling') {
          this.endCall('No answer');
        }
      }, 30000);

    } catch (err) {
      console.error('[PeerService] startCall failed:', err);
      this.callState = 'error';
      this.error = { code: 'CALL_START_FAILED', message: err.message };
      this.notify('error', this.error);
      this.notify('state-changed');
      setTimeout(() => {
        if (this.callState === 'error') {
          this.callState = 'idle';
          this.notify('state-changed');
        }
      }, 3000);
    }
  }

  async acceptCall() {
    if (this.callState !== 'ringing' || !this.currentCall) return;

    try {
      // 1. Acquire local microphone stream
      let stream = mediaController.stream;
      if (!stream || !stream.getAudioTracks().some(t => t.readyState === 'live')) {
        await mediaController.toggleMic();
        stream = mediaController.stream;
      }

      if (!stream || !stream.getAudioTracks().some(t => t.readyState === 'live')) {
        if (mediaController.micState === 'blocked') {
          throw new Error('Microphone permission blocked. Please allow microphone access to accept the call.');
        }
        throw new Error('Microphone unavailable.');
      }

      // Ensure local track is enabled
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) audioTrack.enabled = true;

      // 2. Answer incoming call
      this.currentCall.answer(stream);

      this.currentCall.on('stream', (remoteStream) => {
        this.handleRemoteStreamConnected(remoteStream);
      });

      this.callState = 'connected';
      this.startDurationTimer();
      this.notify('state-changed');

    } catch (err) {
      console.error('[PeerService] acceptCall error:', err);
      this.callState = 'error';
      this.error = { code: 'CALL_ACCEPT_FAILED', message: err.message };
      this.notify('error', this.error);
      this.notify('state-changed');
    }
  }

  rejectCall() {
    if (this.currentCall) {
      try {
        this.currentCall.close();
      } catch {}
    }
    this.cleanupCallState();
    this.callState = 'idle';
    this.notify('state-changed');
  }

  endCall(reason = null) {
    if (this.callingTimeoutTimer) {
      clearTimeout(this.callingTimeoutTimer);
      this.callingTimeoutTimer = null;
    }

    if (this.currentCall) {
      try {
        this.currentCall.close();
      } catch {}
      this.currentCall = null;
    }

    this.cleanupAudioNodes();
    this.cleanupCallState();

    this.callState = 'disconnected';
    if (reason) {
      this.error = { code: 'CALL_TERMINATED', message: reason };
    }
    this.notify('call-ended', { reason });
    this.notify('peers-updated', {});
    this.notify('state-changed');

    setTimeout(() => {
      if (this.callState === 'disconnected') {
        this.callState = 'idle';
        this.error = null;
        this.notify('state-changed');
      }
    }, 1200);
  }

  handleCallEnded(reason = 'Call ended') {
    this.endCall(reason);
  }

  handleCallError(err) {
    console.warn('[PeerService] Active call error:', err);
    this.endCall(err?.message || 'Connection error');
  }

  handlePeerError(err) {
    const errorType = err?.type;
    let message = err?.message || 'Peer communication error';

    if (errorType === 'peer-unavailable') {
      message = `${this.remoteUser?.name || 'User'} is currently offline or unavailable.`;
      if (this.callState === 'calling') {
        this.endCall(message);
      }
    } else if (errorType === 'network' || errorType === 'server-error' || errorType === 'socket-error') {
      message = 'Signaling network issue. Reconnecting...';
    }

    this.error = { code: errorType || 'PEER_ERROR', message };
    this.notify('error', this.error);
    this.notify('state-changed');
  }

  // ==========================================
  // MICROPHONE & MUTE CONTROLS
  // ==========================================

  async toggleMute() {
    const isCurrentlyLive = mediaController.micState === 'on';
    if (isCurrentlyLive) {
      // Soft mute local track
      if (this.currentCall && mediaController.stream) {
        const track = mediaController.stream.getAudioTracks()[0];
        if (track) track.enabled = false;
      }
      mediaController.softMute();
      socket.emit('webrtc:media-state', { isMuted: true });
    } else {
      // Unmute
      await mediaController.toggleMic();
      if (mediaController.stream) {
        const track = mediaController.stream.getAudioTracks()[0];
        if (track) track.enabled = true;
      }
      socket.emit('webrtc:media-state', { isMuted: false });
    }
    this.notify('state-changed');
  }

  setMuted(muted) {
    const track = mediaController.stream?.getAudioTracks()[0];
    if (track) {
      track.enabled = !muted;
    }
    if (muted) {
      mediaController.softMute();
    }
    socket.emit('webrtc:media-state', { isMuted: Boolean(muted) });
    this.notify('state-changed');
  }

  // ==========================================
  // REMOTE AUDIO ROUTING & ANALYSER
  // ==========================================

  handleRemoteStreamConnected(remoteStream) {
    if (!remoteStream) return;

    if (this.callingTimeoutTimer) {
      clearTimeout(this.callingTimeoutTimer);
      this.callingTimeoutTimer = null;
    }

    this.remoteStream = remoteStream;
    this.callState = 'connected';
    this.startDurationTimer();

    // 1. Set up Web Audio API routing for smooth mobile volume & ducking
    this.setupWebAudio(remoteStream);

    // 2. Set up background HTMLAudioElement
    this.setupAudioElement(remoteStream);

    this.notify('peers-updated', this.getPeers());
    this.notify('state-changed');
  }

  setupWebAudio(stream) {
    if (typeof window === 'undefined') return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    try {
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioContextClass();
      }

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      // Disconnect previous nodes if any
      this.cleanupAudioNodes();

      const source = this.audioContext.createMediaStreamSource(stream);
      const gain = this.audioContext.createGain();
      const analyser = this.audioContext.createAnalyser();

      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;

      const vol = Math.max(0, this.voicesVolume / 100);
      gain.gain.value = vol;

      source.connect(gain);
      gain.connect(this.audioContext.destination);

      source.connect(analyser);

      this.remoteSourceNode = source;
      this.gainNode = gain;
      this.analyserNode = analyser;

      // Start periodic speech level monitoring
      this.startSpeechDetection();

    } catch (err) {
      console.warn('[PeerService] Web Audio setup warning:', err);
    }
  }

  setupAudioElement(stream) {
    if (typeof document === 'undefined') return;

    if (!this.audioElement) {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.playsInline = true;
      audio.setAttribute('playsinline', '');
      audio.setAttribute('webkit-playsinline', '');
      audio.style.display = 'none';
      document.body.appendChild(audio);
      this.audioElement = audio;
    }

    this.audioElement.srcObject = stream;
    this.audioElement.volume = Math.max(0, Math.min(1, this.voicesVolume / 100));

    this.audioElement.play().catch(err => {
      console.debug('[PeerService] Autoplay policy prevented direct audio element playback:', err?.message);
    });
  }

  startSpeechDetection() {
    if (this.analyserInterval) clearInterval(this.analyserInterval);

    const buffer = new Uint8Array(128);

    this.analyserInterval = setInterval(() => {
      if (!this.analyserNode || this.callState !== 'connected') {
        if (this.isRemoteSpeaking) {
          this.isRemoteSpeaking = false;
          this.notify('peers-updated', this.getPeers());
          this.notify('state-changed');
        }
        return;
      }

      try {
        this.analyserNode.getByteTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          const val = (buffer[i] - 128) / 128;
          sum += val * val;
        }
        const rms = Math.sqrt(sum / buffer.length);
        const speakingNow = rms > 0.025;

        if (speakingNow !== this.isRemoteSpeaking) {
          this.isRemoteSpeaking = speakingNow;
          this.notify('peers-updated', this.getPeers());
          this.notify('state-changed');
        }
      } catch {}
    }, 100);
  }

  setVoicesVolume(vol) {
    this.voicesVolume = Math.max(0, Math.min(100, vol));
    const factor = this.voicesVolume / 100;

    if (this.gainNode && this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.gainNode.gain.setTargetAtTime(factor, this.audioContext.currentTime, 0.05);
      } catch {
        this.gainNode.gain.value = factor;
      }
    }

    if (this.audioElement) {
      try {
        this.audioElement.volume = factor;
      } catch {}
    }
  }

  async unlockAudio() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch {}
    }
    if (this.audioElement) {
      try {
        await this.audioElement.play();
      } catch {}
    }
  }

  // ==========================================
  // TIMERS & RESOURCE TEARDOWN
  // ==========================================

  startDurationTimer() {
    if (this.callTimer) clearInterval(this.callTimer);
    this.callDuration = 0;
    this.callTimer = setInterval(() => {
      this.callDuration += 1;
      this.notify('state-changed');
    }, 1000);
  }

  cleanupCallState() {
    if (this.callTimer) {
      clearInterval(this.callTimer);
      this.callTimer = null;
    }
    if (this.callingTimeoutTimer) {
      clearTimeout(this.callingTimeoutTimer);
      this.callingTimeoutTimer = null;
    }
    this.callDuration = 0;
    this.remoteUser = null;
    this.remoteStream = null;
    this.isRemoteSpeaking = false;
  }

  cleanupAudioNodes() {
    if (this.analyserInterval) {
      clearInterval(this.analyserInterval);
      this.analyserInterval = null;
    }

    if (this.remoteSourceNode) {
      try { this.remoteSourceNode.disconnect(); } catch {}
      this.remoteSourceNode = null;
    }

    if (this.gainNode) {
      try { this.gainNode.disconnect(); } catch {}
      this.gainNode = null;
    }

    if (this.analyserNode) {
      try { this.analyserNode.disconnect(); } catch {}
      this.analyserNode = null;
    }

    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.srcObject = null;
        if (this.audioElement.parentNode) {
          this.audioElement.parentNode.removeChild(this.audioElement);
        }
      } catch {}
      this.audioElement = null;
    }
  }

  getDiagnostics() {
    return {
      engine: 'peerjs',
      isReady: this.isReady,
      peerId: this.peerId,
      callState: this.callState,
      hasActiveCall: Boolean(this.currentCall),
      remoteUser: this.remoteUser?.name || null,
      hasRemoteStream: Boolean(this.remoteStream),
      isRemoteSpeaking: this.isRemoteSpeaking,
      callDuration: this.callDuration,
      audioContextState: this.audioContext?.state || 'none'
    };
  }

  destroy() {
    this.endCall('Room left');

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }

    this.isReady = false;
    this.peerId = null;
    this.roomId = null;
    this.user = null;
    this.callState = 'idle';
  }
}

// Singleton export
export const peerService = new PeerService();
export default peerService;
