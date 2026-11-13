/**
 * LiveKit SFU Client Service
 * Audio-only voice communication via LiveKit Room.
 */

import { Room, RoomEvent, Track } from 'livekit-client';
import { getBackendUrl } from './socket.js';

class LiveKitService {
  constructor() {
    this.room = null;
    this.isEnabled = false;
    this.isConnected = false;
    this.listeners = new Set();

    this.localStream = null;
    this.remoteStreams = new Map(); // identity -> MediaStream
    this.participantsData = new Map(); // identity -> ParticipantInfo
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

      if (res.ok) {
        return await res.json();
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
    console.debug('[LiveKitService] Connecting to LiveKit audio room:', roomId);

    this.room = new Room({
      adaptiveStream: true,
      dynacast: false
    });

    this.bindRoomEvents();

    try {
      await this.room.connect(livekitUrl, auth.token);
      this.isConnected = true;
      console.debug('[LiveKitService] Successfully connected to LiveKit room:', this.room.name);

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
   * Publish audio tracks from local MediaStream to LiveKit room
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
    } catch (err) {
      console.error('[LiveKitService] Error publishing local audio stream:', err);
    }
  }

  /**
   * Re-publish a single track after system re-acquisition
   */
  async republishTrack(track) {
    if (!this.room || !this.isConnected || !track || track.kind !== 'audio') return;

    try {
      const existingPub = Array.from(this.room.localParticipant.trackPublications.values()).find(
        p => p.source === Track.Source.Microphone || p.kind === 'audio'
      );

      if (existingPub && existingPub.track) {
        if (typeof existingPub.track.replaceTrack === 'function') {
          await existingPub.track.replaceTrack(track);
        } else {
          await this.room.localParticipant.unpublishTrack(existingPub.track);
          await this.room.localParticipant.publishTrack(track, {
            name: 'microphone',
            source: Track.Source.Microphone
          });
        }
      } else {
        await this.room.localParticipant.publishTrack(track, {
          name: 'microphone',
          source: Track.Source.Microphone
        });
      }
    } catch (err) {
      console.error('[LiveKitService] republishTrack error:', err);
    }
  }

  /**
   * Toggle Microphone on / off
   */
  async setMicrophoneEnabled(enabled) {
    if (!this.room || !this.isConnected) return;
    try {
      await this.room.localParticipant.setMicrophoneEnabled(enabled);
    } catch (err) {
      console.error('[LiveKitService] setMicrophoneEnabled error:', err);
    }
  }

  bindRoomEvents() {
    if (!this.room) return;

    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind !== 'audio') return;
      console.debug(`[LiveKitService] TrackSubscribed from ${participant.identity}`);

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
      const stream = this.remoteStreams.get(participant.identity);
      if (stream && track.mediaStreamTrack) {
        stream.removeTrack(track.mediaStreamTrack);
      }
      this.updateParticipants();
    });

    this.room.on(RoomEvent.TrackMuted, () => {
      this.updateParticipants();
    });

    this.room.on(RoomEvent.TrackUnmuted, () => {
      this.updateParticipants();
    });

    this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const speakerIds = new Set(speakers.map(s => s.identity));
      this.participantsData.forEach((p, identity) => {
        p.isSpeaking = speakerIds.has(identity);
      });
      this.notify('peers-updated', this.getAllPeers());
    });

    this.room.on(RoomEvent.ParticipantConnected, () => {
      this.updateParticipants();
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      this.remoteStreams.delete(participant.identity);
      this.participantsData.delete(participant.identity);
      this.notify('peers-updated', this.getAllPeers());
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
      const isMuted = !participant.isMicrophoneEnabled;
      const stream = this.remoteStreams.get(participant.identity) || null;

      this.participantsData.set(participant.identity, {
        peerId: participant.identity,
        userName: participant.name || participant.identity,
        avatarColor: '#5865f2',
        isMuted,
        isSpeaking: participant.isSpeaking,
        connectionQuality: participant.connectionQuality === 'poor' ? 'poor' : 'good',
        stream
      });
    }

    this.notify('peers-updated', this.getAllPeers());
  }

  getAllPeers() {
    const obj = {};
    for (const [id, data] of this.participantsData.entries()) {
      obj[id] = { ...data };
    }
    return obj;
  }

  async startAudio() {
    if (this.room && typeof this.room.startAudio === 'function') {
      try {
        await this.room.startAudio();
      } catch (err) {
        console.debug('[LiveKitService] startAudio error:', err);
      }
    }
  }

  disconnect() {
    if (this.room) {
      try {
        this.room.disconnect();
      } catch (err) {
        console.debug('[LiveKitService] Disconnect error:', err);
      }
      this.room = null;
    }
    this.isConnected = false;
    this.remoteStreams.clear();
    this.participantsData.clear();
    this.notify('peers-updated', {});
  }
}

export const livekitService = new LiveKitService();
export default livekitService;
