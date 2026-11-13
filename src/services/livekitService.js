/**
 * LiveKit SFU Client Service
 * Manages LiveKit Room connection, track publication, remote track subscription,
 * active speaker detection, connection quality, and screen sharing.
 */

import { Room, RoomEvent, Track } from 'livekit-client';
import { getBackendUrl } from './socket.js';
import { isDebug } from './peerConnectionService.js';

function traceLog(...args) {
  if (isDebug()) {
    console.log('[trace][livekit]', ...args);
  }
}

class LiveKitService {
  constructor() {
    this.room = null;
    this.isEnabled = false;
    this.isConnected = false;
    this.listeners = new Set();

    this.localStream = null;
    this.remoteStreams = new Map(); // identity -> MediaStream
    this.participantsData = new Map(); // identity -> ParticipantInfo
    this.localTracks = [];

    this.diagnosticsInfo = {
      lastAction: null
    };
  }

  recordDiagnostics(method, trackKind, isMuted, isPublished) {
    this.diagnosticsInfo.lastAction = {
      method,
      trackKind,
      isMuted,
      isPublished,
      timestamp: new Date().toISOString()
    };
    traceLog(`Action: ${method}, kind: ${trackKind}, isMuted: ${isMuted}, isPublished: ${isPublished}`);
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
        console.error('[LiveKitService] Listener error:', err);
      }
    });
  }

  /**
   * Request short-lived LiveKit access token from backend
   */
  async fetchToken(roomId, userName, sessionId) {
    try {
      const url = `${getBackendUrl()}/api/livekit/token`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, userName, sessionId })
      });

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        console.error('[LiveKitService] /api/livekit/token returned HTML. Backend URL may be pointing to static frontend origin (Vercel). Verify VITE_BACKEND_URL.');
        return { enabled: false, reason: 'token request failed', error: 'HTML returned from token endpoint' };
      }

      if (res.ok) {
        const data = await res.json();
        return data;
      } else {
        const errData = await res.json().catch(() => ({}));
        return { enabled: false, reason: 'token request failed', error: errData.error || `HTTP ${res.status}` };
      }
    } catch (err) {
      console.warn('[LiveKitService] Token fetch failed:', err.message);
      return { enabled: false, reason: 'token request failed', error: err.message };
    }
  }

  /**
   * Connect to LiveKit Room if enabled
   */
  async connectRoom({ roomId, userName, sessionId, localStream, initialMediaState = {} }) {
    // 1. Request token
    const auth = await this.fetchToken(roomId, userName, sessionId);
    if (!auth || !auth.enabled) {
      this.isEnabled = false;
      const reason = auth?.reason === 'missing credentials' ? 'missing credentials' : 'token request failed';
      return { connected: false, reason, error: auth?.error };
    }

    const livekitUrl = auth.url || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_LIVEKIT_URL);
    if (!livekitUrl || !auth.token) {
      this.isEnabled = false;
      return { connected: false, reason: 'token request failed', error: 'No LiveKit URL or token returned' };
    }

    this.isEnabled = true;
    console.debug('[LiveKitService] Connecting to LiveKit SFU room:', roomId);

    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: { width: 640, height: 360, frameRate: 24 }
      }
    });

    this.bindRoomEvents();

    try {
      await this.room.connect(livekitUrl, auth.token);
      this.isConnected = true;
      console.debug('[LiveKitService] Successfully connected to LiveKit room:', this.room.name);

      // Publish initial local tracks if available
      if (localStream) {
        await this.publishLocalStream(localStream, initialMediaState);
      }

      this.updateParticipants();
      return { connected: true };
    } catch (err) {
      console.error('[LiveKitService] Connection failed:', err);
      this.isEnabled = false;
      this.isConnected = false;
      return { connected: false, reason: 'connect failed', error: err.message };
    }
  }

  /**
   * Publish tracks from local MediaStream to LiveKit room
   */
  async publishLocalStream(stream, mediaState = {}) {
    if (!this.room || !this.isConnected || !stream) return;
    this.localStream = stream;

    try {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack && audioTrack.readyState === 'live') {
        const existingAudioPub = Array.from(this.room.localParticipant.trackPublications.values()).find(
          p => p.source === Track.Source.Microphone || p.kind === 'audio'
        );
        if (!existingAudioPub) {
          const localAudio = await this.room.localParticipant.publishTrack(audioTrack, {
            name: 'microphone',
            source: Track.Source.Microphone
          });
          if (mediaState.isMuted) {
            localAudio.mute();
          }
          this.recordDiagnostics('publishTrack', 'audio', Boolean(mediaState.isMuted), true);
        } else if (existingAudioPub.track !== audioTrack) {
          if (typeof existingAudioPub.track?.replaceTrack === 'function') {
            await existingAudioPub.track.replaceTrack(audioTrack);
            this.recordDiagnostics('replaceTrack', 'audio', Boolean(mediaState.isMuted), true);
          } else {
            await this.room.localParticipant.unpublishTrack(existingAudioPub.track);
            await this.room.localParticipant.publishTrack(audioTrack, {
              name: 'microphone',
              source: Track.Source.Microphone
            });
            this.recordDiagnostics('republishTrack', 'audio', Boolean(mediaState.isMuted), true);
          }
        }
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && videoTrack.readyState === 'live') {
        const existingVideoPub = Array.from(this.room.localParticipant.trackPublications.values()).find(
          p => p.source === Track.Source.Camera || p.kind === 'video'
        );
        if (!existingVideoPub) {
          await this.room.localParticipant.publishTrack(videoTrack, {
            name: 'camera',
            source: Track.Source.Camera,
            simulcast: true
          });
          this.recordDiagnostics('publishTrack', 'video', false, true);
        } else if (existingVideoPub.track !== videoTrack) {
          if (typeof existingVideoPub.track?.replaceTrack === 'function') {
            await existingVideoPub.track.replaceTrack(videoTrack);
            this.recordDiagnostics('replaceTrack', 'video', false, true);
          } else {
            await this.room.localParticipant.unpublishTrack(existingVideoPub.track);
            await this.room.localParticipant.publishTrack(videoTrack, {
              name: 'camera',
              source: Track.Source.Camera,
              simulcast: true
            });
            this.recordDiagnostics('republishTrack', 'video', false, true);
          }
        }
      }
    } catch (err) {
      console.warn('[LiveKitService] Error publishing local tracks:', err);
    }
  }

  /**
   * Republish or replace track across LiveKit (e.g. mobile lifecycle resume)
   */
  async republishTrack(track) {
    if (!this.room || !this.isConnected || !track) return;
    try {
      const existingPub = Array.from(this.room.localParticipant.trackPublications.values()).find(
        p => p.kind === track.kind
      );
      if (existingPub && existingPub.track) {
        if (typeof existingPub.track.replaceTrack === 'function') {
          await existingPub.track.replaceTrack(track);
          this.recordDiagnostics('replaceTrack', track.kind, false, true);
          return;
        }
        await this.room.localParticipant.unpublishTrack(existingPub.track);
      }
      await this.room.localParticipant.publishTrack(track, {
        name: track.kind === 'video' ? 'camera' : 'microphone',
        source: track.kind === 'video' ? Track.Source.Camera : Track.Source.Microphone,
        ...(track.kind === 'video' ? { simulcast: true } : {})
      });
      this.recordDiagnostics('publishTrack', track.kind, false, true);
    } catch (err) {
      console.warn('[LiveKitService] republishTrack error:', err);
    }
  }

  /**
   * Mute or unmute microphone without uncoordinated getUserMedia calls
   */
  async setMicrophoneMuted(muted) {
    if (!this.room || !this.isConnected) return;
    try {
      const existingAudioPub = Array.from(this.room.localParticipant.trackPublications.values()).find(
        p => p.source === Track.Source.Microphone || p.kind === 'audio'
      );
      if (existingAudioPub && existingAudioPub.track) {
        if (muted) {
          await existingAudioPub.mute();
          this.recordDiagnostics('mute', 'audio', true, true);
        } else {
          await existingAudioPub.unmute();
          this.recordDiagnostics('unmute', 'audio', false, true);
        }
      } else if (!muted) {
        // If not published yet, publish audioTrack from localStream
        const audioTrack = this.localStream?.getAudioTracks().find(t => t.readyState === 'live');
        if (audioTrack) {
          await this.room.localParticipant.publishTrack(audioTrack, {
            name: 'microphone',
            source: Track.Source.Microphone
          });
          this.recordDiagnostics('publishTrack', 'audio', false, true);
        }
      }
    } catch (err) {
      console.error('[media] setMicrophoneMuted error:', err);
    }
  }

  /**
   * Turn camera on or off by publishing/unpublishing localStream's video track
   * Never calls internal setCameraEnabled which triggers competing getUserMedia
   */
  async setCameraEnabled(enabled) {
    if (!this.room || !this.isConnected) return;
    try {
      const existingVideoPub = Array.from(this.room.localParticipant.trackPublications.values()).find(
        p => p.source === Track.Source.Camera || p.kind === 'video'
      );

      if (enabled) {
        const videoTrack = this.localStream?.getVideoTracks().find(t => t.readyState === 'live');
        if (videoTrack) {
          if (!existingVideoPub) {
            await this.room.localParticipant.publishTrack(videoTrack, {
              name: 'camera',
              source: Track.Source.Camera,
              simulcast: true
            });
            this.recordDiagnostics('publishTrack', 'video', false, true);
          } else if (existingVideoPub.track !== videoTrack) {
            if (typeof existingVideoPub.track?.replaceTrack === 'function') {
              await existingVideoPub.track.replaceTrack(videoTrack);
              this.recordDiagnostics('replaceTrack', 'video', false, true);
            } else {
              await this.room.localParticipant.unpublishTrack(existingVideoPub.track);
              await this.room.localParticipant.publishTrack(videoTrack, {
                name: 'camera',
                source: Track.Source.Camera,
                simulcast: true
              });
              this.recordDiagnostics('republishTrack', 'video', false, true);
            }
          }
        }
      } else {
        if (existingVideoPub && existingVideoPub.track) {
          await this.room.localParticipant.unpublishTrack(existingVideoPub.track);
          this.recordDiagnostics('unpublishTrack', 'video', true, false);
        }
      }
    } catch (err) {
      console.error('[media] setCameraEnabled error:', err);
    }
  }

  /**
   * Toggle Screen Sharing
   */
  async setScreenShareEnabled(enabled) {
    if (!this.room || !this.isConnected) return;
    try {
      await this.room.localParticipant.setScreenShareEnabled(enabled);
    } catch (err) {
      console.warn('[LiveKitService] setScreenShareEnabled error:', err);
    }
  }

  /**
   * Unlock Audio Playback for LiveKit Room
   */
  async startAudio() {
    if (this.room && typeof this.room.startAudio === 'function') {
      try {
        await this.room.startAudio();
        this.notify('autoplay-changed', false);
      } catch (err) {
        console.warn('[LiveKitService] startAudio error:', err);
      }
    }
  }

  bindRoomEvents() {
    if (!this.room) return;

    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      console.debug('[LiveKitService] Track subscribed:', track.kind, participant.identity);
      let stream = this.remoteStreams.get(participant.identity);
      if (!stream) {
        stream = new MediaStream();
        this.remoteStreams.set(participant.identity, stream);
      }
      if (!stream.getTracks().some(t => t.id === track.mediaStreamTrack.id)) {
        stream.addTrack(track.mediaStreamTrack);
      }
      this.updateParticipants();
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      console.debug('[LiveKitService] Track unsubscribed:', track.kind, participant.identity);
      const stream = this.remoteStreams.get(participant.identity);
      if (stream && track.mediaStreamTrack) {
        stream.removeTrack(track.mediaStreamTrack);
      }
      this.updateParticipants();
    });

    this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const activeIds = new Set(speakers.map(s => s.identity));
      for (const [id, data] of this.participantsData.entries()) {
        data.isSpeaking = activeIds.has(id);
      }
      this.notify('peers-updated', this.getAllPeers());
    });

    this.room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      const data = this.participantsData.get(participant.identity);
      if (data) {
        data.connectionQuality = quality === 0 ? 'poor' : quality === 1 ? 'fair' : 'good';
        this.notify('peers-updated', this.getAllPeers());
      }
    });

    this.room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      const isBlocked = this.room ? !this.room.canPlaybackAudio : false;
      this.notify('autoplay-changed', isBlocked);
    });

    this.room.on(RoomEvent.ParticipantConnected, () => this.updateParticipants());
    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      this.remoteStreams.delete(participant.identity);
      this.participantsData.delete(participant.identity);
      this.updateParticipants();
    });

    this.room.on(RoomEvent.Disconnected, () => {
      this.isConnected = false;
      this.remoteStreams.clear();
      this.participantsData.clear();
      this.notify('peers-updated', {});
    });
  }

  updateParticipants() {
    if (!this.room) return;

    for (const participant of this.room.remoteParticipants.values()) {
      const stream = this.remoteStreams.get(participant.identity) || null;
      const isMuted = !participant.isMicrophoneEnabled;
      const isCameraOff = !participant.isCameraEnabled;

      this.participantsData.set(participant.identity, {
        peerId: participant.identity,
        userName: participant.name || 'Member',
        avatarColor: '#5865f2',
        isMuted,
        isCameraOff,
        isSpeaking: participant.isSpeaking,
        connectionQuality: 'good',
        stream
      });
    }

    this.notify('peers-updated', this.getAllPeers());
  }

  getAllPeers() {
    const peers = {};
    for (const [id, data] of this.participantsData.entries()) {
      peers[id] = { ...data };
    }
    return peers;
  }

  /**
   * Disconnect cleanly from LiveKit room
   */
  disconnect() {
    if (this.room) {
      try {
        this.room.disconnect();
      } catch {}
      this.room = null;
    }
    this.isConnected = false;
    this.isEnabled = false;
    this.remoteStreams.clear();
    this.participantsData.clear();
    this.notify('peers-updated', {});
  }

  getDiagnostics() {
    const senders = [];
    if (this.room && this.room.localParticipant) {
      for (const pub of this.room.localParticipant.trackPublications.values()) {
        senders.push({
          kind: pub.kind,
          source: pub.source,
          trackId: pub.trackSid || pub.track?.sid || pub.track?.id || null,
          isMuted: Boolean(pub.isMuted),
          readyState: pub.track?.mediaStreamTrack?.readyState || 'unknown'
        });
      }
    }
    return {
      engine: 'livekit',
      connectionState: this.room?.state || (this.isConnected ? 'connected' : 'disconnected'),
      senders,
      diagnostics: this.diagnosticsInfo
    };
  }
}

export const livekitService = new LiveKitService();
export default livekitService;

