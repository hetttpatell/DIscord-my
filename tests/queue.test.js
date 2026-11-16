import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { io as ClientIO } from 'socket.io-client';
import { roomStore } from '../server/services/roomStore.js';
import { signSessionToken } from '../server/services/security.js';
import { httpServer } from '../server/index.js';

describe('Playback Queue Services & Socket Events', () => {
  beforeEach(async () => {
    roomStore.memoryRooms.clear();
  });

  describe('RoomStore Queue Methods', () => {
    it('starts track immediately if room has nothing playing', async () => {
      const room = await roomStore.createRoom({
        roomId: 'queue-room-1',
        passwordHash: 'hash123',
        creatorMemberId: 'm1',
        creatorDisplayName: 'User1',
      });
      expect(room.queue).toEqual([]);
      expect(room.nowPlaying).toBeNull();

      const video = {
        videoId: 'vid1',
        title: 'Song One',
        channel: 'Artist One',
        thumbnailUrl: 'https://img.youtube.com/vi/vid1/0.jpg',
        durationSec: 180,
      };

      const result = await roomStore.addToQueue('queue-room-1', video, {
        memberId: 'm1',
        displayName: 'User1',
      });

      expect(result.startedImmediately).toBe(true);
      expect(result.item.videoId).toBe('vid1');
      expect(result.room.nowPlaying.videoId).toBe('vid1');
      expect(result.room.playerState.videoId).toBe('vid1');
      expect(result.room.playerState.status).toBe('playing');
      expect(result.room.queue).toEqual([]);
    });

    it('appends to queue if a track is already playing', async () => {
      await roomStore.createRoom({
        roomId: 'queue-room-2',
        passwordHash: 'hash123',
        creatorMemberId: 'm1',
        creatorDisplayName: 'User1',
      });

      await roomStore.addToQueue(
        'queue-room-2',
        { videoId: 'vid1', title: 'Song 1' },
        { memberId: 'm1', displayName: 'User1' }
      );

      const res2 = await roomStore.addToQueue(
        'queue-room-2',
        { videoId: 'vid2', title: 'Song 2' },
        { memberId: 'm2', displayName: 'User2' }
      );

      expect(res2.startedImmediately).toBe(false);
      expect(res2.room.nowPlaying.videoId).toBe('vid1');
      expect(res2.room.queue.length).toBe(1);
      expect(res2.room.queue[0].videoId).toBe('vid2');
    });

    it('rejects duplicates if videoId is already playing or in queue', async () => {
      await roomStore.createRoom({
        roomId: 'queue-room-3',
        passwordHash: 'hash123',
        creatorMemberId: 'm1',
        creatorDisplayName: 'User1',
      });

      await roomStore.addToQueue(
        'queue-room-3',
        { videoId: 'vid1', title: 'Song 1' },
        { memberId: 'm1', displayName: 'User1' }
      );

      await expect(
        roomStore.addToQueue(
          'queue-room-3',
          { videoId: 'vid1', title: 'Duplicate Song 1' },
          { memberId: 'm2', displayName: 'User2' }
        )
      ).rejects.toThrow('already in queue or currently playing');

      await roomStore.addToQueue(
        'queue-room-3',
        { videoId: 'vid2', title: 'Song 2' },
        { memberId: 'm2', displayName: 'User2' }
      );

      await expect(
        roomStore.addToQueue(
          'queue-room-3',
          { videoId: 'vid2', title: 'Duplicate Song 2' },
          { memberId: 'm3', displayName: 'User3' }
        )
      ).rejects.toThrow('already in queue or currently playing');
    });

    it('enforces maximum 50 tracks in queue', async () => {
      const room = await roomStore.createRoom({
        roomId: 'queue-room-4',
        passwordHash: 'hash123',
        creatorMemberId: 'm1',
        creatorDisplayName: 'User1',
      });
      room.nowPlaying = { id: 'playing1', videoId: 'v-playing', title: 'Playing' };
      room.playerState.videoId = 'v-playing';
      room.queue = Array.from({ length: 50 }, (_, i) => ({
        id: `item-${i}`,
        videoId: `vid-${i}`,
        title: `Song ${i}`,
      }));
      await roomStore.saveRoom(room);

      await expect(
        roomStore.addToQueue(
          'queue-room-4',
          { videoId: 'v-overflow', title: 'Overflow' },
          { memberId: 'm1', displayName: 'User1' }
        )
      ).rejects.toThrow('Queue is full');
    });

    it('removes an item by id from the queue', async () => {
      await roomStore.createRoom({
        roomId: 'queue-room-5',
        passwordHash: 'hash123',
        creatorMemberId: 'm1',
        creatorDisplayName: 'User1',
      });
      await roomStore.addToQueue(
        'queue-room-5',
        { videoId: 'vid1', title: 'Track 1' },
        { memberId: 'm1', displayName: 'User1' }
      );
      const res2 = await roomStore.addToQueue(
        'queue-room-5',
        { videoId: 'vid2', title: 'Track 2' },
        { memberId: 'm1', displayName: 'User1' }
      );

      const itemIdToRemove = res2.item.id;
      const updated = await roomStore.removeFromQueue('queue-room-5', itemIdToRemove);
      expect(updated.queue.length).toBe(0);
    });

    it('skips to next track in queue', async () => {
      await roomStore.createRoom({
        roomId: 'queue-room-6',
        passwordHash: 'hash123',
        creatorMemberId: 'm1',
        creatorDisplayName: 'User1',
      });
      await roomStore.addToQueue(
        'queue-room-6',
        { videoId: 'vid1', title: 'Track 1' },
        { memberId: 'm1', displayName: 'User1' }
      );
      await roomStore.addToQueue(
        'queue-room-6',
        { videoId: 'vid2', title: 'Track 2' },
        { memberId: 'm1', displayName: 'User1' }
      );

      const skipped = await roomStore.skipQueue('queue-room-6');
      expect(skipped.nowPlaying.videoId).toBe('vid2');
      expect(skipped.playerState.videoId).toBe('vid2');
      expect(skipped.playerState.status).toBe('playing');
      expect(skipped.queue.length).toBe(0);

      const skippedAgain = await roomStore.skipQueue('queue-room-6');
      expect(skippedAgain.nowPlaying).toBeNull();
      expect(skippedAgain.playerState.videoId).toBe('');
      expect(skippedAgain.playerState.status).toBe('paused');
    });

    it('endedQueue de-duplicates across multiple client calls', async () => {
      await roomStore.createRoom({
        roomId: 'queue-room-7',
        passwordHash: 'hash123',
        creatorMemberId: 'm1',
        creatorDisplayName: 'User1',
      });
      const res1 = await roomStore.addToQueue(
        'queue-room-7',
        { videoId: 'vid1', title: 'Track 1' },
        { memberId: 'm1', displayName: 'User1' }
      );
      await roomStore.addToQueue(
        'queue-room-7',
        { videoId: 'vid2', title: 'Track 2' },
        { memberId: 'm1', displayName: 'User1' }
      );

      const currentItemId = res1.item.id;

      // First client notifies ended
      const advanced = await roomStore.endedQueue('queue-room-7', currentItemId);
      expect(advanced).not.toBeNull();
      expect(advanced.nowPlaying.videoId).toBe('vid2');

      // Second client notifies ended with the same old currentItemId (must be ignored)
      const ignored = await roomStore.endedQueue('queue-room-7', currentItemId);
      expect(ignored).toBeNull();
      const current = await roomStore.getRoom('queue-room-7');
      expect(current.nowPlaying.videoId).toBe('vid2');
    });
  });

  describe('Socket.IO Queue Integration', () => {
    let port;
    let clientSocket;

    beforeEach(async () => {
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

    it('receives initial queue:update on connection and handles queue:add and queue:skip', async () => {
      const roomId = 'socket-room-1';
      await roomStore.createRoom({
        roomId,
        passwordHash: 'hash123',
        creatorMemberId: 'm_alice',
        creatorDisplayName: 'Alice',
      });

      const token = signSessionToken({
        roomId,
        memberId: 'm_alice',
        displayName: 'Alice',
      });

      const queueUpdates = [];

      await new Promise((resolve) => {
        clientSocket = ClientIO(`http://127.0.0.1:${port}`, {
          auth: { token },
          forceNew: true,
          transports: ['websocket'],
          extraHeaders: {
            'x-forwarded-for': '192.168.10.1',
          },
        });

        clientSocket.on('queue:update', (data) => {
          queueUpdates.push(data);
          if (queueUpdates.length === 1) {
            resolve();
          }
        });
      });

      expect(queueUpdates[0].queue).toEqual([]);
      expect(queueUpdates[0].nowPlaying).toBeNull();

      // Emit queue:add for first song (should start immediately)
      const playerStates = [];
      clientSocket.on('player:state', (s) => playerStates.push(s));

      await new Promise((resolve) => {
        clientSocket.emit('queue:add', {
          videoId: 'yt-song-1',
          title: 'First Song',
          channel: 'Band',
          durationSec: 200,
        });

        clientSocket.on('queue:update', (data) => {
          if (data.nowPlaying?.videoId === 'yt-song-1') {
            resolve();
          }
        });
      });

      expect(playerStates.some((s) => s.videoId === 'yt-song-1' && s.status === 'playing')).toBe(
        true
      );

      // Emit queue:add for second song (should go to queue)
      await new Promise((resolve) => {
        clientSocket.emit('queue:add', {
          videoId: 'yt-song-2',
          title: 'Second Song',
          channel: 'Band',
          durationSec: 150,
        });

        clientSocket.on('queue:update', (data) => {
          if (data.queue.length === 1 && data.queue[0].videoId === 'yt-song-2') {
            resolve();
          }
        });
      });

      // Emit queue:skip
      await new Promise((resolve) => {
        clientSocket.emit('queue:skip');
        clientSocket.on('queue:update', (data) => {
          if (data.nowPlaying?.videoId === 'yt-song-2' && data.queue.length === 0) {
            resolve();
          }
        });
      });
    });

    it('emits queue:error when attempting to add duplicate video', async () => {
      const roomId = 'socket-room-2';
      await roomStore.createRoom({
        roomId,
        passwordHash: 'hash123',
        creatorMemberId: 'm_bob',
        creatorDisplayName: 'Bob',
      });

      const token = signSessionToken({
        roomId,
        memberId: 'm_bob',
        displayName: 'Bob',
      });

      await new Promise((resolve) => {
        clientSocket = ClientIO(`http://127.0.0.1:${port}`, {
          auth: { token },
          forceNew: true,
          transports: ['websocket'],
          extraHeaders: {
            'x-forwarded-for': '192.168.10.2',
          },
        });
        clientSocket.on('connect', resolve);
      });

      // Add song 1
      await new Promise((resolve) => {
        clientSocket.emit('queue:add', { videoId: 'same-vid', title: 'Track' });
        clientSocket.on('queue:update', (data) => {
          if (data.nowPlaying?.videoId === 'same-vid') resolve();
        });
      });

      // Add same song again
      const errorPromise = new Promise((resolve) => {
        clientSocket.on('queue:error', (err) => {
          resolve(err);
        });
      });

      clientSocket.emit('queue:add', { videoId: 'same-vid', title: 'Track Again' });
      const err = await errorPromise;
      expect(err.message).toContain('already in queue or currently playing');
    });
  });
});
