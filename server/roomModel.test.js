import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOM_ID_ALPHABET,
  generateRoomId,
  generateResumeToken,
  verifyResumeToken,
  RoomRateLimiter,
  sanitizePublicRoom,
  MAX_ROOM_MEMBERS,
  MIN_PASSWORD_LENGTH
} from './roomModel.js';
import { hashPassword, verifyPassword } from './roomStore.js';

test('Room Model & Access Unit Tests', async (t) => {
  await t.test('generateRoomId produces 6-character strings from unambiguous alphabet', () => {
    assert.equal(ROOM_ID_ALPHABET.length, 32);
    // No ambiguous chars: 0, 1, I, O
    assert.equal(ROOM_ID_ALPHABET.includes('0'), false);
    assert.equal(ROOM_ID_ALPHABET.includes('1'), false);
    assert.equal(ROOM_ID_ALPHABET.includes('I'), false);
    assert.equal(ROOM_ID_ALPHABET.includes('O'), false);

    for (let i = 0; i < 50; i++) {
      const id = generateRoomId(6);
      assert.equal(id.length, 6);
      for (const char of id) {
        assert.ok(ROOM_ID_ALPHABET.includes(char), `Character ${char} must be in alphabet`);
      }
    }
  });

  await t.test('Password hashing and constant-time verification with scrypt', () => {
    assert.equal(MIN_PASSWORD_LENGTH, 4);

    const pass = 'secretPass123';
    const hash = hashPassword(pass);
    assert.ok(hash.includes(':'), 'Hash must contain salt:key');

    assert.equal(verifyPassword(pass, hash), true);
    assert.equal(verifyPassword('wrongPassword', hash), false);
    assert.equal(verifyPassword('', hash), false);
    assert.equal(verifyPassword(null, hash), false);
  });

  await t.test('Resume token generation and constant-time verification', () => {
    const { token, hash } = generateResumeToken();
    assert.ok(token && token.length >= 32);
    assert.ok(hash && hash.length === 64); // SHA-256 hex string

    assert.equal(verifyResumeToken(token, hash), true);
    assert.equal(verifyResumeToken('tamperedToken', hash), false);
    assert.equal(verifyResumeToken('', hash), false);
    assert.equal(verifyResumeToken(null, hash), false);
  });

  await t.test('RoomRateLimiter enforces 5 failed attempts per 10 minutes', () => {
    const limiter = new RoomRateLimiter(600000, 5);
    const roomId = 'ABC234';
    const clientId = 'client-tab-1';
    const now = 1000000;

    // First 4 failures are allowed without being limited
    for (let i = 1; i <= 4; i++) {
      limiter.recordFailure(roomId, clientId, now + i * 1000);
      const status = limiter.isRateLimited(roomId, clientId, now + i * 1000);
      assert.equal(status.limited, false);
    }

    // 5th failure trips the rate limit
    limiter.recordFailure(roomId, clientId, now + 5000);
    const status = limiter.isRateLimited(roomId, clientId, now + 5000);
    assert.equal(status.limited, true);
    assert.ok(status.waitMinutes >= 1 && status.waitMinutes <= 10);

    // Another client for same room is NOT blocked
    assert.equal(limiter.isRateLimited(roomId, 'client-tab-2', now + 5000).limited, false);

    // After 10 minutes pass, the limit expires
    const after10Min = now + 600000 + 10000;
    assert.equal(limiter.isRateLimited(roomId, clientId, after10Min).limited, false);

    // Successful login clears the history immediately
    limiter.recordFailure(roomId, clientId, now + 600000 + 12000);
    limiter.recordSuccess(roomId, clientId);
    assert.equal(limiter.isRateLimited(roomId, clientId, now + 600000 + 13000).limited, false);
  });

  await t.test('sanitizePublicRoom never leaks passwords, passwordHash, or resumeTokens', () => {
    const rawRoom = {
      id: 'XYZ789',
      name: 'Secret Lounge',
      password: 'plainPassword123',
      passwordHash: 'salt:1234567890abcdef',
      resumeTokens: { 'client-1': 'hash1', 'client-2': 'hash2' },
      hostId: 'client-1',
      currentTrack: { id: 'track-1', title: 'Song' },
      isPlaying: true,
      playbackPosition: 42,
      queue: [],
      members: [
        { id: 'sock-1', clientId: 'client-1', name: 'Alice', isHost: true, isOnline: true, avatarColor: '#fff', joinedAt: 123 },
        { id: 'sock-2', clientId: 'client-2', name: 'Bob', isHost: false, isOnline: true, avatarColor: '#000', joinedAt: 124 }
      ]
    };

    const sanitized = sanitizePublicRoom(rawRoom, 42);

    assert.equal(sanitized.id, 'XYZ789');
    assert.equal(sanitized.name, 'Secret Lounge');
    assert.equal(sanitized.hasPassword, true);
    assert.equal(sanitized.hostId, 'client-1');
    assert.equal(sanitized.members.length, 2);

    // Sensitive properties must be undefined
    assert.equal('password' in sanitized, false);
    assert.equal('passwordHash' in sanitized, false);
    assert.equal('resumeTokens' in sanitized, false);
  });

  await t.test('MAX_ROOM_MEMBERS is 12', () => {
    assert.equal(MAX_ROOM_MEMBERS, 12);
  });
});

