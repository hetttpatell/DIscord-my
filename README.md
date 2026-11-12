# afterspot 🎵 — Real-Time Shared Watch Party & Music Platform

**afterspot** is a modern Discord-inspired collaborative web platform that lets friends watch videos and listen to music together in real-time through private shared rooms. Every member in the room watches and listens on a synchronized stage, joins low-latency WebRTC voice and video calls, shares a collaborative queue, and can react and chat live.

---

## 🌟 Key Features

### 1. 👥 Private Rooms & Easy Invites
- **Create Rooms**: Set a custom Room Name, Host Name, custom Room ID (or auto-generated), and optional Password.
- **1-Click Invite Links**: Share `http://localhost:5173/?room=ROOM_ID` with friends. When they open the link, the Room ID is automatically populated.
- **Password Protection**: Restrict private rooms so only friends with the passcode can join.

### 2. 📺 Synchronized Common Screen
- **Real-Time Synchronization**: Play, pause, scrub, skip, or change songs—every action reflects instantly across all friends' screens.
- **Dual View Modes**:
  - **Vinyl Visualizer Mode**: Displays spinning vinyl record with album art, ambient aura, animated equalizer, track metadata, and who queued it.
  - **Video Stream Mode**: Full YouTube video player embed for synchronized watch parties.
- **Drift Correction**: Automatic background time-alignment ensures no listener falls behind.
- **Theater Fullscreen**: 1-click fullscreen mode for shared party screens.
- **Individual Volume Control**: Each friend controls their own volume and mute toggle locally without affecting others.

### 3. 🎶 Collaborative Queue System
- Any friend can search and add songs to the common room queue.
- Shows who added each track (e.g., *"Queued by Alex"*).
- Instant "Play Now" action and track removal.
- Automatic queue progression: when a track finishes, the room moves to the next queued song in sync.

### 4. 🔑 YouTube Search & API Key Guide
- **YouTube Data API v3**: Configure a free YouTube API key to search the entire YouTube catalog in real time.
- **Dedicated Setup Modal**: Includes a built-in step-by-step guide with links to Google Cloud Console and an instant **"Test Key"** validator.
- **Zero-Key Alternatives**:
  - **Direct Link / Video ID Paste**: Paste any YouTube link (e.g. `https://youtu.be/...`)—it fetches details and plays with 0 keys required.
  - **Curated Music**: Pre-loaded instant Lo-Fi, Synthwave, Chillhop, Pop, and Rock tracks ready to play immediately.

### 5. 💬 Social & DJ Controls
- **Live Floating Emoji Reactions**: Click 🔥, ❤️, 🎧, 🕺, 👏, 🚀 to send animated floating reactions that float across everyone's common screen!
- **Room Chat**: Real-time room messaging to discuss tracks.
- **DJ Mode**: Host can toggle "Host DJ Mode" to restrict play/pause/skip controls exclusively to the host.
- **Active Friends List**: Color-coded member avatars with host crown indicators.

---

## 🚀 Getting Started

### 1. Start Development Server
Both the backend WebSocket synchronization server and Vite frontend run simultaneously:
```bash
npm run dev
```
- **Frontend**: [http://localhost:5173](http://localhost:5173)
- **Backend API & WebSockets**: [http://localhost:3001](http://localhost:3001)

### 2. How to Test Multi-User Listening Locally
1. Open [http://localhost:5173](http://localhost:5173) in your primary browser window.
2. Click **"Create Room"**, choose a nickname (e.g., *Alex*), and click **Create Room**.
3. Click the **"Invite Friends"** button in the top navigation bar to copy the room link.
4. Open an Incognito / Private window (or a different browser) and paste the link.
5. Enter a friend's nickname (e.g., *Sam*) and click **Join Shared Room**.
6. Play, pause, scrub, add songs, or send reactions in either window—notice how both screens stay synchronized in real time!

---

## 🔑 How to Get a Free YouTube API Key
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `TogetherTune`).
3. In **APIs & Services > Library**, search for **YouTube Data API v3** and click **Enable**.
4. In **APIs & Services > Credentials**, click **+ Create Credentials > API Key**.
5. Copy your key, open TogetherTune, click **YouTube API** in the header, paste it, and click **Test Key** & **Save**!
