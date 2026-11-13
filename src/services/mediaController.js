/**
 * MediaController
 * Single source of truth for mic and camera state across the application.
 *
 * Explicit Device States:
 * - micState: 'off' | 'requesting' | 'on' | 'soft-muted' | 'blocked' | 'error'
 * - cameraState: 'off' | 'requesting' | 'on' | 'blocked' | 'error'
 *
 * Concurrency:
 * - One in-flight operation per device (audio / video).
 * - While requesting, additional taps are coalesced: only the latest intent runs after current one finishes.
 *
 * Policy:
 * - Microphone: After first acquisition, track is kept alive in localStream and track.enabled
 *   is toggled for instant mute/unmute without renegotiation.
 * - Camera: Turning off stops the track so the hardware light turns off and the OS releases the camera.
 *   Turning on re-acquires via ideal-only constraint chain.
 *   Switching camera stops old track before acquiring the new one.
 * - Hands lobby live tracks to the room without re-acquiring or stopping.
 * - Track cleanup happens ONLY on leaving the room, never on component mount/unmount.
 */

import mediaService from './mediaService.js';

export class MediaController {
  constructor() {
    this.micState = 'off'; // 'off' | 'requesting' | 'on' | 'soft-muted' | 'blocked' | 'error'
    this.cameraState = 'off'; // 'off' | 'requesting' | 'on' | 'blocked' | 'error'
    this.facingMode = 'user'; // 'user' | 'environment'
    this.isSpeaking = false;
    this.error = null;
    this.isAudioMutedBySystem = false;
    this.isVideoMutedBySystem = false;

    // Concurrency queues
    this.audioInFlight = false;
    this.pendingAudioIntent = null; // 'on' | 'off' | null

    this.videoInFlight = false;
    this.pendingVideoIntent = null; // 'on' | 'off' | 'switch' | null

    this.listeners = new Set();

    // Re-acquire guard (throttled to 1 attempt per 3s, max 3 consecutive failures)
    this.lastReacquireAttemptAt = 0;
    this.consecutiveReacquireFailures = 0;

    // Restore saved devices
    try {
      if (typeof localStorage !== 'undefined') {
        const savedMic = localStorage.getItem('tt_preferred_mic');
        if (savedMic) mediaService.selectedMicId = savedMic;
        const savedCam = localStorage.getItem('tt_preferred_camera');
        if (savedCam) mediaService.selectedCameraId = savedCam;
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
      cameraState: this.cameraState || 'off',
      isMicOn: this.micState === 'on',
      isCameraOn: this.cameraState === 'on',
      facingMode: this.facingMode || 'user',
      isSpeaking: Boolean(this.isSpeaking),
      error: this.error || null,
      isSecureContext: this.isSecureContext,
      isAudioMutedBySystem: Boolean(this.isAudioMutedBySystem),
      isVideoMutedBySystem: Boolean(this.isVideoMutedBySystem),
      selectedMicId: mediaService.selectedMicId || '',
      selectedCameraId: mediaService.selectedCameraId || '',
      selectedSpeakerId: mediaService.selectedSpeakerId || ''
    };
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => { };
    this.listeners.add(listener);
    const state = this.getState();
    try {
      // Pass state as both payload and state so subscribers accepting
      // (event, payload) or (event, payload, state) always receive a valid state object
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
    mediaService.resetReacquireGuard();
  }

  // ==========================================
  // MICROPHONE API & COALESCING
  // ==========================================

  async toggleMic() {
    if (this.micState === 'on') {
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
    this.micState = 'requesting';
    this.notify('state-changed', { micState: 'requesting' });

    try {
      let audioTrack = this.stream?.getAudioTracks().find(t => t.readyState === 'live');
      if (audioTrack) {
        // Track exists: policy is instant unmute via track.enabled
        audioTrack.enabled = true;
        this.micState = 'on';
        this.error = null;
        mediaService.isMicOn = true;
        mediaService.initSpeakingDetector();
      } else {
        // First acquisition
        const track = await mediaService.acquireAudioTrack(false);
        if (track) {
          audioTrack = track;
          this.micState = 'on';
          this.error = null;
        } else {
          const isDenied = await mediaService.isPermissionDenied('microphone');
          this.micState = isDenied ? 'blocked' : 'error';
          this.error = mediaService.lastError;
        }
      }
    } catch (err) {
      console.error('[media] enableMic error:', err);
      const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      this.micState = isDenied ? 'blocked' : 'error';
      this.error = mediaService.parseMediaError(err, 'audio');
    } finally {
      this.audioInFlight = false;
      this.notify('state-changed', this.getState());

      // Evaluate coalesced intent
      if (this.pendingAudioIntent) {
        const next = this.pendingAudioIntent;
        this.pendingAudioIntent = null;
        if (next === 'off') {
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
      const audioTrack = this.stream?.getAudioTracks().find(t => t.readyState === 'live');
      if (audioTrack) {
        audioTrack.enabled = false;
        this.micState = 'soft-muted';
        mediaService.isMicOn = false;
      } else {
        this.micState = 'off';
      }
      this.isSpeaking = false;
    } finally {
      this.audioInFlight = false;
      this.notify('state-changed', this.getState());

      if (this.pendingAudioIntent) {
        const next = this.pendingAudioIntent;
        this.pendingAudioIntent = null;
        if (next === 'on') {
          await this.enableMic();
        }
      }
    }
  }

  // ==========================================
  // CAMERA API & COALESCING
  // ==========================================

  async toggleCamera() {
    if (this.cameraState === 'on' || this.cameraState === 'requesting') {
      return this.disableCamera();
    } else {
      return this.enableCamera();
    }
  }

  async enableCamera() {
    if (this.videoInFlight) {
      this.pendingVideoIntent = 'on';
      return;
    }

    this.videoInFlight = true;
    this.cameraState = 'requesting';
    this.notify('state-changed', { cameraState: 'requesting' });

    try {
      const track = await mediaService.acquireVideoTrack(this.facingMode);
      if (track) {
        this.cameraState = 'on';
        this.error = null;
      } else {
        const isDenied = await mediaService.isPermissionDenied('camera');
        this.cameraState = isDenied ? 'blocked' : 'error';
        this.error = mediaService.lastError;
      }
    } catch (err) {
      console.error('[media] enableCamera error:', err);
      const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      this.cameraState = isDenied ? 'blocked' : 'error';
      this.error = mediaService.parseMediaError(err, 'video');
    } finally {
      this.videoInFlight = false;
      this.notify('state-changed', this.getState());

      if (this.pendingVideoIntent) {
        const next = this.pendingVideoIntent;
        this.pendingVideoIntent = null;
        if (next === 'off') {
          await this.disableCamera();
        } else if (next === 'switch') {
          await this.switchCamera();
        } else if (next === 'on' && this.cameraState !== 'on') {
          await this.enableCamera();
        }
      }
    }

    return this.stream?.getVideoTracks().find(t => t.readyState === 'live');
  }

  async disableCamera() {
    if (this.videoInFlight) {
      this.pendingVideoIntent = 'off';
      return;
    }

    this.videoInFlight = true;
    try {
      // Policy: camera off stops the track so hardware light turns off & OS lock is released
      if (this.stream) {
        this.stream.getVideoTracks().forEach(t => {
          try { t.stop(); } catch { }
          this.stream.removeTrack(t);
        });
      }
      mediaService.isCameraOn = false;
      this.cameraState = 'off';
    } finally {
      this.videoInFlight = false;
      this.notify('state-changed', this.getState());

      if (this.pendingVideoIntent) {
        const next = this.pendingVideoIntent;
        this.pendingVideoIntent = null;
        if (next === 'on') {
          await this.enableCamera();
        } else if (next === 'switch') {
          await this.switchCamera();
        }
      }
    }
  }

  async switchCamera() {
    if (this.videoInFlight) {
      this.pendingVideoIntent = 'switch';
      return;
    }

    this.videoInFlight = true;
    this.cameraState = 'requesting';
    this.notify('state-changed', { cameraState: 'requesting' });

    try {
      // Policy: stop old track before acquiring new one
      if (this.stream) {
        this.stream.getVideoTracks().forEach(t => {
          try { t.stop(); } catch { }
          this.stream.removeTrack(t);
        });
      }

      this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
      mediaService.facingMode = this.facingMode;

      const track = await mediaService.acquireVideoTrack(this.facingMode);
      if (track) {
        this.cameraState = 'on';
        this.error = null;
      } else {
        this.cameraState = 'error';
        this.error = mediaService.lastError;
      }
    } catch (err) {
      console.error('[media] switchCamera error:', err);
      this.cameraState = 'error';
      this.error = mediaService.parseMediaError(err, 'video');
    } finally {
      this.videoInFlight = false;
      this.notify('state-changed', this.getState());

      if (this.pendingVideoIntent) {
        const next = this.pendingVideoIntent;
        this.pendingVideoIntent = null;
        if (next === 'off') {
          await this.disableCamera();
        } else if (next === 'on' || next === 'switch') {
          await this.enableCamera();
        }
      }
    }

    return this.stream?.getVideoTracks().find(t => t.readyState === 'live');
  }

  // ==========================================
  // DEVICE SELECTION & LIVE HOT-SWAP
  // ==========================================

  async setAudioInput(deviceId) {
    mediaService.selectedMicId = deviceId || null;
    try {
      if (deviceId) {
        localStorage.setItem('tt_preferred_mic', deviceId);
      } else {
        localStorage.removeItem('tt_preferred_mic');
      }
    } catch {}

    // Live hot-swap if mic is active
    if (this.micState === 'on') {
      if (this.audioInFlight) {
        this.pendingAudioIntent = 'on';
        return;
      }
      this.audioInFlight = true;
      try {
        if (this.stream) {
          this.stream.getAudioTracks().forEach(t => {
            try { t.stop(); } catch {}
            this.stream.removeTrack(t);
          });
        }
        await mediaService.acquireAudioTrack(false);
        this.micState = 'on';
      } catch (err) {
        console.error('[media] setAudioInput switch error:', err);
      } finally {
        this.audioInFlight = false;
        this.notify('state-changed', this.getState());
      }
    } else {
      this.notify('state-changed', this.getState());
    }
  }

  async setVideoInput(deviceId) {
    mediaService.selectedCameraId = deviceId || null;
    try {
      if (deviceId) {
        localStorage.setItem('tt_preferred_camera', deviceId);
      } else {
        localStorage.removeItem('tt_preferred_camera');
      }
    } catch {}

    // Live hot-swap if camera is active
    if (this.cameraState === 'on') {
      if (this.videoInFlight) {
        this.pendingVideoIntent = 'on';
        return;
      }
      this.videoInFlight = true;
      try {
        if (this.stream) {
          this.stream.getVideoTracks().forEach(t => {
            try { t.stop(); } catch {}
            this.stream.removeTrack(t);
          });
        }
        await mediaService.acquireVideoTrack(this.facingMode);
        this.cameraState = 'on';
      } catch (err) {
        console.error('[media] setVideoInput switch error:', err);
      } finally {
        this.videoInFlight = false;
        this.notify('state-changed', this.getState());
      }
    } else {
      this.notify('state-changed', this.getState());
    }
  }

  setAudioOutput(deviceId) {
    mediaService.setAudioOutput(deviceId);
    try {
      if (deviceId) {
        localStorage.setItem('tt_preferred_speaker', deviceId);
      } else {
        localStorage.removeItem('tt_preferred_speaker');
      }
    } catch {}
    this.notify('state-changed', this.getState());
  }

  // ==========================================
  // ROOM EXIT CLEANUP
  // ==========================================

  cleanupOnLeaveRoom() {
    mediaService.stopAll();
    this.micState = 'off';
    this.cameraState = 'off';
    this.isSpeaking = false;
    this.error = null;
    this.consecutiveReacquireFailures = 0;
    this.notify('state-changed', this.getState());
  }

  // ==========================================
  // HARDWARE EVENT SYNC & RECOVERY
  // ==========================================

  initMediaServiceListeners() {
    mediaService.subscribe((event, payload) => {
      if (event === 'track-muted') {
        if (payload?.kind === 'audio') this.isAudioMutedBySystem = true;
        if (payload?.kind === 'video') this.isVideoMutedBySystem = true;
        this.notify('track-muted', payload);
      } else if (event === 'track-unmuted') {
        if (payload?.kind === 'audio') this.isAudioMutedBySystem = false;
        if (payload?.kind === 'video') this.isVideoMutedBySystem = false;
        this.notify('track-unmuted', payload);
      } else if (event === 'speaking') {
        this.isSpeaking = Boolean(payload.isSpeaking);
        this.notify('speaking', payload);
      } else if (event === 'error') {
        this.error = payload;
        this.notify('error', payload);
      }
    });
  }

  setupMobileLifecycleListeners() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const checkTracks = async () => {
      if (document.visibilityState !== 'visible') return;

      const audioTrack = this.stream?.getAudioTracks()[0];
      const needsAudio = this.micState === 'on' && (!audioTrack || audioTrack.readyState === 'ended' || audioTrack.muted);

      const videoTrack = this.stream?.getVideoTracks()[0];
      const needsVideo = this.cameraState === 'on' && (!videoTrack || videoTrack.readyState === 'ended' || videoTrack.muted);

      if (!needsAudio && !needsVideo) return;

      const now = Date.now();
      if (now - this.lastReacquireAttemptAt < 3000) return;
      if (this.consecutiveReacquireFailures >= 3) return;

      this.lastReacquireAttemptAt = now;
      let failed = false;

      if (needsAudio) {
        try {
          const newTrack = await mediaService.reacquireTrack('audio');
          if (newTrack) {
            this.micState = 'on';
          } else {
            failed = true;
          }
        } catch {
          failed = true;
        }
      }

      if (needsVideo) {
        try {
          const newTrack = await mediaService.reacquireTrack('video');
          if (newTrack) {
            this.cameraState = 'on';
          } else {
            failed = true;
          }
        } catch {
          failed = true;
        }
      }

      if (failed) {
        this.consecutiveReacquireFailures++;
      } else {
        this.consecutiveReacquireFailures = 0;
      }
      this.notify('state-changed', this.getState());
    };

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', checkTracks);
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('focus', checkTracks);
    }
  }

  async setupPermissionChangeListeners() {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;

    try {
      const micStatus = await navigator.permissions.query({ name: 'microphone' });
      micStatus.onchange = () => {
        if (micStatus.state === 'granted' && (this.micState === 'blocked' || this.micState === 'error')) {
          this.resetReacquireGuard();
          this.micState = 'off';
          this.error = null;
          this.notify('state-changed', this.getState());
        } else if (micStatus.state === 'denied') {
          this.micState = 'blocked';
          this.notify('state-changed', this.getState());
        }
      };
    } catch { }

    try {
      const camStatus = await navigator.permissions.query({ name: 'camera' });
      camStatus.onchange = () => {
        if (camStatus.state === 'granted' && (this.cameraState === 'blocked' || this.cameraState === 'error')) {
          this.resetReacquireGuard();
          this.cameraState = 'off';
          this.error = null;
          this.notify('state-changed', this.getState());
        } else if (camStatus.state === 'denied') {
          this.cameraState = 'blocked';
          this.notify('state-changed', this.getState());
        }
      };
    } catch { }
  }
}

export const mediaController = new MediaController();
export default mediaController;
