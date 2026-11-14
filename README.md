# afterspot

> **Listen together. In sync. On mic. That's it.**

Mobile-first, lounge-style synchronized YouTube player and mic-only audio lounge built with React 19, LiveKit, Socket.IO, and Express.

---

## 🏗️ Architecture

```
                                  +-----------------------+
                                  |   Browser Clients     |
                                  | (React + Vite + Vaul) |
                                  +-----------+-----------+
                                              |
                   +--------------------------+--------------------------+
                   | HTTP REST                | Socket.IO (WebSockets)   | LiveKit WebRTC (WSS)
                   v                          v                          v
          +-----------------+        +-----------------+        +-----------------+
          | Express API     |        | Authoritative   |        | LiveKit Cloud   |
          | - Rooms (scrypt)|        | Room State &    |        | Mesh/SFU Voice  |
          | - YouTube Search|        | Sync Engine     |        | (Mic only)      |
          | - LiveKit Tokens|        | (Drift < 1.5s)  |        |                 |
          +--------+--------+        +--------+--------+        +-----------------+
                   |                          |
                   +------------+-------------+
                                |
                                v
                     +---------------------+
                     | Room Store Engine   |
                     | - In-Memory Map     |
                     | - Redis (Optional)  |
                     +---------------------+
```

### Components
1. **Room Engine & Security**:
   - Rooms created and joined via Room ID + Password + Display Name.
   - Passwords hashed with Node crypto `scrypt` and a per-room random salt; verified via `crypto.timingSafeEqual`.
   - Signed HMAC-SHA256 session tokens with 12-hour expiry.
   - Max 20 participants per room; rooms expire 24h after the last member leaves.
   - Strict rate limiting: 10 room requests/min per IP, 30 socket events/5s per socket.

2. **Synchronized YouTube Screen**:
   - Authoritative state on the server: `{ videoId, status, positionSec, serverUpdatedAtMs }`.
   - 3-sample ping median server clock offset calibration on connect.
   - Client derives expected position while playing and auto-compensates drift only when exceeding 1.5s.
   - Custom player controls with smooth scrubbing, volume slider, and mobile autoplay gesture unlock overlay.

3. **YouTube Search**:
   - `GET /api/search?q=...` calls YouTube Data API v3 (`search.list` & `videos.list`).
   - Cached in server-side `lru-cache` for 10 minutes; rate limited to 30 requests/min per member.
   - Debounced search input (350ms) using TanStack Query.
   - Mobile-first Vaul bottom-sheet drawer with 16px font-size (prevents iOS auto-zoom), dvh units, overscroll containment, and accessible 44px tap targets.

4. **Mic-Only Audio Lounge (LiveKit)**:
   - LiveKit SFU audio chat (<LiveKitRoom>, `<RoomAudioRenderer />`).
   - Muted by default on entry; microphone toggle activates strictly on user tap (`useTrackToggle`).
   - Native error handling for permission denial with platform-specific instructions (Android Chrome, iOS Safari, desktop).
   - Screen wake lock maintained while active in room.
   - Participant list with live speaking indicator (`useIsSpeaking`) and connection quality indicator.

---

## ⚙️ Environment Variables

### Server (`server/.env.example`)
| Variable | Description | Example |
| :--- | :--- | :--- |
| `PORT` | Port for the Express server to listen on | `3001` |
| `CLIENT_ORIGIN` | Allowed client origin for CORS and security headers | `http://localhost:5174` |
| `SESSION_SECRET` | Secret key used to sign and verify HMAC session tokens (min 32 chars) | `your_long_session_secret_32_characters` |
| `LIVEKIT_URL` | WebSocket URL for LiveKit Cloud or self-hosted instance | `wss://your-project.livekit.cloud` |
| `LIVEKIT_API_KEY` | LiveKit API key for room operations and authentication | `your_livekit_api_key` |
| `LIVEKIT_API_SECRET` | LiveKit API secret for signing access tokens | `your_livekit_api_secret` |
| `YOUTUBE_API_KEY` | Google YouTube Data API v3 key for searching videos | `AIzaSy...` |
| `REDIS_URL` | *(Optional)* Redis connection URL for multi-node clustering and persistence | `redis://localhost:6379` |

### Client (`.env.example`)
| Variable | Description | Example |
| :--- | :--- | :--- |
| `VITE_API_URL` | Backend API base URL (Socket.IO connects to the same origin) | `http://localhost:3001` |

---

## 🎙️ LiveKit Setup Guide

To enable live voice chat between participants:
1. Visit [LiveKit Cloud](https://cloud.livekit.io/) and sign up for a free account.
2. Click **Create Project** (e.g. `afterspot-lounge`).
3. In your project dashboard, navigate to **Settings** → **Keys**.
4. Click **Generate Key**. You will receive:
   - **WebSocket URL** (`wss://your-project.livekit.cloud`)
   - **API Key**
   - **API Secret**
5. Paste these three values into your `.env` file:
   ```env
   LIVEKIT_URL=wss://your-project.livekit.cloud
   LIVEKIT_API_KEY=your_key_here
   LIVEKIT_API_SECRET=your_secret_here
   ```
6. Restart the server. Voice chat is now live with automatic NAT traversal and global relay!

---

## 🚀 Local Development

1. **Clone and install dependencies**:
   ```bash
   git clone <repo-url>
   cd US
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Add your YouTube API Key and LiveKit credentials to .env
   ```

3. **Start development servers**:
   ```bash
   npm run dev
   ```
   - Frontend: `http://localhost:5174`
   - Backend: `http://localhost:3001`

---

## 🧪 Testing

```bash
# Run code linter
npm run lint

# Run all unit and integration tests (Vitest)
npm test

# Run Playwright end-to-end tests (Desktop & Mobile)
npm run test:e2e

# Build for production
npm run build
```

---

## 🚢 Deployment

### Frontend (Vercel)
1. Push your repository to GitHub.
2. In Vercel, import the project.
3. Set **Framework Preset** to `Vite`.
4. Configure Environment Variable:
   - `VITE_API_URL`: Your deployed backend URL (e.g. `https://afterspot-api.onrender.com`).
5. Deploy.

### Backend (Render / Railway / Fly.io)
> ⚠️ **HTTPS & WebSocket support are strictly required.**
1. Create a Web Service pointing to this repository.
2. Set Build Command: `npm install`
3. Set Start Command: `node server.js`
4. Configure Environment Variables:
   - `PORT`: `3001` (or provided by platform)
   - `CLIENT_ORIGIN`: Your frontend URL (e.g. `https://afterspot.vercel.app`)
   - `SESSION_SECRET`: Random 32+ character string
   - `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`: From LiveKit dashboard
   - `YOUTUBE_API_KEY`: From Google Cloud Console
   - `REDIS_URL`: *(Optional)* Your managed Redis URL
5. Health Check Path: `/healthz`
