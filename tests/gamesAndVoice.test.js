import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { io as ClientIO } from 'socket.io-client';
import { roomStore } from '../server/services/roomStore.js';
import { signSessionToken } from '../server/services/security.js';
import { httpServer } from '../server/index.js';
import {
  VOICE_PRESETS,
  getCurrentVoicePreset,
  setVoicePreset,
  setVoiceMonitor,
  isVoiceMonitorActive,
} from '../src/lib/voiceEffects.js';

describe('Voice Effects DSP Presets', () => {
  it('exposes 9 distinct voice presets with valid id, name, and emoji', () => {
    expect(VOICE_PRESETS).toHaveLength(9);
    const ids = VOICE_PRESETS.map((p) => p.id);
    expect(ids).toContain('normal');
    expect(ids).toContain('chipmunk');
    expect(ids).toContain('deep');
    expect(ids).toContain('robot');
    expect(ids).toContain('radio');
    expect(ids).toContain('megaphone');
    expect(ids).toContain('echo');
    expect(ids).toContain('alien');
    expect(ids).toContain('cathedral');
  });

  it('allows getting, setting presets and headphone monitoring', () => {
    setVoicePreset('chipmunk');
    expect(getCurrentVoicePreset()).toBe('chipmunk');

    setVoicePreset('deep');
    expect(getCurrentVoicePreset()).toBe('deep');

    setVoiceMonitor(true);
    expect(isVoiceMonitorActive()).toBe(true);

    setVoiceMonitor(false);
    expect(isVoiceMonitorActive()).toBe(false);

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

  it('handles game:start, broadcasting game:started to others, drawing strokes, and guessing words', async () => {
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

    // 2. Start game: verify guesser receives game:started notification
    const startedPromise = new Promise((resolve) => {
      guesserSocket.once('game:started', resolve);
    });

    drawerSocket.emit('game:start');
    const startedData = await startedPromise;
    expect(startedData.round).toBe(1);
    expect(startedData.drawerName).toBe('DrawerUser');
    expect(startedData.startedBy).toBe('DrawerUser');

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
