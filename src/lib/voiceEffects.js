/**
 * Real-time Web Audio API voice transformation engine.
 * Intercepts raw microphone MediaStream and applies audio DSP effects
 * before publishing to WebRTC / LiveKit.
 */

export const VOICE_PRESETS = [
  { id: 'normal', name: 'Natural', desc: 'Clean uncolored voice', emoji: '🎙️' },
  { id: 'chipmunk', name: 'Helium / Chipmunk', desc: 'Real high-pitch vocal shift', emoji: '🐿️' },
  { id: 'deep', name: 'Deep Monster', desc: 'Booming pitched-down bass growl', emoji: '👹' },
  { id: 'robot', name: 'Cyber Robot', desc: 'Metallic sawtooth ring modulation', emoji: '🤖' },
  { id: 'radio', name: 'Walkie-Talkie', desc: 'Lo-fi resonant radio transmitter', emoji: '📻' },
  { id: 'megaphone', name: 'Bullhorn', desc: 'Loud public address megaphone', emoji: '📢' },
  { id: 'echo', name: 'Cosmic Echo', desc: 'Spacious rhythmic slapback canyon', emoji: '🌌' },
  { id: 'alien', name: 'Alien Warble', desc: 'Eerie sci-fi pitch vibrato', emoji: '👽' },
  { id: 'cathedral', name: 'Cathedral', desc: 'Grand cavernous room reverb', emoji: '🏛️' },
];

let audioCtx = null;
let currentSource = null;
let currentDestination = null;
let monitorNode = null;
let isMonitorOn = false;
let currentNodes = [];
let currentPreset = 'normal';
let isRunning = false;

function makeDistortionCurve(amount = 25) {
  const k = typeof amount === 'number' ? amount : 25;
  const nSamples = 44100;
  const curve = new Float32Array(nSamples);
  const deg = Math.PI / 180;
  for (let i = 0; i < nSamples; ++i) {
    const x = (i * 2) / nSamples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function clearCurrentNodes() {
  currentNodes.forEach((node) => {
    try {
      if (typeof node.stop === 'function') node.stop();
      node.disconnect();
    } catch {}
  });
  currentNodes = [];
}

/**
 * Native Web Audio Dual-Delay Pitch Shifter
 * Uses dual modulated delay lines with 180-deg phase offset and
 * triangular crossfade envelopes to achieve real continuous pitch shifting.
 */
function createPitchShifter(ctx, source, destination, pitchRatio = 1.0) {
  if (Math.abs(pitchRatio - 1.0) < 0.05) {
    source.connect(destination);
    return [];
  }

  const grainDuration = 0.085; // 85ms grain size
  const freq = Math.abs(pitchRatio - 1.0) / grainDuration;
  const sampleRate = ctx.sampleRate || 48000;
  const bufferLength = Math.max(128, Math.floor(sampleRate / Math.max(freq, 0.5)));

  // 1. Modulation Buffers (Sawtooth delay ramps)
  const modBufferA = ctx.createBuffer(1, bufferLength, sampleRate);
  const modBufferB = ctx.createBuffer(1, bufferLength, sampleRate);
  const modDataA = modBufferA.getChannelData(0);
  const modDataB = modBufferB.getChannelData(0);

  // 2. Window Gain Buffers (Hanning / Cosine crossfade windows)
  const winBufferA = ctx.createBuffer(1, bufferLength, sampleRate);
  const winBufferB = ctx.createBuffer(1, bufferLength, sampleRate);
  const winDataA = winBufferA.getChannelData(0);
  const winDataB = winBufferB.getChannelData(0);

  const halfLength = Math.floor(bufferLength / 2);

  for (let i = 0; i < bufferLength; i++) {
    const phaseA = i / bufferLength;
    const phaseB = ((i + halfLength) % bufferLength) / bufferLength;

    if (pitchRatio > 1.0) {
      // Pitch UP: delay ramps down from grainDuration to 0
      modDataA[i] = grainDuration * (1 - phaseA);
      modDataB[i] = grainDuration * (1 - phaseB);
    } else {
      // Pitch DOWN: delay ramps up from 0 to grainDuration
      modDataA[i] = grainDuration * phaseA;
      modDataB[i] = grainDuration * phaseB;
    }

    // Smooth overlapping raised cosine envelope
    winDataA[i] = 0.5 * (1 - Math.cos(2 * Math.PI * phaseA));
    winDataB[i] = 0.5 * (1 - Math.cos(2 * Math.PI * phaseB));
  }

  // Create delay lines
  const delayA = ctx.createDelay(1.0);
  const delayB = ctx.createDelay(1.0);
  delayA.delayTime.value = 0;
  delayB.delayTime.value = 0;

  // Modulator sources
  const modSourceA = ctx.createBufferSource();
  const modSourceB = ctx.createBufferSource();
  modSourceA.buffer = modBufferA;
  modSourceB.buffer = modBufferB;
  modSourceA.loop = true;
  modSourceB.loop = true;

  // Window gain nodes
  const gainA = ctx.createGain();
  const gainB = ctx.createGain();
  gainA.gain.value = 0;
  gainB.gain.value = 0;

  const winSourceA = ctx.createBufferSource();
  const winSourceB = ctx.createBufferSource();
  winSourceA.buffer = winBufferA;
  winSourceB.buffer = winBufferB;
  winSourceA.loop = true;
  winSourceB.loop = true;

  // Wire delay time modulations
  modSourceA.connect(delayA.delayTime);
  modSourceB.connect(delayB.delayTime);

  // Wire gain modulations
  winSourceA.connect(gainA.gain);
  winSourceB.connect(gainB.gain);

  // Wire audio path
  source.connect(delayA);
  source.connect(delayB);
  delayA.connect(gainA);
  delayB.connect(gainB);

  // Output mixer gain
  const outGain = ctx.createGain();
  outGain.gain.value = 1.35; // Compensate for windowing
  gainA.connect(outGain);
  gainB.connect(outGain);
  outGain.connect(destination);

  // Start modulation loops
  modSourceA.start();
  modSourceB.start();
  winSourceA.start();
  winSourceB.start();

  return [
    delayA,
    delayB,
    gainA,
    gainB,
    modSourceA,
    modSourceB,
    winSourceA,
    winSourceB,
    outGain,
  ];
}

/**
 * Applies the selected voice preset nodes between source and destination.
 */
function applyPresetNodes(presetId) {
  if (!audioCtx || !currentSource || !currentDestination) return;

  // CRITICAL: Always disconnect currentSource from any previous node
  // to prevent audio leaking through parallel old connections!
  try {
    currentSource.disconnect();
  } catch {}

  clearCurrentNodes();
  currentPreset = presetId;

  if (presetId === 'normal') {
    // Pure clean passthrough
    currentSource.connect(currentDestination);
    return;
  }

  if (presetId === 'chipmunk') {
    // Real Pitch-Shift Up (+8 semitones, 1.62x) + High Shelf
    const highShelf = audioCtx.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = 3500;
    highShelf.gain.value = 6;

    const nodes = createPitchShifter(audioCtx, currentSource, highShelf, 1.62);
    highShelf.connect(currentDestination);
    currentNodes = [...nodes, highShelf];
    return;
  }

  if (presetId === 'deep') {
    // Real Pitch-Shift Down (-7 semitones, 0.67x) + Low Shelf Bass Boost
    const lowShelf = audioCtx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 180;
    lowShelf.gain.value = 10;

    const nodes = createPitchShifter(audioCtx, currentSource, lowShelf, 0.67);
    lowShelf.connect(currentDestination);
    currentNodes = [...nodes, lowShelf];
    return;
  }

  if (presetId === 'robot') {
    // Cyber Robot: Sawtooth carrier ring modulation + Bandpass resonance
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 950;
    filter.Q.value = 3.0;

    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55; // 55Hz metallic robot buzz

    const modGain = audioCtx.createGain();
    modGain.gain.value = 0.0;

    const oscGain = audioCtx.createGain();
    oscGain.gain.value = 0.9;

    const shaper = audioCtx.createWaveShaper();
    shaper.curve = makeDistortionCurve(15);

    const outGain = audioCtx.createGain();
    outGain.gain.value = 1.6;

    currentSource.connect(filter);
    filter.connect(modGain);

    osc.connect(oscGain);
    oscGain.connect(modGain.gain);

    modGain.connect(shaper);
    shaper.connect(outGain);
    outGain.connect(currentDestination);
    osc.start();

    currentNodes = [filter, osc, oscGain, modGain, shaper, outGain];
    return;
  }

  if (presetId === 'radio') {
    // Walkie-Talkie: Lo-fi bandpass (750Hz - 2400Hz) + speaker resonance + overdrive
    const highpass = audioCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 750;

    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 2400;
    lowpass.Q.value = 3.0;

    const peak = audioCtx.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = 1600;
    peak.gain.value = 8;
    peak.Q.value = 3.5;

    const shaper = audioCtx.createWaveShaper();
    shaper.curve = makeDistortionCurve(28);

    const gain = audioCtx.createGain();
    gain.gain.value = 1.4;

    currentSource.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(peak);
    peak.connect(shaper);
    shaper.connect(gain);
    gain.connect(currentDestination);

    currentNodes = [highpass, lowpass, peak, shaper, gain];
    return;
  }

  if (presetId === 'megaphone') {
    // Bullhorn / Megaphone: High-gain midrange bandpass + horn distortion + slapback reflection
    const bandpass = audioCtx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 1200;
    bandpass.Q.value = 2.2;

    const shaper = audioCtx.createWaveShaper();
    shaper.curve = makeDistortionCurve(35);

    const delay = audioCtx.createDelay(0.1);
    delay.delayTime.value = 0.016; // 16ms horn slapback

    const outGain = audioCtx.createGain();
    outGain.gain.value = 1.7;

    currentSource.connect(bandpass);
    bandpass.connect(shaper);
    shaper.connect(outGain);
    shaper.connect(delay);
    delay.connect(outGain);
    outGain.connect(currentDestination);

    currentNodes = [bandpass, shaper, delay, outGain];
    return;
  }

  if (presetId === 'echo') {
    // Cosmic Echo: Dual feedback delay lines with lowpass damping
    const dryGain = audioCtx.createGain();
    dryGain.gain.value = 0.85;

    const delay = audioCtx.createDelay(1.0);
    delay.delayTime.value = 0.24; // 240ms slapback

    const feedback = audioCtx.createGain();
    feedback.gain.value = 0.42;

    const damping = audioCtx.createBiquadFilter();
    damping.type = 'lowpass';
    damping.frequency.value = 2600; // Natural atmospheric damping

    const wetGain = audioCtx.createGain();
    wetGain.gain.value = 0.65;

    // Dry
    currentSource.connect(dryGain);
    dryGain.connect(currentDestination);

    // Wet loop
    currentSource.connect(delay);
    delay.connect(damping);
    damping.connect(feedback);
    feedback.connect(delay);
    damping.connect(wetGain);
    wetGain.connect(currentDestination);

    currentNodes = [dryGain, delay, damping, feedback, wetGain];
    return;
  }

  if (presetId === 'alien') {
    // Alien Warble: Modulated 8.5Hz pitch vibrato
    const delay = audioCtx.createDelay(0.1);
    delay.delayTime.value = 0.015;

    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 8.5; // 8.5Hz warble

    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.006; // 6ms modulation depth

    const outGain = audioCtx.createGain();
    outGain.gain.value = 1.2;

    lfo.connect(lfoGain);
    lfoGain.connect(delay.delayTime);

    currentSource.connect(delay);
    delay.connect(outGain);
    outGain.connect(currentDestination);
    lfo.start();

    currentNodes = [delay, lfo, lfoGain, outGain];
    return;
  }

  if (presetId === 'cathedral') {
    // Cathedral Reverb: Multi-tap Schroeder reflection matrix
    const dryGain = audioCtx.createGain();
    dryGain.gain.value = 0.75;

    const wetGain = audioCtx.createGain();
    wetGain.gain.value = 0.55;

    const delays = [0.031, 0.047, 0.071, 0.093].map((time) => {
      const d = audioCtx.createDelay(0.5);
      d.delayTime.value = time;
      const fb = audioCtx.createGain();
      fb.gain.value = 0.52;
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;

      currentSource.connect(d);
      d.connect(lp);
      lp.connect(fb);
      fb.connect(d);
      lp.connect(wetGain);
      return [d, fb, lp];
    });

    currentSource.connect(dryGain);
    dryGain.connect(currentDestination);
    wetGain.connect(currentDestination);

    currentNodes = [dryGain, wetGain, ...delays.flat()];
    return;
  }

  // Fallback
  currentSource.connect(currentDestination);
}

/**
 * Initializes the voice changer processing graph with a raw MediaStream.
 * Returns the processed destination MediaStream to be published.
 */
export function createProcessedAudioStream(rawStream, initialPreset = 'normal') {
  if (typeof window === 'undefined') return rawStream;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return rawStream;

    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContextClass({ sampleRate: 48000 });
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    currentSource = audioCtx.createMediaStreamSource(rawStream);
    currentDestination = audioCtx.createMediaStreamDestination();
    isRunning = true;

    applyPresetNodes(initialPreset);

    // If local test monitoring was previously toggled on, connect to speakers
    if (isMonitorOn) {
      enableLocalMonitor();
    }

    return currentDestination.stream;
  } catch (err) {
    console.warn('[VoiceEffects] Audio processing init failed, using raw stream:', err);
    return rawStream;
  }
}

/**
 * Dynamically switches voice preset in real-time without interrupting active call.
 */
export function setVoicePreset(presetId) {
  currentPreset = presetId;
  if (isRunning && audioCtx && currentSource && currentDestination) {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    try {
      applyPresetNodes(presetId);
    } catch (err) {
      console.warn('[VoiceEffects] Error switching preset:', err);
    }
  }
}

/**
 * Gets currently active voice preset id.
 */
export function getCurrentVoicePreset() {
  return currentPreset;
}

/**
 * Toggles hearing your own voice effect in your headphones/speakers for testing.
 */
export function setVoiceMonitor(enabled) {
  isMonitorOn = Boolean(enabled);
  if (!audioCtx || !currentDestination) return;

  if (isMonitorOn) {
    enableLocalMonitor();
  } else {
    disableLocalMonitor();
  }
}

export function isVoiceMonitorActive() {
  return isMonitorOn;
}

function enableLocalMonitor() {
  if (!audioCtx || !currentDestination || monitorNode) return;
  try {
    monitorNode = audioCtx.createGain();
    monitorNode.gain.value = 0.9;
    currentDestination.connect(monitorNode);
    monitorNode.connect(audioCtx.destination);
  } catch {}
}

function disableLocalMonitor() {
  if (monitorNode) {
    try {
      if (currentDestination) {
        currentDestination.disconnect(monitorNode);
      }
      monitorNode.disconnect();
    } catch {}
    monitorNode = null;
  }
}

/**
 * Cleans up AudioContext and nodes.
 */
export function cleanupVoiceEffects() {
  disableLocalMonitor();
  clearCurrentNodes();
  isRunning = false;
  if (currentSource) {
    try {
      currentSource.disconnect();
    } catch {}
    currentSource = null;
  }
  if (currentDestination) {
    try {
      currentDestination.disconnect();
    } catch {}
    currentDestination = null;
  }
  if (audioCtx && audioCtx.state !== 'closed') {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
}
