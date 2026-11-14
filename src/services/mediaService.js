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

      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      this.lastGetUserMediaError = {
        name: err.name || 'Error',
        message: err.message || String(err),
        constraints
      };
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
   * Check browser permission status if supported
   */
  async checkMicPermission() {
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      try {
        const res = await navigator.permissions.query({ name: 'microphone' });
        return res.state; // 'granted' | 'denied' | 'prompt'
      } catch {
        return 'unknown';
      }
    }
    return 'unknown';
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
   * Acquire microphone audio track with progressive constraints fallback.
   * Only uses ideal constraints, never exact.
   */
  async acquireAudioTrack(initialMuted = false) {
    this.lastError = null;
    this.setupAudioSession();

    // Return existing live audio track if available and set its enabled state
    const existing = this.localStream?.getAudioTracks().find(t => t.readyState === 'live');
    if (existing) {
      existing.enabled = !initialMuted;
      this.isMicOn = !initialMuted;
      if (!initialMuted) {
        this.initSpeakingDetector();
      }
      this.notify('stream-changed', { stream: this.localStream, track: existing, kind: 'audio' });
      this.notify('state-changed', { isMicOn: this.isMicOn });
      return existing;
    }

    // Clean, universally supported WebRTC audio constraints.
    // Avoid non-standard flags or raw numbers that trigger OverconstrainedError on Android HAL.
    const audioTiers = [
      {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(this.selectedMicId ? { deviceId: { ideal: this.selectedMicId } } : {})
        }
      },
      {
        audio: true
      }
    ];

    let audioStream = null;
    let lastAudioErr = null;

    for (const constraints of audioTiers) {
      try {
        audioStream = await this.callGetUserMedia(constraints);
        if (audioStream && audioStream.getAudioTracks().length > 0) {
          break;
        }
      } catch (err) {
        lastAudioErr = err;
        console.warn('[MediaService] Audio constraint tier failed, falling back:', err.name, err.message);
      }
    }

    if (!audioStream || audioStream.getAudioTracks().length === 0) {
      console.warn('[MediaService] All audio constraint tiers failed');
      this.isMicOn = false;
      this.lastError = this.parseMediaError(lastAudioErr || new Error('No audio input'), 'audio');
      this.notify('error', this.lastError);
      this.notify('state-changed', { isMicOn: false });
      return null;
    }

    const newAudioTrack = audioStream.getAudioTracks()[0];
    newAudioTrack.enabled = !initialMuted;
    this.isMicOn = !initialMuted;

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
   * Bind event listeners to MediaStreamTrack (mute, unmute, ended)
   */
  bindTrackEvents(track, kind) {
    let muteTimer = null;

    const onMute = () => {
      console.warn(`[MediaService] ${kind} track muted by system`);
      this.notify('track-muted', { track, kind });
      if (muteTimer) clearTimeout(muteTimer);
      muteTimer = setTimeout(async () => {
        if (track.muted && kind === 'audio' && this.isMicOn) {
          console.warn(`[MediaService] ${kind} track muted for >1s, auto-reacquiring...`);
          await this.reacquireTrack(kind);
        }
      }, 1000);
    };

    const onUnmute = () => {
      console.debug(`[MediaService] ${kind} track unmuted by system`);
      if (muteTimer) {
        clearTimeout(muteTimer);
        muteTimer = null;
      }
      this.notify('track-unmuted', { track, kind });
    };

    const onEnded = async () => {
      console.warn(`[MediaService] ${kind} track ended`);
      if (muteTimer) clearTimeout(muteTimer);
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
   * Re-acquire audio track on system interruption and notify subscribers to replace on senders
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
        if (micStatus.state === 'granted') {
          this.lastError = null;
          this.lastGetUserMediaError = null;
          this.resetReacquireGuard();
          this.notify('permission-granted', { permission: 'granted' });
        }
      };
    } catch {}
  }

  /**
   * Reset consecutive failure count and rate-limiting timestamp (e.g., when user taps Retry)
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
   * Handle mobile app switcher / screen lock lifecycle
   */
  setupMobileLifecycleListeners() {
    if (typeof document === 'undefined') return;

    const onResume = async () => {
      if (document.visibilityState !== 'visible') return;

      const audioTrack = this.localStream?.getAudioTracks()[0];
      const needsAudio = this.isMicOn && (!audioTrack || audioTrack.readyState === 'ended' || audioTrack.muted);

      if (!needsAudio) {
        this.resetReacquireGuard();
        return;
      }

      // Check explicit permission denial before re-requesting
      const isDenied = await this.isPermissionDenied('microphone');
      if (isDenied) {
        console.debug('[MediaService] Lifecycle check: Mic permission denied, aborting re-acquire.');
        return;
      }

      // Rate limit re-acquisition: wait at least 3000ms between attempts
      const now = Date.now();
      if (now - this.lastReacquireAttemptAt < 3000) {
        console.debug('[MediaService] Lifecycle check throttled (<3s since last attempt)');
        return;
      }

      // Max 3 consecutive failures before requiring user manual intervention
      if (this.consecutiveReacquireFailures >= 3) {
        console.warn('[MediaService] Reached max 3 consecutive re-acquire failures. User must tap Retry.');
        this.notify('reacquire-blocked', { reason: 'max_failures_exceeded' });
        return;
      }

      this.lastReacquireAttemptAt = now;

      try {
        console.debug('[MediaService] Lifecycle check: Re-acquiring audio track...');
        const newTrack = await this.reacquireTrack('audio');
        if (newTrack) {
          this.consecutiveReacquireFailures = 0;
        } else {
          this.consecutiveReacquireFailures++;
        }
      } catch (err) {
        this.consecutiveReacquireFailures++;
        console.error('[MediaService] Lifecycle re-acquire audio error:', err);
      }
    };

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', onResume);
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('pageshow', onResume);
      window.addEventListener('focus', onResume);
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
        message: 'Microphone permission was denied. Please allow it in your site settings, then tap Retry.',
        device
      };
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return {
        type: 'NOT_FOUND',
        name,
        message: 'No microphone device found.',
        device
      };
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return {
        type: 'HARDWARE_IN_USE',
        name,
        message: 'The microphone is in use by another app. Please close it and retry.',
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
