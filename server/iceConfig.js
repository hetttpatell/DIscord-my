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
 * Helper to ensure TURN config includes both UDP and TCP/443 options (including turns:)
 * for traversal across restrictive firewalls and corporate NATs.
 */
export function expandTurnUrls(urls) {
  if (!urls || urls.length === 0) return [];
  const result = new Set();
  const hosts = new Set();

  for (const rawUrl of urls) {
    if (!rawUrl) continue;
    result.add(rawUrl);
    // Parse host e.g. turn:turn.example.com:3478?transport=udp
    const match = rawUrl.match(/^(?:turns?):([^:?]+)(?::(\d+))?/i);
    if (match) {
      hosts.add(match[1]);
    }
  }

  // Ensure TCP 443 and turns: are included so calls work on restrictive networks
  for (const host of hosts) {
    result.add(`turn:${host}:3478?transport=udp`);
    result.add(`turn:${host}:3478?transport=tcp`);
    result.add(`turn:${host}:443?transport=tcp`);
    result.add(`turns:${host}:443?transport=tcp`);
    result.add(`turns:${host}:5349?transport=tcp`);
  }

  return Array.from(result);
}

/**
 * Check TURN configuration status without exposing credentials
 */
export function getTurnProviderStatus() {
  if (process.env.METERED_API_KEY) {
    return { configured: true, provider: 'Metered.ca' };
  }
  const turnUrls = process.env.TURN_URLS || process.env.TURN_URL;
  if (turnUrls && (process.env.TURN_SECRET || (process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL))) {
    const provider = process.env.TURN_SECRET ? 'Custom Coturn HMAC' : 'Custom TURN';
    return { configured: true, provider };
  }
  return { configured: false, provider: null };
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
    const parsedUrls = turnUrls.split(',').map(u => u.trim()).filter(Boolean);
    let username = process.env.TURN_USERNAME;
    let credential = process.env.TURN_CREDENTIAL;

    // Coturn REST API HMAC secret mode
    if (process.env.TURN_SECRET) {
      const generated = generateCoturnCredentials(process.env.TURN_SECRET, sessionId);
      username = generated.username;
      credential = generated.credential;
    }

    if (parsedUrls.length > 0 && username && credential) {
      const urls = expandTurnUrls(parsedUrls);
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

  // 3. No TURN provider configured
  console.warn('[WebRTC] Warning: No TURN server configured. Calls across symmetric NAT or restrictive networks will fail.');

  return {
    iceServers,
    iceCandidatePoolSize: 10
  };
}

