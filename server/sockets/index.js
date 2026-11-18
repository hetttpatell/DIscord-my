import crypto from 'node:crypto';
import { z } from 'zod';
import { verifySessionToken } from '../services/security.js';
import { roomStore } from '../services/roomStore.js';

// Schemas for socket events
const setVideoSchema = z.object({
  videoId: z.string().trim().min(1).max(64),
  title: z.string().nullish(),
  channel: z.string().nullish(),
  thumbnail: z.string().nullish(),
  thumbnailUrl: z.string().nullish(),
  durationSec: z.union([z.number(), z.string(), z.null()]).optional(),
  durationSeconds: z.union([z.number(), z.string(), z.null()]).optional(),
});

const queueAddSchema = z.object({
  videoId: z.string().trim().min(1).max(64),
  title: z.string().nullish(),
  channel: z.string().nullish(),
  thumbnail: z.string().nullish(),
  thumbnailUrl: z.string().nullish(),
  durationSec: z.union([z.number(), z.string(), z.null()]).optional(),
  durationSeconds: z.union([z.number(), z.string(), z.null()]).optional(),
});

const queueRemoveSchema = z.object({
  itemId: z.string().min(1),
});

const queueEndedSchema = z.object({
  itemId: z.string().min(1),
});

const positionSchema = z.object({
  positionSec: z.number().min(0),
});

const pingSchema = z.object({
  clientTime: z.number(),
});

const voiceStateSchema = z.object({
  isMicEnabled: z.boolean(),
});

const cameraStateSchema = z.object({
  isCameraEnabled: z.boolean(),
});

const reactionSchema = z.object({
  emoji: z.string().trim().min(1).max(16),
});

const mediaStartSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  durationSec: z.number().min(0).optional(),
});

const mediaControlSchema = z.object({
  action: z.enum(['play', 'pause', 'seek']),
  positionSec: z.number().min(0).optional(),
});

const gameDrawSchema = z.object({
  x0: z.number().min(0).max(1),
  y0: z.number().min(0).max(1),
  x1: z.number().min(0).max(1),
  y1: z.number().min(0).max(1),
  color: z.string().min(1).max(32),
  size: z.number().min(1).max(50),
});

const gameGuessSchema = z.object({
  text: z.string().trim().min(1).max(100),
});

const WORD_BANK = [
  // Food & Sweets
  { word: 'PIZZA', category: 'Food & Sweets' },
  { word: 'BURGER', category: 'Food & Sweets' },
  { word: 'DONUT', category: 'Food & Sweets' },
  { word: 'POPCORN', category: 'Food & Sweets' },
  { word: 'CUPCAKE', category: 'Food & Sweets' },
  { word: 'ICE CREAM', category: 'Food & Sweets' },
  { word: 'PANCAKE', category: 'Food & Sweets' },
  { word: 'TACO', category: 'Food & Sweets' },
  { word: 'SUSHI', category: 'Food & Sweets' },
  { word: 'WATERMELON', category: 'Food & Sweets' },
  { word: 'COOKIE', category: 'Food & Sweets' },
  { word: 'CHOCOLATE', category: 'Food & Sweets' },
  { word: 'BANANA', category: 'Food & Sweets' },
  { word: 'HOT DOG', category: 'Food & Sweets' },
  { word: 'STRAWBERRY', category: 'Food & Sweets' },
  { word: 'PINEAPPLE', category: 'Food & Sweets' },
  { word: 'AVOCADO', category: 'Food & Sweets' },
  { word: 'WAFFLE', category: 'Food & Sweets' },
  { word: 'CHEESE', category: 'Food & Sweets' },
  { word: 'FRENCH FRIES', category: 'Food & Sweets' },
  { word: 'LOLLIPOP', category: 'Food & Sweets' },

  // Animals & Wildlife
  { word: 'CAT', category: 'Animals & Wildlife' },
  { word: 'PENGUIN', category: 'Animals & Wildlife' },
  { word: 'PANDA', category: 'Animals & Wildlife' },
  { word: 'WHALE', category: 'Animals & Wildlife' },
  { word: 'SPIDER', category: 'Animals & Wildlife' },
  { word: 'DOLPHIN', category: 'Animals & Wildlife' },
  { word: 'LION', category: 'Animals & Wildlife' },
  { word: 'GIRAFFE', category: 'Animals & Wildlife' },
  { word: 'ELEPHANT', category: 'Animals & Wildlife' },
  { word: 'MONKEY', category: 'Animals & Wildlife' },
  { word: 'OCTOPUS', category: 'Animals & Wildlife' },
  { word: 'BUTTERFLY', category: 'Animals & Wildlife' },
  { word: 'KANGAROO', category: 'Animals & Wildlife' },
  { word: 'FLAMINGO', category: 'Animals & Wildlife' },
  { word: 'TURTLE', category: 'Animals & Wildlife' },
  { word: 'CHAMELEON', category: 'Animals & Wildlife' },
  { word: 'HAMSTER', category: 'Animals & Wildlife' },
  { word: 'EAGLE', category: 'Animals & Wildlife' },
  { word: 'SHARK', category: 'Animals & Wildlife' },
  { word: 'KOALA', category: 'Animals & Wildlife' },
  { word: 'FROG', category: 'Animals & Wildlife' },
  { word: 'PARROT', category: 'Animals & Wildlife' },
  { word: 'ZEBRA', category: 'Animals & Wildlife' },
  { word: 'HEDGEHOG', category: 'Animals & Wildlife' },

  // Objects & Tech
  { word: 'GUITAR', category: 'Objects & Tech' },
  { word: 'ROBOT', category: 'Objects & Tech' },
  { word: 'HEADPHONES', category: 'Objects & Tech' },
  { word: 'DIAMOND', category: 'Objects & Tech' },
  { word: 'CANDLE', category: 'Objects & Tech' },
  { word: 'SUNGLASSES', category: 'Objects & Tech' },
  { word: 'LIGHTBULB', category: 'Objects & Tech' },
  { word: 'CAMERA', category: 'Objects & Tech' },
  { word: 'BACKPACK', category: 'Objects & Tech' },
  { word: 'UMBRELLA', category: 'Objects & Tech' },
  { word: 'ALARM CLOCK', category: 'Objects & Tech' },
  { word: 'MICROSCOPE', category: 'Objects & Tech' },
  { word: 'TEAPOT', category: 'Objects & Tech' },
  { word: 'LANTERN', category: 'Objects & Tech' },
  { word: 'COMPASS', category: 'Objects & Tech' },
  { word: 'HOURGLASS', category: 'Objects & Tech' },
  { word: 'SCISSORS', category: 'Objects & Tech' },
  { word: 'KEYBOARD', category: 'Objects & Tech' },
  { word: 'FLASHLIGHT', category: 'Objects & Tech' },
  { word: 'DRUM SET', category: 'Objects & Tech' },

  // Nature & Weather
  { word: 'SUNFLOWER', category: 'Nature & Weather' },
  { word: 'RAINBOW', category: 'Nature & Weather' },
  { word: 'VOLCANO', category: 'Nature & Weather' },
  { word: 'CAMPFIRE', category: 'Nature & Weather' },
  { word: 'TREEHOUSE', category: 'Nature & Weather' },
  { word: 'SNOWMAN', category: 'Nature & Weather' },
  { word: 'WATERFALL', category: 'Nature & Weather' },
  { word: 'ISLAND', category: 'Nature & Weather' },
  { word: 'CACTUS', category: 'Nature & Weather' },
  { word: 'LIGHTNING', category: 'Nature & Weather' },
  { word: 'SNOWFLAKE', category: 'Nature & Weather' },
  { word: 'TORNADO', category: 'Nature & Weather' },
  { word: 'PALM TREE', category: 'Nature & Weather' },
  { word: 'MUSHROOM', category: 'Nature & Weather' },
  { word: 'CORAL REEF', category: 'Nature & Weather' },

  // Fantasy & Characters
  { word: 'GHOST', category: 'Fantasy & Heroes' },
  { word: 'DINOSAUR', category: 'Fantasy & Heroes' },
  { word: 'SUPERHERO', category: 'Fantasy & Heroes' },
  { word: 'PIRATE', category: 'Fantasy & Heroes' },
  { word: 'DRAGON', category: 'Fantasy & Heroes' },
  { word: 'WIZARD', category: 'Fantasy & Heroes' },
  { word: 'UNICORN', category: 'Fantasy & Heroes' },
  { word: 'MERMAID', category: 'Fantasy & Heroes' },
  { word: 'NINJA', category: 'Fantasy & Heroes' },
  { word: 'VAMPIRE', category: 'Fantasy & Heroes' },
  { word: 'ALIEN', category: 'Fantasy & Heroes' },
  { word: 'MUMMY', category: 'Fantasy & Heroes' },
  { word: 'GENIE', category: 'Fantasy & Heroes' },
  { word: 'KNIGHT', category: 'Fantasy & Heroes' },

  // Space & Science
  { word: 'ASTRONAUT', category: 'Space & Science' },
  { word: 'ROCKET', category: 'Space & Science' },
  { word: 'TELESCOPE', category: 'Space & Science' },
  { word: 'METEOR', category: 'Space & Science' },
  { word: 'SATELLITE', category: 'Space & Science' },
  { word: 'SPACESHIP', category: 'Space & Science' },
  { word: 'BLACK HOLE', category: 'Space & Science' },

  // Vehicles & Places
  { word: 'AIRPLANE', category: 'Vehicles & Places' },
  { word: 'CASTLE', category: 'Vehicles & Places' },
  { word: 'BICYCLE', category: 'Vehicles & Places' },
  { word: 'HOT AIR BALLOON', category: 'Vehicles & Places' },
  { word: 'HELICOPTER', category: 'Vehicles & Places' },
  { word: 'SKATEBOARD', category: 'Vehicles & Places' },
  { word: 'SAILBOAT', category: 'Vehicles & Places' },
  { word: 'TRAIN', category: 'Vehicles & Places' },
  { word: 'SUBMARINE', category: 'Vehicles & Places' },
  { word: 'PYRAMID', category: 'Vehicles & Places' },
  { word: 'LIGHTHOUSE', category: 'Vehicles & Places' },
  { word: 'WINDMILL', category: 'Vehicles & Places' },
  { word: 'ROLLER COASTER', category: 'Vehicles & Places' },

  // Party & Treasures
  { word: 'BALLOON', category: 'Party & Celebration' },
  { word: 'TREASURE', category: 'Party & Celebration' },
  { word: 'CROWN', category: 'Party & Celebration' },
  { word: 'MAGIC WAND', category: 'Party & Celebration' },
  { word: 'TROPHY', category: 'Party & Celebration' },
  { word: 'FIREWORKS', category: 'Party & Celebration' },
  { word: 'GIFT BOX', category: 'Party & Celebration' },
];

const gameTimers = new Map();
const roundTransitionTimeouts = new Map();

function sanitizeGameStateForMember(gameState, memberId) {
  if (!gameState) return null;
  const isDrawer = gameState.currentDrawerId === memberId;
  const isRoundOver = gameState.status === 'round_end' || gameState.status === 'idle';
  const hasGuessed = Array.isArray(gameState.guessedMemberIds) && gameState.guessedMemberIds.includes(memberId);
  const showFullWord = isDrawer || isRoundOver || hasGuessed;

  const rawWord = gameState.word || '';
  const maskedWord = showFullWord
    ? rawWord
    : rawWord.replace(/[A-Za-z0-9]/g, '_ ');

  return {
    status: gameState.status,
    currentDrawerId: gameState.currentDrawerId,
    currentDrawerName: gameState.currentDrawerName,
    word: showFullWord ? rawWord : '',
    maskedWord,
    wordLength: rawWord.length,
    category: gameState.category,
    round: gameState.round,
    maxRounds: gameState.maxRounds,
    timeRemaining: gameState.timeRemaining,
    scores: gameState.scores || {},
    guessedMemberIds: gameState.guessedMemberIds || [],
    drawHistory: gameState.drawHistory || [],
    isDrawer,
  };
}

async function broadcastGameState(io, roomId) {
  const room = await roomStore.getRoom(roomId);
  if (!room || !room.gameState) return;

  try {
    const roomSockets = await io.in(roomId).fetchSockets();
    for (const s of roomSockets) {
      const memId = s.session?.memberId;
      s.emit('game:state', sanitizeGameStateForMember(room.gameState, memId));
    }
  } catch (err) {
    console.warn('[Game] Broadcast error:', err.message);
  }
}

async function startNewRound(io, roomId, explicitDrawerId = null, starterName = null) {
  const room = await roomStore.getRoom(roomId);
  if (!room) return;

  if (gameTimers.has(roomId)) {
    clearInterval(gameTimers.get(roomId));
    gameTimers.delete(roomId);
  }
  if (roundTransitionTimeouts.has(roomId)) {
    clearTimeout(roundTransitionTimeouts.get(roomId));
    roundTransitionTimeouts.delete(roomId);
  }

  const membersList = Object.values(room.members || {});
  if (membersList.length === 0) return;

  let nextDrawer = null;
  if (explicitDrawerId && room.members[explicitDrawerId]) {
    nextDrawer = room.members[explicitDrawerId];
  } else {
    const currentDrawerIdx = membersList.findIndex(
      (m) => m.memberId === room.gameState?.currentDrawerId
    );
    const nextIdx = (currentDrawerIdx + 1) % membersList.length;
    nextDrawer = membersList[nextIdx];
  }

  // Filter out recently used words in this match so words never repeat
  const usedWords = Array.isArray(room.gameState?.usedWords) ? room.gameState.usedWords : [];
  const availableWords = WORD_BANK.filter((item) => !usedWords.includes(item.word));
  const pool = availableWords.length > 0 ? availableWords : WORD_BANK;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  const nextRound = (room.gameState?.round || 0) + 1;
  const currentScores = room.gameState?.scores || {};

  membersList.forEach((m) => {
    if (!currentScores[m.memberId]) {
      currentScores[m.memberId] = { name: m.displayName, score: 0 };
    }
  });

  room.gameState = {
    status: 'drawing',
    currentDrawerId: nextDrawer.memberId,
    currentDrawerName: nextDrawer.displayName,
    word: picked.word,
    category: picked.category,
    round: nextRound,
    maxRounds: 5,
    timeRemaining: 60,
    scores: currentScores,
    guessedMemberIds: [],
    drawHistory: [],
    usedWords: [...usedWords, picked.word],
  };

  await roomStore.saveRoom(room);
  await broadcastGameState(io, roomId);

  // Broadcast to room that a game/round has started
  io.to(roomId).emit('game:started', {
    startedBy: starterName || nextDrawer.displayName,
    drawerName: nextDrawer.displayName,
    drawerMemberId: nextDrawer.memberId,
    category: picked.category,
    round: nextRound,
    maxRounds: 5,
  });

  io.to(roomId).emit('game:round_start', {
    round: nextRound,
    drawerName: nextDrawer.displayName,
    category: picked.category,
  });

  const timer = setInterval(async () => {
    const currentRoom = await roomStore.getRoom(roomId);
    if (!currentRoom || currentRoom.gameState?.status !== 'drawing') {
      clearInterval(timer);
      gameTimers.delete(roomId);
      return;
    }

    currentRoom.gameState.timeRemaining -= 1;
    io.to(roomId).emit('game:tick', {
      timeRemaining: currentRoom.gameState.timeRemaining,
    });

    if (currentRoom.gameState.timeRemaining <= 0) {
      clearInterval(timer);
      gameTimers.delete(roomId);
      await endRound(io, roomId, "Time's up!");
    } else {
      await roomStore.saveRoom(currentRoom);
    }
  }, 1000);

  gameTimers.set(roomId, timer);
}

async function endRound(io, roomId, reason) {
  if (gameTimers.has(roomId)) {
    clearInterval(gameTimers.get(roomId));
    gameTimers.delete(roomId);
  }

  const room = await roomStore.getRoom(roomId);
  if (!room || !room.gameState) return;

  room.gameState.status = 'round_end';
  await roomStore.saveRoom(room);

  await broadcastGameState(io, roomId);

  io.to(roomId).emit('game:round_end', {
    word: room.gameState.word,
    category: room.gameState.category,
    reason,
    scores: room.gameState.scores,
  });

  if (room.gameState.round >= room.gameState.maxRounds) {
    const transition = setTimeout(async () => {
      roundTransitionTimeouts.delete(roomId);
      const finishedRoom = await roomStore.getRoom(roomId);
      if (finishedRoom && finishedRoom.gameState) {
        finishedRoom.gameState.status = 'idle';
        await roomStore.saveRoom(finishedRoom);
        await broadcastGameState(io, roomId);
        io.to(roomId).emit('game:match_end', {
          scores: finishedRoom.gameState.scores,
        });
      }
    }, 5000);
    roundTransitionTimeouts.set(roomId, transition);
  } else {
    const transition = setTimeout(async () => {
      roundTransitionTimeouts.delete(roomId);
      await startNewRound(io, roomId);
    }, 4500);
    roundTransitionTimeouts.set(roomId, transition);
  }
}

// Per-socket rate limiter: max 30 events per 5 seconds
function createSocketRateLimiter(maxEvents = 30, windowMs = 5000) {
  const eventTimestamps = [];
  return function isAllowed() {
    const now = Date.now();
    while (eventTimestamps.length > 0 && eventTimestamps[0] <= now - windowMs) {
      eventTimestamps.shift();
    }
    if (eventTimestamps.length >= maxEvents) {
      return false;
    }
    eventTimestamps.push(now);
    return true;
  };
}

export function setupSocketIO(io) {
  // Socket handshake middleware: require valid session token
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const session = verifySessionToken(token);
    if (!session) {
      return next(new Error('Invalid or expired authentication token'));
    }

    socket.session = session;
    next();
  });

  io.on('connection', async (socket) => {
    const { roomId, memberId, displayName } = socket.session;
    const isAllowed = createSocketRateLimiter();

    socket.join(roomId);

    // Register member in roomStore
    await roomStore.addMember(roomId, {
      memberId,
      displayName,
      socketId: socket.id,
    });

    const room = await roomStore.getRoom(roomId);
    if (room) {
      // Send authoritative player state snapshot to connecting socket
      socket.emit('player:state', room.playerState);

      // Send queue snapshot to connecting socket
      socket.emit('queue:update', {
        queue: room.queue || [],
        nowPlaying: room.nowPlaying || null,
        version: room.queueVersion || 1,
      });

      // Send media state snapshot to connecting socket
      socket.emit('media:state', room.mediaState || { type: 'youtube' });

      // Send game state snapshot to connecting socket
      socket.emit('game:state', sanitizeGameStateForMember(room.gameState, memberId));

      // Send welcome announcement snapshot to connecting socket
      if (room.welcomeMessage) {
        socket.emit('room:welcome_message', {
          message: room.welcomeMessage,
          creatorDisplayName: room.creatorDisplayName || 'Host',
        });
      }

      // Broadcast updated member list to all room participants
      io.to(roomId).emit(
        'room:members',
        Object.values(room.members || {}).map((m) => ({
          memberId: m.memberId,
          displayName: m.displayName,
          isOnline: m.isOnline,
        }))
      );
    }

    // Ping / Pong for 3-sample median clock offset calibration
    socket.on('ping:client', (payload) => {
      if (!isAllowed()) return;
      const parsed = pingSchema.safeParse(payload);
      if (!parsed.success) return;

      socket.emit('pong:server', {
        clientTime: parsed.data.clientTime,
        serverTime: Date.now(),
      });
    });

    // Update or clear room welcome announcement message
    socket.on('room:set_welcome_message', async ({ message }, ack) => {
      try {
        const currentRoom = await roomStore.getRoom(roomId);
        if (!currentRoom) return;

        const cleanMessage =
          typeof message === 'string' && message.trim()
            ? message.trim().slice(0, 140)
            : null;

        currentRoom.welcomeMessage = cleanMessage;
        await roomStore.saveRoom(currentRoom);

        io.to(roomId).emit('room:welcome_message', {
          message: currentRoom.welcomeMessage,
          creatorDisplayName: currentRoom.creatorDisplayName || displayName,
        });

        if (typeof ack === 'function') {
          ack({ ok: true, welcomeMessage: currentRoom.welcomeMessage });
        }
      } catch (err) {
        console.warn('[socket] set_welcome_message error:', err);
        if (typeof ack === 'function') {
          ack({ ok: false, error: err.message });
        }
      }
    });

    // player:set-video
    socket.on('player:set-video', async (payload) => {
      if (!isAllowed()) return;
      const parsed = setVideoSchema.safeParse(payload);
      if (!parsed.success) return;

      const updated = await roomStore.updatePlayerState(roomId, {
        videoId: parsed.data.videoId,
        status: 'playing',
        positionSec: 0,
      });

      const currentRoom = await roomStore.getRoom(roomId);
      if (currentRoom) {
        currentRoom.nowPlaying = {
          id: crypto.randomUUID(),
          videoId: parsed.data.videoId,
          title: parsed.data.title || 'Untitled',
          channel: parsed.data.channel || '',
          thumbnail:
            parsed.data.thumbnailUrl ||
            parsed.data.thumbnail ||
            `https://i.ytimg.com/vi/${parsed.data.videoId}/hqdefault.jpg`,
          durationSeconds: Number(parsed.data.durationSec || parsed.data.durationSeconds || 0) || 0,
          addedById: memberId,
          addedByName: displayName,
          addedAt: Date.now(),
        };
        currentRoom.queueVersion = (currentRoom.queueVersion || 0) + 1;
        await roomStore.saveRoom(currentRoom);
        io.to(roomId).emit('queue:update', {
          queue: currentRoom.queue || [],
          nowPlaying: currentRoom.nowPlaying,
          version: currentRoom.queueVersion,
        });
      }

      if (updated) {
        if (currentRoom?.mediaState?.type === 'local') {
          currentRoom.mediaState = {
            type: 'youtube',
            sharerId: null,
            sharerName: null,
            fileName: null,
            durationSec: 0,
            positionSec: 0,
            status: 'paused',
          };
          await roomStore.saveRoom(currentRoom);
          io.to(roomId).emit('media:state', currentRoom.mediaState);
        }
        io.to(roomId).emit('player:state', updated);
      }
    });

    // queue:add
    socket.on('queue:add', async (payload) => {
      if (!isAllowed()) return;
      const parsed = queueAddSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit('queue:error', { message: 'Invalid video payload' });
        return;
      }

      try {
        const result = await roomStore.addToQueue(roomId, parsed.data, {
          memberId,
          displayName,
        });
        if (result?.room) {
          if (result.room.mediaState?.type === 'local' && result.startedImmediately) {
            result.room.mediaState = {
              type: 'youtube',
              sharerId: null,
              sharerName: null,
              fileName: null,
              durationSec: 0,
              positionSec: 0,
              status: 'paused',
            };
            await roomStore.saveRoom(result.room);
            io.to(roomId).emit('media:state', result.room.mediaState);
          }

          io.to(roomId).emit('queue:update', {
            queue: result.room.queue || [],
            nowPlaying: result.room.nowPlaying || null,
            version: result.room.queueVersion,
          });

          if (result.startedImmediately) {
            io.to(roomId).emit('player:state', result.room.playerState);
          }
        }
      } catch (err) {
        socket.emit('queue:error', { message: err.message });
      }
    });

    // queue:remove
    socket.on('queue:remove', async (payload) => {
      if (!isAllowed()) return;
      const parsed = queueRemoveSchema.safeParse(payload);
      if (!parsed.success) return;

      const updatedRoom = await roomStore.removeFromQueue(roomId, parsed.data.itemId);
      if (updatedRoom) {
        io.to(roomId).emit('queue:update', {
          queue: updatedRoom.queue || [],
          nowPlaying: updatedRoom.nowPlaying || null,
          version: updatedRoom.queueVersion,
        });
      }
    });

    // queue:skip
    socket.on('queue:skip', async () => {
      if (!isAllowed()) return;
      const updatedRoom = await roomStore.skipQueue(roomId);
      if (updatedRoom) {
        if (updatedRoom.mediaState?.type === 'local') {
          updatedRoom.mediaState = {
            type: 'youtube',
            sharerId: null,
            sharerName: null,
            fileName: null,
            durationSec: 0,
            positionSec: 0,
            status: 'paused',
          };
          await roomStore.saveRoom(updatedRoom);
          io.to(roomId).emit('media:state', updatedRoom.mediaState);
        }
        io.to(roomId).emit('queue:update', {
          queue: updatedRoom.queue || [],
          nowPlaying: updatedRoom.nowPlaying || null,
          version: updatedRoom.queueVersion,
        });
        io.to(roomId).emit('player:state', updatedRoom.playerState);
      }
    });

    // queue:ended
    socket.on('queue:ended', async (payload) => {
      if (!isAllowed()) return;
      const parsed = queueEndedSchema.safeParse(payload);
      if (!parsed.success) return;

      const updatedRoom = await roomStore.endedQueue(roomId, parsed.data.itemId);
      if (updatedRoom) {
        if (updatedRoom.mediaState?.type === 'local') {
          updatedRoom.mediaState = {
            type: 'youtube',
            sharerId: null,
            sharerName: null,
            fileName: null,
            durationSec: 0,
            positionSec: 0,
            status: 'paused',
          };
          await roomStore.saveRoom(updatedRoom);
          io.to(roomId).emit('media:state', updatedRoom.mediaState);
        }
        io.to(roomId).emit('queue:update', {
          queue: updatedRoom.queue || [],
          nowPlaying: updatedRoom.nowPlaying || null,
          version: updatedRoom.queueVersion,
        });
        io.to(roomId).emit('player:state', updatedRoom.playerState);
      }
    });

    // player:play
    socket.on('player:play', async (payload) => {
      if (!isAllowed()) return;
      const parsed = positionSchema.safeParse(payload);
      if (!parsed.success) return;

      const currentRoom = await roomStore.getRoom(roomId);
      const updated = await roomStore.updatePlayerState(roomId, {
        status: 'playing',
        positionSec: parsed.data.positionSec,
      });

      if (updated) {
        if (currentRoom?.mediaState?.type === 'local') {
          currentRoom.mediaState = {
            type: 'youtube',
            sharerId: null,
            sharerName: null,
            fileName: null,
            durationSec: 0,
            positionSec: 0,
            status: 'paused',
          };
          await roomStore.saveRoom(currentRoom);
          io.to(roomId).emit('media:state', currentRoom.mediaState);
        }
        io.to(roomId).emit('player:state', updated);
      }
    });

    // player:pause
    socket.on('player:pause', async (payload) => {
      if (!isAllowed()) return;
      const parsed = positionSchema.safeParse(payload);
      if (!parsed.success) return;

      const currentRoom = await roomStore.getRoom(roomId);
      const updated = await roomStore.updatePlayerState(roomId, {
        status: 'paused',
        positionSec: parsed.data.positionSec,
      });

      if (updated) {
        if (currentRoom?.mediaState?.type === 'local') {
          currentRoom.mediaState = {
            type: 'youtube',
            sharerId: null,
            sharerName: null,
            fileName: null,
            durationSec: 0,
            positionSec: 0,
            status: 'paused',
          };
          await roomStore.saveRoom(currentRoom);
          io.to(roomId).emit('media:state', currentRoom.mediaState);
        }
        io.to(roomId).emit('player:state', updated);
      }
    });

    // player:seek
    socket.on('player:seek', async (payload) => {
      if (!isAllowed()) return;
      const parsed = positionSchema.safeParse(payload);
      if (!parsed.success) return;

      const currentRoom = await roomStore.getRoom(roomId);
      const updated = await roomStore.updatePlayerState(roomId, {
        status: currentRoom?.playerState?.status || 'playing',
        positionSec: parsed.data.positionSec,
      });

      if (updated) {
        if (currentRoom?.mediaState?.type === 'local') {
          currentRoom.mediaState = {
            type: 'youtube',
            sharerId: null,
            sharerName: null,
            fileName: null,
            durationSec: 0,
            positionSec: 0,
            status: 'paused',
          };
          await roomStore.saveRoom(currentRoom);
          io.to(roomId).emit('media:state', currentRoom.mediaState);
        }
        io.to(roomId).emit('player:state', updated);
      }
    });

    // voice:state
    socket.on('voice:state', (payload) => {
      if (!isAllowed()) return;
      const parsed = voiceStateSchema.safeParse(payload);
      if (!parsed.success) return;

      io.to(roomId).emit('voice:state', {
        memberId,
        displayName,
        isMicEnabled: parsed.data.isMicEnabled,
      });
    });

    // camera:state
    socket.on('camera:state', (payload) => {
      if (!isAllowed()) return;
      const parsed = cameraStateSchema.safeParse(payload);
      if (!parsed.success) return;

      io.to(roomId).emit('camera:state', {
        memberId,
        displayName,
        isCameraEnabled: parsed.data.isCameraEnabled,
      });
    });

    // reaction:send
    socket.on('reaction:send', (payload) => {
      if (!isAllowed()) return;
      const parsed = reactionSchema.safeParse(payload);
      if (!parsed.success) return;

      io.to(roomId).emit('reaction:new', {
        id: crypto.randomUUID(),
        emoji: parsed.data.emoji,
        senderId: memberId,
        senderName: displayName,
        timestamp: Date.now(),
      });
    });

    // media:start
    socket.on('media:start', async (payload) => {
      if (!isAllowed()) return;
      const parsed = mediaStartSchema.safeParse(payload);
      if (!parsed.success) return;

      const room = await roomStore.getRoom(roomId);
      if (!room) return;

      room.mediaState = {
        type: 'local',
        sharerId: memberId,
        sharerName: displayName,
        fileName: parsed.data.fileName,
        durationSec: parsed.data.durationSec || 0,
        positionSec: 0,
        status: 'playing',
      };

      if (room.playerState) {
        room.playerState.status = 'paused';
      }

      await roomStore.saveRoom(room);
      io.to(roomId).emit('media:state', room.mediaState);
      io.to(roomId).emit('player:state', room.playerState);
    });

    // media:stop
    socket.on('media:stop', async () => {
      if (!isAllowed()) return;
      const room = await roomStore.getRoom(roomId);
      if (!room) return;

      room.mediaState = {
        type: 'youtube',
        sharerId: null,
        sharerName: null,
        fileName: null,
        durationSec: 0,
        positionSec: 0,
        status: 'paused',
      };

      await roomStore.saveRoom(room);
      io.to(roomId).emit('media:state', room.mediaState);
    });

    // media:control
    socket.on('media:control', async (payload) => {
      if (!isAllowed()) return;
      const parsed = mediaControlSchema.safeParse(payload);
      if (!parsed.success) return;

      const room = await roomStore.getRoom(roomId);
      if (!room || room.mediaState?.type !== 'local') return;

      if (parsed.data.action === 'play') room.mediaState.status = 'playing';
      if (parsed.data.action === 'pause') room.mediaState.status = 'paused';
      if (parsed.data.positionSec !== undefined) room.mediaState.positionSec = parsed.data.positionSec;

      await roomStore.saveRoom(room);
      io.to(roomId).emit('media:state', room.mediaState);
      io.to(roomId).emit('media:control', {
        action: parsed.data.action,
        positionSec: parsed.data.positionSec,
        byMemberId: memberId,
      });
    });

    // --- Scribble & Guess Game Handlers ---
    const isDrawAllowed = createSocketRateLimiter(600, 5000);

    // game:start
    socket.on('game:start', async () => {
      if (!isAllowed()) return;
      await startNewRound(io, roomId, null, displayName);
    });

    // game:draw
    socket.on('game:draw', async (payload) => {
      if (!isDrawAllowed()) return;
      const parsed = gameDrawSchema.safeParse(payload);
      if (!parsed.success) return;

      const room = await roomStore.getRoom(roomId);
      if (!room || room.gameState?.status !== 'drawing') return;
      if (room.gameState.currentDrawerId !== memberId) return;

      if (!Array.isArray(room.gameState.drawHistory)) {
        room.gameState.drawHistory = [];
      }
      if (room.gameState.drawHistory.length < 2500) {
        room.gameState.drawHistory.push(parsed.data);
      }

      io.to(roomId).emit('game:draw', parsed.data);
    });

    // game:clear
    socket.on('game:clear', async () => {
      if (!isAllowed()) return;
      const room = await roomStore.getRoom(roomId);
      if (!room || room.gameState?.status !== 'drawing') return;
      if (room.gameState.currentDrawerId !== memberId) return;

      room.gameState.drawHistory = [];
      await roomStore.saveRoom(room);
      io.to(roomId).emit('game:clear');
    });

    // game:guess
    socket.on('game:guess', async (payload) => {
      if (!isAllowed()) return;
      const parsed = gameGuessSchema.safeParse(payload);
      if (!parsed.success) return;

      const room = await roomStore.getRoom(roomId);
      if (!room || room.gameState?.status !== 'drawing') return;

      // Drawer cannot guess own word
      if (room.gameState.currentDrawerId === memberId) return;

      // Already guessed correctly in this round
      if (room.gameState.guessedMemberIds?.includes(memberId)) return;

      const userGuess = parsed.data.text.trim().toUpperCase();
      const targetWord = (room.gameState.word || '').trim().toUpperCase();

      if (userGuess === targetWord) {
        const remaining = room.gameState.timeRemaining || 10;
        const guesserPoints = Math.max(15, Math.round(remaining * 1.5));
        const drawerPoints = 15;

        if (!room.gameState.scores[memberId]) {
          room.gameState.scores[memberId] = { name: displayName, score: 0 };
        }
        room.gameState.scores[memberId].score += guesserPoints;

        const drawerId = room.gameState.currentDrawerId;
        if (drawerId && room.gameState.scores[drawerId]) {
          room.gameState.scores[drawerId].score += drawerPoints;
        }

        room.gameState.guessedMemberIds.push(memberId);
        await roomStore.saveRoom(room);

        io.to(roomId).emit('game:correct_guess', {
          memberId,
          displayName,
          points: guesserPoints,
          word: room.gameState.word,
          scores: room.gameState.scores,
        });

        // Let this user see the full word now
        socket.emit('game:state', sanitizeGameStateForMember(room.gameState, memberId));

        // Check if all active non-drawers have guessed
        const onlineNonDrawers = Object.values(room.members || {}).filter(
          (m) => m.isOnline && m.memberId !== drawerId
        );
        if (
          onlineNonDrawers.length > 0 &&
          room.gameState.guessedMemberIds.length >= onlineNonDrawers.length
        ) {
          await endRound(io, roomId, 'Everyone guessed correctly! 🎉');
        }
      } else {
        io.to(roomId).emit('game:chat', {
          id: crypto.randomUUID(),
          memberId,
          displayName,
          text: parsed.data.text,
          timestamp: Date.now(),
        });
      }
    });

    // game:skip
    socket.on('game:skip', async () => {
      if (!isAllowed()) return;
      const room = await roomStore.getRoom(roomId);
      if (!room || room.gameState?.status !== 'drawing') return;
      await endRound(io, roomId, 'Round was skipped');
    });

    // game:reset
    socket.on('game:reset', async () => {
      if (!isAllowed()) return;
      if (gameTimers.has(roomId)) {
        clearInterval(gameTimers.get(roomId));
        gameTimers.delete(roomId);
      }
      if (roundTransitionTimeouts.has(roomId)) {
        clearTimeout(roundTransitionTimeouts.get(roomId));
        roundTransitionTimeouts.delete(roomId);
      }
      const room = await roomStore.getRoom(roomId);
      if (room) {
        room.gameState = {
          status: 'idle',
          currentDrawerId: null,
          currentDrawerName: null,
          word: '',
          category: '',
          round: 0,
          maxRounds: 5,
          timeRemaining: 60,
          scores: {},
          guessedMemberIds: [],
          drawHistory: [],
          usedWords: [],
        };
        await roomStore.saveRoom(room);
        await broadcastGameState(io, roomId);
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      const roomBefore = await roomStore.getRoom(roomId);
      if (
        roomBefore?.gameState?.status === 'drawing' &&
        roomBefore.gameState.currentDrawerId === memberId
      ) {
        io.to(roomId).emit('game:chat', {
          id: crypto.randomUUID(),
          memberId: 'system',
          displayName: 'System',
          text: `${displayName} (Drawer) disconnected. Rotating round...`,
          timestamp: Date.now(),
        });
        await endRound(io, roomId, 'Drawer disconnected');
      }

      const result = await roomStore.removeMemberBySocket(socket.id);
      if (result?.room) {
        if (result.sharerLeft) {
          io.to(result.room.roomId).emit('media:state', result.room.mediaState);
        }
        io.to(result.room.roomId).emit(
          'room:members',
          Object.values(result.room.members || {}).map((m) => ({
            memberId: m.memberId,
            displayName: m.displayName,
            isOnline: m.isOnline,
          }))
        );
      }
    });
  });
}

