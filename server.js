import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AccessToken } from 'livekit-server-sdk';
import { getIceServerConfig, getTurnProviderStatus } from './server/iceConfig.js';
import { roomStore, hashPassword, verifyPassword } from './server/roomStore.js';
import { advanceQueue } from './server/queue.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

// In-memory store for rooms
// Key: roomId, Value: Room object
const rooms = new Map();

// Rehydrate stored rooms on boot from persistent storage (Redis or in-memory fallback)
try {
  const storedRooms = await roomStore.loadAllRooms();
  for (const [id, r] of storedRooms) {
    rooms.set(id, r);
  }
  if (storedRooms.size > 0) {
    console.log(`[RoomStore] Rehydrated ${storedRooms.size} room(s) from persistent storage.`);
  }
} catch (err) {
  console.warn('[RoomStore] Room rehydration failed:', err.message);
}

// Helper to generate a random avatar color
const AVATAR_COLORS = [
  '#2e5bff', '#10b981', '#f59e0b', '#ec4899', 
  '#8b5cf6', '#06b6d4', '#ef4444', '#3b82f6'
];

function getRandomColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

// Server-issued random resume tokens (stored as SHA-256 hash server-side with room)
function generateResumeToken() {
  const token = crypto.randomBytes(24).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

function verifyResumeToken(token, expectedHash) {
  if (!token || !expectedHash) return false;
  try {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const hashBuf = Buffer.from(hash, 'hex');
    const expBuf = Buffer.from(expectedHash, 'hex');
    if (hashBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, expBuf);
  } catch {
    return false;
  }
}

function isHostUser(room, socketId, user) {
  if (!room) return false;
  if (room.hostSocketId === socketId) return true;
  if (user && user.clientId && room.hostId === user.clientId) return true;
  return false;
}

// Compute accurate real-time position of current playback
function getRoomCurrentTime(room) {
  if (!room.currentTrack) return 0;
  if (!room.isPlaying) return room.playbackPosition;
  const elapsed = (Date.now() - room.lastStateChangeTime) / 1000;
  return room.playbackPosition + elapsed;
}

// REST Endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    activeRooms: rooms.size,
    hasApiKey: Boolean(process.env.YOUTUBE_API_KEY)
  });
});

// Dynamic STUN/TURN ICE Servers configuration endpoint for WebRTC
app.get('/api/webrtc/ice-servers', async (req, res) => {
  try {
    const sessionId = req.query.sessionId || 'guest';
    const config = await getIceServerConfig(sessionId);
    res.json(config);
  } catch (err) {
    console.error('Failed to get ICE servers:', err);
    res.status(500).json({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    });
  }
});

// LiveKit SFU Access Token Endpoint (Generates short-lived JWT token)
app.post('/api/livekit/token', async (req, res) => {
  const { roomId, userName, sessionId } = req.body || {};

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !livekitUrl) {
    return res.json({
      enabled: false,
      reason: 'missing credentials',
      message: 'LiveKit server credentials not configured in .env. Falling back to native WebRTC engine.'
    });
  }

  if (!roomId || !userName) {
    return res.status(400).json({ error: 'roomId and userName are required' });
  }

  try {
    const identity = sessionId || `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: userName,
      ttl: '4h'
    });

    at.addGrant({
      room: roomId.toUpperCase(),
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });

    const token = await at.toJwt();

    res.json({
      enabled: true,
      token,
      url: livekitUrl
    });
  } catch (err) {
    console.error('[LiveKit] Token generation error:', err);
    res.status(500).json({
      enabled: false,
      error: err.message
    });
  }
});

// Save API key to .env file and memory
app.post('/api/youtube/save-key', (req, res) => {
  const { key } = req.body;
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Key is required' });
  }

  process.env.YOUTUBE_API_KEY = key.trim();

  // Save to .env file
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      if (envContent.includes('YOUTUBE_API_KEY=')) {
        envContent = envContent.replace(/YOUTUBE_API_KEY=.*/, `YOUTUBE_API_KEY=${key.trim()}`);
      } else {
        envContent += `\nYOUTUBE_API_KEY=${key.trim()}\n`;
      }
    } else {
      envContent = `YOUTUBE_API_KEY=${key.trim()}\n`;
    }
    fs.writeFileSync(envPath, envContent, 'utf8');
  } catch (err) {
    console.warn('Could not write to .env:', err.message);
  }

  res.json({ success: true, message: 'YouTube API Key saved successfully' });
});

// Check room existence and password requirement
app.get('/api/room/:roomId/check', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId?.toUpperCase());
  if (!room) {
    return res.status(404).json({ exists: false, message: 'Room not found' });
  }
  res.json({
    exists: true,
    roomId: room.id,
    name: room.name,
    hasPassword: Boolean(room.passwordHash || room.password),
    membersCount: room.members.length,
    waitingCount: room.waitingList.length,
    currentTrack: room.currentTrack
  });
});

// Proxy YouTube oEmbed to fetch video info without API Key
app.get('/api/youtube/oembed', async (req, res) => {
  const { url, videoId } = req.query;
  const targetUrl = url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);
  
  if (!targetUrl) {
    return res.status(400).json({ error: 'url or videoId query parameter required' });
  }

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`;
    const response = await fetch(oembedUrl);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Video not found or unavailable' });
    }
    const data = await response.json();
    
    // Extract videoId if not directly provided
    let extractedId = videoId;
    if (!extractedId) {
      const match = targetUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
      extractedId = match ? match[1] : '';
    }

    res.json({
      id: extractedId,
      title: data.title,
      channelTitle: data.author_name,
      thumbnail: `https://img.youtube.com/vi/${extractedId}/hqdefault.jpg`,
      authorUrl: data.author_url
    });
  } catch (error) {
    console.error('oEmbed error:', error);
    res.status(500).json({ error: 'Failed to fetch video details' });
  }
});

// Helper to scrape YouTube search results without needing an API key
async function searchYouTubeScrape(query) {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (!response.ok) return [];
    const html = await response.text();
    const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/ytInitialData\s*=\s*({.+?});/);
    if (!match) return [];
    const data = JSON.parse(match[1]);
    const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    const videos = [];
    for (const section of contents) {
      const items = section.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const v = item.videoRenderer;
        if (v && v.videoId) {
          videos.push({
            id: v.videoId,
            title: v.title?.runs?.map(r => r.text).join('') || v.title?.simpleText || '',
            channelTitle: v.ownerText?.runs?.map(r => r.text).join('') || '',
            thumbnail: v.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`,
            duration: v.lengthText?.simpleText || ''
          });
        }
      }
    }
    return videos;
  } catch (err) {
    console.error('YouTube scrape error:', err.message);
    return [];
  }
}

// Proxy YouTube Data API search with zero-API-key scrape fallback
app.get('/api/youtube/search', async (req, res) => {
  const { q, key } = req.query;
  const apiKey = key || process.env.YOUTUBE_API_KEY;

  if (!q) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  // 1. Try official YouTube Data API v3 if API key is provided
  if (apiKey) {
    try {
      const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&q=${encodeURIComponent(q)}&type=video&key=${apiKey}`;
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (!data.error && data.items && data.items.length > 0) {
        const items = data.items.map(item => ({
          id: item.id.videoId,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
          publishedAt: item.snippet.publishedAt
        }));
        return res.json({ items, source: 'api' });
      }
      console.warn('YouTube API call returned error or empty, falling back to direct scrape:', data.error?.message);
    } catch (apiErr) {
      console.warn('YouTube API fetch failed, falling back to direct scrape:', apiErr.message);
    }
  }

  // 2. Direct scrape fallback (zero-API-key, unlimited quota)
  try {
    const scrapedItems = await searchYouTubeScrape(q);
    if (scrapedItems.length > 0) {
      return res.json({ items: scrapedItems, source: 'scrape' });
    }
  } catch (scrapeErr) {
    console.error('YouTube scrape search failed:', scrapeErr.message);
  }

  // 3. Fallback to empty items
  res.json({ items: [] });
});

// Socket.IO Handling
io.on('connection', (socket) => {
  let currentRoomId = null;
  let currentUser = null;

  // 1. Create a new Room
  socket.on('room:create', ({ roomId, roomName, password, userName, sessionId, clientId, requireApproval = true }, callback) => {
    const id = (roomId || Math.random().toString(36).substring(2, 8)).toUpperCase();

    if (rooms.has(id)) {
      return callback({ success: false, message: 'Room ID already exists. Try a different ID.' });
    }

    const stableClientId = clientId || sessionId || `client-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const { token: resumeToken, hash: resumeTokenHash } = generateResumeToken();

    const user = {
      clientId: stableClientId,
      sessionId: stableClientId,
      id: socket.id,
      name: userName.trim() || 'Host',
      isHost: true,
      avatarColor: '#5865f2',
      isOnline: true,
      joinedAt: Date.now()
    };

    const passwordHash = password ? hashPassword(password.trim()) : null;

    const newRoom = {
      id,
      name: roomName.trim() || `afterspot Lounge`,
      passwordHash,
      resumeTokens: { [stableClientId]: resumeTokenHash },
      requireApproval: Boolean(requireApproval),
      hostId: stableClientId, // Stable clientId stored in localStorage
      hostSocketId: socket.id,
      hostSessionId: stableClientId,
      createdAt: Date.now(),
      currentTrack: null,
      isPlaying: false,
      playbackPosition: 0,
      lastStateChangeTime: Date.now(),
      queue: [],
      history: [],
      members: [user],
      waitingList: [], // Users waiting to join
      chatMessages: [],
      callParticipants: new Map(), // Active WebRTC call participants
      settings: {
        djMode: false
      }
    };

    rooms.set(id, newRoom);
    roomStore.save(id, newRoom);
    socket.join(id);
    currentRoomId = id;
    currentUser = user;

    callback({
      success: true,
      room: {
        ...newRoom,
        hasPassword: Boolean(newRoom.passwordHash)
      },
      user,
      resumeToken
    });
  });

  // 2. Request to Join or Direct Join
  socket.on('room:join', ({ roomId, password, userName, sessionId, clientId }, callback) => {
    const id = roomId ? roomId.trim().toUpperCase() : '';
    const room = rooms.get(id);

    if (!room) {
      return callback({ success: false, message: 'Room does not exist. Check the ID.' });
    }

    if (room.passwordHash) {
      if (!verifyPassword(password?.trim(), room.passwordHash)) {
        return callback({ success: false, message: 'Incorrect room password.' });
      }
    } else if (room.password && room.password !== password?.trim()) {
      return callback({ success: false, message: 'Incorrect room password.' });
    }

    const stableClientId = clientId || sessionId || `client-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const { token: resumeToken, hash: resumeTokenHash } = generateResumeToken();
    if (!room.resumeTokens) room.resumeTokens = {};
    room.resumeTokens[stableClientId] = resumeTokenHash;

    const isHost = room.hostId === stableClientId || room.members.length === 0;

    // Check if this session already exists as a member (reconnecting offline user or same socket)
    const existingMember = room.members.find(m => 
      m.id === socket.id || (!m.isOnline && (m.clientId === stableClientId || m.sessionId === stableClientId))
    );
    if (existingMember) {
      existingMember.id = socket.id;
      existingMember.clientId = stableClientId;
      existingMember.isOnline = true;
      existingMember.disconnectedAt = null;
      if (userName?.trim()) existingMember.name = userName.trim();
      if (isHost) {
        existingMember.isHost = true;
        room.hostId = stableClientId;
        room.hostSocketId = socket.id;
      }

      socket.join(id);
      currentRoomId = id;
      currentUser = existingMember;

      roomStore.save(id, room);
      const accurateTime = getRoomCurrentTime(room);

      callback({
        success: true,
        waiting: false,
        room: {
          ...room,
          hasPassword: Boolean(room.passwordHash || room.password),
          playbackPosition: accurateTime
        },
        user: existingMember,
        resumeToken
      });

      io.to(id).emit('room:members-updated', {
        members: room.members,
        waitingList: room.waitingList
      });
      return;
    }

    // Also remove any stale entries for the same socket.id (edge case: same tab, no session)
    room.members = room.members.filter(m => m.id !== socket.id);

    // Check if room requires host approval
    if (room.requireApproval && room.hostId !== stableClientId && room.hostSocketId !== socket.id) {
      const waitUser = {
        clientId: stableClientId,
        sessionId: stableClientId,
        id: socket.id,
        name: userName?.trim() || `Guest-${socket.id.substring(0, 4)}`,
        avatarColor: getRandomColor(),
        requestedAt: Date.now()
      };

      // Check if already in waiting list
      if (!room.waitingList.some(w => w.id === socket.id || w.clientId === stableClientId)) {
        room.waitingList.push(waitUser);
      } else {
        const existingWait = room.waitingList.find(w => w.clientId === stableClientId);
        if (existingWait) existingWait.id = socket.id;
      }

      // Notify host about the waiting user
      if (room.hostSocketId) {
        io.to(room.hostSocketId).emit('room:waiting-list-updated', {
          waitingList: room.waitingList
        });
      }

      return callback({
        success: true,
        waiting: true,
        message: 'You are in the waiting room. The host will admit you shortly.'
      });
    }

    // Direct Join — fresh user
    const user = {
      clientId: stableClientId,
      sessionId: stableClientId,
      id: socket.id,
      name: userName?.trim() || `Guest-${socket.id.substring(0, 4)}`,
      isHost,
      avatarColor: getRandomColor(),
      isOnline: true,
      joinedAt: Date.now()
    };

    if (isHost) {
      room.hostId = stableClientId;
      room.hostSocketId = socket.id;
    }

    room.members.push(user);
    socket.join(id);
    currentRoomId = id;
    currentUser = user;

    roomStore.save(id, room);
    const accurateTime = getRoomCurrentTime(room);

    callback({
      success: true,
      waiting: false,
      room: {
        ...room,
        hasPassword: Boolean(room.passwordHash || room.password),
        playbackPosition: accurateTime
      },
      user,
      resumeToken
    });

    socket.to(id).emit('room:members-updated', {
      members: room.members,
      waitingList: room.waitingList
    });
  });

  // 2b. Reconnect / Resume Session with stable clientId and server-issued resumeToken
  socket.on('room:resume', ({ roomId, sessionId, clientId, userName, resumeToken }, callback) => {
    const id = roomId ? roomId.trim().toUpperCase() : '';
    const room = rooms.get(id);

    if (!room) {
      return callback({ success: false, message: 'Room no longer exists or has expired.' });
    }

    const stableClientId = clientId || sessionId;
    if (!stableClientId) {
      return callback({ success: false, message: 'Missing client identifier.' });
    }

    const isHost = Boolean(room.hostId && room.hostId === stableClientId);

    // Verify resumeToken if room is password-protected and user is not host
    if (room.passwordHash || room.password) {
      const storedTokenHash = room.resumeTokens?.[stableClientId];
      const isTokenValid = Boolean(storedTokenHash && resumeToken && verifyResumeToken(resumeToken, storedTokenHash));
      if (!isTokenValid && !isHost) {
        return callback({ success: false, message: 'Session resume expired or invalid. Please rejoin.' });
      }
    }

    // Remove any stale entries for the same socket.id (prevents ghost duplicates)
    room.members = room.members.filter(m => m.id !== socket.id || m.clientId === stableClientId);

    let member = room.members.find(m => m.clientId === stableClientId || m.sessionId === stableClientId);

    if (member) {
      // Reconnecting existing member — update socket id, mark online
      member.id = socket.id;
      member.clientId = stableClientId;
      member.isOnline = true;
      member.disconnectedAt = null;
      if (userName?.trim()) member.name = userName.trim();
      if (isHost) {
        member.isHost = true;
        room.hostId = stableClientId;
        room.hostSocketId = socket.id;
      }
    } else if (isHost) {
      // Host reconnecting after server restart or rehydration
      member = {
        clientId: stableClientId,
        sessionId: stableClientId,
        id: socket.id,
        name: userName?.trim() || 'Host',
        isHost: true,
        avatarColor: '#5865f2',
        isOnline: true,
        joinedAt: Date.now()
      };
      room.members.unshift(member);
      room.hostId = stableClientId;
      room.hostSocketId = socket.id;
    } else if (!room.requireApproval || (room.resumeTokens && room.resumeTokens[stableClientId])) {
      // Member reconnecting after restart
      member = {
        clientId: stableClientId,
        sessionId: stableClientId,
        id: socket.id,
        name: userName?.trim() || `Guest-${socket.id.substring(0, 4)}`,
        isHost: false,
        avatarColor: getRandomColor(),
        isOnline: true,
        joinedAt: Date.now()
      };
      room.members.push(member);
    } else {
      return callback({ success: false, message: 'Session expired. Please rejoin the room.' });
    }

    socket.join(id);
    currentRoomId = id;
    currentUser = member;

    // Issue refreshed resume token
    const { token: freshResumeToken, hash: freshTokenHash } = generateResumeToken();
    if (!room.resumeTokens) room.resumeTokens = {};
    room.resumeTokens[stableClientId] = freshTokenHash;
    roomStore.save(id, room);

    const accurateTime = getRoomCurrentTime(room);

    callback({
      success: true,
      room: {
        ...room,
        hasPassword: Boolean(room.passwordHash || room.password),
        playbackPosition: accurateTime
      },
      user: member,
      resumeToken: freshResumeToken
    });

    io.to(id).emit('room:members-updated', {
      members: room.members,
      waitingList: room.waitingList
    });
  });

  // 3. Host: Approve a waiting user
  socket.on('room:approve-user', ({ userId }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room || !isHostUser(room, socket.id, currentUser)) return;

    const index = room.waitingList.findIndex(w => w.id === userId);
    if (index === -1) return;

    const [waitUser] = room.waitingList.splice(index, 1);

    // Check if this session already exists as a member (prevent duplicates)
    const existingMember = room.members.find(m => m.sessionId === waitUser.sessionId);
    if (existingMember) {
      existingMember.id = waitUser.id;
      existingMember.isOnline = true;
      existingMember.disconnectedAt = null;
    } else {
      const member = {
        sessionId: waitUser.sessionId,
        id: waitUser.id,
        name: waitUser.name,
        avatarColor: waitUser.avatarColor,
        isHost: false,
        isOnline: true,
        joinedAt: Date.now()
      };
      room.members.push(member);
    }

    const approvedMember = room.members.find(m => m.id === waitUser.id);

    // Join socket to room channel
    const targetSocket = io.sockets.sockets.get(userId);
    if (targetSocket) {
      targetSocket.join(currentRoomId);
      
      const accurateTime = getRoomCurrentTime(room);
      targetSocket.emit('room:approved', {
        room: {
          ...room,
          hasPassword: Boolean(room.passwordHash || room.password),
          playbackPosition: accurateTime
        },
        user: approvedMember
      });
    }

    // Update room with new members and waiting list
    io.to(currentRoomId).emit('room:members-updated', {
      members: room.members,
      waitingList: room.waitingList
    });
    socket.emit('room:waiting-list-updated', {
      waitingList: room.waitingList
    });
  });

  // 4. Host: Approve all waiting users
  socket.on('room:approve-all', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room || !isHostUser(room, socket.id, currentUser)) return;

    const accurateTime = getRoomCurrentTime(room);

    while (room.waitingList.length > 0) {
      const waitUser = room.waitingList.shift();
      const member = {
        id: waitUser.id,
        name: waitUser.name,
        avatarColor: waitUser.avatarColor,
        isHost: false,
        joinedAt: Date.now()
      };
      room.members.push(member);

      const targetSocket = io.sockets.sockets.get(waitUser.id);
      if (targetSocket) {
        targetSocket.join(currentRoomId);
        targetSocket.emit('room:approved', {
          room: {
            ...room,
            hasPassword: Boolean(room.passwordHash || room.password),
            playbackPosition: accurateTime
          },
          user: member
        });
      }
    }

    io.to(currentRoomId).emit('room:members-updated', {
      members: room.members,
      waitingList: room.waitingList
    });
    socket.emit('room:waiting-list-updated', {
      waitingList: room.waitingList
    });
  });

  // 5. Host: Reject a waiting user
  socket.on('room:reject-user', ({ userId }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room || !isHostUser(room, socket.id, currentUser)) return;

    room.waitingList = room.waitingList.filter(w => w.id !== userId);

    const targetSocket = io.sockets.sockets.get(userId);
    if (targetSocket) {
      targetSocket.emit('room:rejected', { message: 'Your join request was declined by the host.' });
    }

    socket.emit('room:waiting-list-updated', { waitingList: room.waitingList });
  });

  // 6. Playback: Play
  socket.on('player:play', ({ currentTime }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    room.isPlaying = true;
    room.playbackPosition = typeof currentTime === 'number' ? currentTime : room.playbackPosition;
    room.lastStateChangeTime = Date.now();
    roomStore.save(currentRoomId, room);

    // Broadcast to ALL clients in the room (including sender for confirmation)
    io.to(currentRoomId).emit('player:sync', {
      isPlaying: true,
      playbackPosition: room.playbackPosition,
      serverTimestamp: Date.now(),
      triggeredBy: currentUser?.name || 'Host'
    });
  });

  // 7. Playback: Pause
  socket.on('player:pause', ({ currentTime }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    room.isPlaying = false;
    room.playbackPosition = typeof currentTime === 'number' ? currentTime : room.playbackPosition;
    room.lastStateChangeTime = Date.now();
    roomStore.save(currentRoomId, room);

    // Broadcast to ALL clients in the room (including sender for confirmation)
    io.to(currentRoomId).emit('player:sync', {
      isPlaying: false,
      playbackPosition: room.playbackPosition,
      serverTimestamp: Date.now(),
      triggeredBy: currentUser?.name || 'Host'
    });
  });

  // 8. Playback: Seek
  socket.on('player:seek', ({ currentTime }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    room.playbackPosition = currentTime;
    room.lastStateChangeTime = Date.now();
    roomStore.save(currentRoomId, room);

    io.to(currentRoomId).emit('player:seek', {
      playbackPosition: currentTime,
      isPlaying: room.isPlaying,
      serverTimestamp: Date.now(),
      triggeredBy: currentUser?.name || 'Host'
    });
  });

  // 9. Play a video immediately
  socket.on('player:set-track', ({ track }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const trackItem = {
      ...track,
      addedBy: currentUser?.name || 'Host',
      addedAt: Date.now(),
      entryId: track?.entryId || crypto.randomUUID()
    };

    room.currentTrack = trackItem;
    room.isPlaying = true;
    room.playbackPosition = 0;
    room.lastStateChangeTime = Date.now();
    roomStore.save(currentRoomId, room);

    io.to(currentRoomId).emit('player:track-change', {
      currentTrack: room.currentTrack,
      isPlaying: true,
      playbackPosition: 0,
      serverTimestamp: Date.now(),
      triggeredBy: currentUser?.name || 'Host'
    });
  });

  // 10. Queue: Add Track
  socket.on('queue:add', ({ track }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const trackItem = {
      ...track,
      addedBy: currentUser?.name || 'Member',
      addedAt: Date.now(),
      queueId: `queue-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      entryId: track?.entryId || crypto.randomUUID()
    };

    if (!room.currentTrack) {
      room.currentTrack = trackItem;
      room.isPlaying = true;
      room.playbackPosition = 0;
      room.lastStateChangeTime = Date.now();

      io.to(currentRoomId).emit('player:track-change', {
        currentTrack: room.currentTrack,
        isPlaying: true,
        playbackPosition: 0,
        serverTimestamp: Date.now(),
        triggeredBy: currentUser?.name || 'Host'
      });
    } else {
      room.queue.push(trackItem);
      io.to(currentRoomId).emit('queue:updated', { queue: room.queue, addedTrack: trackItem });
    }
    roomStore.save(currentRoomId, room);
  });

  // 11. Queue: Play track now
  socket.on('queue:play-now', ({ queueId }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const index = room.queue.findIndex(item => item.queueId === queueId);
    if (index === -1) return;

    const [track] = room.queue.splice(index, 1);
    if (!track.entryId) {
      track.entryId = crypto.randomUUID();
    }
    room.currentTrack = track;
    room.isPlaying = true;
    room.playbackPosition = 0;
    room.lastStateChangeTime = Date.now();
    roomStore.save(currentRoomId, room);

    io.to(currentRoomId).emit('player:track-change', {
      currentTrack: room.currentTrack,
      isPlaying: true,
      playbackPosition: 0,
      serverTimestamp: Date.now(),
      triggeredBy: currentUser?.name || 'Host'
    });
    io.to(currentRoomId).emit('queue:updated', { queue: room.queue });
  });

  // 12. Queue: Remove track
  socket.on('queue:remove', ({ queueId }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    room.queue = room.queue.filter(item => item.queueId !== queueId);
    io.to(currentRoomId).emit('queue:updated', { queue: room.queue });
    roomStore.save(currentRoomId, room);
  });

  // 13. Queue: Play next (Skip / Track End)
  const handleAdvanceQueue = (payload) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const endedEntryId = payload?.entryId;
    const { advanced } = advanceQueue(room, endedEntryId);

    if (advanced) {
      io.to(currentRoomId).emit('player:track-change', {
        currentTrack: room.currentTrack,
        isPlaying: room.isPlaying,
        playbackPosition: 0,
        serverTimestamp: Date.now(),
        triggeredBy: 'Autoplay'
      });
      io.to(currentRoomId).emit('queue:updated', { queue: room.queue });
      roomStore.save(currentRoomId, room);
    }
  };

  socket.on('player:skip', handleAdvanceQueue);
  socket.on('player:track-end', handleAdvanceQueue);

  // 14. Chat: Send Message
  socket.on('chat:message', ({ text }) => {
    if (!currentRoomId || !text?.trim()) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const msg = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      senderId: socket.id,
      sender: currentUser?.name || 'Guest',
      senderColor: currentUser?.avatarColor || '#5865f2',
      isHost: Boolean(currentUser?.isHost),
      text: text.trim(),
      timestamp: Date.now()
    };

    room.chatMessages.push(msg);
    if (room.chatMessages.length > 100) room.chatMessages.shift();

    io.to(currentRoomId).emit('chat:message', msg);
  });

  // 15. Reactions: Send Floating Emoji
  socket.on('reaction:send', ({ emoji }) => {
    if (!currentRoomId || !emoji) return;
    io.to(currentRoomId).emit('reaction:received', {
      id: `react-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      emoji,
      sender: currentUser?.name || 'Friend',
      timestamp: Date.now()
    });
  });

  // 16. Room Settings Update (DJ mode, etc.)
  socket.on('settings:update', (newSettings) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room || !isHostUser(room, socket.id, currentUser)) return;

    room.settings = { ...room.settings, ...newSettings };
    io.to(currentRoomId).emit('settings:updated', { settings: room.settings });
  });

  // 16b. Update Room Name (Host only)
  socket.on('room:update-name', ({ name }, callback) => {
    if (!currentRoomId || !name?.trim()) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    // Check if host
    if (!isHostUser(room, socket.id, currentUser)) {
      if (typeof callback === 'function') callback({ success: false, message: 'Only the host can rename the room.' });
      return;
    }

    room.name = name.trim();
    roomStore.save(currentRoomId, room);
    io.to(currentRoomId).emit('room:name-updated', { name: room.name });
    if (typeof callback === 'function') callback({ success: true, name: room.name });
  });

  // 16c. Update User Display Name (Nickname)
  socket.on('user:update-name', ({ name }, callback) => {
    if (!currentRoomId || !name?.trim() || !currentUser) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    currentUser.name = name.trim();
    const member = room.members.find(m => m.id === socket.id || m.sessionId === currentUser.sessionId);
    if (member) member.name = currentUser.name;

    io.to(currentRoomId).emit('room:members-updated', { members: room.members });
    socket.emit('user:updated', { user: currentUser });
    if (typeof callback === 'function') callback({ success: true, name: currentUser.name });
  });

  // 17. WebRTC Voice & Video Call Signaling (Google Meet / Discord Style)
  socket.on('webrtc:join-call', (initialMediaState) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    if (!room.callParticipants) {
      room.callParticipants = new Map();
    }

    const participantInfo = {
      peerId: socket.id,
      userName: currentUser?.name || 'Member',
      avatarColor: currentUser?.avatarColor || '#5865f2',
      isMuted: Boolean(initialMediaState?.isMuted ?? false),
      isCameraOff: Boolean(initialMediaState?.isCameraOff ?? true),
      isScreenSharing: Boolean(initialMediaState?.isScreenSharing ?? false),
      joinedAt: Date.now()
    };

    room.callParticipants.set(socket.id, participantInfo);

    // 1. Announce to all existing call peers in the room
    socket.to(currentRoomId).emit('webrtc:peer-joined', participantInfo);

    // 2. Return all existing active call peers in this room to the joining socket
    const existingPeers = [];
    for (const [peerId, peerData] of room.callParticipants.entries()) {
      if (peerId !== socket.id) {
        existingPeers.push(peerData);
      }
    }

    socket.emit('webrtc:existing-peers', { peers: existingPeers });
  });

  socket.on('webrtc:signal', ({ to, signal, type }) => {
    if (!to || !currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    // Direct forward to target socket
    io.to(to).emit('webrtc:signal', {
      from: socket.id,
      fromName: currentUser?.name || 'Member',
      signal,
      type
    });
  });

  socket.on('webrtc:media-state', (mediaState) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.callParticipants && room.callParticipants.has(socket.id)) {
      const prev = room.callParticipants.get(socket.id);
      room.callParticipants.set(socket.id, { ...prev, ...mediaState });
    }

    socket.to(currentRoomId).emit('webrtc:media-state-updated', {
      peerId: socket.id,
      ...mediaState
    });
  });

  socket.on('webrtc:leave-call', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.callParticipants) {
      room.callParticipants.delete(socket.id);
    }
    socket.to(currentRoomId).emit('webrtc:peer-left', {
      peerId: socket.id
    });
  });

  // 18. Explicit Leave Room (User clicked Leave button)
  socket.on('room:leave', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    // Notify call peers of departure
    room.callParticipants?.delete(socket.id);
    socket.to(currentRoomId).emit('webrtc:peer-left', { peerId: socket.id });

    // Remove user immediately on explicit leave
    room.members = room.members.filter(m => m.id !== socket.id);
    room.waitingList = room.waitingList.filter(w => w.id !== socket.id);

    // If host left explicitly, transfer host to next online member or clear
    if (room.hostId === currentUser?.clientId || room.hostSocketId === socket.id) {
      if (room.members.length > 0) {
        const nextHost = room.members.find(m => m.isOnline) || room.members[0];
        nextHost.isHost = true;
        room.hostId = nextHost.clientId || nextHost.id;
        room.hostSocketId = nextHost.id;
        room.hostSessionId = nextHost.sessionId || nextHost.id;
      } else {
        room.hostId = null;
        room.hostSocketId = null;
        room.hostSessionId = null;
        rooms.delete(currentRoomId);
        roomStore.delete(currentRoomId);
      }
    }

    if (room.members.length === 0) {
      rooms.delete(currentRoomId);
      roomStore.delete(currentRoomId);
    } else {
      io.to(currentRoomId).emit('room:members-updated', {
        members: room.members,
        waitingList: room.waitingList
      });
    }

    socket.leave(currentRoomId);
    currentRoomId = null;
    currentUser = null;
  });

  // 18. Socket Disconnect (Browser refresh or network drop - Grace Period!)
  socket.on('disconnect', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    // Notify call peers of disconnection
    room.callParticipants?.delete(socket.id);
    socket.to(currentRoomId).emit('webrtc:peer-left', { peerId: socket.id });

    // Mark the member as offline (by socket.id match)
    const member = room.members.find(m => m.id === socket.id);
    if (member) {
      member.isOnline = false;
      member.disconnectedAt = Date.now();
    }

    io.to(currentRoomId).emit('room:members-updated', {
      members: room.members,
      waitingList: room.waitingList
    });

    // Also clean up any stale waiting list entries for this socket
    room.waitingList = room.waitingList.filter(w => w.id !== socket.id);

    // Store roomId in closure for the timeout
    const disconnectedRoomId = currentRoomId;

    // 30-second grace period before cleaning up disconnected members
    // (reduced from 2 min to avoid long ghost entries)
    setTimeout(() => {
      const checkRoom = rooms.get(disconnectedRoomId);
      if (!checkRoom) return;

      const now = Date.now();
      checkRoom.members = checkRoom.members.filter(m => {
        if (!m.isOnline && m.disconnectedAt && (now - m.disconnectedAt >= 30000)) {
          return false;
        }
        return true;
      });

      if (checkRoom.members.length === 0) {
        rooms.delete(disconnectedRoomId);
        roomStore.delete(disconnectedRoomId);
      } else {
        // Re-elect host if current host was cleaned up
        if (!checkRoom.members.some(m => m.clientId === checkRoom.hostId)) {
          const onlineMember = checkRoom.members.find(m => m.isOnline) || checkRoom.members[0];
          onlineMember.isHost = true;
          checkRoom.hostId = onlineMember.clientId || onlineMember.id;
          checkRoom.hostSocketId = onlineMember.id;
          checkRoom.hostSessionId = onlineMember.sessionId || onlineMember.id;
        }

        io.to(disconnectedRoomId).emit('room:members-updated', {
          members: checkRoom.members,
          waitingList: checkRoom.waitingList
        });
      }
    }, 30000);
  });
});

// Periodic playback heartbeat: broadcast accurate time to all rooms every 5 seconds
// This ensures all clients stay perfectly in sync like a real theater
setInterval(() => {
  for (const [roomId, room] of rooms) {
    if (room.isPlaying && room.currentTrack) {
      const accurateTime = getRoomCurrentTime(room);
      io.to(roomId).emit('player:time-sync', {
        playbackPosition: accurateTime,
        isPlaying: room.isPlaying,
        serverTimestamp: Date.now()
      });
    }
  }
}, 5000);

// Serve compiled React frontend in production (All-in-One Monorepo Deployment)
const distPath = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
      return res.sendFile(path.resolve(distPath, 'index.html'));
    }
    next();
  });
}

const rawPort = process.env.PORT || '3001';
const PORT = parseInt(rawPort, 10);
if (isNaN(PORT) || PORT <= 0 || PORT > 65535) {
  console.error(`[Fatal] Invalid PORT configuration: "${rawPort}". Expected integer between 1 and 65535.`);
  process.exit(1);
}

httpServer.listen(PORT, () => {
  console.log(`afterspot server listening on http://localhost:${PORT}`);
  const hasLiveKit = Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
  const turnStatus = getTurnProviderStatus();
  const hasYouTube = Boolean(process.env.YOUTUBE_API_KEY);

  console.log(`[Services] LiveKit SFU: ${hasLiveKit ? 'Configured (Active)' : 'Not set (Native WebRTC Mesh active)'}`);
  if (turnStatus.configured) {
    console.log(`TURN: configured (provider ${turnStatus.provider})`);
  } else {
    console.log('TURN: NOT configured, calls across NAT will fail');
  }
  console.log(`[Services] YouTube API: ${hasYouTube ? 'Configured' : 'Zero-Key oEmbed fallback'}`);
});
