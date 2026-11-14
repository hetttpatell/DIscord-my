/**
 * MediaController
 * Single source of truth for audio microphone state across the application.
 *
 * Explicit Mic States:
 * - micState: 'off' | 'requesting' | 'on' | 'soft-muted' | 'blocked' | 'error'
 *
 * Concurrency:
 * - One in-flight audio operation.
 * - While requesting, additional taps are coalesced: only the latest intent runs after current one finishes.
 *
 * Policy:
 * - Microphone starts OFF.
 * - The first tap on the mic button acquires the microphone with ideal audio constraints.
 * - After first acquisition, the track is kept alive in localStream and track.enabled
 *   is toggled for instant mute/unmute without renegotiation.
 * - Track cleanup happens ONLY on leaving the room, never on component mount/unmount.
 */

import mediaService from './mediaService.js';
import { logMediaDebug } from './mediaLogger.js';

export class MediaController {
  constructor() {
    this.micState = 'off'; // 'off' | 'requesting' | 'on' | 'soft-muted' | 'blocked' | 'error'
    this.isSpeaking = false;
    this.error = null;
    this.isAudioMutedBySystem = false;

    // Concurrency queue
    this.audioInFlight = false;
    this.pendingAudioIntent = null; // 'on' | 'off' | null

    this.listeners = new Set();

    // Re-acquire guard (throttled to 1 attempt per 3s, max 3 consecutive failures)
    this.lastReacquireAttemptAt = 0;
    this.consecutiveReacquireFailures = 0;

    // Restore saved devices
    try {
      if (typeof localStorage !== 'undefined') {
        const savedMic = localStorage.getItem('tt_preferred_mic');
        if (savedMic) mediaService.selectedMicId = savedMic;
        const savedSpk = localStorage.getItem('tt_preferred_speaker');
        if (savedSpk) mediaService.selectedSpeakerId = savedSpk;
      }
    } catch {}

    // Initialize listeners
    this.initMediaServiceListeners();
    this.setupPermissionChangeListeners();
    this.setupMobileLifecycleListeners();
  }

  get stream() {
    return mediaService.localStream;
  }

  get isSecureContext() {
    return typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false;
  }

  getState() {
    return {
      stream: this.stream || null,
      micState: this.micState || 'off',
      isMicOn: this.micState === 'on',
      isSpeaking: Boolean(this.isSpeaking),
      error: this.error || null,
      isSecureContext: this.isSecureContext,
      isAudioMutedBySystem: Boolean(this.isAudioMutedBySystem),
      selectedMicId: mediaService.selectedMicId || '',
      selectedSpeakerId: mediaService.selectedSpeakerId || ''
    };
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => { };
    this.listeners.add(listener);
    const state = this.getState();
    try {
      listener('state-changed', state, state);
    } catch (err) {
      console.error('[media] Subscriber error:', err);
    }
    return () => this.listeners.delete(listener);
  }

  notify(event = 'state-changed', payload = {}) {
    const state = this.getState();
    const effectivePayload = (payload !== undefined && payload !== null) ? payload : state;
    this.listeners.forEach(cb => {
      try {
        cb(event, effectivePayload, state);
      } catch (err) {
        console.error('[media] Subscriber error:', err);
      }
    });
  }

  resetReacquireGuard() {
    this.consecutiveReacquireFailures = 0;
    this.lastReacquireAttemptAt = 0;
  }

  // MICROPHONE API & COALESCING
  async toggleMic() {
    if (this.micState === 'on' || this.micState === 'requesting') {
      return this.disableMic();
    } else {
      return this.enableMic();
    }
  }

  async enableMic() {
    if (this.audioInFlight) {
      this.pendingAudioIntent = 'on';
      return;
    }
    this.audioInFlight = true;

    try {
      const existingTrack = this.stream?.getAudioTracks().find(t => t.readyState === 'live');
      if (existingTrack) {
        existingTrack.enabled = true;
        mediaService.isMicOn = true;
        this.micState = 'on';
        this.isAudioMutedBySystem = false;
        mediaService.initSpeakingDetector();
        this.notify('state-changed', { micState: 'on' });
        this.audioInFlight = false;
        return existingTrack;
      }

      this.micState = 'requesting';
      this.notify('state-changed', { micState: 'requesting' });

      const track = await mediaService.acquireAudioTrack(false);
      if (track) {
        this.micState = 'on';
        this.error = null;
        this.consecutiveReacquireFailures = 0;
      } else {
        const lastErr = mediaService.lastError;
        const permissionStatus = await mediaService.checkMicPermission();

        if (lastErr?.type === 'INSECURE_CONTEXT' || !this.isSecureContext) {
          this.micState = 'insecure';
        } else if (permissionStatus === 'denied' || lastErr?.type === 'PERMISSION_DENIED') {
          this.micState = 'blocked';
        } else {
          this.micState = 'error';
        }
        this.error = lastErr;
      }
    } catch (err) {
      console.error('[media] enableMic error:', err);
      const parsedErr = mediaService.parseMediaError(err, 'audio');
      const permissionStatus = await mediaService.checkMicPermission();

      if (parsedErr.type === 'INSECURE_CONTEXT' || !this.isSecureContext) {
        this.micState = 'insecure';
      } else if (permissionStatus === 'denied' || parsedErr.type === 'PERMISSION_DENIED') {
        this.micState = 'blocked';
      } else {
        this.micState = 'error';
      }
      this.error = parsedErr;
    } finally {
      this.audioInFlight = false;
      this.notify('state-changed', { micState: this.micState, error: this.error });

      if (this.pendingAudioIntent) {
        const next = this.pendingAudioIntent;
        this.pendingAudioIntent = null;
        if (next === 'off' && this.micState === 'on') {
          await this.disableMic();
        } else if (next === 'on' && this.micState !== 'on') {
          await this.enableMic();
        }
      }
    }

    return this.stream?.getAudioTracks().find(t => t.readyState === 'live');
  }

  async disableMic() {
    if (this.audioInFlight) {
      this.pendingAudioIntent = 'off';
      return;
    }
    this.audioInFlight = true;

    try {
      const liveTrack = this.stream?.getAudioTracks().find(t => t.readyState === 'live');
      if (liveTrack) {
        liveTrack.enabled = false;
        mediaService.isMicOn = false;
        this.micState = 'soft-muted';
      } else {
        this.micState = 'off';
      }
    } finally {
      this.audioInFlight = false;
      this.isSpeaking = false;
      this.notify('state-changed', { micState: this.micState, isSpeaking: false });

      if (this.pendingAudioIntent) {
        const next = this.pendingAudioIntent;
        this.pendingAudioIntent = null;
        if (next === 'on') {
          await this.enableMic();
        }
      }
    }
  }

  stopMic() {
    this.pendingAudioIntent = null;
    this.audioInFlight = false;
    this.isSpeaking = false;
    this.isAudioMutedBySystem = false;
    this.micState = 'off';
    this.error = null;
    mediaService.stopAll();
    this.notify('state-changed', this.getState());
  }

  async setAudioInput(deviceId) {
    mediaService.selectedMicId = deviceId || null;
    try {
      if (typeof localStorage !== 'undefined') {
        if (deviceId) {
          localStorage.setItem('tt_preferred_mic', deviceId);
        } else {
          localStorage.removeItem('tt_preferred_mic');
        }
      }
    } catch {}

    if (this.micState === 'on') {
      if (this.audioInFlight) {
        this.pendingAudioIntent = 'on';
        return;
      }
      this.audioInFlight = true;
      try {
        await mediaService.acquireAudioTrack(false);
      } catch (err) {
        console.error('[media] setAudioInput switch error:', err);
      } finally {
        this.audioInFlight = false;
        this.notify('state-changed', { micState: this.micState });
      }
    }
  }

  setAudioOutput(deviceId) {
    mediaService.setAudioOutput(deviceId);
    try {
      if (typeof localStorage !== 'undefined') {
        if (deviceId) {
          localStorage.setItem('tt_preferred_speaker', deviceId);
        } else {
          localStorage.removeItem('tt_preferred_speaker');
        }
      }
    } catch {}
    this.notify('state-changed', { selectedSpeakerId: deviceId });
  }

  cleanupOnLeaveRoom() {
    this.pendingAudioIntent = null;
    this.audioInFlight = false;
    this.isSpeaking = false;
    this.isAudioMutedBySystem = false;
    this.micState = 'off';
    this.error = null;
    mediaService.stopAll();
    this.notify('state-changed', this.getState());
  }

  initMediaServiceListeners() {
    mediaService.subscribe((event, payload) => {
      if (event === 'speaking') {
        this.isSpeaking = Boolean(payload?.isSpeaking);
        this.notify('speaking', { isSpeaking: this.isSpeaking });
      } else if (event === 'track-muted') {
        if (payload?.kind === 'audio') this.isAudioMutedBySystem = true;
        this.notify('state-changed', { isAudioMutedBySystem: this.isAudioMutedBySystem });
      } else if (event === 'track-unmuted') {
        if (payload?.kind === 'audio') this.isAudioMutedBySystem = false;
        this.notify('state-changed', { isAudioMutedBySystem: this.isAudioMutedBySystem });
      } else if (event === 'error') {
        this.error = payload;
        this.notify('error', payload);
      }
    });
  }

  setupMobileLifecycleListeners() {
    if (typeof document === 'undefined') return;

    const handleResume = () => {
      if (document.visibilityState !== 'visible') return;

      const audioTrack = this.stream?.getAudioTracks()[0];
      if (audioTrack && audioTrack.readyState === 'ended') {
        logMediaDebug('controller:track-ended-hidden', { id: audioTrack.id });
        this.micState = 'off';
        this.notify('state-changed', { micState: 'off' });
      }
    };

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', handleResume);
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('pageshow', handleResume);
      window.addEventListener('focus', handleResume);
    }
  }

  async setupPermissionChangeListeners() {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;

    try {
      const micStatus = await navigator.permissions.query({ name: 'microphone' });
      const handleMicChange = () => {
        logMediaDebug('controller:permission-change', { state: micStatus.state });
        if (micStatus.state === 'granted') {
          this.error = null;
          this.micState = 'off';
          mediaService.lastError = null;
          mediaService.resetReacquireGuard();
          this.notify('state-changed', { micState: 'off', error: null });
        } else if (micStatus.state === 'denied') {
          this.micState = 'blocked';
          this.error = mediaService.parseMediaError({ name: 'NotAllowedError' }, 'audio');
          this.notify('state-changed', { micState: 'blocked', error: this.error });
        }
      };
      micStatus.onchange = handleMicChange;
    } catch (err) {
      logMediaDebug('controller:permission-query-unsupported', { error: err?.message });
    }
  }

  async retryPermission() {
    this.resetReacquireGuard();
    this.error = null;
    this.micState = 'off';
    mediaService.lastError = null;
    mediaService.lastGetUserMediaError = null;
    mediaService.resetReacquireGuard();
    return this.enableMic();
  }
}

export const mediaController = new MediaController();
export default mediaController;
