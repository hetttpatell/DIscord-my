import crypto from 'node:crypto';

/**
 * Pure function to advance a room's queue on track end or skip.
 * Does no socket or io work.
 *
 * @param {object} room - The room state object
 * @param {string} endedEntryId - The entryId of the track that ended/skipped
 * @returns {{ advanced: boolean, room: object }} Result containing success flag and updated room
 */
export function advanceQueue(room, endedEntryId) {
  if (!room) {
    return { advanced: false, room };
  }

  const currentEntryId = room.currentTrack?.entryId;

  // Return without effect unless entryId matches current playing track
  if (!endedEntryId || !currentEntryId || endedEntryId !== currentEntryId) {
    return { advanced: false, room };
  }

  if (Array.isArray(room.queue) && room.queue.length > 0) {
    const nextTrack = room.queue.shift();
    if (!nextTrack.entryId) {
      nextTrack.entryId = crypto.randomUUID();
    }
    room.currentTrack = nextTrack;
    room.isPlaying = true;
    room.playbackPosition = 0;
    room.lastStateChangeTime = Date.now();
    return { advanced: true, room };
  } else {
    room.currentTrack = null;
    room.isPlaying = false;
    room.playbackPosition = 0;
    room.lastStateChangeTime = Date.now();
    return { advanced: true, room };
  }
}

export default advanceQueue;
