/**
 * participantsStore.js
 * Unified Audio Participant Store for afterspot.
 *
 * Built with useSyncExternalStore.
 * Single source of truth for:
 * - Local participant & remote audio peers
 * - Active speaker arbitration (300 ms sustained, 1500 ms holdover)
 * - Audio levels outside React state (refs / direct subscription)
 */

import { useSyncExternalStore, useCallback } from 'react';
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
    this.subscribeIds = this.subscribeIds.bind(this);
    this.subscribeActiveSpeaker = this.subscribeActiveSpeaker.bind(this);
    this.subscribeParticipant = this.subscribeParticipant.bind(this);
    this.subscribeAudioLevel = this.subscribeAudioLevel.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
    this.getActiveSpeakerId = this.getActiveSpeakerId.bind(this);
    this.getParticipantIds = this.getParticipantIds.bind(this);
    this.getParticipant = this.getParticipant.bind(this);
    this.getLocalParticipant = this.getLocalParticipant.bind(this);
    this.getAudioLevel = this.getAudioLevel.bind(this);

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
    this.participants.clear();
    this.participantIds = [];
    this.participantsList = [];
    this.activeSpeakerId = null;
    this.speechCandidateId = null;
    this.speechCandidateStartedAt = 0;
    if (this.speechCandidateTimer) clearTimeout(this.speechCandidateTimer);
    if (this.speechHoldTimer) clearTimeout(this.speechHoldTimer);
    this.audioLevels.clear();
    this._recomputeCaches();
  }

  // ==========================================
  // SUBSCRIPTIONS
  // ==========================================

  subscribe = (listener) => {
    const target = this?.globalListeners ? this : participantsStore;
    if (!target?.globalListeners) return () => {};
    target.globalListeners.add(listener);
    return () => target.globalListeners.delete(listener);
  };

  subscribeIds = (listener) => {
    const target = this?.idsListeners ? this : participantsStore;
    if (!target?.idsListeners) return () => {};
    target.idsListeners.add(listener);
    return () => target.idsListeners.delete(listener);
  };

  subscribeActiveSpeaker = (listener) => {
    const target = this?.activeSpeakerListeners ? this : participantsStore;
    if (!target?.activeSpeakerListeners) return () => {};
    target.activeSpeakerListeners.add(listener);
    return () => target.activeSpeakerListeners.delete(listener);
  };

  subscribeParticipant = (id, listener) => {
    const target = this?.participantListeners ? this : participantsStore;
    if (!target?.participantListeners) return () => {};
    if (!target.participantListeners.has(id)) {
      target.participantListeners.set(id, new Set());
    }
    const set = target.participantListeners.get(id);
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) target.participantListeners.delete(id);
    };
  };

  subscribeAudioLevel = (id, listener) => {
    const target = this?.audioLevelListeners ? this : participantsStore;
    if (!target?.audioLevelListeners) return () => {};
    if (!target.audioLevelListeners.has(id)) {
      target.audioLevelListeners.set(id, new Set());
    }
    const set = target.audioLevelListeners.get(id);
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) target.audioLevelListeners.delete(id);
    };
  };

  getSnapshot = () => {
    const target = this?.participantsList ? this : participantsStore;
    return target?.participantsList || [];
  };

  getParticipantIds = () => {
    const target = this?.participantIds ? this : participantsStore;
    return target?.participantIds || [];
  };

  getActiveSpeakerId = () => {
    const target = this?.participants ? this : participantsStore;
    return target?.activeSpeakerId || null;
  };

  getParticipant = (id) => {
    const target = this?.participants ? this : participantsStore;
    return target?.participants?.get(id) || null;
  };

  getLocalParticipant = () => {
    const target = this?.participants ? this : participantsStore;
    if (!target?.participants) return null;
    for (const p of target.participants.values()) {
      if (p.isLocal) return p;
    }
    return null;
  };

  getAudioLevel = (id) => {
    const target = this?.audioLevels ? this : participantsStore;
    return target?.audioLevels?.get(id) || 0;
  };

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
      if (this.activeSpeakerId === id) {
        const p = this.participants.get(id);
        if (p) {
          p.lastActiveSpeakerAt = Date.now();
        }
        return;
      }

      if (this.speechCandidateId !== id) {
        this.speechCandidateId = id;
        this.speechCandidateStartedAt = Date.now();

        if (this.speechCandidateTimer) clearTimeout(this.speechCandidateTimer);
        this.speechCandidateTimer = setTimeout(() => {
          this._promoteCandidateIfEligible(id);
        }, 300);
      }
    } else {
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
    const local = this.getLocalParticipant();
    const memberMap = new Map();
    members.forEach(m => memberMap.set(m.id, m));

    for (const [id, p] of this.participants.entries()) {
      if (p.isLocal) continue;
      if (!memberMap.has(id)) {
        this.participants.delete(id);
        idsChanged = true;
        if (this.activeSpeakerId === id) {
          this.activeSpeakerId = null;
        }
      }
    }

    for (const member of members) {
      if (local && (member.id === local.id || member.clientId === local.clientId)) {
        continue;
      }

      const existing = this.participants.get(member.id);
      if (!existing) {
        this.participants.set(member.id, createParticipantRecord({
          id: member.id,
          clientId: member.clientId || member.sessionId || member.id,
          name: member.name || 'Member',
          isLocal: false,
          isHost: Boolean(member.isHost),
          avatarColor: member.avatarColor || '#5865f2',
          audioEnabled: true,
          connectionQuality: 'good'
        }));
        idsChanged = true;
      } else {
        const updated = {
          ...existing,
          name: member.name || existing.name,
          isHost: Boolean(member.isHost),
          avatarColor: member.avatarColor || existing.avatarColor
        };
        this.participants.set(member.id, updated);
        this._notifyParticipant(member.id);
      }
    }

    this._recomputeCaches();
    if (idsChanged) {
      this._notifyIds();
    }
    this._notifyAll();
  }

  syncPeers(peers = {}) {
    let changed = false;

    for (const [peerId, peer] of Object.entries(peers)) {
      const existing = this.participants.get(peerId);
      if (!existing) {
        this.participants.set(peerId, createParticipantRecord({
          id: peerId,
          clientId: peer.clientId || peerId,
          name: peer.userName || 'Member',
          avatarColor: peer.avatarColor || '#5865f2',
          audioEnabled: !peer.isMuted,
          connectionQuality: peer.connectionQuality || 'good',
          stream: peer.stream || null
        }));
        changed = true;
      } else {
        const audioEnabled = !peer.isMuted;
        if (
          existing.audioEnabled !== audioEnabled ||
          existing.stream !== (peer.stream || null) ||
          existing.connectionQuality !== normalizeQuality(peer.connectionQuality)
        ) {
          this.participants.set(peerId, {
            ...existing,
            audioEnabled,
            stream: peer.stream || existing.stream,
            connectionQuality: normalizeQuality(peer.connectionQuality || existing.connectionQuality)
          });
          this._notifyParticipant(peerId);
        }
      }

      this.reportSpeechActivity(peerId, Boolean(peer.isSpeaking));
    }

    if (changed) {
      this._recomputeCaches();
      this._notifyIds();
      this._notifyAll();
    }
  }

  bindServicesAndSocket() {
    mediaController.subscribe((event, payload, state) => {
      const local = this.getLocalParticipant();
      if (!local) return;

      const current = state || payload || mediaController.getState();
      const isMicOn = Boolean(current.isMicOn);
      const isSpeaking = Boolean(current.isSpeaking);

      if (local.audioEnabled !== isMicOn || local.stream !== current.stream) {
        this.participants.set(local.id, {
          ...local,
          audioEnabled: isMicOn,
          stream: current.stream || null
        });
        this._notifyParticipant(local.id);
      }

      this.reportSpeechActivity(local.id, isSpeaking);
    });

    livekitService.subscribe((event, payload) => {
      if (event === 'peers-updated') {
        this.syncPeers(payload || {});
      }
    });

    peerConnectionService.subscribe((event, payload) => {
      if (event === 'peers-updated') {
        this.syncPeers(payload || {});
      }
    });

    socket.on('room:members-updated', ({ members }) => {
      if (Array.isArray(members)) {
        this.setSignalingMembers(members);
      }
    });

    socket.on('webrtc:media-state-updated', ({ peerId, isMuted }) => {
      if (!peerId) return;
      const existing = this.participants.get(peerId);
      if (existing) {
        this.participants.set(peerId, {
          ...existing,
          audioEnabled: isMuted !== undefined ? !isMuted : existing.audioEnabled
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
  }
}

// Singleton export
export const participantsStore = new ParticipantsStore();

// REACT HOOKS
export function useParticipantIds() {
  return useSyncExternalStore(
    participantsStore.subscribeIds,
    participantsStore.getParticipantIds,
    participantsStore.getParticipantIds
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

export function useActiveSpeakerId() {
  return useSyncExternalStore(
    participantsStore.subscribeActiveSpeaker,
    participantsStore.getActiveSpeakerId,
    participantsStore.getActiveSpeakerId
  );
}

export function useLocalParticipant() {
  return useSyncExternalStore(
    participantsStore.subscribe,
    participantsStore.getLocalParticipant,
    participantsStore.getLocalParticipant
  );
}

export default participantsStore;
