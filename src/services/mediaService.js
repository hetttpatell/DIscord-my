/**
 * Centralized Media Management Service
 * Provides robust, cross-platform audio & video track lifecycle management
 * for Chrome Desktop, Chrome Android, iOS Safari, and Edge.
 */

class MediaService {
  constructor() {
    this.localStream = null;
    this.facingMode = 'user'; // 'user' (front) | 'environment' (back)
    this.selectedCameraId = null;
    this.selectedMicId = null;
    this.selectedSpeakerId = null;

    this.isMicOn = false;
    this.isCameraOn = false;
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
   */
  setupAudioSession() {
    if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
      try {
        navigator.audioSession.type = 'play-and-record';
      } catch (err) {
        console.debug('[MediaService] navigator.audioSession error:', err);
      }
    }
  }

  /**
   * Universal getUserMedia wrapper supporting standard & legacy browser APIs
   */
  /**
   * Universal getUserMedia wrapper
   * Throws custom InsecureContextError when mediaDevices is undefined or context is insecure
   */
  async callGetUserMedia(constraints) {
    try {
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        const err = new Error('Insecure context: Camera and microphone require HTTPS or localhost.');
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
      isCameraOn: this.isCameraOn,
      facingMode: this.facingMode,
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
        return res.state; // 'granted' | 'prompt' | 'denied'
      } catch { }
    }
    return null;
  }

  /**
   * Enumerate available cameras and microphones
   */
  async enumerateDevices() {
    if (!navigator?.mediaDevices?.enumerateDevices) return { audioInputs: [], videoInputs: [] };
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return {
        audioInputs: devices.filter(d => d.kind === 'audioinput'),
        videoInputs: devices.filter(d => d.kind === 'videoinput')
      };
    } catch (e) {
      console.warn('[MediaService] enumerateDevices error:', e);
      return { audioInputs: [], videoInputs: [] };
    }
  }

  /**
   * Acquire microphone audio track with progressive constraints fallback.
   * Directly called inside user click/tap handlers; never blocked by async work.
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

    // Audio fallback chain using ideal constraints only (never exact)
    const audioTiers = [
      {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(this.selectedMicId ? { deviceId: { ideal: this.selectedMicId } } : {})
        },
        video: false
      },
      {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      },
      {
        audio: true,
        video: false
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
        console.debug('[MediaService] Audio constraint tier failed, falling back:', err.name);
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
   * Acquire camera video track with progressive constraints fallback.
   * Ideal values only: 640x360@24fps (max 30) -> facingMode -> bare video.
   */
  async acquireVideoTrack(targetFacing = this.facingMode) {
    this.lastError = null;
    this.facingMode = targetFacing || 'user';

    // Stop and remove existing video tracks
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(t => {
        try { t.stop(); } catch { }
        this.localStream.removeTrack(t);
      });
    }

    // Constraints fallback chain using ideal values only (never exact)
    const constraintTiers = [
      {
        video: {
          ...(this.selectedCameraId ? { deviceId: { ideal: this.selectedCameraId } } : { facingMode: this.facingMode }),
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 24, max: 30 }
        },
        audio: false
      },
      {
        video: {
          ...(this.selectedCameraId ? { deviceId: { ideal: this.selectedCameraId } } : { facingMode: this.facingMode })
        },
        audio: false
      },
      {
        video: true,
        audio: false
      }
    ];

    let videoStream = null;
    let lastVideoErr = null;

    for (const constraints of constraintTiers) {
      try {
        videoStream = await this.callGetUserMedia(constraints);
        if (videoStream && videoStream.getVideoTracks().length > 0) {
          break;
        }
      } catch (err) {
        lastVideoErr = err;
        console.debug('[MediaService] Video constraint tier failed, falling back:', err.name);
      }
    }

    if (!videoStream || videoStream.getVideoTracks().length === 0) {
      console.warn('[MediaService] All video constraint tiers failed');
      this.isCameraOn = false;
      this.lastError = this.parseMediaError(lastVideoErr || new Error('No camera input'), 'video');
      this.notify('error', this.lastError);
      this.notify('state-changed', { isCameraOn: false });
      return null;
    }

    const newVideoTrack = videoStream.getVideoTracks()[0];
    newVideoTrack.enabled = true;
    this.isCameraOn = true;

    this.bindTrackEvents(newVideoTrack, 'video');

    if (!this.localStream) {
      this.localStream = new MediaStream([newVideoTrack]);
    } else {
      this.localStream.addTrack(newVideoTrack);
    }

    this.notify('stream-changed', { stream: this.localStream, track: newVideoTrack, kind: 'video' });
    this.notify('state-changed', { isCameraOn: true, facingMode: this.facingMode });
    return newVideoTrack;
  }

  /**
   * Monitor track lifecycle events (ended, mute, unmute)
   */
  bindTrackEvents(track, kind) {
    if (!track) return;

    let muteTimer = null;

    const onMute = () => {
      console.warn(`[MediaService] ${kind} track muted by system`);
      this.notify('track-muted', { track, kind });
      if (muteTimer) clearTimeout(muteTimer);
      muteTimer = setTimeout(async () => {
        if (track.muted && ((kind === 'audio' && this.isMicOn) || (kind === 'video' && this.isCameraOn))) {
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
      } else {
        this.isCameraOn = false;
      }
      this.notify('state-changed', { isMicOn: this.isMicOn, isCameraOn: this.isCameraOn });
    };

    track.addEventListener('mute', onMute);
    track.addEventListener('unmute', onUnmute);
    track.addEventListener('ended', onEnded);
  }

  /**
   * Re-acquire track on system interruption and notify subscribers to replace on senders
   */
  async reacquireTrack(kind) {
    if (kind === 'audio') {
      const oldTrack = this.localStream?.getAudioTracks()[0];
      const newTrack = await this.acquireAudioTrack(!this.isMicOn);
      if (newTrack) {
        this.notify('track-replaced', { oldTrack, newTrack, kind: 'audio' });
      }
      return newTrack;
    } else if (kind === 'video') {
      const oldTrack = this.localStream?.getVideoTracks()[0];
      const newTrack = await this.acquireVideoTrack(this.facingMode);
      if (newTrack) {
        this.notify('track-replaced', { oldTrack, newTrack, kind: 'video' });
      }
      return newTrack;
    }
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
   * Listen to browser permission state changes and auto-acquire when granted in settings
   */
  async setupPermissionChangeListeners() {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;

    try {
      const micStatus = await navigator.permissions.query({ name: 'microphone' });
      micStatus.onchange = () => {
        if (micStatus.state === 'granted') {
          if (this.lastError?.name === 'NotAllowedError' || this.lastError?.type === 'PERMISSION_DENIED') {
            this.lastError = null;
          }
          if (this.lastGetUserMediaError?.name === 'NotAllowedError') {
            this.lastGetUserMediaError = null;
          }
          this.resetReacquireGuard();
          if (!this.isMicOn) {
            console.debug('[MediaService] Microphone permission granted via settings, auto-acquiring...');
            this.acquireAudioTrack().catch(() => {});
          }
        }
      };
    } catch {}

    try {
      const camStatus = await navigator.permissions.query({ name: 'camera' });
      camStatus.onchange = () => {
        if (camStatus.state === 'granted') {
          if (this.lastError?.name === 'NotAllowedError' || this.lastError?.type === 'PERMISSION_DENIED') {
            this.lastError = null;
          }
          if (this.lastGetUserMediaError?.name === 'NotAllowedError') {
            this.lastGetUserMediaError = null;
          }
          this.resetReacquireGuard();
          if (!this.isCameraOn) {
            console.debug('[MediaService] Camera permission granted via settings, auto-acquiring...');
            this.acquireVideoTrack().catch(() => {});
          }
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
   * Check if permission is explicitly denied for a given device type
   */
  async isPermissionDenied(name) {
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
   * Guarded against permission denials, throttled to 1 attempt per 3s,
   * and stopped after 3 consecutive failures until user taps Retry.
   */
  setupMobileLifecycleListeners() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const checkTracks = async () => {
      if (document.visibilityState !== 'visible') return;

      const audioTrack = this.localStream?.getAudioTracks()[0];
      const needsAudio = this.isMicOn && (!audioTrack || audioTrack.readyState === 'ended' || audioTrack.muted);

      const videoTrack = this.localStream?.getVideoTracks()[0];
      const needsVideo = this.isCameraOn && (!videoTrack || videoTrack.readyState === 'ended' || videoTrack.muted);

      if (!needsAudio && !needsVideo) {
        return;
      }

      // Check current permission state: skip if 'denied'
      let skipAudio = false;
      let skipVideo = false;

      if (needsAudio) {
        const isDenied = await this.isPermissionDenied('microphone');
        if (isDenied) skipAudio = true;
      }
      if (needsVideo) {
        const isDenied = await this.isPermissionDenied('camera');
        if (isDenied) skipVideo = true;
      }

      const shouldReacquireAudio = needsAudio && !skipAudio;
      const shouldReacquireVideo = needsVideo && !skipVideo;

      if (!shouldReacquireAudio && !shouldReacquireVideo) {
        return;
      }

      // If 'granted' or 'prompt', or Permissions API is unavailable, continue to throttle & cap
      const now = Date.now();
      if (now - this.lastReacquireAttemptAt < 3000) {
        return;
      }

      if (this.consecutiveReacquireFailures >= 3) {
        return;
      }

      this.lastReacquireAttemptAt = now;
      let failed = false;

      if (shouldReacquireAudio) {
        console.debug('[MediaService] Lifecycle check: Re-acquiring audio track...');
        const newTrack = await this.reacquireTrack('audio');
        if (!newTrack) {
          failed = true;
        }
      }

      if (shouldReacquireVideo) {
        console.debug('[MediaService] Lifecycle check: Re-acquiring video track...');
        const newTrack = await this.reacquireTrack('video');
        if (!newTrack) {
          failed = true;
        }
      }

      if (failed) {
        this.consecutiveReacquireFailures++;
        console.debug(`[MediaService] Lifecycle re-acquisition failed (${this.consecutiveReacquireFailures}/3)`);
      } else {
        this.consecutiveReacquireFailures = 0;
      }
    };

    document.addEventListener('visibilitychange', checkTracks);
    window.addEventListener('focus', checkTracks);
  }

  /**
   * Flip camera front/back on mobile devices
   */
  async switchCamera() {
    const nextFacing = this.facingMode === 'user' ? 'environment' : 'user';
    return this.acquireVideoTrack(nextFacing);
  }

  /**
   * Toggle Microphone on / off
   */
  async toggleMic() {
    const audioTrack = this.localStream?.getAudioTracks().find(t => t.readyState === 'live');
    if (!audioTrack) {
      return this.acquireAudioTrack();
    }

    audioTrack.enabled = !audioTrack.enabled;
    this.isMicOn = audioTrack.enabled;

    this.notify('stream-changed', { stream: this.localStream, track: audioTrack, kind: 'audio' });
    this.notify('state-changed', { isMicOn: this.isMicOn });
    return audioTrack;
  }

  /**
   * Toggle Camera on / off
   */
  async toggleCamera() {
    if (this.isCameraOn) {
      if (this.localStream) {
        this.localStream.getVideoTracks().forEach(t => {
          try { t.stop(); } catch { }
          this.localStream.removeTrack(t);
        });
      }
      this.isCameraOn = false;
      this.notify('stream-changed', { stream: this.localStream, track: null, kind: 'video' });
      this.notify('state-changed', { isCameraOn: false });
      return null;
    } else {
      return this.acquireVideoTrack(this.facingMode);
    }
  }

  /**
   * Initialize Voice Activity Detection (Speaking Indicator)
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
  parseMediaError(err, device) {
    const name = err.name || '';
    const msg = err.message || '';

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return {
        type: 'PERMISSION_DENIED',
        name,
        message: `${device === 'audio' ? 'Microphone' : 'Camera'} permission was denied. Please allow it in your site settings, then tap Retry.`,
        device
      };
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return {
        type: 'NOT_FOUND',
        name,
        message: `No ${device === 'audio' ? 'microphone' : 'camera'} device found.`,
        device
      };
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return {
        type: 'HARDWARE_IN_USE',
        name,
        message: `The ${device === 'audio' ? 'microphone' : 'camera'} is in use by another app. Please close it and retry.`,
        device
      };
    }
    if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
      return {
        type: 'OVERCONSTRAINED',
        name,
        message: '',
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
        message: 'Insecure context: Camera and microphone require HTTPS or localhost.',
        device
      };
    }
    return {
      type: 'UNKNOWN',
      name: name || 'Error',
      message: msg || `Unable to access ${device}.`,
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
    this.isCameraOn = false;
    this.isSpeaking = false;
    this.notify('stream-changed', { stream: null, track: null });
    this.notify('state-changed', { isMicOn: false, isCameraOn: false, isSpeaking: false });
  }
}

// Singleton media service instance
export const mediaService = new MediaService();
export default mediaService;
