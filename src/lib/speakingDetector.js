/**
 * Speaking detection using a single shared AudioContext, computing RMS every 100ms
 * with 400ms hysteresis. Analysers are never connected to destination so audio
 * is never doubled.
 */

export class SpeakingDetector {
  constructor(onSpeakingChange) {
    this.ctx = null;
    this.analysers = new Map();
    this.onSpeakingChange = onSpeakingChange;
    this.intervalId = null;
  }

  getAudioContext() {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        if (typeof window !== 'undefined') {
          window.__audioContext = this.ctx;
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  addStream(id, stream, isLocal = false) {
    if (!stream) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    this.removeStream(id);

    try {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser); // DO NOT connect to destination

      this.analysers.set(id, {
        source,
        analyser,
        dataArray: new Float32Array(analyser.fftSize),
        isSpeaking: false,
        belowSince: 0,
        isLocal,
      });

      this.ensureLoop();
    } catch (err) {
      console.warn('[SpeakingDetector] Error adding stream:', err);
    }
  }

  removeStream(id) {
    const entry = this.analysers.get(id);
    if (entry) {
      try {
        entry.source.disconnect();
        entry.analyser.disconnect();
      } catch {}
      this.analysers.delete(id);
      if (this.onSpeakingChange) {
        this.onSpeakingChange(id, false);
      }
    }
    if (this.analysers.size === 0 && this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  ensureLoop() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.tick(), 100);
  }

  tick() {
    const now = Date.now();
    for (const [id, entry] of this.analysers.entries()) {
      try {
        entry.analyser.getFloatTimeDomainData(entry.dataArray);
        let sumSquares = 0;
        for (let i = 0; i < entry.dataArray.length; i++) {
          const val = entry.dataArray[i];
          sumSquares += val * val;
        }
        const rms = Math.sqrt(sumSquares / entry.dataArray.length);

        if (rms > 0.02) {
          entry.belowSince = 0;
          if (!entry.isSpeaking) {
            entry.isSpeaking = true;
            if (this.onSpeakingChange) {
              this.onSpeakingChange(id, true);
            }
          }
        } else if (rms <= 0.012) {
          if (entry.isSpeaking) {
            if (entry.belowSince === 0) {
              entry.belowSince = now;
            } else if (now - entry.belowSince >= 400) {
              entry.isSpeaking = false;
              entry.belowSince = 0;
              if (this.onSpeakingChange) {
                this.onSpeakingChange(id, false);
              }
            }
          }
        }
      } catch {}
    }
  }

  destroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    for (const [id] of this.analysers.entries()) {
      this.removeStream(id);
    }
    if (this.ctx) {
      try {
        this.ctx.close().catch(() => {});
      } catch {}
      this.ctx = null;
    }
  }
}

export default SpeakingDetector;

