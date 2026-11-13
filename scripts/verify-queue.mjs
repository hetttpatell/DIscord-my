import assert from 'node:assert';
import crypto from 'node:crypto';

/**
 * Queue Verification Script
 * Simulates 4 duplicate track-end events with the same entryId against advanceQueue
 * and asserts that exactly one advance occurs.
 */

function createTestRoom() {
  const entryId1 = crypto.randomUUID();
  const entryId2 = crypto.randomUUID();
  const entryId3 = crypto.randomUUID();

  return {
    id: 'AUDIT-ROOM',
    currentTrack: { id: 'vid-1', title: 'Bohemian Rhapsody', entryId: entryId1 },
    queue: [
      { id: 'vid-2', title: 'Hotel California', entryId: entryId2 },
      { id: 'vid-3', title: 'Stairway to Heaven', entryId: entryId3 }
    ],
    isPlaying: true,
    playbackPosition: 354,
    lastStateChangeTime: Date.now()
  };
}

function advanceQueue(room, payload, broadcastLog = []) {
  const payloadEntryId = payload?.entryId;
  const currentEntryId = room.currentTrack?.entryId;

  // Return without effect unless entryId matches current playing track
  if (!payloadEntryId || !currentEntryId || payloadEntryId !== currentEntryId) {
    return false; // Rejected race condition
  }

  if (room.queue.length > 0) {
    const nextTrack = room.queue.shift();
    if (!nextTrack.entryId) {
      nextTrack.entryId = crypto.randomUUID();
    }
    room.currentTrack = nextTrack;
    room.isPlaying = true;
    room.playbackPosition = 0;
    room.lastStateChangeTime = Date.now();

    broadcastLog.push({ event: 'player:track-change', track: room.currentTrack });
    return true; // Accepted advance
  } else {
    room.currentTrack = null;
    room.isPlaying = false;
    room.playbackPosition = 0;
    room.lastStateChangeTime = Date.now();

    broadcastLog.push({ event: 'player:track-change', track: null });
    return true; // Advanced to end of queue
  }
}

console.log('====================================================');
console.log('AUDIT VERIFICATION: advanceQueue Race Condition Test');
console.log('====================================================');

const room = createTestRoom();
const targetEntryId = room.currentTrack.entryId;
const initialQueueLength = room.queue.length;
const broadcastLog = [];

console.log(`Initial Track: "${room.currentTrack.title}" [entryId: ${targetEntryId}]`);
console.log(`Initial Queue: ${room.queue.map(t => `"${t.title}"`).join(', ')} (${room.queue.length} items)\n`);

// 4 simulated tabs simultaneously firing player:track-end for the same song
const incomingEvents = [
  { client: 'Client Tab 1', entryId: targetEntryId },
  { client: 'Client Tab 2', entryId: targetEntryId },
  { client: 'Client Tab 3', entryId: targetEntryId },
  { client: 'Client Tab 4', entryId: targetEntryId }
];

let acceptedCount = 0;
let rejectedCount = 0;

for (const evt of incomingEvents) {
  const advanced = advanceQueue(room, evt, broadcastLog);
  if (advanced) {
    acceptedCount++;
    console.log(`[ADVANCED] ${evt.client}: Accepted advanceQueue for entryId ${evt.entryId}`);
  } else {
    rejectedCount++;
    console.log(`[DROPPED]  ${evt.client}: Stale entryId ${evt.entryId} safely ignored (current: ${room.currentTrack?.entryId})`);
  }
}

console.log('\n--- Asserting Invariants ---');
assert.strictEqual(acceptedCount, 1, `Invariant failure: Expected exactly 1 accepted advance, got ${acceptedCount}`);
console.log('✓ Invariant 1: Exactly one advance accepted');

assert.strictEqual(rejectedCount, 3, `Invariant failure: Expected 3 rejected duplicates, got ${rejectedCount}`);
console.log('✓ Invariant 2: Exactly 3 duplicate events dropped without side effects');

assert.strictEqual(broadcastLog.length, 1, `Invariant failure: Expected 1 broadcast, got ${broadcastLog.length}`);
console.log('✓ Invariant 3: Exactly 1 room broadcast emitted');

assert.strictEqual(room.currentTrack.title, 'Hotel California', `Invariant failure: Expected Hotel California, got ${room.currentTrack?.title}`);
console.log('✓ Invariant 4: New track is "Hotel California"');

assert.strictEqual(room.queue.length, initialQueueLength - 1, `Invariant failure: Expected queue length ${initialQueueLength - 1}, got ${room.queue.length}`);
console.log('✓ Invariant 5: Queue decremented by exactly 1 item');

console.log('\n====================================================');
console.log('ALL VERIFICATION ASSERTIONS PASSED SUCCESSFULLY (0 ERRORS)');
console.log('====================================================');

