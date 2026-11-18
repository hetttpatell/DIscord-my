import crypto from 'node:crypto';
import Redis from 'ioredis';
import { config } from '../config.js';

export const MAX_ROOM_MEMBERS = 20;
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
    let room = null;
    if (this.redis) {
      try {
        const raw = await this.redis.get(`room:${id}`);
        if (raw) room = JSON.parse(raw);
      } catch (err) {
        console.warn('[RoomStore] Redis get error:', err.message);
      }
    }
    if (!room) {
      room = this.memoryRooms.get(id) || null;
    }
    if (room) {
      if (!Array.isArray(room.queue)) room.queue = [];
      if (room.nowPlaying === undefined) room.nowPlaying = null;
      if (!room.queueVersion) room.queueVersion = 1;
      if (!room.mediaState) {
        room.mediaState = {
          type: 'youtube',
          sharerId: null,
          sharerName: null,
          fileName: null,
          durationSec: 0,
          positionSec: 0,
          status: 'paused',
        };
      }
    }
    return room;
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
      members: {},
      playerState: {
        videoId: '',
        status: 'paused',
        positionSec: 0,
        serverUpdatedAtMs: Date.now(),
      },
      mediaState: {
        type: 'youtube',
        sharerId: null,
        sharerName: null,
        fileName: null,
        durationSec: 0,
        positionSec: 0,
        status: 'paused',
      },
      queue: [],
      nowPlaying: null,
      queueVersion: 1,
    };

    if (creatorMemberId && creatorDisplayName) {
      room.members[creatorMemberId] = {
        memberId: creatorMemberId,
        displayName: creatorDisplayName,
        joinedAt: Date.now(),
        isOnline: false,
      };
    }

    await this.saveRoom(room);
    return room;
  }

  async addMember(roomId, { memberId, displayName, socketId }) {
    const room = await this.getRoom(roomId);
    if (!room) return null;

    const currentMembers = Object.values(room.members || {});
    const existingMember = room.members[memberId];

    if (!existingMember && currentMembers.length >= MAX_ROOM_MEMBERS) {
      const err = new Error('Room is full (max 20 members)');
      err.status = 403;
      throw err;
    }

    room.members[memberId] = {
      memberId,
      displayName,
      socketId,
      joinedAt: existingMember?.joinedAt || Date.now(),
      isOnline: true,
      lastSeenAt: Date.now(),
    };

    await this.saveRoom(room);
    return room;
  }

  async removeMemberBySocket(socketId) {
    for (const [, room] of this.memoryRooms.entries()) {
      let changed = false;
      let leftMember = null;
      for (const member of Object.values(room.members || {})) {
        if (member.socketId === socketId) {
          member.isOnline = false;
          member.socketId = null;
          member.lastSeenAt = Date.now();
          leftMember = member;
          changed = true;
          break;
        }
      }

      if (changed) {
        let sharerLeft = false;
        if (room.mediaState?.type === 'local' && room.mediaState?.sharerId === leftMember?.memberId) {
          room.mediaState = {
            type: 'youtube',
            sharerId: null,
            sharerName: null,
            fileName: null,
            durationSec: 0,
            positionSec: 0,
            status: 'paused',
          };
          sharerLeft = true;
        }
        await this.saveRoom(room);
        return { room, leftMember, sharerLeft };
      }
    }
    return null;
  }

  async updateMediaState(roomId, newState) {
    const room = await this.getRoom(roomId);
    if (!room) return null;

    room.mediaState = {
      ...(room.mediaState || {}),
      ...newState,
    };

    await this.saveRoom(room);
    return room.mediaState;
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

  // Queue to play management
  async addToQueue(roomId, video, member) {
    const room = await this.getRoom(roomId);
    if (!room) return null;
    if (!Array.isArray(room.queue)) room.queue = [];

    if (room.queue.length >= 50) {
      throw new Error('Queue is full (max 50 tracks)');
    }

    const isDuplicate =
      room.queue.some((it) => it.videoId === video.videoId) ||
      (room.nowPlaying && room.nowPlaying.videoId === video.videoId);

    if (isDuplicate) {
      throw new Error('Video already in queue or currently playing');
    }

    const item = {
      id: crypto.randomUUID(),
      videoId: video.videoId,
      title: video.title || 'Untitled',
      channel: video.channel || 'Unknown',
      thumbnail:
        video.thumbnailUrl ||
        video.thumbnail ||
        `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
      durationSeconds: Number(video.durationSec || video.durationSeconds || 0) || 0,
      addedById: member?.memberId || 'anonymous',
      addedByName: member?.displayName || 'Guest',
      addedAt: Date.now(),
    };

    let startedImmediately = false;
    if (!room.nowPlaying || !room.playerState.videoId) {
      room.nowPlaying = item;
      startedImmediately = true;
      room.playerState = {
        videoId: item.videoId,
        status: 'playing',
        positionSec: 0,
        serverUpdatedAtMs: Date.now(),
      };
    } else {
      room.queue.push(item);
    }

    room.queueVersion = (room.queueVersion || 0) + 1;
    await this.saveRoom(room);
    return { room, item, startedImmediately };
  }

  async removeFromQueue(roomId, itemId) {
    const room = await this.getRoom(roomId);
    if (!room || !Array.isArray(room.queue)) return null;

    const index = room.queue.findIndex((it) => it.id === itemId);
    if (index === -1) return null;

    room.queue.splice(index, 1);
    room.queueVersion = (room.queueVersion || 0) + 1;
    await this.saveRoom(room);
    return room;
  }

  async skipQueue(roomId) {
    const room = await this.getRoom(roomId);
    if (!room) return null;
    if (!Array.isArray(room.queue)) room.queue = [];

    const nextItem = room.queue.shift() || null;
    room.nowPlaying = nextItem;
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
    return room;
  }

  async endedQueue(roomId, itemId) {
    const room = await this.getRoom(roomId);
    if (!room || !room.nowPlaying) return null;

    // De-duplication check: ignore if itemId does not match current nowPlaying.id
    if (room.nowPlaying.id !== itemId) {
      return null;
    }

    const nextItem = Array.isArray(room.queue) ? room.queue.shift() || null : null;
    room.nowPlaying = nextItem;
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
    return room;
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
      const activeMembers = Object.values(room.members || {}).filter((m) => m.isOnline);
      if (activeMembers.length === 0 && now - (room.lastActiveAt || room.createdAt) > ROOM_EXPIRY_MS) {
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
