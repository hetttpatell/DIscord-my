/**
 * LiveKit SFU Client Service
 * Manages LiveKit Room connection, track publication, remote track subscription,
 * active speaker detection, connection quality, and screen sharing.
 */

import { Room, RoomEvent, Track } from 'livekit-client';
import { getBackendUrl } from './socket';

class LiveKitService {
  constructor() {
    this.room = null;
    this.isEnabled = false;
    this.isConnected = false;
    this.listeners = new Set();

    this.remoteStreams = new Map(); // identity -> MediaStream
    this.participantsData = new Map(); // identity -> ParticipantInfo
    this.localTracks = [];
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
      const res = await fetch(`${getBackendUrl()}/api/livekit/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, userName, sessionId })
      });

      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (err) {
      console.warn('[LiveKitService] Token fetch failed:', err.message);
    }
    return { enabled: false, reason: 'FETCH_FAILED' };
  }

  /**
   * Connect to LiveKit Room if enabled
   */
  async connectRoom({ roomId, userName, sessionId, localStream, initialMediaState = {} }) {
    // 1. Request token
    const auth = await this.fetchToken(roomId, userName, sessionId);
    if (!auth || !auth.enabled || !auth.token || !auth.url) {
      this.isEnabled = false;
      return false; // Triggers fallback to native WebRTC
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
      await this.room.connect(auth.url, auth.token);
      this.isConnected = true;
      console.debug('[LiveKitService] Successfully connected to LiveKit room:', this.room.name);

      // Publish initial local tracks if available
      if (localStream) {
        await this.publishLocalStream(localStream, initialMediaState);
      }

      this.updateParticipants();
      return true;
    } catch (err) {
      console.error('[LiveKitService] Connection failed:', err);
      this.isEnabled = false;
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Publish tracks from local MediaStream to LiveKit room
   */
  async publishLocalStream(stream, mediaState = {}) {
    if (!this.room || !this.isConnected || !stream) return;

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
        } else if (existingAudioPub.track !== audioTrack) {
          if (typeof existingAudioPub.track?.replaceTrack === 'function') {
            await existingAudioPub.track.replaceTrack(audioTrack);
          } else {
            await this.room.localParticipant.unpublishTrack(existingAudioPub.track);
            await this.room.localParticipant.publishTrack(audioTrack, {
              name: 'microphone',
              source: Track.Source.Microphone
            });
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
        } else if (existingVideoPub.track !== videoTrack) {
          if (typeof existingVideoPub.track?.replaceTrack === 'function') {
            await existingVideoPub.track.replaceTrack(videoTrack);
          } else {
            await this.room.localParticipant.unpublishTrack(existingVideoPub.track);
            await this.room.localParticipant.publishTrack(videoTrack, {
              name: 'camera',
              source: Track.Source.Camera,
              simulcast: true
            });
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
          return;
        }
        await this.room.localParticipant.unpublishTrack(existingPub.track);
      }
      await this.room.localParticipant.publishTrack(track, {
        name: track.kind === 'video' ? 'camera' : 'microphone',
        source: track.kind === 'video' ? Track.Source.Camera : Track.Source.Microphone,
        ...(track.kind === 'video' ? { simulcast: true } : {})
      });
    } catch (err) {
      console.warn('[LiveKitService] republishTrack error:', err);
    }
  }

  /**
   * Mute or unmute microphone
   */
  async setMicrophoneMuted(muted) {
    if (!this.room || !this.isConnected) return;
    try {
      await this.room.localParticipant.setMicrophoneEnabled(!muted);
    } catch (err) {
      console.warn('[LiveKitService] setMicrophoneEnabled error:', err);
    }
  }

  /**
   * Turn camera on or off
   */
  async setCameraEnabled(enabled) {
    if (!this.room || !this.isConnected) return;
    try {
      await this.room.localParticipant.setCameraEnabled(enabled);
    } catch (err) {
      console.warn('[LiveKitService] setCameraEnabled error:', err);
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
          trackId: pub.trackSid || pub.track?.sid || pub.track?.id || null
        });
      }
    }
    return {
      engine: 'livekit',
      connectionState: this.room?.state || (this.isConnected ? 'connected' : 'disconnected'),
      senders
    };
  }
}

export const livekitService = new LiveKitService();
export default livekitService;

