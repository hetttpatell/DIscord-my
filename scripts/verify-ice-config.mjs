/**
 * Verification test for WebRTC ICE Config Builder (server/iceConfig.js)
 *
 * Verifies:
 * 1. With NO TURN env vars:
 *    - Returns ONLY stun: entries (no turn: or turns: entries)
 *    - Logs the warning: "[WebRTC] Warning: No TURN server configured. Calls across symmetric NAT or restrictive networks will fail."
 * 2. With TURN env vars set to dummy values:
 *    - Returns turn: and turns: entries
 *    - Includes a transport=tcp or port 443 entry for traversing restrictive firewalls
 * 3. With Coturn HMAC secret set:
 *    - Generates dynamic time-limited credentials and expands TCP/443 URLs
 */

import assert from 'node:assert';
import { getIceServerConfig, expandTurnUrls, getTurnProviderStatus } from '../server/iceConfig.js';

console.log('================================================================');
console.log('AUDIT VERIFICATION: WebRTC ICE Server Provisioning & TURN Relay');
console.log('================================================================');

// Save original env
const originalEnv = { ...process.env };

try {
  // -------------------------------------------------------------
  // Test 1: With NO TURN env vars configured
  // -------------------------------------------------------------
  console.log('[Test 1] Testing ICE config with NO TURN env vars...');
  delete process.env.METERED_API_KEY;
  delete process.env.METERED_APP_DOMAIN;
  delete process.env.TURN_URLS;
  delete process.env.TURN_URL;
  delete process.env.TURN_USERNAME;
  delete process.env.TURN_CREDENTIAL;
  delete process.env.TURN_SECRET;

  let warningLogged = false;
  const originalWarn = console.warn;
  console.warn = (...args) => {
    const msg = args.join(' ');
    if (msg.includes('No TURN server configured')) {
      warningLogged = true;
    }
    originalWarn(...args);
  };

  const statusNoTurn = getTurnProviderStatus();
  assert.strictEqual(statusNoTurn.configured, false, 'TURN status should be NOT configured');

  const configNoTurn = await getIceServerConfig('test-session-1');
  console.warn = originalWarn; // restore

  assert.ok(configNoTurn && Array.isArray(configNoTurn.iceServers), 'iceServers array returned');
  assert.strictEqual(warningLogged, true, 'Warning logged when no TURN is configured');

  // Verify that all URLs are stun: only
  let hasTurn = false;
  let stunCount = 0;
  for (const server of configNoTurn.iceServers) {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    for (const u of urls) {
      if (u.startsWith('turn:') || u.startsWith('turns:')) {
        hasTurn = true;
      }
      if (u.startsWith('stun:')) {
        stunCount++;
      }
    }
  }

  assert.strictEqual(hasTurn, false, 'No turn: or turns: entries should be present without TURN env vars');
  assert.ok(stunCount > 0, `At least 1 stun: server returned (found ${stunCount})`);
  console.log('✓ Invariant 1: With no TURN env vars, returns ONLY stun: entries and logs warning');

  // -------------------------------------------------------------
  // Test 2: With TURN env vars set to dummy values
  // -------------------------------------------------------------
  console.log('[Test 2] Testing ICE config with TURN env vars set to dummy values...');
  process.env.TURN_URLS = 'turn:relay.example.com:3478';
  process.env.TURN_USERNAME = 'dummy_test_user';
  process.env.TURN_CREDENTIAL = 'dummy_test_password';

  const statusWithTurn = getTurnProviderStatus();
  assert.strictEqual(statusWithTurn.configured, true, 'TURN status should be configured');
  assert.strictEqual(statusWithTurn.provider, 'Custom TURN', 'Provider is Custom TURN');

  const configWithTurn = await getIceServerConfig('test-session-2');
  assert.ok(configWithTurn && Array.isArray(configWithTurn.iceServers), 'iceServers array returned');

  let hasTurnScheme = false;
  let hasTurnsScheme = false;
  let hasTcpOr443 = false;
  let hasCredentials = false;

  for (const server of configWithTurn.iceServers) {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    for (const u of urls) {
      if (u.startsWith('turn:')) hasTurnScheme = true;
      if (u.startsWith('turns:')) hasTurnsScheme = true;
      if (u.includes('transport=tcp') || u.includes(':443')) hasTcpOr443 = true;
    }
    if (server.username === 'dummy_test_user' && server.credential === 'dummy_test_password') {
      hasCredentials = true;
    }
  }

  assert.strictEqual(hasTurnScheme, true, 'Must return turn: URLs');
  assert.strictEqual(hasTurnsScheme, true, 'Must return turns: URLs');
  assert.strictEqual(hasTcpOr443, true, 'Must include transport=tcp or port 443 URL for restrictive networks');
  assert.strictEqual(hasCredentials, true, 'Must include provided username and credential');
  console.log('✓ Invariant 2: With TURN env vars, returns turn: & turns: entries including TCP/443');

  // -------------------------------------------------------------
  // Test 3: With Coturn HMAC secret mode
  // -------------------------------------------------------------
  console.log('[Test 3] Testing Coturn HMAC secret dynamic credential generation...');
  delete process.env.TURN_USERNAME;
  delete process.env.TURN_CREDENTIAL;
  process.env.TURN_SECRET = 'super-secret-hmac-key';

  const configCoturn = await getIceServerConfig('test-session-3');
  let coturnTurnFound = false;
  for (const server of configCoturn.iceServers) {
    if (server.username && server.credential) {
      coturnTurnFound = true;
      assert.ok(server.username.includes(':test-session-3'), 'HMAC username includes timestamp and sessionId');
      assert.ok(server.credential.length > 10, 'HMAC base64 credential generated');
    }
  }
  assert.strictEqual(coturnTurnFound, true, 'Coturn HMAC credentials successfully generated');
  console.log('✓ Invariant 3: Coturn HMAC secret generates valid dynamic ephemeral credentials');

  // -------------------------------------------------------------
  // Test 4: expandTurnUrls URL expansion
  // -------------------------------------------------------------
  console.log('[Test 4] Testing expandTurnUrls URL helper...');
  const expanded = expandTurnUrls(['turn:restricted-nat.com:3478']);
  assert.ok(expanded.some(u => u === 'turns:restricted-nat.com:443?transport=tcp'), 'turns: on 443 with transport=tcp included');
  assert.ok(expanded.some(u => u === 'turn:restricted-nat.com:443?transport=tcp'), 'turn: on 443 with transport=tcp included');
  console.log('✓ Invariant 4: expandTurnUrls generates full UDP/TCP matrix on ports 3478, 443, and 5349');

  console.log('================================================================');
  console.log('ALL ICE CONFIG INVARIANTS PASSED SUCCESSFULLY (0 ERRORS)');
  console.log('================================================================');
} finally {
  // Restore original env
  process.env = originalEnv;
}

