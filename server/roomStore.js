import Redis from 'ioredis';
import crypto from 'node:crypto';

/**
 * Hash password securely with scrypt from node:crypto
 * Returns "salt:derivedKeyHex"
 */
export function hashPassword(password) {
  if (!password) return null;
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Compare password against stored scrypt hash in constant time
 */
export function verifyPassword(password, storedHash) {
  if (!storedHash) return true; // Room has no password
  if (!password) return false;
  try {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, keyBuffer.length);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch (err) {
    console.warn('[RoomStore] Password verification error:', err);
    return false;
  }
}

/**
 * Room persistence store supporting Redis with in-memory fallback
 */
class RoomStore {
  constructor() {
    this.redis = null;
    this.inMemoryStore = new Map();
    this.saveDebounceTimers = new Map();
    this.debounceMs = 250;
    this.ttlSeconds = 86400; // 24 hours

    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 2,
          retryStrategy(times) {
            if (times > 5) return null;
            return Math.min(times * 500, 2000);
          },
          lazyConnect: false
        });
        this.redis.on('error', (err) => {
          console.warn('[RoomStore] Redis connection warning:', err.message);
        });
        this.redis.on('connect', () => {
          console.log('[RoomStore] Connected to Redis persistence store.');
        });
      } catch (err) {
        console.warn('[RoomStore] Redis initialization error, using in-memory fallback:', err.message);
        this.redis = null;
      }
    } else {
      console.warn('[RoomStore] REDIS_URL environment variable is not set. Falling back to in-memory room store (data will not persist across restarts).');
    }
  }

  isRedisActive() {
    return Boolean(this.redis && this.redis.status === 'ready');
  }

  serializeRoom(room) {
    return {
      id: room.id,
      name: room.name,
      currentTrack: room.currentTrack || null,
      isPlaying: Boolean(room.isPlaying),
      startedAtServerMs: room.lastStateChangeTime || Date.now(),
      pausedOffsetSec: typeof room.playbackPosition === 'number' ? room.playbackPosition : 0,
      queue: Array.isArray(room.queue) ? room.queue : [],
      hostId: room.hostId || null,
      hostSessionId: room.hostSessionId || null,
      passwordHash: room.passwordHash || null,
      resumeTokens: room.resumeTokens || {},
      createdAt: room.createdAt || Date.now()
    };
  }

  deserializeRoom(data) {
    return {
      id: data.id,
      name: data.name || 'afterspot Lounge',
      passwordHash: data.passwordHash || null,
      resumeTokens: data.resumeTokens || {},
      hostId: data.hostId || null,
      hostSocketId: null,
      hostSessionId: data.hostSessionId || null,
      createdAt: data.createdAt || Date.now(),
      currentTrack: data.currentTrack || null,
      isPlaying: Boolean(data.isPlaying),
      playbackPosition: typeof data.pausedOffsetSec === 'number' ? data.pausedOffsetSec : (data.playbackPosition || 0),
      lastStateChangeTime: data.startedAtServerMs || data.lastStateChangeTime || Date.now(),
      queue: Array.isArray(data.queue) ? data.queue : [],
      members: [],
      callParticipants: new Map()
    };
  }

  save(roomId, room) {
    if (!roomId || !room) return;
    const serialized = this.serializeRoom(room);

    // Debounce writes about 250ms after each mutation
    if (this.saveDebounceTimers.has(roomId)) {
      clearTimeout(this.saveDebounceTimers.get(roomId));
    }

    const timer = setTimeout(async () => {
      this.saveDebounceTimers.delete(roomId);
      await this.persist(roomId, serialized);
    }, this.debounceMs);

    this.saveDebounceTimers.set(roomId, timer);
  }

  async persist(roomId, data) {
    const key = `room:${roomId.toUpperCase()}`;
    const jsonStr = JSON.stringify(data);

    this.inMemoryStore.set(roomId.toUpperCase(), data);

    if (this.redis) {
      try {
        await this.redis.set(key, jsonStr, 'EX', this.ttlSeconds);
      } catch (err) {
        console.warn(`[RoomStore] Failed to write room ${roomId} to Redis:`, err.message);
      }
    }
  }

  async delete(roomId) {
    if (!roomId) return;
    const id = roomId.toUpperCase();

    if (this.saveDebounceTimers.has(id)) {
      clearTimeout(this.saveDebounceTimers.get(id));
      this.saveDebounceTimers.delete(id);
    }

    this.inMemoryStore.delete(id);

    if (this.redis) {
      try {
        await this.redis.del(`room:${id}`);
      } catch (err) {
        console.warn(`[RoomStore] Failed to delete room ${id} from Redis:`, err.message);
      }
    }
  }

  async load(roomId) {
    if (!roomId) return null;
    const id = roomId.toUpperCase();

    if (this.redis) {
      try {
        const raw = await this.redis.get(`room:${id}`);
        if (raw) {
          return this.deserializeRoom(JSON.parse(raw));
        }
      } catch (err) {
        console.warn(`[RoomStore] Failed to load room ${id} from Redis:`, err.message);
      }
    }

    const mem = this.inMemoryStore.get(id);
    return mem ? this.deserializeRoom(mem) : null;
  }

  async loadAllRooms() {
    const map = new Map();

    if (this.redis) {
      try {
        const keys = await this.redis.keys('room:*');
        if (keys && keys.length > 0) {
          const values = await this.redis.mget(keys);
          for (let i = 0; i < keys.length; i++) {
            const raw = values[i];
            if (raw) {
              const data = JSON.parse(raw);
              map.set(data.id, this.deserializeRoom(data));
            }
          }
          return map;
        }
      } catch (err) {
        console.warn('[RoomStore] Failed to scan rooms from Redis, falling back to memory:', err.message);
      }
    }

    for (const [id, data] of this.inMemoryStore) {
      map.set(id, this.deserializeRoom(data));
    }
    return map;
  }
}

export const roomStore = new RoomStore();
export default roomStore;

