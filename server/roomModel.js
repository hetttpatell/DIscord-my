import crypto from 'node:crypto';

export const ROOM_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_ROOM_MEMBERS = 12;
export const MIN_PASSWORD_LENGTH = 4;
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
export const RATE_LIMIT_MAX_ATTEMPTS = 5;

/**
 * Generate a 6-character room ID from unambiguous alphabet ABCDEFGHJKLMNPQRSTUVWXYZ23456789
 */
export function generateRoomId(length = 6) {
  const bytes = crypto.randomBytes(length);
  let id = '';
  for (let i = 0; i < length; i++) {
    id += ROOM_ID_ALPHABET[bytes[i] % ROOM_ID_ALPHABET.length];
  }
  return id;
}

/**
 * Generate a cryptographically secure random resume token and its SHA-256 hash
 */
export function generateResumeToken() {
  const token = crypto.randomBytes(24).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

/**
 * Verify a resume token against expected SHA-256 hash using constant-time comparison
 */
export function verifyResumeToken(token, expectedHash) {
  if (!token || !expectedHash) return false;
  try {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const hashBuf = Buffer.from(hash, 'hex');
    const expBuf = Buffer.from(expectedHash, 'hex');
    if (hashBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, expBuf);
  } catch {
    return false;
  }
}

/**
 * Rate limiter for failed password attempts per (room, client)
 * Limit: 5 failed attempts per 10 minutes
 */
export class RoomRateLimiter {
  constructor(windowMs = RATE_LIMIT_WINDOW_MS, maxAttempts = RATE_LIMIT_MAX_ATTEMPTS) {
    this.windowMs = windowMs;
    this.maxAttempts = maxAttempts;
    this.attempts = new Map(); // key -> Array<number> (timestamps)
  }

  _getKey(roomId, clientId) {
    const cleanRoom = (roomId || '').trim().toUpperCase();
    const cleanClient = (clientId || '').trim();
    return `${cleanRoom}:${cleanClient}`;
  }

  isRateLimited(roomId, clientId, now = Date.now()) {
    const key = this._getKey(roomId, clientId);
    const history = this.attempts.get(key);
    if (!history || history.length === 0) return { limited: false, waitMinutes: 0 };

    const validHistory = history.filter(ts => now - ts < this.windowMs);
    this.attempts.set(key, validHistory);

    if (validHistory.length >= this.maxAttempts) {
      const oldest = validHistory[0];
      const waitMs = this.windowMs - (now - oldest);
      const waitMinutes = Math.max(1, Math.ceil(waitMs / 60000));
      return { limited: true, waitMinutes };
    }

    return { limited: false, waitMinutes: 0 };
  }

  recordFailure(roomId, clientId, now = Date.now()) {
    const key = this._getKey(roomId, clientId);
    const history = (this.attempts.get(key) || []).filter(ts => now - ts < this.windowMs);
    history.push(now);
    this.attempts.set(key, history);
  }

  recordSuccess(roomId, clientId) {
    const key = this._getKey(roomId, clientId);
    this.attempts.delete(key);
  }

  clear() {
    this.attempts.clear();
  }
}

/**
 * Sanitize room object before sending over the wire or to clients.
 * Passwords and resume tokens are NEVER included.
 */
export function sanitizePublicRoom(room, currentPos = 0) {
  if (!room) return null;
  return {
    id: room.id,
    name: room.name,
    hasPassword: Boolean(room.passwordHash),
    hostId: room.hostId || null,
    currentTrack: room.currentTrack || null,
    isPlaying: Boolean(room.isPlaying),
    playbackPosition: typeof currentPos === 'number' ? currentPos : (room.playbackPosition || 0),
    queue: Array.isArray(room.queue) ? room.queue : [],
    members: (room.members || []).map(m => ({
      id: m.id,
      clientId: m.clientId,
      name: m.name,
      isHost: Boolean(m.isHost),
      isOnline: Boolean(m.isOnline),
      avatarColor: m.avatarColor,
      joinedAt: m.joinedAt
    }))
  };
}

