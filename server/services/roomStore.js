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
      members: {},
      playerState: {
        videoId: '',
        status: 'paused',
        positionSec: 0,
        serverUpdatedAtMs: Date.now(),
      },
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
        await this.saveRoom(room);
        return { room, leftMember };
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
