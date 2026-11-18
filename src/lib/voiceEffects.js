/**
 * Real-time Web Audio API voice transformation engine.
 * Intercepts raw microphone MediaStream and applies audio DSP effects
 * before publishing to WebRTC / LiveKit.
 */

export const VOICE_PRESETS = [
  { id: 'normal', name: 'Normal', desc: 'Natural clean voice', emoji: '🎙️' },
  { id: 'robot', name: 'Robot', desc: 'Metallic cyber voice', emoji: '🤖' },
  { id: 'radio', name: 'Radio', desc: 'Walkie-talkie lo-fi', emoji: '📻' },
  { id: 'deep', name: 'Deep', desc: 'Deep bass growl', emoji: '👹' },
  { id: 'chipmunk', name: 'Helium', desc: 'High-pitch squeak', emoji: '🐿️' },
  { id: 'echo', name: 'Cosmic Echo', desc: 'Spacial reverberation', emoji: '🌌' },
];

let audioCtx = null;
let currentSource = null;
let currentDestination = null;
let currentNodes = [];
let currentPreset = 'normal';
let isRunning = false;

function makeDistortionCurve(amount = 20) {
  const k = typeof amount === 'number' ? amount : 20;
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
 * Applies the selected voice preset nodes between source and destination.
 */
function applyPresetNodes(presetId) {
  if (!audioCtx || !currentSource || !currentDestination) return;

  clearCurrentNodes();
  currentPreset = presetId;

  if (presetId === 'normal') {
    // Pure clean passthrough
    currentSource.connect(currentDestination);
    return;
  }

  if (presetId === 'robot') {
    // Metallic Ring Modulator + Bandpass Filter
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    filter.Q.value = 2.5;

    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 52; // 52Hz carrier ring

    const oscGain = audioCtx.createGain();
    oscGain.gain.value = 0.8;

    const modGain = audioCtx.createGain();
    modGain.gain.value = 0.5;

    // Connect graph
    currentSource.connect(filter);
    filter.connect(modGain);

    osc.connect(oscGain);
    oscGain.connect(modGain.gain);

    modGain.connect(currentDestination);
    osc.start();

    currentNodes.push(filter, osc, oscGain, modGain);
    return;
  }

  if (presetId === 'radio') {
    // Walkie-Talkie: Bandpass (600Hz - 2800Hz) + Overdrive Distortion
    const highpass = audioCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 650;

    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 2700;
    lowpass.Q.value = 4.0;

    const shaper = audioCtx.createWaveShaper();
    shaper.curve = makeDistortionCurve(18);
    shaper.oversample = '2x';

    const gain = audioCtx.createGain();
    gain.gain.value = 1.3;

    currentSource.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(shaper);
    shaper.connect(gain);
    gain.connect(currentDestination);

    currentNodes.push(highpass, lowpass, shaper, gain);
    return;
  }

  if (presetId === 'deep') {
    // Deep Monster: Heavy low shelf + warm compression + gentle distortion
    const lowShelf = audioCtx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 180;
    lowShelf.gain.value = 14; // +14dB sub bass boost

    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1400;

    const shaper = audioCtx.createWaveShaper();
    shaper.curve = makeDistortionCurve(10);

    const gain = audioCtx.createGain();
    gain.gain.value = 1.1;

    currentSource.connect(lowShelf);
    lowShelf.connect(lowpass);
    lowpass.connect(shaper);
    shaper.connect(gain);
    gain.connect(currentDestination);

    currentNodes.push(lowShelf, lowpass, shaper, gain);
    return;
  }

  if (presetId === 'chipmunk') {
    // Helium: High-pass + sharp formant resonance boost
    const highpass = audioCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 850;

    const peak1 = audioCtx.createBiquadFilter();
    peak1.type = 'peaking';
    peak1.frequency.value = 2600;
    peak1.gain.value = 16;
    peak1.Q.value = 4.5;

    const highShelf = audioCtx.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = 4200;
    highShelf.gain.value = 10;

    currentSource.connect(highpass);
    highpass.connect(peak1);
    peak1.connect(highShelf);
    highShelf.connect(currentDestination);

    currentNodes.push(highpass, peak1, highShelf);
    return;
  }

  if (presetId === 'echo') {
    // Cosmic Echo: Delay + Feedback loop mixed with dry vocal
    const dryGain = audioCtx.createGain();
    dryGain.gain.value = 0.8;

    const delay = audioCtx.createDelay(1.0);
    delay.delayTime.value = 0.22; // 220ms slapback echo

    const feedback = audioCtx.createGain();
    feedback.gain.value = 0.42;

    const wetGain = audioCtx.createGain();
    wetGain.gain.value = 0.55;

    // Dry path
    currentSource.connect(dryGain);
    dryGain.connect(currentDestination);

    // Wet / Echo loop
    currentSource.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay); // feedback loop
    delay.connect(wetGain);
    wetGain.connect(currentDestination);

    currentNodes.push(dryGain, delay, feedback, wetGain);
    return;
  }

  // Fallback to passthrough
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

    // Return the processed audio track stream
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
 * Cleans up AudioContext and nodes.
 */
export function cleanupVoiceEffects() {
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
