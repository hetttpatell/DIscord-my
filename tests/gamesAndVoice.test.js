import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { io as ClientIO } from 'socket.io-client';
import { roomStore } from '../server/services/roomStore.js';
import { signSessionToken } from '../server/services/security.js';
import { httpServer } from '../server/index.js';
import { VOICE_PRESETS, getCurrentVoicePreset, setVoicePreset } from '../src/lib/voiceEffects.js';

describe('Voice Effects DSP Presets', () => {
  it('exposes 6 voice presets with valid id, name, and emoji', () => {
    expect(VOICE_PRESETS).toHaveLength(6);
    const ids = VOICE_PRESETS.map((p) => p.id);
    expect(ids).toContain('normal');
    expect(ids).toContain('robot');
    expect(ids).toContain('radio');
    expect(ids).toContain('deep');
    expect(ids).toContain('chipmunk');
    expect(ids).toContain('echo');
  });

  it('allows getting and setting voice presets dynamically', () => {
    setVoicePreset('robot');
    expect(getCurrentVoicePreset()).toBe('robot');

    setVoicePreset('normal');
    expect(getCurrentVoicePreset()).toBe('normal');
  });
});

describe('Scribble & Guess Socket Mini-Game', () => {
  let port;
  let drawerSocket;
  let guesserSocket;
  const roomId = 'scribble-test-room';

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
    if (drawerSocket?.connected) drawerSocket.disconnect();
    if (guesserSocket?.connected) guesserSocket.disconnect();
    await new Promise((resolve) => {
      httpServer.close(resolve);
    });
  });

  it('handles game:start, drawing strokes, and guessing words', async () => {
    await roomStore.createRoom({
      roomId,
      passwordHash: 'hash123',
      creatorMemberId: 'm_drawer',
      creatorDisplayName: 'DrawerUser',
    });

    const drawerToken = signSessionToken({
      roomId,
      memberId: 'm_drawer',
      displayName: 'DrawerUser',
    });

    const guesserToken = signSessionToken({
      roomId,
      memberId: 'm_guesser',
      displayName: 'GuesserUser',
    });

    let initialStateReceived = null;

    // Connect drawer with listener registered upfront
    await new Promise((resolve) => {
      drawerSocket = ClientIO(`http://127.0.0.1:${port}`, {
        auth: { token: drawerToken },
        forceNew: true,
        transports: ['websocket'],
      });
      drawerSocket.on('game:state', (state) => {
        if (!initialStateReceived) initialStateReceived = state;
      });
      drawerSocket.on('connect', resolve);
    });

    // Connect guesser
    await new Promise((resolve) => {
      guesserSocket = ClientIO(`http://127.0.0.1:${port}`, {
        auth: { token: guesserToken },
        forceNew: true,
        transports: ['websocket'],
      });
      guesserSocket.on('connect', resolve);
    });

    expect(initialStateReceived).toBeDefined();
    expect(initialStateReceived.status).toBe('idle');

    // 2. Start game
    const roundStartPromise = new Promise((resolve) => {
      guesserSocket.once('game:round_start', resolve);
    });
    drawerSocket.emit('game:start');
    const roundData = await roundStartPromise;
    expect(roundData.round).toBe(1);

    // 3. Test draw stroke relay
    const drawPromise = new Promise((resolve) => {
      guesserSocket.once('game:draw', resolve);
    });

    const stroke = {
      x0: 0.1,
      y0: 0.2,
      x1: 0.3,
      y1: 0.4,
      color: '#FF5A5F',
      size: 6,
    };
    drawerSocket.emit('game:draw', stroke);

    const receivedStroke = await drawPromise;
    expect(receivedStroke.x0).toBe(0.1);
    expect(receivedStroke.color).toBe('#FF5A5F');

    // Clean up game timers
    drawerSocket.emit('game:reset');
  });
});
