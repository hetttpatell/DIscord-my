import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { io as ClientIO } from 'socket.io-client';
import { roomStore } from '../server/services/roomStore.js';
import { signSessionToken } from '../server/services/security.js';
import { httpServer } from '../server/index.js';

describe('Floating Reaction Socket Events', () => {
  let port;
  let clientSocket;

  beforeEach(async () => {
    roomStore.memoryRooms.clear();
    await new Promise((resolve) => {
      httpServer.listen(0, () => {
        port = httpServer.address().port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    await new Promise((resolve) => {
      httpServer.close(resolve);
    });
  });

  it('broadcasts reaction:new when a participant emits reaction:send', async () => {
    const roomId = 'reaction-room-1';
    await roomStore.createRoom({
      roomId,
      passwordHash: 'hash123',
      creatorMemberId: 'm_charlie',
      creatorDisplayName: 'Charlie',
    });

    const token = signSessionToken({
      roomId,
      memberId: 'm_charlie',
      displayName: 'Charlie',
    });

    await new Promise((resolve) => {
      clientSocket = ClientIO(`http://127.0.0.1:${port}`, {
        auth: { token },
        forceNew: true,
        transports: ['websocket'],
        extraHeaders: {
          'x-forwarded-for': '192.168.10.99',
        },
      });
      clientSocket.on('connect', resolve);
    });

    const reactionPromise = new Promise((resolve) => {
      clientSocket.on('reaction:new', (data) => {
        resolve(data);
      });
    });

    clientSocket.emit('reaction:send', { emoji: '🔥' });

    const received = await reactionPromise;
    expect(received).toBeDefined();
    expect(received.emoji).toBe('🔥');
    expect(received.senderId).toBe('m_charlie');
    expect(received.senderName).toBe('Charlie');
    expect(received.id).toBeDefined();
    expect(received.timestamp).toBeTypeOf('number');
  });

  it('rejects invalid reaction emojis (e.g. empty or too long)', async () => {
    const roomId = 'reaction-room-2';
    await roomStore.createRoom({
      roomId,
      passwordHash: 'hash123',
      creatorMemberId: 'm_dana',
      creatorDisplayName: 'Dana',
    });

    const token = signSessionToken({
      roomId,
      memberId: 'm_dana',
      displayName: 'Dana',
    });

    await new Promise((resolve) => {
      clientSocket = ClientIO(`http://127.0.0.1:${port}`, {
        auth: { token },
        forceNew: true,
        transports: ['websocket'],
        extraHeaders: {
          'x-forwarded-for': '192.168.10.100',
        },
      });
      clientSocket.on('connect', resolve);
    });

    let receivedCount = 0;
    clientSocket.on('reaction:new', () => {
      receivedCount++;
    });

    clientSocket.emit('reaction:send', { emoji: '' });
    clientSocket.emit('reaction:send', { emoji: 'this-emoji-string-is-way-too-long-to-be-valid' });

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(receivedCount).toBe(0);
  });
});

