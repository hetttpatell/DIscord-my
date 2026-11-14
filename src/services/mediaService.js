import { logMediaDebug, getPlatformInfo } from './mediaLogger.js';

/**
 * Centralized Audio Media Management Service
 * Provides robust, cross-platform audio track lifecycle management
 * for Chrome Desktop, Chrome Android, iOS Safari, and Edge.
 */

class MediaService {
  constructor() {
    this.localStream = null;
    this.selectedMicId = null;
    this.selectedSpeakerId = null;

    this.isMicOn = false;
    this.isSpeaking = false;

    this.lastError = null;
    this.lastGetUserMediaError = null;
    this.listeners = new Set();

    // Re-acquire guard state (rate limit 3s, max 3 consecutive failures until Retry)
    this.lastReacquireAttemptAt = 0;
    this.consecutiveReacquireFailures = 0;

    // Web Audio API for Voice Activity Detection (Speaking Indicator)
    this.audioContext = null;
    this.analyser = null;
    this.analyserInterval = null;
    this.speakingThreshold = 0.035; // Normalized RMS threshold

    // Log platform diagnostics
    logMediaDebug('platform:detected', getPlatformInfo());

    // Configure iOS Safari audio session if available
    this.setupAudioSession();
    this.setupPermissionChangeListeners();
    this.setupMobileLifecycleListeners();
  }

  /**
   * Feature-detect navigator.audioSession and set type to play-and-record on iOS Safari
   * with speakerphone routing so sound doesn't get trapped in the earpiece.
   */
  setupAudioSession() {
    if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
      try {
        navigator.audioSession.type = 'play-and-record';
        if ('categoryOptions' in navigator.audioSession) {
          navigator.audioSession.categoryOptions = ['defaultToSpeaker', 'allowBluetooth'];
        }
      } catch (err) {
        console.debug('[MediaService] navigator.audioSession error:', err);
      }
    }
  }

  /**
   * Universal getUserMedia wrapper
   * Throws custom InsecureContextError when mediaDevices is undefined or context is insecure
   */
  async callGetUserMedia(constraints) {
    try {
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        const err = new Error('Insecure context: Microphone requires HTTPS or localhost.');
        err.name = 'InsecureContextError';
        throw err;
      }

      if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        const err = new Error('navigator.mediaDevices is undefined. Insecure context or unsupported browser.');
        err.name = 'InsecureContextError';
        throw err;
      }

      logMediaDebug('getUserMedia:call', { constraints });
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      logMediaDebug('getUserMedia:success', {
        trackCount: stream.getAudioTracks().length,
        trackId: stream.getAudioTracks()[0]?.id,
        readyState: stream.getAudioTracks()[0]?.readyState
      });
      return stream;
    } catch (err) {
      this.lastGetUserMediaError = {
        name: err.name || 'Error',
        message: err.message || String(err),
        constraints
      };
      logMediaDebug('getUserMedia:error', {
        name: err.name || 'Error',
        message: err.message || String(err)
      });
      console.error('[media]', err.name || 'Error', err.message || String(err));
      throw err;
    }
  }

  /**
   * Subscribe to media state events
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(event, payload) {
    this.listeners.forEach(cb => {
      try {
        cb(event, payload, this.getState());
      } catch (err) {
        console.error('[MediaService] Listener error:', err);
      }
    });
  }

  getState() {
    return {
      stream: this.localStream,
      isMicOn: this.isMicOn,
      isSpeaking: this.isSpeaking,
      lastError: this.lastError,
      isSecureContext: typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false
    };
  }

  /**
   * Check browser permission status if supported.
   * Does not assume the Permissions API is supported on every mobile browser.
   */
  async checkMicPermission() {
    if (typeof navigator === 'undefined' || !navigator.permissions || typeof navigator.permissions.query !== 'function') {
      return 'unknown';
    }
    try {
      const res = await navigator.permissions.query({ name: 'microphone' });
      const state = res?.state || 'unknown';
      logMediaDebug('permission:query', { state });
      return state; // 'granted' | 'denied' | 'prompt'
    } catch (err) {
      logMediaDebug('permission:query-unsupported', { error: err?.message });
      return 'unknown';
    }
  }

  /**
   * Enumerate available microphones and audio outputs
   */
  async enumerateDevices() {
    if (!navigator?.mediaDevices?.enumerateDevices) return { audioInputs: [], audioOutputs: [] };
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return {
        audioInputs: devices.filter(d => d.kind === 'audioinput'),
        audioOutputs: devices.filter(d => d.kind === 'audiooutput')
      };
    } catch {
      return { audioInputs: [], audioOutputs: [] };
    }
  }

  /**
   * Acquire microphone audio track with native constraints and safe fallback.
   * Must be called from a user interaction (button click/tap).
   */
  async acquireAudioTrack(initialMuted = false) {
    this.lastError = null;
    this.setupAudioSession();

    // 1. Return existing live audio track if available and set its enabled state
    const existing = this.localStream?.getAudioTracks().find(t => t.readyState === 'live');
    if (existing) {
      existing.enabled = !initialMuted;
      this.isMicOn = !initialMuted;
      logMediaDebug('track:reuse-existing', { id: existing.id, enabled: existing.enabled });
      if (!initialMuted) {
        this.initSpeakingDetector();
      }
      this.notify('stream-changed', { stream: this.localStream, track: existing, kind: 'audio' });
      this.notify('state-changed', { isMicOn: this.isMicOn });
      return existing;
    }

    // 2. Check secure context
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      const err = new Error('Insecure context: Microphone requires HTTPS or localhost.');
      err.name = 'InsecureContextError';
      this.lastError = this.parseMediaError(err, 'audio');
      logMediaDebug('mic:insecure-blocked', {});
      this.notify('error', this.lastError);
      this.notify('state-changed', { isMicOn: false });
      return null;
    }

    // 3. Query browser permission status for logging & diagnostics
    const permStatus = await this.checkMicPermission();
    logMediaDebug('mic:permission-state', { permStatus });

    // 4. Standard W3C constraints recommended for WebRTC voice
    const primaryConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(this.selectedMicId ? { deviceId: { ideal: this.selectedMicId } } : {})
      },
      video: false
    };

    const fallbackConstraints = {
      audio: true,
      video: false
    };

    let audioStream = null;
    let lastAudioErr = null;

    try {
      audioStream = await this.callGetUserMedia(primaryConstraints);
    } catch (err) {
      lastAudioErr = err;
      // Only fallback on overconstrained errors; never retry on NotAllowedError (which indicates user denial)
      if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
        try {
          logMediaDebug('mic:overconstrained-fallback', {});
          audioStream = await this.callGetUserMedia(fallbackConstraints);
        } catch (fallbackErr) {
          lastAudioErr = fallbackErr;
        }
      }
    }

    if (!audioStream || audioStream.getAudioTracks().length === 0) {
      this.isMicOn = false;
      this.lastError = this.parseMediaError(lastAudioErr || new Error('No audio input'), 'audio');
      logMediaDebug('mic:acquire-failed', this.lastError);
      this.notify('error', this.lastError);
      this.notify('state-changed', { isMicOn: false });
      return null;
    }

    const newAudioTrack = audioStream.getAudioTracks()[0];
    newAudioTrack.enabled = !initialMuted;
    this.isMicOn = !initialMuted;

    logMediaDebug('track:acquired', {
      id: newAudioTrack.id,
      label: newAudioTrack.label,
      enabled: newAudioTrack.enabled,
      readyState: newAudioTrack.readyState
    });

    this.bindTrackEvents(newAudioTrack, 'audio');

    if (!this.localStream) {
      this.localStream = new MediaStream([newAudioTrack]);
    } else {
      this.localStream.getAudioTracks().forEach(t => {
        if (t !== newAudioTrack) {
          try { t.stop(); } catch { }
          this.localStream.removeTrack(t);
        }
      });
      this.localStream.addTrack(newAudioTrack);
    }

    if (!initialMuted) {
      this.initSpeakingDetector();
    }
    this.notify('stream-changed', { stream: this.localStream, track: newAudioTrack, kind: 'audio' });
    this.notify('state-changed', { isMicOn: this.isMicOn });
    return newAudioTrack;
  }

  /**
   * Bind event listeners to MediaStreamTrack (mute, unmute, ended).
   * Note: Never invokes getUserMedia automatically from background events.
   */
  bindTrackEvents(track, kind) {
    const onMute = () => {
      logMediaDebug('track:muted-by-system', { kind, id: track.id });
      this.notify('track-muted', { track, kind });
    };

    const onUnmute = () => {
      logMediaDebug('track:unmuted-by-system', { kind, id: track.id });
      this.notify('track-unmuted', { track, kind });
    };

    const onEnded = () => {
      logMediaDebug('track:ended', { kind, id: track.id });
      if (kind === 'audio') {
        this.isMicOn = false;
      }
      this.notify('state-changed', { isMicOn: this.isMicOn });
    };

    track.addEventListener('mute', onMute);
    track.addEventListener('unmute', onUnmute);
    track.addEventListener('ended', onEnded);
  }

  /**
   * Re-acquire audio track on explicit user request
   */
  async reacquireTrack(kind = 'audio') {
    if (kind === 'audio') {
      const oldTrack = this.localStream?.getAudioTracks()[0];
      const newTrack = await this.acquireAudioTrack(!this.isMicOn);
      if (newTrack) {
        this.notify('track-replaced', { oldTrack, newTrack, kind: 'audio' });
      }
      return newTrack;
    }
    return null;
  }

  /**
   * Set speaker/audiooutput device ID and apply to all audio elements via setSinkId
   */
  setAudioOutput(deviceId) {
    this.selectedSpeakerId = deviceId || null;
    if (typeof document !== 'undefined') {
      const audioEls = document.querySelectorAll('audio');
      audioEls.forEach(el => {
        if (typeof el.setSinkId === 'function') {
          el.setSinkId(deviceId || '').catch(() => {});
        }
      });
    }
    this.notify('audio-output-changed', { deviceId });
  }

  /**
   * Set preferred microphone device ID
   */
  async setAudioInput(deviceId) {
    this.selectedMicId = deviceId || null;
    if (this.isMicOn) {
      await this.acquireAudioTrack(false);
    }
  }

  /**
   * Listen to browser permission state changes and reset error state when granted in settings
   */
  async setupPermissionChangeListeners() {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;

    try {
      const micStatus = await navigator.permissions.query({ name: 'microphone' });
      micStatus.onchange = () => {
        logMediaDebug('permission:change', { state: micStatus.state });
        if (micStatus.state === 'granted') {
          this.lastError = null;
          this.lastGetUserMediaError = null;
          this.resetReacquireGuard();
          this.notify('permission-granted', { permission: 'granted' });
        } else if (micStatus.state === 'denied') {
          this.lastError = this.parseMediaError({ name: 'NotAllowedError' });
          this.notify('permission-denied', { permission: 'denied' });
        }
      };
    } catch (err) {
      logMediaDebug('permission:query-unsupported', { error: err?.message });
    }
  }

  /**
   * Reset consecutive failure count and rate-limiting timestamp
   */
  resetReacquireGuard() {
    this.consecutiveReacquireFailures = 0;
    this.lastReacquireAttemptAt = 0;
  }

  /**
   * Check if permission is explicitly denied for microphone
   */
  async isPermissionDenied(name = 'microphone') {
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      try {
        const res = await navigator.permissions.query({ name });
        return res?.state === 'denied';
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Handle mobile tab switching and page visibility changes.
   * Never calls getUserMedia automatically without direct user gesture.
   */
  setupMobileLifecycleListeners() {
    if (typeof document === 'undefined') return;

    const onVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      logMediaDebug('lifecycle:visibility', { visibilityState: document.visibilityState });
      if (!isVisible) return;

      // When tab becomes visible again, verify track status without calling getUserMedia
      const audioTrack = this.localStream?.getAudioTracks()[0];
      if (audioTrack && audioTrack.readyState === 'ended') {
        logMediaDebug('track:ended-while-hidden', { id: audioTrack.id });
        this.isMicOn = false;
        this.notify('state-changed', { isMicOn: false });
      }
    };

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('pageshow', onVisibilityChange);
      window.addEventListener('focus', onVisibilityChange);
    }
  }

  /**
   * Web Audio API RMS Voice Activity Detector
   */
  initSpeakingDetector() {
    if (typeof window === 'undefined') return;
    const audioTrack = this.localStream?.getAudioTracks().find(t => t.readyState === 'live');
    if (!audioTrack) return;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioContextClass();
      }

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => { });
      }

      const mediaStream = new MediaStream([audioTrack]);
      const source = this.audioContext.createMediaStreamSource(mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.4;
      source.connect(this.analyser);

      if (this.analyserInterval) clearInterval(this.analyserInterval);

      const buffer = new Uint8Array(this.analyser.frequencyBinCount);
      let speakingFrames = 0;

      this.analyserInterval = setInterval(() => {
        if (!this.isMicOn || !audioTrack.enabled || audioTrack.readyState !== 'live') {
          if (this.isSpeaking) {
            this.isSpeaking = false;
            this.notify('speaking', { isSpeaking: false });
          }
          return;
        }

        this.analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const average = sum / buffer.length / 255; // 0.0 to 1.0

        if (average > this.speakingThreshold) {
          speakingFrames++;
          if (speakingFrames >= 2 && !this.isSpeaking) {
            this.isSpeaking = true;
            this.notify('speaking', { isSpeaking: true });
          }
        } else {
          speakingFrames = 0;
          if (this.isSpeaking) {
            this.isSpeaking = false;
            this.notify('speaking', { isSpeaking: false });
          }
        }
      }, 120);
    } catch (e) {
      console.debug('[MediaService] Voice activity detection fallback:', e);
    }
  }

  /**
   * Parse getUserMedia error to user-friendly messages
   */
  parseMediaError(err, device = 'audio') {
    const name = err?.name || '';
    const msg = err?.message || '';

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return {
        type: 'PERMISSION_DENIED',
        name,
        message: 'Microphone permission was denied. Please enable microphone access in Chrome site settings.',
        device
      };
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return {
        type: 'NOT_FOUND',
        name,
        message: 'No microphone found. Please check your device microphone.',
        device
      };
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return {
        type: 'HARDWARE_IN_USE',
        name,
        message: 'Microphone is busy. Please close other applications using the microphone and retry.',
        device
      };
    }
    if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
      return {
        type: 'OVERCONSTRAINED',
        name,
        message: 'Audio constraints could not be satisfied by your microphone.',
        device
      };
    }
    if (
      name === 'InsecureContextError' ||
      name === 'SecurityError' ||
      msg.includes('INSECURE_CONTEXT') ||
      (typeof window !== 'undefined' && !window.isSecureContext) ||
      (typeof navigator !== 'undefined' && !navigator.mediaDevices)
    ) {
      return {
        type: 'INSECURE_CONTEXT',
        name: 'InsecureContextError',
        message: 'Insecure context: Microphone requires HTTPS or localhost.',
        device
      };
    }
    return {
      type: 'UNKNOWN',
      name: name || 'Error',
      message: msg || 'Unable to access microphone.',
      device
    };
  }

  /**
   * Stop all local media tracks and release hardware
   */
  stopAll() {
    if (this.analyserInterval) {
      clearInterval(this.analyserInterval);
      this.analyserInterval = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => { });
      this.audioContext = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => {
        try {
          t.stop();
        } catch { }
      });
      this.localStream = null;
    }

    this.isMicOn = false;
    this.isSpeaking = false;
    this.notify('stream-changed', { stream: null, track: null });
    this.notify('state-changed', { isMicOn: false, isSpeaking: false });
  }
}

// Singleton media service instance
export const mediaService = new MediaService();
export default mediaService;
