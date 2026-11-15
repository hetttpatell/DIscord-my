import crypto from 'node:crypto';
import Redis from 'ioredis';
import { config } from '../config.js';

export const MAX_ROOM_MEMBERS = 6;
export const ROOM_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export class RoomStore {
  constructor() {
    this.memoryRooms = new Map();
    this.redis = null;
    this.init();
  }

  init() {
    if (config.REDIS_URL) {
      try {
        this.redis = new Redis(config.REDIS_URL, {
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: true,
        });
        this.redis.connect().catch((err) => {
          console.warn('[RoomStore] Redis connection failed, using in-memory store:', err.message);
          this.redis = null;
        });
      } catch (err) {
        console.warn('[RoomStore] Redis initialization error:', err.message);
        this.redis = null;
      }
    }
  }

  async getRoom(roomId) {
    if (!roomId) return null;
    const id = roomId.trim();
    if (this.redis) {
      try {
        const raw = await this.redis.get(`room:${id}`);
        if (raw) return JSON.parse(raw);
      } catch (err) {
        console.warn('[RoomStore] Redis get error:', err.message);
      }
    }
    return this.memoryRooms.get(id) || null;
  }

  async saveRoom(room) {
    room.lastActiveAt = Date.now();
    this.memoryRooms.set(room.roomId, room);

    if (this.redis) {
      try {
        const key = `room:${room.roomId}`;
        await this.redis.set(key, JSON.stringify(room), 'PX', ROOM_EXPIRY_MS);
      } catch (err) {
        console.warn('[RoomStore] Redis save error:', err.message);
      }
    }
    return room;
  }

  async createRoom({ roomId, passwordHash, creatorDisplayName, creatorMemberId }) {
    const existing = await this.getRoom(roomId);
    if (existing) {
      const err = new Error('Room already exists');
      err.status = 409;
      throw err;
    }

    const room = {
      roomId,
      passwordHash,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      creatorMemberId: creatorMemberId || null,
      creatorDisplayName: creatorDisplayName || '',
      memberVersion: 1,
      members: [], // Array of { id (socket id), peerId, name, isHost, micOn, camOn, joinedAt }
      playerState: {
        videoId: '',
        status: 'paused',
        positionSec: 0,
        serverUpdatedAtMs: Date.now(),
      },
      queue: [],
      nowPlaying: null,
      queueVersion: 1,
      skipVotes: [],
      chatHistory: [],
    };

    await this.saveRoom(room);
    return room;
  }

  async addMember(roomId, { socketId, peerId = '', name = '', memberId = '' }) {
    const room = await this.getRoom(roomId);
    if (!room) return null;

    if (!Array.isArray(room.members)) {
      room.members = [];
    }

    // Check if socket already in room
    const existingIndex = room.members.findIndex(
      (m) => m.id === socketId || (memberId && m.memberId === memberId)
    );

    if (existingIndex === -1 && room.members.length >= MAX_ROOM_MEMBERS) {
      const err = new Error('Room is full');
      err.status = 403;
      throw err;
    }

    const trimmedName = (name || '').trim().slice(0, 20) || 'Guest';

    // Determine host: if room has no host, or if this member is creator
    const hasHost = room.members.some((m) => m.isHost);
    const isCreator = (memberId && memberId === room.creatorMemberId) || (!hasHost && room.members.length === 0);

    let member;
    if (existingIndex !== -1) {
      member = room.members[existingIndex];
      member.id = socketId;
      if (peerId) member.peerId = peerId;
      if (trimmedName) member.name = trimmedName;
      if (isCreator && !hasHost) member.isHost = true;
    } else {
      member = {
        id: socketId,
        memberId: memberId || socketId,
        peerId: peerId || '',
        name: trimmedName,
        isHost: isCreator || !hasHost,
        micOn: false,
        camOn: false,
        joinedAt: Date.now(),
      };
      room.members.push(member);
    }

    // Ensure exactly one host if members exist
    this.ensureHost(room);

    room.memberVersion = (room.memberVersion || 0) + 1;
    await this.saveRoom(room);
    return { room, member };
  }

  ensureHost(room) {
    if (!room.members || room.members.length === 0) return;
    const currentHost = room.members.find((m) => m.isHost);
    if (!currentHost) {
      // Find member with earliest joinedAt
      let earliest = room.members[0];
      for (const m of room.members) {
        if (m.joinedAt < earliest.joinedAt) {
          earliest = m;
        }
      }
      earliest.isHost = true;
    }
  }

  async updateMemberMedia(roomId, socketId, { micOn, camOn }) {
    const room = await this.getRoom(roomId);
    if (!room || !Array.isArray(room.members)) return null;

    const member = room.members.find((m) => m.id === socketId);
    if (!member) return null;

    if (typeof micOn === 'boolean') member.micOn = micOn;
    if (typeof camOn === 'boolean') member.camOn = camOn;

    room.memberVersion = (room.memberVersion || 0) + 1;
    await this.saveRoom(room);
    return room;
  }

  async updateMemberPeer(roomId, socketId, { peerId, name }) {
    const room = await this.getRoom(roomId);
    if (!room || !Array.isArray(room.members)) return null;

    const member = room.members.find((m) => m.id === socketId);
    if (!member) return null;

    if (peerId) member.peerId = peerId;
    if (name) member.name = name.trim().slice(0, 20);

    room.memberVersion = (room.memberVersion || 0) + 1;
    await this.saveRoom(room);
    return room;
  }

  async removeMember(roomId, socketId) {
    const room = await this.getRoom(roomId);
    if (!room || !Array.isArray(room.members)) return null;

    const index = room.members.findIndex((m) => m.id === socketId);
    if (index === -1) return null;

    const [leftMember] = room.members.splice(index, 1);

    // Remove from skip votes
    if (Array.isArray(room.skipVotes)) {
      room.skipVotes = room.skipVotes.filter((id) => id !== socketId && id !== leftMember.memberId);
    }

    // Re-evaluate host if needed
    if (leftMember.isHost && room.members.length > 0) {
      let earliest = room.members[0];
      for (const m of room.members) {
        if (m.joinedAt < earliest.joinedAt) {
          earliest = m;
        }
      }
      earliest.isHost = true;
    }

    room.memberVersion = (room.memberVersion || 0) + 1;
    await this.saveRoom(room);
    return { room, leftMember };
  }

  async removeMemberBySocket(socketId) {
    for (const [, room] of this.memoryRooms.entries()) {
      if (Array.isArray(room.members)) {
        const found = room.members.find((m) => m.id === socketId);
        if (found) {
          return this.removeMember(room.roomId, socketId);
        }
      }
    }
    return null;
  }

  async updatePlayerState(roomId, newState) {
    const room = await this.getRoom(roomId);
    if (!room) return null;

    room.playerState = {
      videoId: newState.videoId !== undefined ? newState.videoId : room.playerState.videoId,
      status: newState.status !== undefined ? newState.status : room.playerState.status,
      positionSec:
        newState.positionSec !== undefined ? Math.max(0, newState.positionSec) : room.playerState.positionSec,
      serverUpdatedAtMs: Date.now(),
    };

    await this.saveRoom(room);
    return room.playerState;
  }

  // Queue Operations
  async addToQueue(roomId, video, member) {
    const room = await this.getRoom(roomId);
    if (!room) return null;
    if (!Array.isArray(room.queue)) room.queue = [];

    if (room.queue.length >= 50) {
      throw new Error('Queue is full (max 50 items)');
    }

    // Reject duplicates of the same videoId
    const isDuplicate =
      room.queue.some((it) => it.videoId === video.videoId) ||
      (room.nowPlaying && room.nowPlaying.videoId === video.videoId);

    if (isDuplicate) {
      throw new Error('Video already in queue or currently playing');
    }

    const item = {
      id: crypto.randomUUID(),
      videoId: video.videoId,
      title: video.title || 'Untitled Video',
      channel: video.channel || 'Unknown Channel',
      thumbnail: video.thumbnailUrl || video.thumbnail || `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
      durationSeconds: video.durationSec || video.durationSeconds || 0,
      addedById: member.id,
      addedByName: member.name,
      addedAt: Date.now(),
    };

    let startedImmediately = false;
    if (!room.nowPlaying) {
      room.nowPlaying = item;
      startedImmediately = true;
      room.playerState = {
        videoId: item.videoId,
        status: 'playing',
        positionSec: 0,
        serverUpdatedAtMs: Date.now(),
      };
      room.skipVotes = [];
    } else {
      room.queue.push(item);
    }

    room.queueVersion = (room.queueVersion || 0) + 1;
    await this.saveRoom(room);

    return {
      room,
      item,
      startedImmediately,
    };
  }

  async removeFromQueue(roomId, itemId, member) {
    const room = await this.getRoom(roomId);
    if (!room || !Array.isArray(room.queue)) return null;

    const index = room.queue.findIndex((it) => it.id === itemId);
    if (index === -1) return null;

    const item = room.queue[index];
    if (!member.isHost && item.addedById !== member.id && item.addedById !== member.memberId) {
      throw new Error('Only the member who added this item or the host can remove it');
    }

    room.queue.splice(index, 1);
    room.queueVersion = (room.queueVersion || 0) + 1;
    await this.saveRoom(room);
    return room;
  }

  async moveQueueItem(roomId, itemId, direction, member) {
    const room = await this.getRoom(roomId);
    if (!room || !Array.isArray(room.queue)) return null;

    if (!member.isHost) {
      throw new Error('Only the host can reorder the queue');
    }

    const index = room.queue.findIndex((it) => it.id === itemId);
    if (index === -1) return null;

    if (direction === 'up' && index > 0) {
      const temp = room.queue[index - 1];
      room.queue[index - 1] = room.queue[index];
      room.queue[index] = temp;
    } else if (direction === 'down' && index < room.queue.length - 1) {
      const temp = room.queue[index + 1];
      room.queue[index + 1] = room.queue[index];
      room.queue[index] = temp;
    } else {
      return room;
    }

    room.queueVersion = (room.queueVersion || 0) + 1;
    await this.saveRoom(room);
    return room;
  }

  async playNowQueueItem(roomId, itemId, member) {
    const room = await this.getRoom(roomId);
    if (!room || !Array.isArray(room.queue)) return null;

    if (!member.isHost) {
      throw new Error('Only the host can use Play Now');
    }

    const index = room.queue.findIndex((it) => it.id === itemId);
    if (index === -1) return null;

    const [item] = room.queue.splice(index, 1);
    room.nowPlaying = item;
    room.skipVotes = [];
    room.queueVersion = (room.queueVersion || 0) + 1;

    room.playerState = {
      videoId: item.videoId,
      status: 'playing',
      positionSec: 0,
      serverUpdatedAtMs: Date.now(),
    };

    await this.saveRoom(room);
    return room;
  }

  async voteSkip(roomId, member) {
    const room = await this.getRoom(roomId);
    if (!room || !room.nowPlaying) return null;

    if (!Array.isArray(room.skipVotes)) room.skipVotes = [];

    const memberCount = Array.isArray(room.members) ? room.members.length : 1;
    const needed = Math.floor(memberCount / 2) + 1;

    if (member.isHost) {
      // Host skips instantly
      const nextItem = room.queue.shift() || null;
      room.nowPlaying = nextItem;
      room.skipVotes = [];
      room.queueVersion = (room.queueVersion || 0) + 1;

      if (nextItem) {
        room.playerState = {
          videoId: nextItem.videoId,
          status: 'playing',
          positionSec: 0,
          serverUpdatedAtMs: Date.now(),
        };
      } else {
        room.playerState = {
          videoId: '',
          status: 'paused',
          positionSec: 0,
          serverUpdatedAtMs: Date.now(),
        };
      }

      await this.saveRoom(room);
      return { skipped: true, room };
    }

    // Register vote if not already voted
    const voterId = member.id || member.memberId;
    if (!room.skipVotes.includes(voterId)) {
      room.skipVotes.push(voterId);
    }

    if (room.skipVotes.length >= needed) {
      const nextItem = room.queue.shift() || null;
      room.nowPlaying = nextItem;
      room.skipVotes = [];
      room.queueVersion = (room.queueVersion || 0) + 1;

      if (nextItem) {
        room.playerState = {
          videoId: nextItem.videoId,
          status: 'playing',
          positionSec: 0,
          serverUpdatedAtMs: Date.now(),
        };
      } else {
        room.playerState = {
          videoId: '',
          status: 'paused',
          positionSec: 0,
          serverUpdatedAtMs: Date.now(),
        };
      }

      await this.saveRoom(room);
      return { skipped: true, room };
    }

    await this.saveRoom(room);
    return {
      skipped: false,
      votes: room.skipVotes.length,
      needed,
      room,
    };
  }

  async endedQueueItem(roomId, itemId) {
    const room = await this.getRoom(roomId);
    if (!room || !room.nowPlaying) return null;

    // De-duplicate: ignore if itemId does not match current nowPlaying
    if (room.nowPlaying.id !== itemId) {
      return null;
    }

    const nextItem = Array.isArray(room.queue) ? room.queue.shift() || null : null;
    room.nowPlaying = nextItem;
    room.skipVotes = [];
    room.queueVersion = (room.queueVersion || 0) + 1;

    if (nextItem) {
      room.playerState = {
        videoId: nextItem.videoId,
        status: 'playing',
        positionSec: 0,
        serverUpdatedAtMs: Date.now(),
      };
    } else {
      room.playerState = {
        videoId: '',
        status: 'paused',
        positionSec: 0,
        serverUpdatedAtMs: Date.now(),
      };
    }

    await this.saveRoom(room);
    return { advanced: true, room };
  }

  async addChatMessage(roomId, message) {
    const room = await this.getRoom(roomId);
    if (!room) return null;

    if (!Array.isArray(room.chatHistory)) room.chatHistory = [];
    room.chatHistory.push(message);

    if (room.chatHistory.length > 100) {
      room.chatHistory = room.chatHistory.slice(-100);
    }

    await this.saveRoom(room);
    return message;
  }

  async deleteRoom(roomId) {
    this.memoryRooms.delete(roomId);
    if (this.redis) {
      try {
        await this.redis.del(`room:${roomId}`);
      } catch (err) {
        console.warn('[RoomStore] Redis del error:', err.message);
      }
    }
  }

  cleanupExpiredRooms() {
    const now = Date.now();
    for (const [roomId, room] of this.memoryRooms.entries()) {
      const activeMembers = Array.isArray(room.members) ? room.members.length : 0;
      if (activeMembers === 0 && now - (room.lastActiveAt || room.createdAt) > ROOM_EXPIRY_MS) {
        this.deleteRoom(roomId);
      }
    }
  }

  async close() {
    if (this.redis) {
      await this.redis.quit().catch(() => {});
      this.redis = null;
    }
  }
}

export const roomStore = new RoomStore();
export default roomStore;
