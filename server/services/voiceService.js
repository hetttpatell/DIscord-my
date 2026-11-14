import { AccessToken } from 'livekit-server-sdk';
import { config } from '../config.js';

export async function generateLiveKitVoiceToken({ roomId, memberId, displayName }) {
  const at = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
    identity: memberId,
    name: displayName,
    ttl: '1h',
  });

  at.addGrant({
    roomJoin: true,
    room: roomId,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  });

  const token = await at.toJwt();
  return {
    token,
    url: config.LIVEKIT_URL,
  };
}

