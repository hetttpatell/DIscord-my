import crypto from 'node:crypto';
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

const mediaStateSchema = z.object({
  micOn: z.boolean().optional(),
  camOn: z.boolean().optional(),
});

const voiceStateSchema = z.object({
  isMicEnabled: z.boolean(),
});

const chatSendSchema = z.object({
  text: z.string().trim().min(1).max(500),
});

const queueAddSchema = z.object({
  video: z.object({
    videoId: z.string().trim().min(1).max(64),
    title: z.string().optional(),
    channel: z.string().optional(),
    thumbnail: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    durationSec: z.number().optional(),
    durationSeconds: z.number().optional(),
  }),
});

const queueItemActionSchema = z.object({
  itemId: z.string().min(1),
});

const queueMoveSchema = z.object({
  itemId: z.string().min(1),
  direction: z.enum(['up', 'down']),
});

const ALLOWED_EMOJIS = ['❤️', '😂', '🔥', '👏', '😮', '🎵'];

// Per-socket rate limiter: sliding window
function createRateLimiter(maxEvents = 30, windowMs = 5000) {
  const timestamps = [];
  return function isAllowed() {
    const now = Date.now();
    while (timestamps.length > 0 && timestamps[0] <= now - windowMs) {
      timestamps.shift();
    }
    if (timestamps.length >= maxEvents) {
      return false;
    }
    timestamps.push(now);
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
    const isGeneralAllowed = createRateLimiter(40, 5000);
    const isChatAllowed = createRateLimiter(5, 3000); // 5 messages per 3s
    let lastReactionTime = 0; // 1 per 300ms

    // Check room capacity
    const currentRoom = await roomStore.getRoom(roomId);
    if (
      currentRoom &&
      Array.isArray(currentRoom.members) &&
      currentRoom.members.length >= 6 &&
      !currentRoom.members.some((m) => m.id === socket.id || m.memberId === memberId)
    ) {
      socket.emit('room:error', { message: 'Room is full' });
      socket.disconnect(true);
      return;
    }

    socket.join(roomId);

    const initialPeerId =
      socket.handshake.auth?.peerId || socket.handshake.query?.peerId || '';
    const initialName =
      socket.handshake.auth?.name || displayName || 'Guest';

    // Register member in roomStore
    const addResult = await roomStore.addMember(roomId, {
      socketId: socket.id,
      memberId,
      peerId: initialPeerId,
      name: initialName,
    });

    const room = addResult?.room;
    const selfMember = addResult?.member;

    if (room) {
      // Send authoritative state snapshot to connecting socket
      socket.emit('player:state', room.playerState);
      socket.emit('queue:update', {
        queue: room.queue || [],
        nowPlaying: room.nowPlaying || null,
        version: room.queueVersion || 1,
      });
      socket.emit('chat:history', {
        messages: room.chatHistory || [],
      });

      // Monotonically increasing room:members broadcast
      io.to(roomId).emit('room:members', {
        members: room.members,
        version: room.memberVersion,
      });

      // System join message
      const joinMsg = {
        id: crypto.randomUUID(),
        type: 'system',
        text: `${selfMember?.name || displayName} joined`,
        ts: Date.now(),
      };
      await roomStore.addChatMessage(roomId, joinMsg);
      io.to(roomId).emit('chat:message', joinMsg);
    }

    // Ping / Pong for clock synchronization
    socket.on('ping:client', (payload) => {
      if (!isGeneralAllowed()) return;
      const parsed = pingSchema.safeParse(payload);
      if (!parsed.success) return;

      socket.emit('pong:server', {
        clientTime: parsed.data.clientTime,
        serverTime: Date.now(),
      });
    });

    // Rejoin / Update Peer ID and Name
    socket.on('room:join', async (payload) => {
      const peerId = typeof payload?.peerId === 'string' ? payload.peerId : '';
      const name = typeof payload?.name === 'string' ? payload.name : '';

      const updatedRoom = await roomStore.updateMemberPeer(roomId, socket.id, {
        peerId,
        name,
      });

      if (updatedRoom) {
        io.to(roomId).emit('room:members', {
          members: updatedRoom.members,
          version: updatedRoom.memberVersion,
        });
      }
    });

    // Media state: micOn, camOn
    socket.on('media:state', async (payload) => {
      if (!isGeneralAllowed()) return;
      const parsed = mediaStateSchema.safeParse(payload);
      if (!parsed.success) return;

      const updatedRoom = await roomStore.updateMemberMedia(roomId, socket.id, {
        micOn: parsed.data.micOn,
        camOn: parsed.data.camOn,
      });

      if (updatedRoom) {
        io.to(roomId).emit('room:members', {
          members: updatedRoom.members,
          version: updatedRoom.memberVersion,
        });
      }
    });

    // Legacy voice:state support
    socket.on('voice:state', async (payload) => {
      if (!isGeneralAllowed()) return;
      const parsed = voiceStateSchema.safeParse(payload);
      if (!parsed.success) return;

      const updatedRoom = await roomStore.updateMemberMedia(roomId, socket.id, {
        micOn: parsed.data.isMicEnabled,
      });

      if (updatedRoom) {
        io.to(roomId).emit('room:members', {
          members: updatedRoom.members,
          version: updatedRoom.memberVersion,
        });
      }

      io.to(roomId).emit('voice:state', {
        memberId,
        displayName,
        isMicEnabled: parsed.data.isMicEnabled,
      });
    });

    // Host kicking a member
    socket.on('room:kick', async (payload) => {
      const current = await roomStore.getRoom(roomId);
      if (!current || !Array.isArray(current.members)) return;

      const caller = current.members.find((m) => m.id === socket.id);
      if (!caller || !caller.isHost) {
        socket.emit('room:error', { message: 'Only the host can kick members' });
        return;
      }

      const targetId = payload?.memberId;
      const target = current.members.find(
        (m) => m.id === targetId || m.memberId === targetId
      );

      if (!target || target.id === socket.id) return;

      // Disconnect target socket
      const targetSocket = io.sockets.sockets.get(target.id);
      if (targetSocket) {
        targetSocket.emit('room:kicked', { message: 'You were removed by the host' });
        targetSocket.disconnect(true);
      }

      const removeResult = await roomStore.removeMember(roomId, target.id);
      if (removeResult?.room) {
        io.to(roomId).emit('room:members', {
          members: removeResult.room.members,
          version: removeResult.room.memberVersion,
        });

        const kickMsg = {
          id: crypto.randomUUID(),
          type: 'system',
          text: `${target.name} was removed by the host`,
          ts: Date.now(),
        };
        await roomStore.addChatMessage(roomId, kickMsg);
        io.to(roomId).emit('chat:message', kickMsg);
      }
    });

    // Chat send
    socket.on('chat:send', async (payload) => {
      if (!isChatAllowed()) {
        socket.emit('chat:error', { message: 'Slow down' });
        return;
      }

      const parsed = chatSendSchema.safeParse(payload);
      if (!parsed.success) return;

      const current = await roomStore.getRoom(roomId);
      const sender = current?.members?.find((m) => m.id === socket.id);
      const senderName = sender?.name || displayName || 'Guest';

      const msg = {
        id: crypto.randomUUID(),
        memberId: socket.id,
        name: senderName,
        text: parsed.data.text,
        ts: Date.now(),
      };

      await roomStore.addChatMessage(roomId, msg);
      io.to(roomId).emit('chat:message', msg);
    });

    // Reactions
    socket.on('reaction:send', async (payload) => {
      const now = Date.now();
      if (now - lastReactionTime < 300) return;
      lastReactionTime = now;

      const emoji = payload?.emoji;
      if (!emoji || !ALLOWED_EMOJIS.includes(emoji)) return;

      const current = await roomStore.getRoom(roomId);
      const sender = current?.members?.find((m) => m.id === socket.id);
      const senderName = sender?.name || displayName || 'Guest';

      io.to(roomId).emit('reaction:show', {
        id: crypto.randomUUID(),
        emoji,
        memberId: socket.id,
        name: senderName,
      });
    });

    // Player events
    socket.on('player:set-video', async (payload) => {
      if (!isGeneralAllowed()) return;
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

    socket.on('player:play', async (payload) => {
      if (!isGeneralAllowed()) return;
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

    socket.on('player:pause', async (payload) => {
      if (!isGeneralAllowed()) return;
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

    socket.on('player:seek', async (payload) => {
      if (!isGeneralAllowed()) return;
      const parsed = positionSchema.safeParse(payload);
      if (!parsed.success) return;

      const current = await roomStore.getRoom(roomId);
      const updated = await roomStore.updatePlayerState(roomId, {
        status: current?.playerState?.status || 'playing',
        positionSec: parsed.data.positionSec,
      });

      if (updated) {
        io.to(roomId).emit('player:state', updated);
      }
    });

    // Queue events
    socket.on('queue:add', async (payload) => {
      if (!isGeneralAllowed()) return;
      const parsed = queueAddSchema.safeParse(payload);
      if (!parsed.success) return;

      const current = await roomStore.getRoom(roomId);
      const sender = current?.members?.find((m) => m.id === socket.id);
      if (!sender) return;

      try {
        const result = await roomStore.addToQueue(roomId, parsed.data.video, sender);
        if (result?.room) {
          io.to(roomId).emit('queue:update', {
            queue: result.room.queue,
            nowPlaying: result.room.nowPlaying,
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

    socket.on('queue:remove', async (payload) => {
      if (!isGeneralAllowed()) return;
      const parsed = queueItemActionSchema.safeParse(payload);
      if (!parsed.success) return;

      const current = await roomStore.getRoom(roomId);
      const sender = current?.members?.find((m) => m.id === socket.id);
      if (!sender) return;

      try {
        const updatedRoom = await roomStore.removeFromQueue(roomId, parsed.data.itemId, sender);
        if (updatedRoom) {
          io.to(roomId).emit('queue:update', {
            queue: updatedRoom.queue,
            nowPlaying: updatedRoom.nowPlaying,
            version: updatedRoom.queueVersion,
          });
        }
      } catch (err) {
        socket.emit('queue:error', { message: err.message });
      }
    });

    socket.on('queue:move', async (payload) => {
      if (!isGeneralAllowed()) return;
      const parsed = queueMoveSchema.safeParse(payload);
      if (!parsed.success) return;

      const current = await roomStore.getRoom(roomId);
      const sender = current?.members?.find((m) => m.id === socket.id);
      if (!sender) return;

      try {
        const updatedRoom = await roomStore.moveQueueItem(
          roomId,
          parsed.data.itemId,
          parsed.data.direction,
          sender
        );
        if (updatedRoom) {
          io.to(roomId).emit('queue:update', {
            queue: updatedRoom.queue,
            nowPlaying: updatedRoom.nowPlaying,
            version: updatedRoom.queueVersion,
          });
        }
      } catch (err) {
        socket.emit('queue:error', { message: err.message });
      }
    });

    socket.on('queue:playNow', async (payload) => {
      if (!isGeneralAllowed()) return;
      const parsed = queueItemActionSchema.safeParse(payload);
      if (!parsed.success) return;

      const current = await roomStore.getRoom(roomId);
      const sender = current?.members?.find((m) => m.id === socket.id);
      if (!sender) return;

      try {
        const updatedRoom = await roomStore.playNowQueueItem(roomId, parsed.data.itemId, sender);
        if (updatedRoom) {
          io.to(roomId).emit('queue:update', {
            queue: updatedRoom.queue,
            nowPlaying: updatedRoom.nowPlaying,
            version: updatedRoom.queueVersion,
          });
          io.to(roomId).emit('player:state', updatedRoom.playerState);
        }
      } catch (err) {
        socket.emit('queue:error', { message: err.message });
      }
    });

    socket.on('queue:skip', async () => {
      if (!isGeneralAllowed()) return;
      const current = await roomStore.getRoom(roomId);
      const sender = current?.members?.find((m) => m.id === socket.id);
      if (!sender) return;

      const result = await roomStore.voteSkip(roomId, sender);
      if (!result) return;

      if (result.skipped) {
        io.to(roomId).emit('queue:update', {
          queue: result.room.queue,
          nowPlaying: result.room.nowPlaying,
          version: result.room.queueVersion,
        });
        io.to(roomId).emit('player:state', result.room.playerState);
        io.to(roomId).emit('queue:votes', {
          votes: 0,
          needed: Math.floor((result.room.members?.length || 1) / 2) + 1,
        });
      } else {
        io.to(roomId).emit('queue:votes', {
          votes: result.votes,
          needed: result.needed,
        });
      }
    });

    socket.on('queue:ended', async (payload) => {
      if (!isGeneralAllowed()) return;
      const itemId = payload?.itemId;
      if (!itemId) return;

      const result = await roomStore.endedQueueItem(roomId, itemId);
      if (result?.advanced) {
        io.to(roomId).emit('queue:update', {
          queue: result.room.queue,
          nowPlaying: result.room.nowPlaying,
          version: result.room.queueVersion,
        });
        io.to(roomId).emit('player:state', result.room.playerState);
        io.to(roomId).emit('queue:votes', {
          votes: 0,
          needed: Math.floor((result.room.members?.length || 1) / 2) + 1,
        });
      }
    });

    // Disconnect
    socket.on('disconnect', async () => {
      const result = await roomStore.removeMember(roomId, socket.id);
      if (result?.room) {
        io.to(roomId).emit('room:members', {
          members: result.room.members,
          version: result.room.memberVersion,
        });

        if (result.leftMember) {
          const leaveMsg = {
            id: crypto.randomUUID(),
            type: 'system',
            text: `${result.leftMember.name} left`,
            ts: Date.now(),
          };
          await roomStore.addChatMessage(roomId, leaveMsg);
          io.to(roomId).emit('chat:message', leaveMsg);
        }
      }
    });
  });
}
