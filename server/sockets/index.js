import crypto from 'node:crypto';
import { z } from 'zod';
import { verifySessionToken } from '../services/security.js';
import { roomStore } from '../services/roomStore.js';

// Schemas for socket events
const setVideoSchema = z.object({
  videoId: z.string().trim().min(1).max(64),
  title: z.string().nullish(),
  channel: z.string().nullish(),
  thumbnail: z.string().nullish(),
  thumbnailUrl: z.string().nullish(),
  durationSec: z.union([z.number(), z.string(), z.null()]).optional(),
  durationSeconds: z.union([z.number(), z.string(), z.null()]).optional(),
});

const queueAddSchema = z.object({
  videoId: z.string().trim().min(1).max(64),
  title: z.string().nullish(),
  channel: z.string().nullish(),
  thumbnail: z.string().nullish(),
  thumbnailUrl: z.string().nullish(),
  durationSec: z.union([z.number(), z.string(), z.null()]).optional(),
  durationSeconds: z.union([z.number(), z.string(), z.null()]).optional(),
});

const queueRemoveSchema = z.object({
  itemId: z.string().min(1),
});

const queueEndedSchema = z.object({
  itemId: z.string().min(1),
});

const positionSchema = z.object({
  positionSec: z.number().min(0),
});

const pingSchema = z.object({
  clientTime: z.number(),
});

const voiceStateSchema = z.object({
  isMicEnabled: z.boolean(),
});

// Per-socket rate limiter: max 30 events per 5 seconds
function createSocketRateLimiter(maxEvents = 30, windowMs = 5000) {
  const eventTimestamps = [];
  return function isAllowed() {
    const now = Date.now();
    while (eventTimestamps.length > 0 && eventTimestamps[0] <= now - windowMs) {
      eventTimestamps.shift();
    }
    if (eventTimestamps.length >= maxEvents) {
      return false;
    }
    eventTimestamps.push(now);
    return true;
  };
}

export function setupSocketIO(io) {
  // Socket handshake middleware: require valid session token
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const session = verifySessionToken(token);
    if (!session) {
      return next(new Error('Invalid or expired authentication token'));
    }

    socket.session = session;
    next();
  });

  io.on('connection', async (socket) => {
    const { roomId, memberId, displayName } = socket.session;
    const isAllowed = createSocketRateLimiter();

    socket.join(roomId);

    // Register member in roomStore
    await roomStore.addMember(roomId, {
      memberId,
      displayName,
      socketId: socket.id,
    });

    const room = await roomStore.getRoom(roomId);
    if (room) {
      // Send authoritative player state snapshot to connecting socket
      socket.emit('player:state', room.playerState);

      // Send queue snapshot to connecting socket
      socket.emit('queue:update', {
        queue: room.queue || [],
        nowPlaying: room.nowPlaying || null,
        version: room.queueVersion || 1,
      });

      // Broadcast updated member list to all room participants
      io.to(roomId).emit(
        'room:members',
        Object.values(room.members || {}).map((m) => ({
          memberId: m.memberId,
          displayName: m.displayName,
          isOnline: m.isOnline,
        }))
      );
    }

    // Ping / Pong for 3-sample median clock offset calibration
    socket.on('ping:client', (payload) => {
      if (!isAllowed()) return;
      const parsed = pingSchema.safeParse(payload);
      if (!parsed.success) return;

      socket.emit('pong:server', {
        clientTime: parsed.data.clientTime,
        serverTime: Date.now(),
      });
    });

    // player:set-video
    socket.on('player:set-video', async (payload) => {
      if (!isAllowed()) return;
      const parsed = setVideoSchema.safeParse(payload);
      if (!parsed.success) return;

      const updated = await roomStore.updatePlayerState(roomId, {
        videoId: parsed.data.videoId,
        status: 'playing',
        positionSec: 0,
      });

      const currentRoom = await roomStore.getRoom(roomId);
      if (currentRoom) {
        currentRoom.nowPlaying = {
          id: crypto.randomUUID(),
          videoId: parsed.data.videoId,
          title: parsed.data.title || 'Untitled',
          channel: parsed.data.channel || '',
          thumbnail:
            parsed.data.thumbnailUrl ||
            parsed.data.thumbnail ||
            `https://i.ytimg.com/vi/${parsed.data.videoId}/hqdefault.jpg`,
          durationSeconds: Number(parsed.data.durationSec || parsed.data.durationSeconds || 0) || 0,
          addedById: memberId,
          addedByName: displayName,
          addedAt: Date.now(),
        };
        currentRoom.queueVersion = (currentRoom.queueVersion || 0) + 1;
        await roomStore.saveRoom(currentRoom);
        io.to(roomId).emit('queue:update', {
          queue: currentRoom.queue || [],
          nowPlaying: currentRoom.nowPlaying,
          version: currentRoom.queueVersion,
        });
      }

      if (updated) {
        io.to(roomId).emit('player:state', updated);
      }
    });

    // queue:add
    socket.on('queue:add', async (payload) => {
      if (!isAllowed()) return;
      const parsed = queueAddSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit('queue:error', { message: 'Invalid video payload' });
        return;
      }

      try {
        const result = await roomStore.addToQueue(roomId, parsed.data, {
          memberId,
          displayName,
        });
        if (result?.room) {
          io.to(roomId).emit('queue:update', {
            queue: result.room.queue || [],
            nowPlaying: result.room.nowPlaying || null,
            version: result.room.queueVersion,
          });

          if (result.startedImmediately) {
            io.to(roomId).emit('player:state', result.room.playerState);
          }
        }
      } catch (err) {
        socket.emit('queue:error', { message: err.message });
      }
    });

    // queue:remove
    socket.on('queue:remove', async (payload) => {
      if (!isAllowed()) return;
      const parsed = queueRemoveSchema.safeParse(payload);
      if (!parsed.success) return;

      const updatedRoom = await roomStore.removeFromQueue(roomId, parsed.data.itemId);
      if (updatedRoom) {
        io.to(roomId).emit('queue:update', {
          queue: updatedRoom.queue || [],
          nowPlaying: updatedRoom.nowPlaying || null,
          version: updatedRoom.queueVersion,
        });
      }
    });

    // queue:skip
    socket.on('queue:skip', async () => {
      if (!isAllowed()) return;
      const updatedRoom = await roomStore.skipQueue(roomId);
      if (updatedRoom) {
        io.to(roomId).emit('queue:update', {
          queue: updatedRoom.queue || [],
          nowPlaying: updatedRoom.nowPlaying || null,
          version: updatedRoom.queueVersion,
        });
        io.to(roomId).emit('player:state', updatedRoom.playerState);
      }
    });

    // queue:ended
    socket.on('queue:ended', async (payload) => {
      if (!isAllowed()) return;
      const parsed = queueEndedSchema.safeParse(payload);
      if (!parsed.success) return;

      const updatedRoom = await roomStore.endedQueue(roomId, parsed.data.itemId);
      if (updatedRoom) {
        io.to(roomId).emit('queue:update', {
          queue: updatedRoom.queue || [],
          nowPlaying: updatedRoom.nowPlaying || null,
          version: updatedRoom.queueVersion,
        });
        io.to(roomId).emit('player:state', updatedRoom.playerState);
      }
    });

    // player:play
    socket.on('player:play', async (payload) => {
      if (!isAllowed()) return;
      const parsed = positionSchema.safeParse(payload);
      if (!parsed.success) return;

      const updated = await roomStore.updatePlayerState(roomId, {
        status: 'playing',
        positionSec: parsed.data.positionSec,
      });

      if (updated) {
        io.to(roomId).emit('player:state', updated);
      }
    });

    // player:pause
    socket.on('player:pause', async (payload) => {
      if (!isAllowed()) return;
      const parsed = positionSchema.safeParse(payload);
      if (!parsed.success) return;

      const updated = await roomStore.updatePlayerState(roomId, {
        status: 'paused',
        positionSec: parsed.data.positionSec,
      });

      if (updated) {
        io.to(roomId).emit('player:state', updated);
      }
    });

    // player:seek
    socket.on('player:seek', async (payload) => {
      if (!isAllowed()) return;
      const parsed = positionSchema.safeParse(payload);
      if (!parsed.success) return;

      const currentRoom = await roomStore.getRoom(roomId);
      const updated = await roomStore.updatePlayerState(roomId, {
        status: currentRoom?.playerState?.status || 'playing',
        positionSec: parsed.data.positionSec,
      });

      if (updated) {
        io.to(roomId).emit('player:state', updated);
      }
    });

    // voice:state
    socket.on('voice:state', (payload) => {
      if (!isAllowed()) return;
      const parsed = voiceStateSchema.safeParse(payload);
      if (!parsed.success) return;

      io.to(roomId).emit('voice:state', {
        memberId,
        displayName,
        isMicEnabled: parsed.data.isMicEnabled,
      });
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      const result = await roomStore.removeMemberBySocket(socket.id);
      if (result?.room) {
        io.to(result.room.roomId).emit(
          'room:members',
          Object.values(result.room.members || {}).map((m) => ({
            memberId: m.memberId,
            displayName: m.displayName,
            isOnline: m.isOnline,
          }))
        );
      }
    });
  });
}

