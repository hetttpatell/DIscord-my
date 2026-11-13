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

    this.isMicOn = false;
    this.isCameraOn = false;
    this.isSpeaking = false;

    this.lastError = null;
    this.listeners = new Set();

    // Web Audio API for Voice Activity Detection (Speaking Indicator)
    this.audioContext = null;
    this.analyser = null;
    this.analyserInterval = null;
    this.speakingThreshold = 0.035; // Normalized RMS threshold

    // Configure iOS Safari audio session if available
    this.setupAudioSession();
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
  async callGetUserMedia(constraints) {
    if (typeof navigator === 'undefined') {
      throw new Error('navigator is not defined');
    }

    // 1. Standard modern navigator.mediaDevices.getUserMedia
    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      return navigator.mediaDevices.getUserMedia(constraints);
    }

    // 2. Legacy vendor-prefixed getUserMedia fallback
    const legacy = navigator.getUserMedia ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia ||
      navigator.msGetUserMedia;

    if (legacy) {
      return new Promise((resolve, reject) => {
        legacy.call(navigator, constraints, resolve, reject);
      });
    }

    // 3. Fallback descriptive error
    const isSecure = typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false;
    if (!isSecure) {
      throw new Error('INSECURE_CONTEXT: Camera and microphone require HTTPS or localhost. On Android Chrome, enable chrome://flags/#unsafely-treat-insecure-origin-as-secure.');
    }
    throw new Error('NOT_SUPPORTED: MediaDevices API is not supported in this browser.');
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
   * Acquire microphone audio track with AEC and noise suppression
   * Never blocked by premature checks: directly attempts capture
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

    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    };

    if (this.selectedMicId) {
      audioConstraints.deviceId = { exact: this.selectedMicId };
    }

    let audioStream = null;
    try {
      // 1. Try high-quality AEC constraints
      audioStream = await this.callGetUserMedia({ audio: audioConstraints, video: false });
    } catch (e1) {
      console.debug('[MediaService] High-quality audio constraints failed, trying basic audio with AEC:', e1.message);
      try {
        // 2. Fallback requesting AEC, noise suppression, and AGC
        audioStream = await this.callGetUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
      } catch (e2) {
        console.warn('[MediaService] Audio acquisition failed:', e2);
        this.lastError = this.parseMediaError(e2, 'audio');
        this.notify('error', this.lastError);
        return null;
      }
    }

    const newAudioTrack = audioStream.getAudioTracks()[0];
    if (!newAudioTrack) {
      this.lastError = { type: 'NOT_FOUND', message: 'No audio track returned from device', device: 'audio' };
      this.notify('error', this.lastError);
      return null;
    }

    newAudioTrack.enabled = !initialMuted;
    this.isMicOn = !initialMuted;

    newAudioTrack.onended = () => {
      console.warn('[MediaService] Audio track ended unexpectedly');
      this.isMicOn = false;
      this.notify('state-changed', { isMicOn: false });
    };

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
   * Acquire camera video track with progressive constraints fallback
   */
  async acquireVideoTrack(targetFacing = this.facingMode) {
    this.lastError = null;
    this.facingMode = targetFacing;

    // Stop and remove existing video tracks
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(t => {
        try { t.stop(); } catch { }
        this.localStream.removeTrack(t);
      });
    }

    // Constraints fallback chain (Default 640x360 @ 24fps -> 480p -> loose facing -> bare video)
    const constraintTiers = [
      {
        video: {
          facingMode: { ideal: targetFacing },
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 24, max: 24 }
        },
        audio: false
      },
      {
        video: {
          facingMode: { ideal: targetFacing },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 24 }
        },
        audio: false
      },
      {
        video: { facingMode: targetFacing },
        audio: false
      },
      {
        video: true,
        audio: false
      }
    ];

    let videoStream = null;
    for (const constraints of constraintTiers) {
      try {
        videoStream = await this.callGetUserMedia(constraints);
        if (videoStream && videoStream.getVideoTracks().length > 0) {
          break;
        }
      } catch (err) {
        console.debug('[MediaService] Video constraint tier failed, falling back:', err.name);
      }
    }

    if (!videoStream || videoStream.getVideoTracks().length === 0) {
      console.warn('[MediaService] All video constraint tiers failed');
      this.isCameraOn = false;
      this.lastError = {
        type: 'HARDWARE_UNAVAILABLE',
        message: 'Could not access camera. Please check permissions or verify camera is not in use.',
        device: 'video'
      };
      this.notify('error', this.lastError);
      this.notify('state-changed', { isCameraOn: false });
      return null;
    }

    const newVideoTrack = videoStream.getVideoTracks()[0];
    newVideoTrack.enabled = true;
    this.isCameraOn = true;

    newVideoTrack.onended = () => {
      console.warn('[MediaService] Video track ended unexpectedly');
      this.isCameraOn = false;
      this.notify('state-changed', { isCameraOn: false });
    };

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
        message: `${device === 'audio' ? 'Microphone' : 'Camera'} permission was denied. Tap the lock/tune icon beside the address bar to allow ${device}.`,
        device
      };
    }
    if (name === 'SecurityError' || msg.includes('INSECURE_CONTEXT')) {
      return {
        type: 'INSECURE_CONTEXT',
        message: `Microphone access on mobile requires HTTPS or localhost. If testing over LAN, access via an HTTPS tunnel or enable Chrome insecure origins flag.`,
        device
      };
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return {
        type: 'NOT_FOUND',
        message: `No ${device === 'audio' ? 'microphone' : 'camera'} hardware detected on this device.`,
        device
      };
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return {
        type: 'HARDWARE_ERROR',
        message: `${device === 'audio' ? 'Microphone' : 'Camera'} is currently in use by another app or browser tab.`,
        device
      };
    }
    if (name === 'OverconstrainedError') {
      return {
        type: 'OVERCONSTRAINED',
        message: `Requested ${device} constraints are not supported by your hardware.`,
        device
      };
    }
    return {
      type: 'UNKNOWN',
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
