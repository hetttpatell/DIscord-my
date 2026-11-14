import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../server/index.js';
import { roomStore, ROOM_EXPIRY_MS } from '../server/services/roomStore.js';
import {
  hashPassword,
  verifyPassword,
  signSessionToken,
  verifySessionToken,
} from '../server/services/security.js';

describe('Phase 2: Rooms and Security Endpoints & Services', () => {
  beforeEach(async () => {
    // Clear in-memory rooms before each test run
    roomStore.memoryRooms.clear();
  });

  describe('Password Hashing and Cryptography', () => {
    it('never stores plaintext passwords and validates via timingSafeEqual', () => {
      const plain = 'mySecretPass123';
      const hash = hashPassword(plain);

      expect(hash).not.toBe(plain);
      expect(hash.split(':').length).toBe(2);
      expect(verifyPassword(plain, hash)).toBe(true);
      expect(verifyPassword('incorrect', hash)).toBe(false);
    });
  });

  describe('Session Token Lifecycle', () => {
    it('creates 12h valid HMAC token and fails on room mismatch or tampering', () => {
      const token = signSessionToken({
        roomId: 'test-room-1',
        memberId: 'm_abc',
        displayName: 'Tester',
      });

      const valid = verifySessionToken(token, 'test-room-1');
      expect(valid).toBeTruthy();
      expect(valid.roomId).toBe('test-room-1');
      expect(valid.memberId).toBe('m_abc');

      // Room mismatch
      expect(verifySessionToken(token, 'different-room')).toBeNull();

      // Tampered token
      const tampered = token.slice(0, -4) + 'abcd';
      expect(verifySessionToken(tampered, 'test-room-1')).toBeNull();
    });
  });

  describe('POST /api/rooms (Room Creation)', () => {
    it('creates a new room with valid params and returns signed token and memberId', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({
          roomId: 'rock-room',
          password: 'pass1234Secure',
          displayName: 'HostAlice',
        });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeTruthy();
      expect(res.body.roomId).toBe('rock-room');
      expect(res.body.memberId).toMatch(/^m_/);
      expect(res.body.displayName).toBe('HostAlice');

      // Verify room stored in roomStore
      const room = await roomStore.getRoom('rock-room');
      expect(room).toBeTruthy();
      expect(room.passwordHash).not.toBe('pass1234Secure');
      expect(verifyPassword('pass1234Secure', room.passwordHash)).toBe(true);
    });

    it('rejects invalid room ID (too short or invalid chars)', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({
          roomId: 'ab', // < 3 chars
          password: 'pass1234Secure',
          displayName: 'HostAlice',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Room ID must be 3-32 characters');
    });

    it('rejects duplicate room creation with 409', async () => {
      await request(app)
        .post('/api/rooms')
        .send({
          roomId: 'dup-room',
          password: 'pass1234Secure',
          displayName: 'User1',
        });

      const res = await request(app)
        .post('/api/rooms')
        .send({
          roomId: 'dup-room',
          password: 'pass1234Secure',
          displayName: 'User2',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already taken');
    });
  });

  describe('POST /api/rooms/join (Room Joining)', () => {
    beforeEach(async () => {
      // Pre-create a room
      await request(app)
        .post('/api/rooms')
        .send({
          roomId: 'lounge-42',
          password: 'correctPassword',
          displayName: 'Host',
        });
    });

    it('joins successfully with correct password and returns signed token', async () => {
      const res = await request(app)
        .post('/api/rooms/join')
        .send({
          roomId: 'lounge-42',
          password: 'correctPassword',
          displayName: 'GuestBob',
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.roomId).toBe('lounge-42');
      expect(res.body.memberId).toBeTruthy();
      expect(res.body.displayName).toBe('GuestBob');
    });

    it('returns generic error on incorrect password (no room enumeration)', async () => {
      const res = await request(app)
        .post('/api/rooms/join')
        .send({
          roomId: 'lounge-42',
          password: 'wrongPassword',
          displayName: 'GuestBob',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid room ID or password');
    });

    it('returns identical generic error for non-existent room (no room enumeration)', async () => {
      const res = await request(app)
        .post('/api/rooms/join')
        .send({
          roomId: 'non-existent-room',
          password: 'anyPassword',
          displayName: 'GuestBob',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid room ID or password');
    });
  });

  describe('Room Store Member Limits & Expiration', () => {
    it('enforces maximum 20 members limit per room', async () => {
      const roomId = 'full-room';
      await roomStore.createRoom({
        roomId,
        passwordHash: hashPassword('pass1234'),
        creatorDisplayName: 'Creator',
        creatorMemberId: 'm_creator',
      });

      // m_creator is member 1. Add 19 more members so room has 20 total members
      for (let i = 1; i <= 19; i++) {
        await roomStore.addMember(roomId, {
          memberId: `m_${i}`,
          displayName: `User ${i}`,
          socketId: `socket_${i}`,
        });
      }

      // 21st member join attempt should fail
      await expect(
        roomStore.addMember(roomId, {
          memberId: 'm_overflow',
          displayName: 'Overflow User',
          socketId: 'socket_overflow',
        })
      ).rejects.toThrow(/Room is full/);
    });

    it('cleans up rooms expired 24h after all members leave', async () => {
      const roomId = 'abandoned-room';
      const room = await roomStore.createRoom({
        roomId,
        passwordHash: hashPassword('pass1234'),
      });

      // Simulate room active 25 hours ago with no online members
      room.lastActiveAt = Date.now() - (ROOM_EXPIRY_MS + 3600000);
      roomStore.cleanupExpiredRooms();

      const checked = await roomStore.getRoom(roomId);
      expect(checked).toBeNull();
    });
  });
});

  describe('Rate Limiting (10 requests per minute per IP)', () => {
    it('blocks the 11th request within 1 minute with 429 Too Many Requests', async () => {
      // Send 10 requests from the same IP
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/rooms/join')
          .set('X-Forwarded-For', '192.168.10.100')
          .send({
            roomId: 'rate-limit-room',
            password: 'wrongPassword',
            displayName: 'Spammer',
          });
      }

      // 11th request from same IP should receive 429
      const res11 = await request(app)
        .post('/api/rooms/join')
        .set('X-Forwarded-For', '192.168.10.100')
        .send({
          roomId: 'rate-limit-room',
          password: 'wrongPassword',
          displayName: 'Spammer',
        });

      expect(res11.status).toBe(429);
      expect(res11.body.error).toContain('Too many room requests');
    });
  });
