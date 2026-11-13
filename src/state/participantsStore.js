/**
 * participantsStore.js
 * Unified Participant Store for afterspot.
 *
 * Built with useSyncExternalStore.
 * Single source of truth for:
 * - Local participant & remote peers
 * - Merged presence from signaling, LiveKit SFU, and WebRTC mesh
 * - Active speaker arbitration (300 ms sustained, 1500 ms holdover)
 * - Audio levels outside React state (refs / direct subscription)
 * - Fine-grained selectors that prevent tile re-renders on unrelated changes.
 */

import { useSyncExternalStore, useCallback, useEffect, useState } from 'react';
import socket from '../services/socket.js';
import mediaController from '../services/mediaController.js';
import livekitService from '../services/livekitService.js';
import peerConnectionService from '../services/peerConnectionService.js';

export function normalizeQuality(q) {
  if (q === 'good' || q === 'poor') return q;
  if (q === 'medium' || q === 'fair') return 'medium';
  return 'unknown';
}

function createParticipantRecord(data = {}) {
  const isLocal = Boolean(data.isLocal);
  return {
    id: data.id || (isLocal ? 'local' : 'unknown'),
    clientId: data.clientId || data.id || 'unknown',
    name: data.name || (isLocal ? 'You' : 'Member'),
    isLocal,
    isHost: Boolean(data.isHost),
    audioEnabled: data.audioEnabled !== undefined ? Boolean(data.audioEnabled) : true,
    videoEnabled: data.videoEnabled !== undefined ? Boolean(data.videoEnabled) : false,
    isScreenSharing: Boolean(data.isScreenSharing),
    handRaisedAt: typeof data.handRaisedAt === 'number' ? data.handRaisedAt : null,
    connectionQuality: normalizeQuality(data.connectionQuality),
    stream: data.stream || null,
    joinedAt: data.joinedAt || Date.now(),
    avatarColor: data.avatarColor || '#5865f2',
    lastActiveSpeakerAt: data.lastActiveSpeakerAt || 0
  };
}

class ParticipantsStore {
  constructor() {
    this.participants = new Map(); // id -> participantRecord
    this.participantIds = [];
    this.participantsList = [];
    this.activeSpeakerId = null;

    // Active speaker arbiter
    this.currentSpeakerBecameActiveAt = 0;
    this.speechCandidateId = null;
    this.speechCandidateStartedAt = 0;
    this.speechCandidateTimer = null;
    this.speechHoldTimer = null;

    // Audio levels outside React state
    this.audioLevels = new Map(); // id -> number (0 to 1)
    this.audioLevelListeners = new Map(); // id -> Set of callbacks

    // React Store Listeners
    this.globalListeners = new Set();
    this.participantListeners = new Map(); // id -> Set of callbacks
    this.activeSpeakerListeners = new Set();
    this.idsListeners = new Set();

    // Auto-binding
    this.subscribe = this.subscribe.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
    this.getActiveSpeakerId = this.getActiveSpeakerId.bind(this);
    this.getParticipantIds = this.getParticipantIds.bind(this);

    // Initial setup with mediaController & services
    this.initialized = false;
  }

  init({ currentUser, roomId }) {
    this.roomId = roomId || null;
    if (this.initialized) {
      this.setLocalUser(currentUser);
      return;
    }
    this.initialized = true;

    if (currentUser) {
      this.setLocalUser(currentUser);
    }

    this.bindServicesAndSocket();
  }

  reset() {
    if (this.speechCandidateTimer) clearTimeout(this.speechCandidateTimer);
    if (this.speechHoldTimer) clearTimeout(this.speechHoldTimer);
    this.speechCandidateTimer = null;
    this.speechHoldTimer = null;
    this.speechCandidateId = null;
    this.speechCandidateStartedAt = 0;
    this.activeSpeakerId = null;
    this.currentSpeakerBecameActiveAt = 0;

    this.participants.clear();
    this.audioLevels.clear();
    this._recomputeCaches();
    this._notifyAll();
  }

  // ==========================================
  // SUBSCRIPTIONS & SELECTORS
  // ==========================================

  subscribe(listener) {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  }

  subscribeIds(listener) {
    this.idsListeners.add(listener);
    return () => this.idsListeners.delete(listener);
  }

  subscribeActiveSpeaker(listener) {
    this.activeSpeakerListeners.add(listener);
    return () => this.activeSpeakerListeners.delete(listener);
  }

  subscribeParticipant(id, listener) {
    if (!this.participantListeners.has(id)) {
      this.participantListeners.set(id, new Set());
    }
    const set = this.participantListeners.get(id);
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.participantListeners.delete(id);
    };
  }

  subscribeAudioLevel(id, listener) {
    if (!this.audioLevelListeners.has(id)) {
      this.audioLevelListeners.set(id, new Set());
    }
    const set = this.audioLevelListeners.get(id);
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.audioLevelListeners.delete(id);
    };
  }

  getSnapshot() {
    return this.participantsList;
  }

  getParticipantIds() {
    return this.participantIds;
  }

  getActiveSpeakerId() {
    return this.activeSpeakerId;
  }

  getParticipant(id) {
    return this.participants.get(id) || null;
  }

  getLocalParticipant() {
    for (const p of this.participants.values()) {
      if (p.isLocal) return p;
    }
    return null;
  }

  getAudioLevel(id) {
    return this.audioLevels.get(id) || 0;
  }

  setAudioLevel(id, level) {
    this.audioLevels.set(id, level);
    const listeners = this.audioLevelListeners.get(id);
    if (listeners && listeners.size > 0) {
      listeners.forEach(cb => {
        try {
          cb(level);
        } catch {}
      });
    }
  }

  // ==========================================
  // NOTIFICATIONS
  // ==========================================

  _recomputeCaches() {
    this.participantsList = Array.from(this.participants.values());
    this.participantIds = this.participantsList.map(p => p.id);
  }

  _notifyParticipant(id) {
    const listeners = this.participantListeners.get(id);
    if (listeners) {
      listeners.forEach(cb => {
        try {
          cb();
        } catch {}
      });
    }
    this.globalListeners.forEach(cb => {
      try {
        cb();
      } catch {}
    });
  }

  _notifyActiveSpeaker() {
    this.activeSpeakerListeners.forEach(cb => {
      try {
        cb();
      } catch {}
    });
    this.globalListeners.forEach(cb => {
      try {
        cb();
      } catch {}
    });
  }

  _notifyIds() {
    this.idsListeners.forEach(cb => {
      try {
        cb();
      } catch {}
    });
  }

  _notifyAll() {
    this.idsListeners.forEach(cb => {
      try { cb(); } catch {}
    });
    this.activeSpeakerListeners.forEach(cb => {
      try { cb(); } catch {}
    });
    this.globalListeners.forEach(cb => {
      try { cb(); } catch {}
    });
  }

  // ==========================================
  // ACTIVE SPEAKER ARBITER
  // ==========================================

  reportSpeechActivity(id, isSpeaking) {
    if (!id) return;

    if (isSpeaking) {
      // If already active speaker, just update timestamp
      if (this.activeSpeakerId === id) {
        const p = this.participants.get(id);
        if (p) {
          p.lastActiveSpeakerAt = Date.now();
        }
        return;
      }

      // Candidate handling
      if (this.speechCandidateId !== id) {
        this.speechCandidateId = id;
        this.speechCandidateStartedAt = Date.now();

        if (this.speechCandidateTimer) clearTimeout(this.speechCandidateTimer);
        this.speechCandidateTimer = setTimeout(() => {
          this._promoteCandidateIfEligible(id);
        }, 300);
      }
    } else {
      // Ceased speaking
      if (this.speechCandidateId === id) {
        this.speechCandidateId = null;
        this.speechCandidateStartedAt = 0;
        if (this.speechCandidateTimer) {
          clearTimeout(this.speechCandidateTimer);
          this.speechCandidateTimer = null;
        }
        if (this.speechHoldTimer) {
          clearTimeout(this.speechHoldTimer);
          this.speechHoldTimer = null;
        }
      }
    }
  }

  _promoteCandidateIfEligible(id) {
    if (this.speechCandidateId !== id) return;

    const now = Date.now();
    const timeSinceActive = now - this.currentSpeakerBecameActiveAt;

    if (!this.activeSpeakerId || timeSinceActive >= 1500) {
      this._setActiveSpeaker(id);
    } else {
      const waitMs = Math.max(50, 1500 - timeSinceActive);
      if (this.speechHoldTimer) clearTimeout(this.speechHoldTimer);
      this.speechHoldTimer = setTimeout(() => {
        if (this.speechCandidateId === id) {
          this._setActiveSpeaker(id);
        }
      }, waitMs);
    }
  }

  _setActiveSpeaker(id) {
    if (this.activeSpeakerId === id) return;
    this.activeSpeakerId = id;
    this.currentSpeakerBecameActiveAt = Date.now();

    if (id && this.participants.has(id)) {
      const p = this.participants.get(id);
      this.participants.set(id, {
        ...p,
        lastActiveSpeakerAt: this.currentSpeakerBecameActiveAt
      });
      this._notifyParticipant(id);
    }

    this._notifyActiveSpeaker();
  }

  // ==========================================
  // PARTICIPANT MUTATIONS
  // ==========================================

  setLocalUser(currentUser) {
    if (!currentUser) return;
    const localId = currentUser.id || socket.id || 'local';

    const existing = this.participants.get(localId) || this.getLocalParticipant();
    const mediaState = mediaController.getState();

    const record = createParticipantRecord({
      ...(existing || {}),
      id: localId,
      clientId: currentUser.clientId || currentUser.sessionId || localId,
      name: currentUser.name || 'You',
      isLocal: true,
      isHost: Boolean(currentUser.isHost),
      avatarColor: currentUser.avatarColor || '#5865f2',
      audioEnabled: mediaState.isMicOn,
      videoEnabled: mediaState.isCameraOn,
      stream: mediaController.stream,
      connectionQuality: 'good'
    });

    if (existing && existing.id !== localId) {
      this.participants.delete(existing.id);
    }

    this.participants.set(localId, record);
    this._recomputeCaches();
    this._notifyParticipant(localId);
    this._notifyIds();
  }

  setSignalingMembers(members = []) {
    let idsChanged = false;

    // Preserve local user
    const local = this.getLocalParticipant();

    // Map members by id
    const memberMap = new Map();
    members.forEach(m => memberMap.set(m.id, m));

    // Remove participants who left room
    for (const [id, p] of this.participants.entries()) {
      if (!p.isLocal && !memberMap.has(id)) {
        this.participants.delete(id);
        if (this.activeSpeakerId === id) {
          this.activeSpeakerId = null;
        }
        idsChanged = true;
      }
    }

    // Add or update members
    members.forEach(m => {
      const isLocal = local && (m.id === local.id || m.clientId === local.clientId);
      if (isLocal) {
        // Update local host / name if changed
        if (local.isHost !== Boolean(m.isHost) || local.name !== m.name) {
          this.participants.set(local.id, {
            ...local,
            name: m.name,
            isHost: Boolean(m.isHost)
          });
          this._notifyParticipant(local.id);
        }
        return;
      }

      const existing = this.participants.get(m.id);
      if (!existing) {
        const record = createParticipantRecord({
          id: m.id,
          clientId: m.clientId || m.id,
          name: m.name,
          isLocal: false,
          isHost: Boolean(m.isHost),
          avatarColor: m.avatarColor || '#5865f2',
          audioEnabled: false,
          videoEnabled: false,
          connectionQuality: 'unknown',
          joinedAt: m.joinedAt || Date.now()
        });
        this.participants.set(m.id, record);
        idsChanged = true;
      } else {
        const updated = {
          ...existing,
          name: m.name || existing.name,
          isHost: Boolean(m.isHost),
          avatarColor: m.avatarColor || existing.avatarColor
        };
        this.participants.set(m.id, updated);
        this._notifyParticipant(m.id);
      }
    });

    this._recomputeCaches();
    if (idsChanged) {
      this._notifyIds();
      this._notifyAll();
    }
  }

  syncPeers(peers = {}) {
    let idsChanged = false;

    for (const [peerId, peerData] of Object.entries(peers)) {
      if (!peerId) continue;
      const existing = this.participants.get(peerId);

      const audioEnabled = peerData.isMuted !== undefined
        ? !peerData.isMuted
        : (existing ? existing.audioEnabled : false);

      const videoEnabled = peerData.isCameraOff !== undefined
        ? !peerData.isCameraOff
        : (existing ? existing.videoEnabled : false);

      const isScreenSharing = peerData.isScreenSharing !== undefined
        ? Boolean(peerData.isScreenSharing)
        : (existing ? existing.isScreenSharing : false);

      const connectionQuality = normalizeQuality(peerData.connectionQuality || existing?.connectionQuality);
      const stream = peerData.stream || existing?.stream || null;

      if (!existing) {
        const record = createParticipantRecord({
          id: peerId,
          clientId: peerData.clientId || peerId,
          name: peerData.userName || 'Member',
          isLocal: false,
          isHost: false,
          avatarColor: peerData.avatarColor || '#5865f2',
          audioEnabled,
          videoEnabled,
          isScreenSharing,
          connectionQuality,
          stream
        });
        this.participants.set(peerId, record);
        idsChanged = true;
      } else {
        const hasChange =
          existing.audioEnabled !== audioEnabled ||
          existing.videoEnabled !== videoEnabled ||
          existing.isScreenSharing !== isScreenSharing ||
          existing.connectionQuality !== connectionQuality ||
          existing.stream !== stream;

        if (hasChange) {
          this.participants.set(peerId, {
            ...existing,
            audioEnabled,
            videoEnabled,
            isScreenSharing,
            connectionQuality,
            stream
          });
          this._notifyParticipant(peerId);
        }
      }

      // Speech reporting
      if (peerData.isSpeaking !== undefined) {
        this.reportSpeechActivity(peerId, Boolean(peerData.isSpeaking));
      }
    }

    this._recomputeCaches();
    if (idsChanged) {
      this._notifyIds();
      this._notifyAll();
    }
  }

  setHandRaised(peerId, handRaisedAt) {
    const p = this.participants.get(peerId);
    if (p) {
      this.participants.set(peerId, {
        ...p,
        handRaisedAt: handRaisedAt || null
      });
      this._recomputeCaches();
      this._notifyParticipant(peerId);
    }
  }

  updateLocalMediaState({ isMicOn, isCameraOn, stream, isScreenSharing }) {
    const local = this.getLocalParticipant();
    if (!local) return;

    const updated = {
      ...local,
      audioEnabled: isMicOn !== undefined ? Boolean(isMicOn) : local.audioEnabled,
      videoEnabled: isCameraOn !== undefined ? Boolean(isCameraOn) : local.videoEnabled,
      stream: stream !== undefined ? stream : local.stream,
      isScreenSharing: isScreenSharing !== undefined ? Boolean(isScreenSharing) : local.isScreenSharing
    };

    this.participants.set(local.id, updated);
    this._recomputeCaches();
    this._notifyParticipant(local.id);
  }

  // ==========================================
  // SERVICE BINDINGS
  // ==========================================

  bindServicesAndSocket() {
    // 1. mediaController listener
    mediaController.subscribe((event, payload, state) => {
      const current = state || payload || mediaController.getState();
      if (!current) return;

      this.updateLocalMediaState({
        isMicOn: current.isMicOn,
        isCameraOn: current.isCameraOn,
        stream: current.stream
      });

      const local = this.getLocalParticipant();
      if (local) {
        this.reportSpeechActivity(local.id, Boolean(current.isSpeaking));
      }
    });

    // 2. LiveKit Service listener
    livekitService.subscribe((event, payload) => {
      if (event === 'peers-updated') {
        this.syncPeers(payload || {});
      }
    });

    // 3. WebRTC mesh listener
    peerConnectionService.subscribe((event, payload) => {
      if (event === 'peers-updated') {
        this.syncPeers(payload || {});
      }
    });

    // 4. Socket presence and hand-raise listeners
    socket.on('room:members-updated', ({ members }) => {
      if (Array.isArray(members)) {
        this.setSignalingMembers(members);
      }
    });

    socket.on('webrtc:media-state-updated', ({ peerId, isMuted, isCameraOff, isScreenSharing }) => {
      if (!peerId) return;
      const existing = this.participants.get(peerId);
      if (existing) {
        this.participants.set(peerId, {
          ...existing,
          audioEnabled: isMuted !== undefined ? !isMuted : existing.audioEnabled,
          videoEnabled: isCameraOff !== undefined ? !isCameraOff : existing.videoEnabled,
          isScreenSharing: isScreenSharing !== undefined ? Boolean(isScreenSharing) : existing.isScreenSharing
        });
        this._recomputeCaches();
        this._notifyParticipant(peerId);
      }
    });

    socket.on('webrtc:peer-left', ({ peerId }) => {
      if (peerId && this.participants.has(peerId)) {
        this.participants.delete(peerId);
        if (this.activeSpeakerId === peerId) {
          this.activeSpeakerId = null;
        }
        this._recomputeCaches();
        this._notifyIds();
        this._notifyAll();
      }
    });

    socket.on('participant:hand-raised', ({ peerId, handRaisedAt }) => {
      this.setHandRaised(peerId, handRaisedAt);
    });
  }
}

// Singleton export
export const participantsStore = new ParticipantsStore();

// ==========================================
// REACT HOOKS (FINE-GRAINED SELECTORS)
// ==========================================

export function useParticipantsList() {
  return useSyncExternalStore(
    participantsStore.subscribe,
    participantsStore.getSnapshot,
    participantsStore.getSnapshot
  );
}

export function useParticipantIds() {
  return useSyncExternalStore(
    participantsStore.subscribeIds,
    participantsStore.getParticipantIds,
    participantsStore.getParticipantIds
  );
}

export function useActiveSpeakerId() {
  return useSyncExternalStore(
    participantsStore.subscribeActiveSpeaker,
    participantsStore.getActiveSpeakerId,
    participantsStore.getActiveSpeakerId
  );
}

export function useParticipant(id) {
  const subscribe = useCallback(
    (onStoreChange) => participantsStore.subscribeParticipant(id, onStoreChange),
    [id]
  );
  const getSnapshot = useCallback(
    () => participantsStore.getParticipant(id),
    [id]
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useLocalParticipant() {
  const local = participantsStore.getLocalParticipant();
  const localId = local?.id || 'local';
  return useParticipant(localId);
}

export function useAudioLevel(id) {
  const [level, setLevel] = useState(() => participantsStore.getAudioLevel(id));

  useEffect(() => {
    return participantsStore.subscribeAudioLevel(id, setLevel);
  }, [id]);

  return level;
}

export default participantsStore;
