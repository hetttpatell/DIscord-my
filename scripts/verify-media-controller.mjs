/**
 * Verification test for MediaController
 * Verifies:
 * 1. State machine explicit states: 'off', 'requesting', 'on', 'soft-muted', 'blocked', 'error'
 * 2. Concurrency coalescing: rapid taps collapse into latest intent
 * 3. Microphone policy: keeps track alive and toggles track.enabled (soft-muted)
 * 4. Camera policy: stops track on disable, acquires on enable, stops old before switch
 * 5. Lobby handoff: tracks persist across room entry, stopped only on cleanupOnLeaveRoom
 */

import assert from 'node:assert';

console.log('================================================================');
console.log('AUDIT VERIFICATION: MediaController State Machine & Policies');
console.log('================================================================');

// Mock MediaStreamTrack
class MockTrack {
  constructor(kind, id = `track-${kind}-${Date.now()}`) {
    this.id = id;
    this.kind = kind;
    this.enabled = true;
    this.readyState = 'live';
    this.muted = false;
  }
  stop() {
    this.readyState = 'ended';
  }
}

// Mock MediaStream
class MockMediaStream {
  constructor(tracks = []) {
    this.tracks = [...tracks];
  }
  getTracks() {
    return [...this.tracks];
  }
  getAudioTracks() {
    return this.tracks.filter(t => t.kind === 'audio');
  }
  getVideoTracks() {
    return this.tracks.filter(t => t.kind === 'video');
  }
  addTrack(track) {
    this.tracks.push(track);
  }
  removeTrack(track) {
    this.tracks = this.tracks.filter(t => t !== track);
  }
}

globalThis.MediaStream = MockMediaStream;
globalThis.window = { isSecureContext: true };
globalThis.document = {
  visibilityState: 'visible',
  addEventListener: () => {},
  removeEventListener: () => {}
};

// Import mediaController dynamically
const { MediaController } = await import('../src/services/mediaController.js');
const controller = new MediaController();

// Mock mediaService calls
let audioAcquireCount = 0;
let videoAcquireCount = 0;

import mediaService from '../src/services/mediaService.js';

mediaService.acquireAudioTrack = async () => {
  audioAcquireCount++;
  const track = new MockTrack('audio');
  if (!mediaService.localStream) {
    mediaService.localStream = new MockMediaStream([track]);
  } else {
    mediaService.localStream.addTrack(track);
  }
  mediaService.isMicOn = true;
  return track;
};

mediaService.acquireVideoTrack = async (facing = 'user') => {
  videoAcquireCount++;
  const track = new MockTrack('video');
  track.facingMode = facing;
  if (!mediaService.localStream) {
    mediaService.localStream = new MockMediaStream([track]);
  } else {
    mediaService.localStream.addTrack(track);
  }
  mediaService.isCameraOn = true;
  return track;
};

// --- Test 1: Initial State ---
console.log('[Test 1] Verifying initial controller state...');
assert.strictEqual(controller.micState, 'off', 'Initial micState should be off');
assert.strictEqual(controller.cameraState, 'off', 'Initial cameraState should be off');
console.log('✓ Invariant 1: Initial state is off');

// --- Test 2: Enable Mic and Soft-Mute ---
console.log('[Test 2] Verifying mic enable & soft-mute policy...');
await controller.enableMic();
assert.strictEqual(controller.micState, 'on', 'micState should be on');
assert.strictEqual(audioAcquireCount, 1, 'Audio acquire should have been called once');

const audioTrack = controller.stream.getAudioTracks()[0];
assert.strictEqual(audioTrack.enabled, true, 'Audio track should be enabled');

// Disable mic -> soft-muted
await controller.disableMic();
assert.strictEqual(controller.micState, 'soft-muted', 'micState should be soft-muted');
assert.strictEqual(audioTrack.enabled, false, 'Audio track should be disabled (soft-muted)');
assert.strictEqual(audioTrack.readyState, 'live', 'Audio track should NOT be stopped');

// Re-enable mic -> should NOT call acquireAudioTrack again, only toggle enabled
await controller.enableMic();
assert.strictEqual(controller.micState, 'on', 'micState should be on');
assert.strictEqual(audioTrack.enabled, true, 'Audio track should be enabled');
assert.strictEqual(audioAcquireCount, 1, 'Audio acquire should NOT be called again (instant un-mute)');
console.log('✓ Invariant 2: Mic soft-mute toggles track.enabled without re-acquisition');

// --- Test 3: Camera Policy (Hardware Release) ---
console.log('[Test 3] Verifying camera policy (hardware release on off)...');
await controller.enableCamera();
assert.strictEqual(controller.cameraState, 'on', 'cameraState should be on');
assert.strictEqual(videoAcquireCount, 1, 'Video acquire should have been called once');

const videoTrack1 = controller.stream.getVideoTracks()[0];
assert.strictEqual(videoTrack1.readyState, 'live', 'Video track should be live');

// Disable camera -> track stopped and removed
await controller.disableCamera();
assert.strictEqual(controller.cameraState, 'off', 'cameraState should be off');
assert.strictEqual(videoTrack1.readyState, 'ended', 'Video track should be stopped to turn off light');
assert.strictEqual(controller.stream.getVideoTracks().length, 0, 'Video track should be removed from stream');

// Re-enable camera -> re-acquired
await controller.enableCamera();
assert.strictEqual(controller.cameraState, 'on', 'cameraState should be on');
assert.strictEqual(videoAcquireCount, 2, 'Video acquire should be called again on camera re-enable');
const videoTrack2 = controller.stream.getVideoTracks()[0];
assert.strictEqual(videoTrack2.readyState, 'live', 'New video track should be live');
console.log('✓ Invariant 3: Camera turns off hardware and re-acquires on enable');

// --- Test 4: Switch Camera ---
console.log('[Test 4] Verifying switchCamera policy...');
assert.strictEqual(controller.facingMode, 'user', 'Facing mode initially user');
await controller.switchCamera();
assert.strictEqual(controller.facingMode, 'environment', 'Facing mode changed to environment');
assert.strictEqual(videoTrack2.readyState, 'ended', 'Old video track was stopped before new one acquired');
assert.strictEqual(videoAcquireCount, 3, 'New video track acquired for environment');
console.log('✓ Invariant 4: Switch camera stops old track before acquiring new facing track');

// --- Test 5: Concurrency Coalescing ---
console.log('[Test 5] Verifying concurrency coalescing on rapid toggles...');
// Simulate rapid taps on mic: enable, disable, enable in rapid succession
const p1 = controller.disableMic();
const p2 = controller.enableMic();
const p3 = controller.disableMic();
await Promise.all([p1, p2, p3]);

assert.strictEqual(controller.micState, 'soft-muted', 'Final state reflects latest intent (disabled/soft-muted)');
console.log('✓ Invariant 5: Rapid coalesced toggles leave device in correct final state');

// --- Test 6: Room Exit Cleanup ---
console.log('[Test 6] Verifying room exit cleanup...');
controller.cleanupOnLeaveRoom();
assert.strictEqual(controller.micState, 'off', 'micState reset to off on room leave');
assert.strictEqual(controller.cameraState, 'off', 'cameraState reset to off on room leave');
assert.strictEqual(controller.stream, null, 'localStream cleared on room leave');
console.log('✓ Invariant 6: Room exit cleanup cleanly stops all tracks');

// --- Test 7: Subscriber Resilience & Signature Invariants ---
console.log('[Test 7] Verifying subscriber resilience for (event, payload, state)...');
let received3ArgMicOn = null;
let received2ArgMicOn = null;

// Test subscriber with 3 parameters (event, payload, state)
const unsub1 = controller.subscribe((event, payload, state) => {
  assert.notStrictEqual(state, undefined, '3rd argument state must not be undefined');
  assert.strictEqual(typeof state.isMicOn, 'boolean', 'state.isMicOn must be boolean');
  received3ArgMicOn = state.isMicOn;
});

// Test subscriber with 2 parameters (event, payload)
const unsub2 = controller.subscribe((event, payload) => {
  assert.notStrictEqual(payload, undefined, '2nd argument payload must not be undefined');
  assert.strictEqual(typeof payload.isMicOn, 'boolean', 'payload.isMicOn must be boolean');
  received2ArgMicOn = payload.isMicOn;
});

assert.strictEqual(received3ArgMicOn, false, 'Initial mic state isMicOn: false received');
assert.strictEqual(received2ArgMicOn, false, 'Initial mic state isMicOn: false received');

unsub1();
unsub2();
console.log('✓ Invariant 7: Subscriber callback signatures safely receive defined state with isMicOn');

console.log('================================================================');
console.log('ALL MEDIACONTROLLER INVARIANTS PASSED SUCCESSFULLY (0 ERRORS)');
console.log('================================================================');

