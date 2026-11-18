import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { io as ClientIO } from 'socket.io-client';
import { roomStore } from '../server/services/roomStore.js';
import { signSessionToken } from '../server/services/security.js';
import { httpServer } from '../server/index.js';

describe('Shared Local Media Watchparty Socket Events', () => {
  let port;
  let clientSocket;
  let clientSocket2;

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
    if (clientSocket2 && clientSocket2.connected) {
      clientSocket2.disconnect();
    }
    await new Promise((resolve) => {
      httpServer.close(resolve);
    });
  });

  it('receives initial media:state on connection and handles media:start, media:control, and media:stop', async () => {
    const roomId = 'media-room-1';
    await roomStore.createRoom({
      roomId,
      passwordHash: 'hash123',
      creatorMemberId: 'm_sharer',
      creatorDisplayName: 'SharerSam',
    });

    const token = signSessionToken({
      roomId,
      memberId: 'm_sharer',
      displayName: 'SharerSam',
    });

    const token2 = signSessionToken({
      roomId,
      memberId: 'm_viewer',
      displayName: 'ViewerVal',
    });

    // Connect Sharer
    await new Promise((resolve) => {
      clientSocket = ClientIO(`http://127.0.0.1:${port}`, {
        auth: { token },
        forceNew: true,
        transports: ['websocket'],
        extraHeaders: { 'x-forwarded-for': '192.168.10.50' },
      });
      clientSocket.on('connect', resolve);
    });

    // Connect Viewer
    await new Promise((resolve) => {
      clientSocket2 = ClientIO(`http://127.0.0.1:${port}`, {
        auth: { token: token2 },
        forceNew: true,
        transports: ['websocket'],
        extraHeaders: { 'x-forwarded-for': '192.168.10.51' },
      });
      clientSocket2.on('connect', resolve);
    });

    // 1. Sharer starts local video stream
    const mediaStartPromise = new Promise((resolve) => {
      clientSocket2.on('media:state', (state) => {
        if (state.type === 'local') resolve(state);
      });
    });

    clientSocket.emit('media:start', {
      fileName: 'test_movie.mp4',
      durationSec: 120,
    });

    const startedState = await mediaStartPromise;
    expect(startedState.type).toBe('local');
    expect(startedState.fileName).toBe('test_movie.mp4');
    expect(startedState.sharerId).toBe('m_sharer');
    expect(startedState.sharerName).toBe('SharerSam');
    expect(startedState.durationSec).toBe(120);
    expect(startedState.status).toBe('playing');

    // 2. Viewer sends media:control (pause)
    const mediaControlPromise = new Promise((resolve) => {
      clientSocket.on('media:control', (ctrl) => {
        resolve(ctrl);
      });
    });

    clientSocket2.emit('media:control', {
      action: 'pause',
      positionSec: 45,
    });

    const ctrlReceived = await mediaControlPromise;
    expect(ctrlReceived.action).toBe('pause');
    expect(ctrlReceived.positionSec).toBe(45);
    expect(ctrlReceived.byMemberId).toBe('m_viewer');

    // 3. Sharer stops media sharing
    const mediaStopPromise = new Promise((resolve) => {
      clientSocket2.on('media:state', (state) => {
        if (state.type === 'youtube') resolve(state);
      });
    });

    clientSocket.emit('media:stop');

    const stoppedState = await mediaStopPromise;
    expect(stoppedState.type).toBe('youtube');
    expect(stoppedState.sharerId).toBeNull();
  });

  it('automatically resets media:state to youtube when the active sharer disconnects', async () => {
    const roomId = 'media-room-2';
    await roomStore.createRoom({
      roomId,
      passwordHash: 'hash123',
      creatorMemberId: 'm_sharer2',
      creatorDisplayName: 'Sharer2',
    });

    const token = signSessionToken({
      roomId,
      memberId: 'm_sharer2',
      displayName: 'Sharer2',
    });

    const token2 = signSessionToken({
      roomId,
      memberId: 'm_viewer2',
      displayName: 'Viewer2',
    });

    await new Promise((resolve) => {
      clientSocket = ClientIO(`http://127.0.0.1:${port}`, {
        auth: { token },
        forceNew: true,
        transports: ['websocket'],
        extraHeaders: { 'x-forwarded-for': '192.168.10.60' },
      });
      clientSocket.on('connect', resolve);
    });

    await new Promise((resolve) => {
      clientSocket2 = ClientIO(`http://127.0.0.1:${port}`, {
        auth: { token: token2 },
        forceNew: true,
        transports: ['websocket'],
        extraHeaders: { 'x-forwarded-for': '192.168.10.61' },
      });
      clientSocket2.on('connect', resolve);
    });

    // Sharer starts local video
    await new Promise((resolve) => {
      clientSocket.emit('media:start', { fileName: 'clip.mp4' });
      clientSocket2.on('media:state', (state) => {
        if (state.type === 'local') resolve();
      });
    });

    // Now Sharer disconnects
    const resetPromise = new Promise((resolve) => {
      clientSocket2.on('media:state', (state) => {
        if (state.type === 'youtube') resolve(state);
      });
    });

    clientSocket.disconnect();

    const resetState = await resetPromise;
    expect(resetState.type).toBe('youtube');
    expect(resetState.sharerId).toBeNull();
  });
});
