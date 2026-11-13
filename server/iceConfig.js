import crypto from 'crypto';

// Default High-Availability Google & Cloudflare STUN Servers
const DEFAULT_STUN_SERVERS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
  'stun:stun3.l.google.com:19302',
  'stun:stun4.l.google.com:19302',
  'stun:stun.cloudflare.com:3478'
];

// Fallback OpenRelay servers (UDP + TCP 80/443)
const FALLBACK_TURN_SERVERS = [
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp'
    ],
    username: 'openrelay',
    credential: 'openrelay'
  }
];

// Cache for Metered dynamic API credentials (valid for 1 hour)
let meteredCache = {
  expiresAt: 0,
  servers: null
};

/**
 * Fetch dynamic time-limited TURN credentials from Metered if METERED_API_KEY is configured
 */
async function fetchMeteredIceServers(apiKey, appDomain) {
  const now = Date.now();
  if (meteredCache.servers && meteredCache.expiresAt > now) {
    return meteredCache.servers;
  }

  try {
    const domain = appDomain || 'standard';
    const res = await fetch(`https://${domain}.metered.ca/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        meteredCache = {
          expiresAt: now + 30 * 60 * 1000, // 30 min cache
          servers: data
        };
        return data;
      }
    }
  } catch (err) {
    console.warn('[WebRTC] Metered TURN fetch failed, using fallback:', err.message);
  }
  return null;
}

/**
 * Generate time-limited TURN credentials using HMAC-SHA1 (coturn / RFC 5766 standard)
 */
function generateCoturnCredentials(secret, userSessionId = 'guest', durationSeconds = 86400) {
  const expiry = Math.floor(Date.now() / 1000) + durationSeconds;
  const username = `${expiry}:${userSessionId}`;
  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(username);
  const credential = hmac.digest('base64');
  return { username, credential };
}

/**
 * Returns complete RTCIceServer configuration
 */
export async function getIceServerConfig(sessionId) {
  const stunUrls = process.env.STUN_SERVERS
    ? process.env.STUN_SERVERS.split(',').map(s => s.trim()).filter(Boolean)
    : DEFAULT_STUN_SERVERS;

  const iceServers = [
    { urls: stunUrls }
  ];

  // 1. Check if Metered API key is set
  if (process.env.METERED_API_KEY) {
    const dynamicServers = await fetchMeteredIceServers(
      process.env.METERED_API_KEY,
      process.env.METERED_APP_DOMAIN
    );
    if (dynamicServers && dynamicServers.length > 0) {
      iceServers.push(...dynamicServers);
      return {
        iceServers,
        iceCandidatePoolSize: 10
      };
    }
  }

  // 2. Check if custom TURN server credentials are provided in .env
  const turnUrls = process.env.TURN_URLS || process.env.TURN_URL;
  if (turnUrls) {
    const urls = turnUrls.split(',').map(u => u.trim()).filter(Boolean);
    let username = process.env.TURN_USERNAME;
    let credential = process.env.TURN_CREDENTIAL;

    // Coturn REST API HMAC secret mode
    if (process.env.TURN_SECRET) {
      const generated = generateCoturnCredentials(process.env.TURN_SECRET, sessionId);
      username = generated.username;
      credential = generated.credential;
    }

    if (urls.length > 0 && username && credential) {
      iceServers.push({
        urls,
        username,
        credential
      });
      return {
        iceServers,
        iceCandidatePoolSize: 10
      };
    }
  }

  // 3. Fallback to OpenRelay TURN servers
  iceServers.push(...FALLBACK_TURN_SERVERS);

  return {
    iceServers,
    iceCandidatePoolSize: 10
  };
}

