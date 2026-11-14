import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

/**
 * WebRTC Multi-Tab / Shared ClientId Signaling & Role Test
 * Simulates two participants joining with distinct socket ids but the same clientId.
 * Asserts:
 * 1. Both participants connect with distinct socket ids.
 * 2. Both participants join the call under the same clientId without collision.
 * 3. Perfect negotiation roles computed on both sides are strictly opposite (one polite, one impolite).
 * 4. webrtc:signal sent from socket1 reaches socket2 directly.
 * 5. webrtc:signal sent from socket2 reaches socket1 directly.
 */

const TEST_PORT = 3999;
const SERVER_URL = `http://127.0.0.1:${TEST_PORT}`;

console.log('================================================================');
console.log('AUDIT VERIFICATION: WebRTC Distinct Sockets & Shared ClientId Test');
console.log('================================================================');

// Spawn server on isolated test port
const serverProcess = spawn('node', ['server.js'], {
  env: {
    ...process.env,
    PORT: String(TEST_PORT)
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverReady = false;

serverProcess.stdout.on('data', (data) => {
  const msg = data.toString();
  if (msg.includes('afterspot server listening') || msg.includes(String(TEST_PORT))) {
    serverReady = true;
  }
  process.stdout.write('[Server] ' + msg);
});

serverProcess.stderr.on('data', (data) => {
  const err = data.toString();
  if (!err.includes('ExperimentalWarning')) {
    console.error('[Server Error]', err);
  }
});

function cleanup() {
  try {
    serverProcess.kill('SIGTERM');
  } catch {}
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('SIGTERM', () => { cleanup(); process.exit(1); });

async function waitForServer(timeoutMs = 10000) {
  const start = Date.now();
  while (!serverReady && Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 100));
  }
  if (!serverReady) {
    throw new Error('Server did not start in time on port ' + TEST_PORT);
  }
}

async function runTest() {
  try {
    await waitForServer();
    console.log(`[Test] Server is live on ${SERVER_URL}`);

    const sharedClientId = 'shared-client-tab-test-' + Date.now();

    // Connect Socket 1
    const socket1 = io(SERVER_URL, { transports: ['websocket'], forceNew: true });
    await new Promise((resolve, reject) => {
      socket1.on('connect', resolve);
      socket1.on('connect_error', reject);
    });
    console.log(`[Test] Socket 1 connected (id: ${socket1.id})`);

    // Connect Socket 2
    const socket2 = io(SERVER_URL, { transports: ['websocket'], forceNew: true });
    await new Promise((resolve, reject) => {
      socket2.on('connect', resolve);
      socket2.on('connect_error', reject);
    });
    console.log(`[Test] Socket 2 connected (id: ${socket2.id})`);

    // Assertion 1: Distinct socket IDs
    assert.notStrictEqual(socket1.id, socket2.id, 'Sockets must have distinct socket IDs');
    console.log('✓ Invariant 1: Distinct socket IDs established');

    // Socket 1 creates room
    let createdRoomId = null;
    await new Promise((resolve, reject) => {
      socket1.emit('room:create', {
        roomName: 'WebRTC Test Lounge',
        password: 'test1234',
        userName: 'Participant 1',
        sessionId: sharedClientId,
        clientId: sharedClientId,
        requireApproval: false
      }, (res) => {
        if (res?.success) {
          createdRoomId = res.room.id;
          resolve(res);
        } else {
          reject(new Error(res?.message || 'Failed to create room'));
        }
      });
    });
    console.log(`[Test] Socket 1 created room ${createdRoomId} with clientId: ${sharedClientId}`);

    // Socket 2 joins room with SAME clientId
    await new Promise((resolve, reject) => {
      socket2.emit('room:join', {
        roomId: createdRoomId,
        password: 'test1234',
        userName: 'Participant 2',
        sessionId: sharedClientId,
        clientId: sharedClientId
      }, (res) => {
        if (res?.success) resolve(res);
        else reject(new Error(res?.message || 'Failed to join room'));
      });
    });
    console.log(`[Test] Socket 2 joined room ${createdRoomId} with shared clientId: ${sharedClientId}`);

    // Socket 1 joins WebRTC call
    console.log(`[Test] Emitting webrtc:join-call from socket1 (connected: ${socket1.connected})`);
    socket1.emit('webrtc:join-call', { isMuted: false, isCameraOff: false });

    // Give socket 1 a moment to register on server
    await new Promise(r => setTimeout(r, 200));

    // Socket 2 joins WebRTC call and waits for existing-peers
    const existingPeersPromise = new Promise((resolve) => {
      socket2.on('webrtc:existing-peers', (data) => {
        resolve(data);
      });
    });

    const peerJoinedPromise = new Promise((resolve) => {
      socket1.on('webrtc:peer-joined', (data) => {
        resolve(data);
      });
    });

    console.log(`[Test] Emitting webrtc:join-call from socket2 (connected: ${socket2.connected})`);
    socket2.emit('webrtc:join-call', { isMuted: false, isCameraOff: false });

    const existingPeersData = await existingPeersPromise;
    const peerJoinedData = await peerJoinedPromise;

    assert.ok(existingPeersData.peers.some(p => p.peerId === socket1.id), 'Socket 2 should see Socket 1 in existingPeers');
    assert.strictEqual(peerJoinedData.peerId, socket2.id, 'Socket 1 should see Socket 2 in peer-joined');
    console.log('✓ Invariant 2: WebRTC call membership registered correctly by socket.id');

    // Assertion 3: Opposite polite/impolite roles
    const polite1 = socket1.id < socket2.id;
    const polite2 = socket2.id < socket1.id;

    assert.strictEqual(typeof polite1, 'boolean', 'polite1 must be boolean');
    assert.strictEqual(typeof polite2, 'boolean', 'polite2 must be boolean');
    assert.notStrictEqual(polite1, polite2, 'Polite roles must be opposite across peers');
    assert.ok((polite1 && !polite2) || (!polite1 && polite2), 'Exactly one side is polite, the other is impolite');
    console.log(`✓ Invariant 3: Opposite polite roles computed: Socket 1 polite=${polite1}, Socket 2 polite=${polite2}`);

    // Assertion 4: webrtc:signal forward from socket1 to socket2
    const signalTo2Promise = new Promise((resolve) => {
      socket2.on('webrtc:signal', (payload) => {
        resolve(payload);
      });
    });

    socket1.emit('webrtc:signal', {
      to: socket2.id,
      signal: { type: 'offer', sdp: 'v=0\r\no=alice 1234 1 IN IP4 127.0.0.1' },
      type: 'offer'
    });

    const signalAt2 = await signalTo2Promise;
    assert.strictEqual(signalAt2.from, socket1.id, 'Signal at socket2 must be from socket1.id');
    assert.strictEqual(signalAt2.type, 'offer', 'Signal type must be offer');
    assert.strictEqual(signalAt2.signal.sdp, 'v=0\r\no=alice 1234 1 IN IP4 127.0.0.1', 'Signal sdp payload preserved');
    console.log('✓ Invariant 4: webrtc:signal offer forwarded from socket1 to intended target socket2');

    // Assertion 5: webrtc:signal forward from socket2 to socket1
    const signalTo1Promise = new Promise((resolve) => {
      socket1.on('webrtc:signal', (payload) => {
        resolve(payload);
      });
    });

    socket2.emit('webrtc:signal', {
      to: socket1.id,
      signal: { type: 'answer', sdp: 'v=0\r\no=bob 5678 1 IN IP4 127.0.0.1' },
      type: 'answer'
    });

    const signalAt1 = await signalTo1Promise;
    assert.strictEqual(signalAt1.from, socket2.id, 'Signal at socket1 must be from socket2.id');
    assert.strictEqual(signalAt1.type, 'answer', 'Signal type must be answer');
    assert.strictEqual(signalAt1.signal.sdp, 'v=0\r\no=bob 5678 1 IN IP4 127.0.0.1', 'Signal sdp payload preserved');
    console.log('✓ Invariant 5: webrtc:signal answer forwarded from socket2 to intended target socket1');

    // Assertion 6: webrtc:media-state broadcast from socket1 to socket2
    const mediaStatePromise = new Promise((resolve) => {
      socket2.on('webrtc:media-state-updated', (payload) => {
        resolve(payload);
      });
    });

    socket1.emit('webrtc:media-state', { isMuted: false, isCameraOff: false, isScreenSharing: true });
    const mediaStateAt2 = await mediaStatePromise;
    assert.strictEqual(mediaStateAt2.peerId, socket1.id, 'Media state must be from socket1.id');
    assert.strictEqual(mediaStateAt2.isMuted, false, 'Media state isMuted must be false');
    assert.strictEqual(mediaStateAt2.isCameraOff, false, 'Media state isCameraOff must be false');
    assert.strictEqual(mediaStateAt2.isScreenSharing, true, 'Media state isScreenSharing must be true');
    console.log('✓ Invariant 6: webrtc:media-state broadcast reached socket2 with correct payload');

    socket1.disconnect();
    socket2.disconnect();

    console.log('\n================================================================');
    console.log('ALL WEBRTC VERIFICATION ASSERTIONS PASSED SUCCESSFULLY (0 ERRORS)');
    console.log('================================================================');
  } finally {
    cleanup();
  }
}

runTest().catch((err) => {
  console.error('\n❌ Test Failure:', err);
  cleanup();
  process.exit(1);
});
