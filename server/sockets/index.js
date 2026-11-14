import { z } from 'zod';
import { verifySessionToken } from '../services/security.js';
import { roomStore } from '../services/roomStore.js';

// Schemas for socket events
const setVideoSchema = z.object({
  videoId: z.string().trim().min(1).max(64),
});

const positionSchema = z.object({
  positionSec: z.number().min(0),
});

const pingSchema = z.object({
  clientTime: z.number(),
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

      if (updated) {
        io.to(roomId).emit('player:state', updated);
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

