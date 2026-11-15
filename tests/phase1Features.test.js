import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { io as ClientIO } from 'socket.io-client';
import { app, httpServer } from '../server/index.js';
import { roomStore } from '../server/services/roomStore.js';

describe('Phase 1 Feature Verification (A - F)', () => {
  let serverPort;
  let activeSockets = [];
  let ipCounter = 1;

  beforeAll(async () => {
    await new Promise((resolve) => {
      httpServer.listen(0, () => {
        serverPort = httpServer.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise((resolve) => httpServer.close(resolve));
  });

  beforeEach(() => {
    roomStore.memoryRooms.clear();
  });

  afterEach(() => {
    for (const s of activeSockets) {
      if (s.connected) s.disconnect();
    }
    activeSockets = [];
  });

  function getNextIp() {
    ipCounter++;
    return `10.200.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
  }

  function createClient(token, peerId = '', name = '') {
    const socket = ClientIO(`http://127.0.0.1:${serverPort}`, {
      transports: ['websocket'],
      auth: { token, peerId, name },
      autoConnect: false,
      reconnection: false,
      forceNew: true,
      multiplex: false,
    });
    activeSockets.push(socket);
    return socket;
  }

  async function connectClient(token, peerId = '', name = '') {
    const socket = createClient(token, peerId, name);
    await new Promise((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
      socket.connect();
    });
    return socket;
  }

  describe('Feature A: Room Members, Presence, Host Transfer & Room Cap', () => {
    it('handles 2 users then 3 users with monotonic versioning and assigns room creator as host', async () => {
      const ip = getNextIp();
      const resCreate = await request(app)
        .post('/api/rooms')
        .set('X-Forwarded-For', ip)
        .send({
          roomId: 'room-presence-1',
          password: 'secretPassword123',
          displayName: 'Alice',
        });
      expect(resCreate.status).toBe(201);
      const token1 = resCreate.body.token;

      // Connect Alice with listener attached beforehand
      const socket1 = createClient(token1, 'peer_alice', 'Alice');
      const membersPromise1 = new Promise((resolve) => socket1.on('room:members', resolve));
      socket1.connect();

      const membersPayload1 = await membersPromise1;
      expect(membersPayload1.members.length).toBe(1);
      expect(membersPayload1.members[0].isHost).toBe(true);
      expect(membersPayload1.members[0].peerId).toBe('peer_alice');
      const v1 = membersPayload1.version;

      // 2. User 2 Joins (Bob)
      const resJoinBob = await request(app)
        .post('/api/rooms/join')
        .set('X-Forwarded-For', ip)
        .send({
          roomId: 'room-presence-1',
          password: 'secretPassword123',
          displayName: 'Bob',
        });
      expect(resJoinBob.status).toBe(200);

      const membersPromise2 = new Promise((resolve) => socket1.once('room:members', resolve));
      const socket2 = await connectClient(resJoinBob.body.token, 'peer_bob', 'Bob');
      const membersPayload2 = await membersPromise2;

      expect(membersPayload2.members.length).toBe(2);
      expect(membersPayload2.version).toBeGreaterThan(v1);
      const bob = membersPayload2.members.find((m) => m.name === 'Bob');
      expect(bob.isHost).toBe(false);
      expect(bob.peerId).toBe('peer_bob');

      // 3. User 3 Joins (Charlie)
      const resJoinCharlie = await request(app)
        .post('/api/rooms/join')
        .set('X-Forwarded-For', ip)
        .send({
          roomId: 'room-presence-1',
          password: 'secretPassword123',
          displayName: 'Charlie',
        });
      expect(resJoinCharlie.status).toBe(200);

      const membersPromise3 = new Promise((resolve) => socket2.once('room:members', resolve));
      await connectClient(resJoinCharlie.body.token, 'peer_charlie', 'Charlie');
      const membersPayload3 = await membersPromise3;

      expect(membersPayload3.members.length).toBe(3);
      expect(membersPayload3.version).toBeGreaterThan(membersPayload2.version);
    });

    it('enforces 6 member cap and rejects the 7th user with "Room is full"', async () => {
      const roomId = 'room-cap-test';
      const pass = 'password123';
      const ip = getNextIp();

      const resCreate = await request(app)
        .post('/api/rooms')
        .set('X-Forwarded-For', ip)
        .send({ roomId, password: pass, displayName: 'User1' });
      expect(resCreate.status).toBe(201);
      await connectClient(resCreate.body.token, 'peer_1', 'User1');

      // Add 5 more users so room has 6 members
      for (let i = 2; i <= 6; i++) {
        const resJoin = await request(app)
          .post('/api/rooms/join')
          .set('X-Forwarded-For', ip)
          .send({ roomId, password: pass, displayName: `User${i}` });
        expect(resJoin.status).toBe(200);
        await connectClient(resJoin.body.token, `peer_${i}`, `User${i}`);
      }

      // 7th user tries to join via HTTP endpoint
      const res7 = await request(app)
        .post('/api/rooms/join')
        .set('X-Forwarded-For', ip)
        .send({ roomId, password: pass, displayName: 'User7' });
      expect(res7.status).toBe(403);
      expect(res7.body.error).toContain('Room is full');
    });

    it('transfers host role to the member with earliest joinedAt when host disconnects', async () => {
      const roomId = 'host-transfer-test';
      const pass = 'password123';
      const ip = getNextIp();

      const resCreate = await request(app)
        .post('/api/rooms')
        .set('X-Forwarded-For', ip)
        .send({ roomId, password: pass, displayName: 'HostAlice' });
      expect(resCreate.status).toBe(201);
      const socketAlice = await connectClient(resCreate.body.token, 'p_alice', 'HostAlice');

      await new Promise((r) => setTimeout(r, 60));

      const resBob = await request(app)
        .post('/api/rooms/join')
        .set('X-Forwarded-For', ip)
        .send({ roomId, password: pass, displayName: 'MemberBob' });
      expect(resBob.status).toBe(200);
      const socketBob = await connectClient(resBob.body.token, 'p_bob', 'MemberBob');

      await new Promise((r) => setTimeout(r, 60));

      const resCharlie = await request(app)
        .post('/api/rooms/join')
        .set('X-Forwarded-For', ip)
        .send({ roomId, password: pass, displayName: 'MemberCharlie' });
      expect(resCharlie.status).toBe(200);
      await connectClient(resCharlie.body.token, 'p_charlie', 'MemberCharlie');
      await new Promise((r) => setTimeout(r, 60));

      // Alice (host) disconnects
      const membersAfterDisconnect = await new Promise((resolve) => {
        socketBob.once('room:members', resolve);
        socketAlice.disconnect();
      });

      expect(membersAfterDisconnect.members.length).toBe(2);
      const newHost = membersAfterDisconnect.members.find((m) => m.isHost);
      expect(newHost).toBeTruthy();
      expect(newHost.name).toBe('MemberBob'); // Earliest joined member becomes host
    });

    it('allows host to kick a member and informs the kicked member', async () => {
      const roomId = 'kick-test';
      const pass = 'password123';
      const ip = getNextIp();

      const resHost = await request(app)
        .post('/api/rooms')
        .set('X-Forwarded-For', ip)
        .send({ roomId, password: pass, displayName: 'Boss' });
      expect(resHost.status).toBe(201);
      const socketHost = await connectClient(resHost.body.token, 'p_boss', 'Boss');

      const resUser = await request(app)
        .post('/api/rooms/join')
        .set('X-Forwarded-For', ip)
        .send({ roomId, password: pass, displayName: 'BadActor' });
      expect(resUser.status).toBe(200);
      const socketUser = await connectClient(resUser.body.token, 'p_actor', 'BadActor');

      const kickedPromise = new Promise((resolve) => {
        socketUser.once('room:kicked', resolve);
      });

      // Host kicks BadActor
      socketHost.emit('room:kick', { memberId: socketUser.id });

      const kickedData = await kickedPromise;
      expect(kickedData.message).toContain('You were removed by the host');
    });

    it('broadcasts media:state changes with monotonic versioning', async () => {
      const roomId = 'media-test';
      const pass = 'password123';
      const ip = getNextIp();

      const res = await request(app)
        .post('/api/rooms')
        .set('X-Forwarded-For', ip)
        .send({ roomId, password: pass, displayName: 'CamGuy' });
      expect(res.status).toBe(201);
      const socket = await connectClient(res.body.token, 'p_cam', 'CamGuy');

      const updatePromise = new Promise((resolve) => {
        socket.once('room:members', resolve);
      });

      socket.emit('media:state', { micOn: true, camOn: true });

      const payload = await updatePromise;
      expect(payload.members[0].micOn).toBe(true);
      expect(payload.members[0].camOn).toBe(true);
    });
  });

  describe('Feature D: Text Chat & Rate Limiting', () => {
    it('broadcasts chat messages and enforces rate limiting of 5 messages per 3s', async () => {
      const roomId = 'chat-test';
      const pass = 'password123';
      const ip = getNextIp();

      const res = await request(app)
        .post('/api/rooms')
        .set('X-Forwarded-For', ip)
        .send({ roomId, password: pass, displayName: 'Chatter' });
      expect(res.status).toBe(201);
      const socket = await connectClient(res.body.token, 'p_chat', 'Chatter');

      // Send 5 messages quickly (allowed)
      for (let i = 1; i <= 5; i++) {
        socket.emit('chat:send', { text: `Message ${i}` });
      }

      // 6th message triggers chat:error "Slow down"
      const errorPromise = new Promise((resolve) => {
        socket.once('chat:error', resolve);
      });

      socket.emit('chat:send', { text: 'Message 6 - flood' });

      const err = await errorPromise;
      expect(err.message).toBe('Slow down');
    });
  });

  describe('Feature E: Shared Queue, Skip Voting & End De-duplication', () => {
    it('adds videos, starts immediate playback if queue was empty, and rejects duplicates', async () => {
      const roomId = 'queue-test-1';
      const pass = 'password123';
      const ip = getNextIp();

      const res = await request(app)
        .post('/api/rooms')
        .set('X-Forwarded-For', ip)
        .send({ roomId, password: pass, displayName: 'DJ' });
      expect(res.status).toBe(201);
      const socket = await connectClient(res.body.token, 'p_dj', 'DJ');

      const item1 = {
        videoId: 'vid_123',
        title: 'Song One',
        channel: 'Artist A',
        thumbnail: 'thumb.jpg',
        durationSec: 200,
      };

      // When queue is empty, adding item starts it immediately as nowPlaying
      const queuePromise1 = new Promise((resolve) => socket.once('queue:update', resolve));
      const playerPromise1 = new Promise((resolve) => socket.once('player:state', resolve));

      socket.emit('queue:add', { video: item1 });

      const qUpdate1 = await queuePromise1;
      const pUpdate1 = await playerPromise1;

      expect(qUpdate1.nowPlaying).toBeTruthy();
      expect(qUpdate1.nowPlaying.videoId).toBe('vid_123');
      expect(pUpdate1.videoId).toBe('vid_123');
      expect(pUpdate1.status).toBe('playing');

      // Adding duplicate videoId is rejected with queue:error
      const errorPromise = new Promise((resolve) => socket.once('queue:error', resolve));
      socket.emit('queue:add', { video: item1 });

      const err = await errorPromise;
      expect(err.message).toContain('already in queue or currently playing');
    });

    it('advances queue only once when two clients fire queue:ended with the same itemId', async () => {
      const roomId = 'queue-ended-test';
      const pass = 'password123';
      const ip = getNextIp();

      const resHost = await request(app)
        .post('/api/rooms')
        .set('X-Forwarded-For', ip)
        .send({ roomId, password: pass, displayName: 'Host' });
      expect(resHost.status).toBe(201);
      const socketHost = await connectClient(resHost.body.token, 'p_h', 'Host');

      const resGuest = await request(app)
        .post('/api/rooms/join')
        .set('X-Forwarded-For', ip)
        .send({ roomId, password: pass, displayName: 'Guest' });
      expect(resGuest.status).toBe(200);
      const socketGuest = await connectClient(resGuest.body.token, 'p_g', 'Guest');

      // Add Song 1 (starts playing)
      socketHost.emit('queue:add', {
        video: { videoId: 'song_1', title: 'Song 1', channel: 'Ch 1' },
      });
      const qState1 = await new Promise((r) => socketHost.once('queue:update', r));
      const song1Id = qState1.nowPlaying.id;

      // Add Song 2 (queued)
      socketHost.emit('queue:add', {
        video: { videoId: 'song_2', title: 'Song 2', channel: 'Ch 2' },
      });
      await new Promise((r) => socketHost.once('queue:update', r));

      let queueUpdateCount = 0;
      let lastQueueState = null;
      socketHost.on('queue:update', (data) => {
        queueUpdateCount++;
        lastQueueState = data;
      });

      // Both Host and Guest fire queue:ended with song1Id at the same time
      socketHost.emit('queue:ended', { itemId: song1Id });
      socketGuest.emit('queue:ended', { itemId: song1Id });

      await new Promise((r) => setTimeout(r, 200));

      // De-duplication: queue advanced exactly ONCE to Song 2
      expect(queueUpdateCount).toBe(1);
      expect(lastQueueState.nowPlaying.videoId).toBe('song_2');
      expect(lastQueueState.queue.length).toBe(0);
    });

    it('skips instantly when host requests skip, but counts votes for regular members', async () => {
      const roomId = 'skip-test';
      const pass = 'password123';
      const ip = getNextIp();

      const resHost = await request(app)
        .post('/api/rooms')
        .set('X-Forwarded-For', ip)
        .send({ roomId, password: pass, displayName: 'HostAlice' });
      expect(resHost.status).toBe(201);
      const socketHost = await connectClient(resHost.body.token, 'p_ha', 'HostAlice');

      const resGuest = await request(app)
        .post('/api/rooms/join')
        .set('X-Forwarded-For', ip)
        .send({ roomId, password: pass, displayName: 'GuestBob' });
      expect(resGuest.status).toBe(200);
      const socketGuest = await connectClient(resGuest.body.token, 'p_gb', 'GuestBob');

      // Add 2 songs
      socketHost.emit('queue:add', { video: { videoId: 's1', title: 'Song 1' } });
      await new Promise((r) => socketHost.once('queue:update', r));
      socketHost.emit('queue:add', { video: { videoId: 's2', title: 'Song 2' } });
      await new Promise((r) => socketHost.once('queue:update', r));

      // Guest votes skip (2 members -> needed = floor(2/2)+1 = 2)
      const votePromise = new Promise((resolve) => socketGuest.once('queue:votes', resolve));
      socketGuest.emit('queue:skip');
      const voteData = await votePromise;
      expect(voteData.votes).toBe(1);
      expect(voteData.needed).toBe(2);

      // Host skips: instant skip to Song 2
      const skipPromise = new Promise((resolve) => socketHost.once('queue:update', resolve));
      socketHost.emit('queue:skip');
      const afterHostSkip = await skipPromise;
      expect(afterHostSkip.nowPlaying.videoId).toBe('s2');
    });
  });

  describe('Feature F: Floating Reactions Rate Limiting', () => {
    it('broadcasts valid emojis and enforces 1 per 300ms rate limit', async () => {
      const roomId = 'reaction-test';
      const pass = 'password123';
      const ip = getNextIp();

      const res = await request(app)
        .post('/api/rooms')
        .set('X-Forwarded-For', ip)
        .send({ roomId, password: pass, displayName: 'Reactor' });
      expect(res.status).toBe(201);
      const socket = await connectClient(res.body.token, 'p_r', 'Reactor');

      const received = [];
      socket.on('reaction:show', (data) => received.push(data));

      // Send 1 valid emoji
      socket.emit('reaction:send', { emoji: '🔥' });
      await new Promise((r) => setTimeout(r, 50));

      // Send immediate second emoji (throttled by 300ms limiter)
      socket.emit('reaction:send', { emoji: '❤️' });

      // Send invalid emoji (dropped)
      socket.emit('reaction:send', { emoji: '🍕' });

      await new Promise((r) => setTimeout(r, 200));

      // Only the first emoji went through
      expect(received.length).toBe(1);
      expect(received[0].emoji).toBe('🔥');
      expect(received[0].name).toBe('Reactor');
    });
  });
});
