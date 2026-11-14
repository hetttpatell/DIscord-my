# Changelog & Quality Assurance Guide

All notable improvements, architectural simplifications, and redesigns applied to **afterspot**.

---

## Redesign & Radical Simplification (Phases 0 – 6)

### Phase 0: Audit & Deprecation Mapping
- Identified and cataloged all legacy components, services, and socket events outside the new 3-pillar product definition (Shared YouTube Stage, Voice Mic, and Secure Room Access).
- Marked 21 legacy components, layouts, assets, and tests for immediate teardown.
- Outlined end-to-end mobile touch requirements, URL resolution paths, and embeddability constraints for YouTube playback.

### Phase 1: Teardown & Scope Elimination
- **Deleted Front-End Components**: `ApiKeyModal.jsx`, `CallControls.jsx`, `CommonScreen.jsx`, `JoinCreateModal.jsx`, `KeyboardShortcutsModal.jsx`, `MeetingLobby.jsx`, `MeetingSettingsModal.jsx`, `MeetingSidePanel.jsx`, `MeetingToasts.jsx`, `MembersAndChat.jsx`, `Navbar.jsx`, `QueuePanel.jsx`, `SearchModal.jsx`, `VideoCallGrid.jsx`, `VideoTile.jsx`, `computeLayout.js`, `computeLayout.test.js`, `App.css`, and legacy image assets.
- **Removed Dead Socket Events in `server.js`**: Stripped `chat:*`, `reaction:*`, `participant:hand-raise`, `room:approve-*`, `room:reject-user`, `host:*`, `settings:update`, and WebRTC video track signaling.
- **Pure Audio Media Services**: Reduced `mediaService.js`, `mediaController.js`, `useLocalMedia.js`, `peerConnectionService.js`, `livekitService.js`, and `useWebRTC.js` strictly to audio constraints and transceivers (`video: false`).
- **Dependencies**: Uninstalled unused `canvas-confetti` package. Cleaned `.env.example`.

### Phase 2: Room Model & Access Hardening
- **6-Character IDs**: Implemented `generateRoomId()` using unambiguous alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
- **Password Protection**: Mandatory password verification using `node:crypto` `scrypt` hashing with constant-time `crypto.timingSafeEqual`.
- **Rate Limiting**: Enforced rate limit of 5 failed password attempts per 10 minutes per client per room, returning wait-time calculations.
- **Room Capacity**: Enforced 12-member maximum capacity per room.
- **Per-Tab Identity & Token Resumption**: Implemented tab-scoped client IDs via `sessionStorage` and random cryptographic SHA-256 `resumeToken`s for zero-interruption reconnection across page reloads and server restarts.
- **Invite Security**: "Copy Invite" exports `https://afterspot.vercel.app/?room=<ID>` without password; "Copy Password" is restricted to the host.
- **Storage**: Sanitized public room serialization preventing password/token leakage to clients or logs.

### Phase 3: Synchronized YouTube Player & Mobile Touch Fixes
- **Mobile Autoplay Handling**: Added entry "Tap to start listening" activation gate and 2.5-second fallback overlay ("Tap to play") when background autoplay is rejected.
- **Embeddability Filters**: Added `videoEmbeddable=true` and `videoSyndicated=true` to YouTube Data API queries; handled YouTube player error codes `2`, `5`, `100`, `101`, and `150` via idempotent auto-skip with room toast notifications.
- **Mobile Touch UI**: Built `YouTubeSearchSheet.jsx` with `visualViewport` dynamic height (`dvh`), outside-pointerdown dismissal (no input blur dropouts), 16px minimum font size (preventing iOS auto-zoom), and ≥56px row touch targets.
- **Quota & URL Paste Support**: Integrated server-side 10-minute query caching, 15 searches/min client rate limiting, and zero-quota direct URL extraction for `youtube.com`, `youtu.be`, `music.youtube.com`, and YouTube shorts.
- **Idempotent Queue Synchronization**: Synchronized queue progression via `entryId` verification on server and client, eliminating duplicate-skip race conditions.

### Phase 4: Voice Engine (Audio-Only)
- **Engine Priority**: LiveKit SFU as primary engine with automatic fallback to native WebRTC mesh with STUN/TURN relays.
- **Microphone Gesture Lifecycle**: Mic starts OFF by default; acquired via user gesture on first unmute (`echoCancellation`, `noiseSuppression`, `autoGainControl`). Unmute/mute operates via `track.enabled` without renegotiation.
- **Persistent Audio Layer**: Dedicated `<audio>` elements mounted once in offscreen DOM tree (`RemoteAudioLayer.jsx`) with volume synchronization.
- **Acoustic Ducking**: YouTube player volume drops to 30% when remote speech is sustained for 250ms, with 600ms release delay (bypassed on iOS).
- **Controls & Guidance**: Created `MembersStrip.jsx` with live speaking pulse ring, `AudioControls.jsx` dual sliders ("Music" and "Voices"), `MicPermissionModal.jsx` for browser-specific permission resolution, and dismissible `HeadphoneTip.jsx`.

### Phase 5: UI Redesign & Aesthetic Polish
- **Design Tokens**: Applied warm dark palette (`#0B0B10` background, `#141419` surface, `#1C1C24` stroke, `#F4F1EA` high-contrast text, `#9A978F` secondary text, `#FF9F1C` to `#FF5A5F` gradient accents, `#2EC4B6` emerald indicators).
- **Typography**: Integrated `Bricolage Grotesque` for display/room codes and `Inter` for clean body typography.
- **Landing Screen**: Distraction-free access card with "Join" / "Create" tabs and automatic invite URL parameter recognition.
- **Room Interface**: Sticky `RoomTopBar`, centered 16:9 responsive YouTube stage with `PlaybackOverlay`, `MembersStrip`, and docked `VoiceActionBar`.
- **Permanent Mount**: Ensured `<YouTubePlayer>` is mounted exactly once in a fixed position, changing only positioning and CSS classes to preserve playback across sheet and drawer transitions.

### Phase 6: Verification, Cleanup & QA
- **Zero Warnings/Errors**: Oxlint clean (0 warnings, 0 errors), Vite production build clean, 21 unit tests passing across all test suites.
- **Deleted Feature Purge**: Removed all dead code, unused socket events, unused variables, and deprecated feature references.
- **Documentation**: Overhauled `README.md` and `CHANGELOG.md` with up-to-date specifications and manual verification checklists.

### Phase 7: Voice Calling Overhaul with PeerJS
- **Dependency Migration**: Removed `livekit-client` and `livekit-server-sdk`. Installed `peerjs`. Removed `src/services/livekitService.js`, `src/services/peerConnectionService.js`, and `src/hooks/useWebRTC.js`.
- **PeerJS Service (`src/services/peerService.js`)**: Implemented unified 1-to-1 voice calling service utilizing PeerJS with dynamic backend STUN/TURN ICE configuration (`/api/webrtc/ice-config`).
- **Call Controls & States**: Complete support for `idle`, `calling`, `ringing`, `connected`, `disconnected`, and `error` states. Full call actions: Start call, Accept call, Reject call, Soft-mute/unmute, and End call.
- **Microphone & Permission Handling**: W3C-standard audio constraints (`echoCancellation`, `noiseSuppression`, `autoGainControl`) with fallback to `{ audio: true }`. Informative `MicPermissionModal` for user permission resolution.
- **Audio Routing & Speech Ducking**: Dual Web Audio API `AudioContext` GainNode routing + background HTML `<audio>` elements for reliable playback across mobile Safari & Android Chrome. Web Audio `AnalyserNode` drives real-time speech detection and automated YouTube music ducking.
- **UI Components**:
  - `CallModal.jsx`: Prominent mobile-first dialog for incoming (Accept/Decline) and outgoing (Cancel) calls with caller avatars and ambient glows.
  - `VoiceActionBar.jsx`: Displays call status, elapsed call duration timer, speaking waveforms, instant mute/unmute, and dedicated End Call button.
  - `MembersStrip.jsx`: Inline Call and End Call controls on member chips with active call partner indicators.
- **Verification**: 27/27 automated unit tests passing (`peerService.test.js`, `participantsStore.test.js`, `roomModel.test.js`, `youtubeSearch.test.js`), 0 lint warnings/errors, clean Vite build.
