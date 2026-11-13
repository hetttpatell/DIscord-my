# Changelog & Quality Assurance Guide

All notable improvements and architectural hardening applied to **afterspot** (TogetherTune).

---

## Changes by Phase

### Phase 1: Track-End Race Mitigation
- **Files Modified**: `server.js`, `src/components/YouTubePlayer.jsx`, `src/components/CommonScreen.jsx`
- **Changes**:
  - Assigned unique `entryId = crypto.randomUUID()` to every queue item upon addition (`queue:add`, `player:set-track`, `queue:play-now`, `advanceQueue`).
  - Added strict payload verification in `advanceQueue`: server drops requests unless `payload.entryId === room.currentTrack?.entryId`.
  - Added `lastEndedEntryIdRef` guard in `YouTubePlayer.jsx` ensuring `player:track-end` and `player:skip` fire at most once per `entryId`.
  - Passed `{ entryId: currentTrack?.entryId }` from `CommonScreen.jsx` during manual skips.

### Phase 2: Permanent YouTube DOM Mounting
- **Files Modified**: `src/components/VideoCallGrid.jsx`, `src/components/CommonScreen.jsx`
- **Changes**:
  - Removed conditional mounting branches around `{children}` in `VideoCallGrid.jsx`; rendered `{children}` exactly once at a persistent position in the JSX tree.
  - Implemented CSS-only layout transitions: full stage container in theater mode (`w-full h-full relative`) and fixed mini-dock (`fixed bottom-20 right-4 z-40 w-48 sm:w-64 md:w-72 aspect-video rounded-xl shadow-2xl border border-[#3c4043] bg-black`) in grid, spotlight, and screen-share modes.
  - In `CommonScreen.jsx`, mounted `<YouTubePlayer>` unconditionally, applying `w-[1px] h-[1px] opacity-0 overflow-hidden pointer-events-none absolute` when no track is loaded to avoid unmounting or reparenting the iframe.

### Phase 3: Persistent Remote Audio Layer
- **Files Modified**: `src/components/RemoteAudioLayer.jsx` (New), `src/components/CommonScreen.jsx`, `src/components/VideoTile.jsx`, `src/components/VideoCallGrid.jsx`, `src/services/livekitService.js`, `src/components/MeetingLobby.jsx`, `src/components/JoinCreateModal.jsx`
- **Changes**:
  - Created standalone `RemoteAudioLayer` component outside `VideoCallGrid`, rendering dedicated `<audio autoPlay playsInline>` elements per remote participant in a fixed offscreen container (`w-[1px] h-[1px] opacity-0 pointer-events-none`).
  - Removed all audio playback elements from `VideoTile.jsx` and enforced `muted={true}` on all `<video>` tags to eliminate duplicate playback and autoplay blocks during layout toggles.
  - Added `AudioUnlockBanner` with one-time `pointerdown` recovery on browser autoplay rejection.
  - Added user gesture hooks `peerConnectionService.unlockAudio()` and `livekitService.startAudio()` on Join/Create buttons; handled LiveKit `RoomEvent.AudioPlaybackStatusChanged`.

### Phase 4: Environment & Startup Hygiene
- **Files Modified**: `.env`, `.gitignore`, `server.js`
- **Changes**:
  - Corrected malformed orphan assignment line in `.env` (`BACKEND_URL=`).
  - Verified `.env` is tracked in `.gitignore`.
  - Added non-sensitive startup diagnostics in `server.js` validating `PORT` and reporting active services (LiveKit SFU, TURN Relays, YouTube API) without exposing secret keys.
  - *Note*: External YouTube Data API key must be restricted via Google Cloud Console to authorized domains / IP ranges.

### Phase 5: LiveKit SFU as Primary Engine with Constrained WebRTC Mesh Fallback
- **Files Modified**: `src/services/livekitService.js`, `src/services/mediaService.js`, `src/hooks/useWebRTC.js`, `src/services/peerConnectionService.js`, `src/components/YouTubePlayer.jsx`, `.env.example`
- **Changes**:
  - Configured LiveKit room connection with `adaptiveStream: true`, `dynacast: true`, and default capture resolution of 640x360 @ 24 fps.
  - When LiveKit connects, bypassed instantiation of the native WebRTC mesh service in `useWebRTC.js`.
  - In native mesh fallback (`peerConnectionService.js`), restricted video publishing to maximum 4 peers (peers $\ge 4$ forced to audio-only) and capped sender bitrate to ~400 kbps via `RTCRtpSender.setParameters`.
  - Added automatic YouTube player quality downgrading (`player.setPlaybackQuality('medium')`) when $\ge 3$ active cameras are detected.
  - Documented `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` in `.env.example`.

### Phase 6: HTTPS & Reverse Proxy for Mobile LAN Testing
- **Files Modified**: `vite.config.js`, `src/services/socket.js`, `src/components/InsecureContextBanner.jsx`, `package.json`
- **Changes**:
  - Added `@vitejs/plugin-basic-ssl` to Vite dev server, configured `server.host: true`, and proxied `/socket.io` (with `ws: true`) and `/api` to backend `http://localhost:3001` to eliminate mixed-content errors on LAN devices.
  - Updated socket client `getBackendUrl()` in dev to connect same-origin (`window.location.origin`) through Vite reverse proxy; preserved production direct URL logic.
  - Updated `InsecureContextBanner.jsx` to check `window.isSecureContext` and recommend `cloudflared tunnel` as an alternative for mobile development.

### Phase 7: Mobile Audio, Acoustic Echo Mitigation & Audio Ducking
- **Files Modified**: `src/services/mediaService.js`, `src/hooks/useLocalMedia.js`, `src/components/VideoCallGrid.jsx`, `src/components/YouTubePlayer.jsx`, `src/components/CallControls.jsx`
- **Changes**:
  - Enforced `echoCancellation: true`, `noiseSuppression: true`, and `autoGainControl: true` across all getUserMedia constraint tiers.
  - Configured `navigator.audioSession.type = 'play-and-record'` on iOS Safari to maintain balanced duplex audio during playback.
  - Added default muted state when a room track is actively playing upon user join.
  - Implemented automatic YouTube audio ducking: lowers music volume when any participant speaks (detected via local/remote RMS analyzers) and restores volume with a 600 ms release delay.
  - Added one-time dismissible desktop headphones advisory banner in `CallControls.jsx` triggered when no headphone output device is detected via `devicechange`.
  - *Platform Notice*: Mobile hardware acoustic echo cancellation varies across device chipsets. Audio ducking, AEC constraints, and muted-on-join provide software mitigation; headphones are still strongly recommended on mobile for complete echo elimination.

### Phase 8: Room State Persistence & Auto-Rejoin
- **Files Modified**: `server/roomStore.js` (New), `server.js`, `src/App.jsx`, `src/components/JoinCreateModal.jsx`, `.env.example`, `package.json`
- **Changes**:
  - Implemented `server/roomStore.js` with Redis support (via `ioredis`) and in-memory fallback if `REDIS_URL` is unset.
  - Debounced storage writes by 250 ms after room mutations (`player:play`, `pause`, `seek`, `set-track`, `queue:add`, `queue:play-now`, `queue:remove`, `advanceQueue`, `room:update-name`).
  - Configured 24-hour TTL (`EX 86400`) on persisted room state.
  - Rehydrated all stored rooms on server startup (`loadAllRooms()`).
  - Hashed room passwords using `scrypt` from `node:crypto` and verified with constant-time `crypto.timingSafeEqual`.
  - Updated client `App.jsx` and `JoinCreateModal.jsx` to store active session credentials and auto-rejoin/resume rooms seamlessly upon socket reconnection, surviving server restarts mid-song.

---

## Manual QA Verification Checklist

### 1. 4-Tab Queue Race Condition Test
- [ ] Open 4 browser tabs (Incognito or multiple browser profiles) and join the same room.
- [ ] Add 3 videos to the queue.
- [ ] Let Track 1 play to the end, or double-click "Skip Track" in quick succession in Tab 1.
- [ ] **Expected Result**: The queue advances exactly one track forward across all 4 tabs. No track is skipped twice, and all 4 tabs play the identical next song in sync.

### 2. Layout Switch Audio & Video Test
- [ ] Start playing a YouTube video in Theater Mode.
- [ ] Click the layout switcher in call controls to toggle between Theater Mode and Grid Mode.
- [ ] Toggle into Spotlight / Pinned mode and Screen Share mode.
- [ ] **Expected Result**:
  - YouTube video transitions into the fixed bottom-right mini-dock without stopping, reloading, buffering, or desyncing.
  - No iframe reload or YouTube unmount occurs.
  - Remote participants' audio remains clear and uninterrupted during all layout transitions.

### 3. iOS Safari & Android Chrome Audio Test
- [ ] Connect a mobile device (iPhone on Safari or Android on Chrome) to the dev server via HTTPS LAN IP or Cloudflare Tunnel.
- [ ] Join a room with an actively playing YouTube track.
- [ ] **Expected Result**:
  - Microphone starts muted by default to prevent instant feedback.
  - Unmuting microphone does not mute or crash YouTube playback.
  - On iOS Safari, `navigator.audioSession` prevents call audio from routing entirely to ear-speaker or muting media.
  - When a participant speaks, YouTube volume ducks smoothly and returns to normal 600 ms after speaking stops.

### 4. 6-User LiveKit SFU vs Mesh Test
- [ ] **LiveKit Path** (with `LIVEKIT_URL` set):
  - Join 6 participants. Verify adaptive stream dynacast and simulcast function with low CPU usage.
- [ ] **WebRTC Mesh Path** (without `LIVEKIT_URL`):
  - Join 6 participants in native WebRTC mesh.
  - Verify that the first 4 video peers publish video, and 5th/6th peers are capped to audio-only.
  - Verify bitrate is capped at ~400 kbps per sender.
  - Verify YouTube player quality switches to `medium` when 3+ cameras are active.

### 5. LAN HTTPS Dev Test
- [ ] Start dev server with `npm run dev`.
- [ ] Note HTTPS URL in terminal (e.g., `https://192.168.x.x:5173`).
- [ ] Navigate to the URL on a mobile device on the same local Wi-Fi.
- [ ] Accept self-signed certificate.
- [ ] **Expected Result**:
  - `window.isSecureContext` is `true`.
  - No mixed content errors (WebSocket and API calls are proxied over HTTPS/WSS through Vite).
  - Browser prompts for camera and microphone permissions normally.

### 6. Server Restart Mid-Song Test
- [ ] In a room with 2 or more clients, play a song to approximately 1:30.
- [ ] In the terminal running the server, stop the server process (`Ctrl+C`) and restart it (`npm start` or `node server.js`).
- [ ] **Expected Result**:
  - Clients detect socket disconnect and show reconnect state.
  - Within ~2 seconds after the server restarts, clients auto-rejoin the room using stored credentials.
  - Room name, host status, queue, and playback position (at ~1:30) resume automatically without manual re-entry.

