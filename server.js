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
import {
  generateRoomId,
  generateResumeToken,
  verifyResumeToken,
  RoomRateLimiter,
  sanitizePublicRoom,
  MAX_ROOM_MEMBERS,
  MIN_PASSWORD_LENGTH
} from './server/roomModel.js';
import { youtubeSearchService } from './server/youtubeSearch.js';

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

// Rate limiter for room password attempts: 5 failed attempts per 10 minutes per client
const roomRateLimiter = new RoomRateLimiter();

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

// Check room existence and password requirement
app.get('/api/room/:roomId/check', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId?.toUpperCase());
  if (!room) {
    return res.status(404).json({ exists: false, message: 'Room not found. Check the ID.' });
  }
  const activeMembers = (room.members || []).filter(m => m.isOnline).length;
  res.json({
    exists: true,
    roomId: room.id,
    name: room.name,
    hasPassword: Boolean(room.passwordHash),
    membersCount: activeMembers,
    isFull: activeMembers >= MAX_ROOM_MEMBERS,
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

// YouTube search with caching, rate limiting, and structured error mapping
app.get('/api/youtube/search', async (req, res) => {
  const { q, clientId, key } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length < 2) {
    return res.status(400).json({
      error: 'INVALID_QUERY',
      message: 'Search query must be at least 2 characters.',
      items: []
    });
  }

  if (key) {
    youtubeSearchService.setApiKey(key);
  }

  const result = await youtubeSearchService.search({
    query: q,
    clientId: clientId || req.ip
  });

  if (result.error) {
    const status = result.error === 'RATE_LIMITED' ? 429 : 400;
    return res.status(status).json(result);
  }

  res.json(result);
});

// Socket.IO Handling
io.on('connection', (socket) => {
  let currentRoomId = null;
  let currentUser = null;

  // 1. Create a new Room
  socket.on('room:create', ({ roomName, password, userName, sessionId, clientId }, callback) => {
    if (typeof callback !== 'function') return;

    if (!password || typeof password !== 'string' || password.trim().length < MIN_PASSWORD_LENGTH) {
      return callback({
        success: false,
        message: `Password is required (minimum ${MIN_PASSWORD_LENGTH} characters).`
      });
    }

    const cleanUserName = (userName || '').trim() || 'Host';
    const stableClientId = clientId || sessionId || `tab-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Generate unambiguous 6-character room ID from ABCDEFGHJKLMNPQRSTUVWXYZ23456789
    let id = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateRoomId(6);
      if (!rooms.has(candidate)) {
        id = candidate;
        break;
      }
    }

    if (!id) {
      return callback({ success: false, message: 'Failed to allocate unique room ID. Please try again.' });
    }

    const { token: resumeToken, hash: resumeTokenHash } = generateResumeToken();
    const passwordHash = hashPassword(password.trim());

    const user = {
      clientId: stableClientId,
      sessionId: stableClientId,
      id: socket.id,
      name: cleanUserName,
      isHost: true,
      avatarColor: '#5865f2',
      isOnline: true,
      joinedAt: Date.now()
    };

    const newRoom = {
      id,
      name: (roomName || '').trim() || `afterspot Lounge`,
      passwordHash,
      resumeTokens: { [stableClientId]: resumeTokenHash },
      hostId: stableClientId,
      hostSocketId: socket.id,
      hostSessionId: stableClientId,
      createdAt: Date.now(),
      currentTrack: null,
      isPlaying: false,
      playbackPosition: 0,
      lastStateChangeTime: Date.now(),
      queue: [],
      members: [user],
      callParticipants: new Map()
    };

    rooms.set(id, newRoom);
    roomStore.save(id, newRoom);
    socket.join(id);
    currentRoomId = id;
    currentUser = user;

    callback({
      success: true,
      room: sanitizePublicRoom(newRoom, 0),
      user,
      resumeToken
    });
  });

  // 2. Request to Join Room
  socket.on('room:join', ({ roomId, password, userName, sessionId, clientId }, callback) => {
    if (typeof callback !== 'function') return;

    const id = roomId ? roomId.trim().toUpperCase() : '';
    const room = rooms.get(id);

    if (!room) {
      return callback({ success: false, message: 'Room not found. Check the ID.' });
    }

    const stableClientId = clientId || sessionId || `tab-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Rate limit check: 5 failed attempts per room per client per 10 minutes
    const rateCheck = roomRateLimiter.isRateLimited(id, stableClientId);
    if (rateCheck.limited) {
      return callback({
        success: false,
        message: `Too many failed attempts. Please wait ${rateCheck.waitMinutes} minute${rateCheck.waitMinutes === 1 ? '' : 's'} before trying again.`
      });
    }

    // Password verification: required, min 4 chars, constant-time scrypt check
    if (!password || typeof password !== 'string' || password.trim().length < MIN_PASSWORD_LENGTH) {
      roomRateLimiter.recordFailure(id, stableClientId);
      return callback({
        success: false,
        message: `Password is required (minimum ${MIN_PASSWORD_LENGTH} characters).`
      });
    }

    if (!verifyPassword(password.trim(), room.passwordHash)) {
      roomRateLimiter.recordFailure(id, stableClientId);
      return callback({ success: false, message: 'Incorrect room password.' });
    }

    // Password succeeded — clear rate limiter record for this client
    roomRateLimiter.recordSuccess(id, stableClientId);

    // Maximum 12 members cap check
    const activeMembersCount = (room.members || []).filter(m => m.isOnline).length;
    const isAlreadyMember = (room.members || []).some(m => m.clientId === stableClientId);
    if (!isAlreadyMember && activeMembersCount >= MAX_ROOM_MEMBERS) {
      return callback({ success: false, message: `Room is full (maximum ${MAX_ROOM_MEMBERS} members).` });
    }

    const cleanUserName = (userName || '').trim() || `Guest-${socket.id.substring(0, 4)}`;
    const { token: resumeToken, hash: resumeTokenHash } = generateResumeToken();
    if (!room.resumeTokens) room.resumeTokens = {};
    room.resumeTokens[stableClientId] = resumeTokenHash;

    const isHost = room.hostId === stableClientId || room.members.length === 0;

    // Check if this client already exists as a member (e.g. reconnecting offline user or same tab)
    const existingMember = room.members.find(m => 
      m.id === socket.id || (!m.isOnline && (m.clientId === stableClientId || m.sessionId === stableClientId))
    );
    if (existingMember) {
      existingMember.id = socket.id;
      existingMember.clientId = stableClientId;
      existingMember.isOnline = true;
      existingMember.disconnectedAt = null;
      if (userName?.trim()) existingMember.name = cleanUserName;
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
        room: sanitizePublicRoom(room, accurateTime),
        user: existingMember,
        resumeToken
      });

      io.to(id).emit('room:members-updated', {
        members: sanitizePublicRoom(room).members
      });
      return;
    }

    // Remove any stale entries for the same socket.id (prevents duplicate entries)
    room.members = room.members.filter(m => m.id !== socket.id);

    // Fresh user joining
    const user = {
      clientId: stableClientId,
      sessionId: stableClientId,
      id: socket.id,
      name: cleanUserName,
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
      room: sanitizePublicRoom(room, accurateTime),
      user,
      resumeToken
    });

    socket.to(id).emit('room:members-updated', {
      members: sanitizePublicRoom(room).members
    });
  });

  // 2b. Reconnect / Resume Session with stable clientId and server-issued resumeToken
  socket.on('room:resume', ({ roomId, sessionId, clientId, userName, resumeToken }, callback) => {
    if (typeof callback !== 'function') return;

    const id = roomId ? roomId.trim().toUpperCase() : '';
    const room = rooms.get(id);

    if (!room) {
      return callback({ success: false, message: 'Room not found or has expired.' });
    }

    const stableClientId = clientId || sessionId;
    if (!stableClientId) {
      return callback({ success: false, message: 'Missing client identifier.' });
    }

    const isHost = Boolean(room.hostId && room.hostId === stableClientId);

    // Verify resumeToken using constant-time comparison
    const storedTokenHash = room.resumeTokens?.[stableClientId];
    const isTokenValid = Boolean(storedTokenHash && resumeToken && verifyResumeToken(resumeToken, storedTokenHash));
    if (!isTokenValid && !isHost) {
      return callback({ success: false, message: 'Session resume expired or invalid. Please rejoin with password.' });
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
        name: (userName || '').trim() || 'Host',
        isHost: true,
        avatarColor: '#5865f2',
        isOnline: true,
        joinedAt: Date.now()
      };
      room.members.unshift(member);
      room.hostId = stableClientId;
      room.hostSocketId = socket.id;
    } else if (room.resumeTokens && room.resumeTokens[stableClientId]) {
      // Member reconnecting after restart
      member = {
        clientId: stableClientId,
        sessionId: stableClientId,
        id: socket.id,
        name: (userName || '').trim() || `Guest-${socket.id.substring(0, 4)}`,
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
      room: sanitizePublicRoom(room, accurateTime),
      user: member,
      resumeToken: freshResumeToken
    });

    io.to(id).emit('room:members-updated', {
      members: sanitizePublicRoom(room).members
    });
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
  const handleSetTrack = ({ track }) => {
    if (!currentRoomId || !track) return;
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
  };

  socket.on('player:set-track', handleSetTrack);
  socket.on('player:change-track', handleSetTrack);

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
  socket.on('queue:remove', ({ queueId, entryId }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    room.queue = room.queue.filter(item => {
      if (entryId && item.entryId === entryId) return false;
      if (queueId && (item.queueId === queueId || item.entryId === queueId)) return false;
      return true;
    });
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
  socket.on('queue:skip', handleAdvanceQueue);
  socket.on('player:track-end', handleAdvanceQueue);

  // WebRTC Audio Call Signaling
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
      room.callParticipants.set(socket.id, { ...prev, isMuted: Boolean(mediaState?.isMuted) });
    }

    socket.to(currentRoomId).emit('webrtc:media-state-updated', {
      peerId: socket.id,
      isMuted: Boolean(mediaState?.isMuted)
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
      roomStore.save(currentRoomId, room);
      io.to(currentRoomId).emit('room:members-updated', {
        members: sanitizePublicRoom(room).members
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

    roomStore.save(currentRoomId, room);
    io.to(currentRoomId).emit('room:members-updated', {
      members: sanitizePublicRoom(room).members
    });

    // Store roomId in closure for the timeout
    const disconnectedRoomId = currentRoomId;

    // 30-second grace period before cleaning up disconnected members
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

        roomStore.save(disconnectedRoomId, checkRoom);
        io.to(disconnectedRoomId).emit('room:members-updated', {
          members: sanitizePublicRoom(checkRoom).members
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
