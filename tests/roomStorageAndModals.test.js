import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveRoomCredentials,
  getSavedRooms,
  getSavedRoom,
  removeSavedRoom,
  getLastActiveRoom,
} from '../src/lib/roomStorage.js';

describe('Persistent Room Storage & Credentials (src/lib/roomStorage.js)', () => {
  let mockStorage = {};

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: vi.fn((key) => mockStorage[key] || null),
      setItem: vi.fn((key, value) => {
        mockStorage[key] = String(value);
      }),
      removeItem: vi.fn((key) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: storageMock,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: globalThis,
      writable: true,
      configurable: true,
    });
  });

  it('saves and retrieves room credentials', () => {
    saveRoomCredentials({
      roomId: 'lounge-42',
      token: 'jwt-token-xyz',
      memberId: 'mem-1',
      displayName: 'Het',
      password: 'secret-pass-42',
    });

    const room = getSavedRoom('lounge-42');
    expect(room).toBeDefined();
    expect(room.roomId).toBe('lounge-42');
    expect(room.displayName).toBe('Het');
    expect(room.password).toBe('secret-pass-42');
    expect(room.token).toBe('jwt-token-xyz');
    expect(room.lastVisitedAt).toBeGreaterThan(0);
  });

  it('updates last active room correctly', () => {
    saveRoomCredentials({
      roomId: 'room-alpha',
      displayName: 'Alice',
      password: 'pass-alpha',
    });
    saveRoomCredentials({
      roomId: 'room-beta',
      displayName: 'Bob',
      password: 'pass-beta',
    });

    const last = getLastActiveRoom();
    expect(last).toBeDefined();
    expect(last.roomId).toBe('room-beta');
  });

  it('removes saved room and cleans last active room if matched', () => {
    saveRoomCredentials({
      roomId: 'room-temp',
      password: 'temp-pass',
    });
    expect(getSavedRoom('room-temp')).not.toBeNull();
    expect(getLastActiveRoom()?.roomId).toBe('room-temp');

    removeSavedRoom('room-temp');
    expect(getSavedRoom('room-temp')).toBeNull();
    expect(getLastActiveRoom()).toBeNull();
  });

  it('returns empty object if no saved rooms exist', () => {
    expect(getSavedRooms()).toEqual({});
    expect(getSavedRoom('non-existent')).toBeNull();
    expect(getLastActiveRoom()).toBeNull();
  });

  it('handles invalid arguments gracefully without throwing', () => {
    expect(() => saveRoomCredentials({})).not.toThrow();
    expect(() => saveRoomCredentials({ roomId: null })).not.toThrow();
    expect(() => getSavedRoom('')).not.toThrow();
    expect(() => removeSavedRoom(null)).not.toThrow();
  });
});
