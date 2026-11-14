import crypto from 'node:crypto';
import { config } from '../config.js';

const KEY_LENGTH = 64;
export const TOKEN_EXPIRY_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Hash password with Node crypto scrypt and a random 16-byte per-room salt.
 * Returns salt:hexDerivedKey
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, KEY_LENGTH);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify password against stored salt:hash using timingSafeEqual
 */
export function verifyPassword(password, storedHash) {
  if (!password || !storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;

  const [salt, key] = parts;
  if (!salt || !key) return false;

  try {
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKeyBuffer = crypto.scryptSync(password, salt, keyBuffer.length);

    if (keyBuffer.length !== derivedKeyBuffer.length) return false;
    return crypto.timingSafeEqual(keyBuffer, derivedKeyBuffer);
  } catch {
    return false;
  }
}

/**
 * Sign session token with HMAC-SHA256 and SESSION_SECRET (12h expiry)
 */
export function signSessionToken({ roomId, memberId, displayName }) {
  const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
  const payload = {
    roomId,
    memberId,
    displayName,
    expiresAt,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', config.SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');

  return `${payloadB64}.${signature}`;
}

/**
 * Verify HMAC session token and check expiration and matching roomId
 */
export function verifySessionToken(token, expectedRoomId = null) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  try {
    const expectedSignature = crypto
      .createHmac('sha256', config.SESSION_SECRET)
      .update(payloadB64)
      .digest('base64url');

    const sigBuffer = Buffer.from(signature);
    const expectedSigBuffer = Buffer.from(expectedSignature);

    if (
      sigBuffer.length !== expectedSigBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)
    ) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload.expiresAt || Date.now() > payload.expiresAt) {
      return null;
    }
    if (expectedRoomId && payload.roomId !== expectedRoomId) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Generate a random member ID
 */
export function generateMemberId() {
  return `m_${crypto.randomBytes(8).toString('hex')}`;
}

