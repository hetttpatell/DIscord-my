import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  hashPassword,
  verifyPassword,
  signSessionToken,
  verifySessionToken,
} from '../server/services/security.js';
import { roomAuthSchema } from '../server/routes/roomRoutes.js';

describe('Security & Authentication Services', () => {
  describe('Password Hashing & Constant-time Verification', () => {
    it('generates random salt and scrypt hash for passwords', () => {
      const pass = 'superSecretPassword123';
      const hash1 = hashPassword(pass);
      const hash2 = hashPassword(pass);

      expect(hash1).toContain(':');
      expect(hash2).toContain(':');
      // Different salts produce different hashes
      expect(hash1).not.toBe(hash2);
    });

    it('successfully verifies correct password', () => {
      const pass = 'correctHorseBatteryStaple';
      const hash = hashPassword(pass);
      expect(verifyPassword(pass, hash)).toBe(true);
    });

    it('rejects incorrect password', () => {
      const pass = 'correctPassword';
      const hash = hashPassword(pass);
      expect(verifyPassword('wrongPassword', hash)).toBe(false);
      expect(verifyPassword('', hash)).toBe(false);
      expect(verifyPassword(null, hash)).toBe(false);
    });

    it('safely handles malformed stored hash strings', () => {
      expect(verifyPassword('test', 'malformed')).toBe(false);
      expect(verifyPassword('test', 'salt-with-no-key:')).toBe(false);
      expect(verifyPassword('test', null)).toBe(false);
    });
  });

  describe('Session Token Signing and Expiry', () => {
    it('signs and verifies a valid session token', () => {
      const payload = {
        roomId: 'lounge-42',
        memberId: 'm_12345678',
        displayName: 'Alice',
      };

      const token = signSessionToken(payload);
      expect(typeof token).toBe('string');
      expect(token).toContain('.');

      const verified = verifySessionToken(token, 'lounge-42');
      expect(verified).not.toBeNull();
      expect(verified.roomId).toBe('lounge-42');
      expect(verified.memberId).toBe('m_12345678');
      expect(verified.displayName).toBe('Alice');
      expect(verified.expiresAt).toBeGreaterThan(Date.now());
    });

    it('rejects token when expected roomId does not match', () => {
      const token = signSessionToken({
        roomId: 'room-alpha',
        memberId: 'm_1',
        displayName: 'Bob',
      });

      expect(verifySessionToken(token, 'room-beta')).toBeNull();
    });

    it('rejects tampered tokens', () => {
      const token = signSessionToken({
        roomId: 'room-alpha',
        memberId: 'm_1',
        displayName: 'Bob',
      });

      const [, sig] = token.split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({
          roomId: 'room-alpha',
          memberId: 'm_hacked',
          displayName: 'Hacker',
          expiresAt: Date.now() + 10000,
        })
      ).toString('base64url');

      const tamperedToken = `${tamperedPayload}.${sig}`;
      expect(verifySessionToken(tamperedToken)).toBeNull();
    });

    it('rejects expired tokens', () => {
      // Create manually expired token
      const expiredPayload = {
        roomId: 'room-alpha',
        memberId: 'm_1',
        displayName: 'Bob',
        expiresAt: Date.now() - 1000, // expired 1s ago
      };
      const b64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
      const sig = crypto
        .createHmac('sha256', process.env.SESSION_SECRET || 'dev_secret')
        .update(b64)
        .digest('base64url');

      expect(verifySessionToken(`${b64}.${sig}`)).toBeNull();
    });
  });

  describe('Room Auth Input Validation (Zod)', () => {
    it('accepts valid input according to rules', () => {
      const valid = {
        roomId: 'room_123-abc',
        password: 'pass1234Secure',
        displayName: 'CoolUser',
      };
      const res = roomAuthSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it('rejects roomId with invalid characters or length', () => {
      expect(
        roomAuthSchema.safeParse({
          roomId: 'ab', // < 3 chars
          password: 'validPass123',
          displayName: 'User',
        }).success
      ).toBe(false);

      expect(
        roomAuthSchema.safeParse({
          roomId: 'room with spaces', // spaces not allowed
          password: 'validPass123',
          displayName: 'User',
        }).success
      ).toBe(false);

      expect(
        roomAuthSchema.safeParse({
          roomId: 'room!@#$', // invalid symbols
          password: 'validPass123',
          displayName: 'User',
        }).success
      ).toBe(false);
    });

    it('rejects password shorter than 4 chars or longer than 64', () => {
      expect(
        roomAuthSchema.safeParse({
          roomId: 'room123',
          password: '123', // < 4 chars
          displayName: 'User',
        }).success
      ).toBe(false);

      expect(
        roomAuthSchema.safeParse({
          roomId: 'room123',
          password: 'a'.repeat(65), // > 64 chars
          displayName: 'User',
        }).success
      ).toBe(false);
    });

    it('rejects empty displayName or longer than 24 chars', () => {
      expect(
        roomAuthSchema.safeParse({
          roomId: 'room123',
          password: 'password123',
          displayName: '',
        }).success
      ).toBe(false);

      expect(
        roomAuthSchema.safeParse({
          roomId: 'room123',
          password: 'password123',
          displayName: 'a'.repeat(25),
        }).success
      ).toBe(false);
    });
  });
});
