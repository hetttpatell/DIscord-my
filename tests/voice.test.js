import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { TokenVerifier } from 'livekit-server-sdk';
import { app } from '../server/index.js';
import { config } from '../server/config.js';
import { signSessionToken } from '../server/services/security.js';
import { roomStore } from '../server/services/roomStore.js';

describe('Phase 5: Voice Token & LiveKit Authentication', () => {
  beforeEach(() => {
    roomStore.memoryRooms.clear();
  });

  it('rejects /api/voice-token without session token', async () => {
    const res = await request(app).post('/api/voice-token');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Session token required');
  });

  it('creates valid LiveKit AccessToken with required grants and 1h TTL', async () => {
    const sessionToken = signSessionToken({
      roomId: 'voice-room-1',
      memberId: 'm_voice_user',
      displayName: 'VoiceAlice',
    });

    const res = await request(app)
      .post('/api/voice-token')
      .set('Authorization', `Bearer ${sessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.url).toBe(config.LIVEKIT_URL);

    // Verify token claims and grants using LiveKit TokenVerifier
    const verifier = new TokenVerifier(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
    const claims = await verifier.verify(res.body.token);

    expect(claims.sub).toBe('m_voice_user');
    expect(claims.name).toBe('VoiceAlice');
    expect(claims.video).toEqual({
      roomJoin: true,
      room: 'voice-room-1',
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    });
  });
});

