# afterspot 🎵

> **Listen together. In sync. On mic. That's it.**

**afterspot** is a lean, real-time shared listening platform where members watch YouTube in sync while talking over low-latency, mic-only voice communication.

---

## 🌟 The Product

1. **Shared YouTube Stage & Up Next Queue**
   - Search the YouTube catalog with rate-limited server caching and embeddability filters (`videoEmbeddable=true`, `videoSyndicated=true`).
   - Paste any YouTube URL (`youtube.com/watch?v=...`, `youtu.be/...`, `music.youtube.com/...`, shorts) for zero-search-quota direct resolution.
   - Synchronized playback across all room members with automatic drift correction.
   - Persistent iframe architecture: the YouTube player remains mounted once in the DOM tree and never unmounts, reparents, or hides via `display: none` when navigating sheets or queues.
   - Autoplay protection: handles mobile browser autoplay blocks with an initial tap gate and a responsive "Tap to play" fallback overlay.
   - Idempotent queue progression: skip and track-end events use unique `entryId` markers to prevent double-skips under concurrent network requests.
   - Automatic skipping of unplayable videos (player error codes 2, 5, 100, 101, 150) with room toast notifications.

2. **PeerJS 1-to-1 Voice Calling**
   - High-quality audio-only communication (echo cancellation, noise suppression, automatic gain control).
   - Powered by PeerJS with dynamic STUN/TURN ICE configuration via backend API.
   - Comprehensive call lifecycle: initiate, incoming alert, accept, decline, soft-mute/unmute, and end call.
   - Real-time speaking indicators and persistent audio elements.
   - Automatic music ducking: lowers YouTube player volume to 30% after 250ms of sustained remote speech, restoring volume after 600ms of silence (bypassed on iOS where volume is hardware-restricted).
   - Dual volume sliders for independent "Music" and "Voices" balance.

3. **Secure Room Access & Resilience**
   - 6-character room codes generated from an unambiguous alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`).
   - Constant-time `scrypt` password hashing and verification.
   - Shareable invite links (`https://afterspot.vercel.app/?room=<ROOM_ID>`) containing only the Room ID—passwords are never embedded in URLs.
   - Rate limiting: maximum 5 failed password attempts per 10 minutes per client.
   - Maximum capacity of 12 members per room.
   - Per-tab client identity and SHA-256 hashed resume tokens for seamless auto-rejoin across page reloads and server restarts.
   - Redis persistence with automatic in-memory fallback.

---

## 🛠 Tech Stack

- **Frontend**: React 19, Vite 8, Tailwind CSS v4, Lucide Icons.
- **Backend**: Node.js, Express 5, Socket.IO 4, ioredis.
- **Voice Engine**: PeerJS (`peerjs`) + Native WebRTC + Dynamic STUN/TURN Relays.
- **Tooling**: Oxlint, Node Test Runner (`node:test`).

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` to configure your environment. **Never commit `.env` or expose API keys.**

| Variable | Description |
| :--- | :--- |
| `PORT` | Local backend server port (default: 3001). |
| `VITE_BACKEND_URL` | Production backend URL for frontend requests. |
| `YOUTUBE_API_KEY` | Google YouTube Data API v3 key for catalog search. |
| `STUN_SERVERS` | Comma-separated list of custom STUN servers. |
| `METERED_API_KEY` | Optional Metered.ca TURN relay API key. |
| `METERED_APP_DOMAIN` | Optional Metered.ca app domain. |
| `TURN_URLS` | Comma-separated custom TURN relay URLs. |
| `TURN_USERNAME` | Custom TURN username. |
| `TURN_CREDENTIAL` | Custom TURN password/credential. |
| `TURN_SECRET` | Coturn RFC 5766 HMAC-SHA1 shared secret. |
| `REDIS_URL` | Optional Redis connection string for persistent room state. |

---

## 🚀 Development & Testing

### Installation
```bash
npm install
```

### Run Locally (Client + Server)
```bash
npm run dev
```
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

### Run Linting
```bash
npm run lint
```

### Run Build
```bash
npm run build
```

### Run Automated Unit Tests
```bash
npm test
```
Runs tests covering room model, password verification, rate limiting, token resumption, YouTube URL extraction, search caching, error mapping, and voice participant store.
