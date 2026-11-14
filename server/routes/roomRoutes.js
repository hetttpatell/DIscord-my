import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { roomStore } from '../services/roomStore.js';
import {
  hashPassword,
  verifyPassword,
  signSessionToken,
  generateMemberId,
} from '../services/security.js';

const router = Router();

// Rate limiter: 10 requests per minute per IP for room creation/joining
export const roomAuthRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many room requests from this IP, please try again in a minute' },
});

export const roomAuthSchema = z.object({
  roomId: z
    .string()
    .trim()
    .min(3, 'Room ID must be 3-32 characters')
    .max(32, 'Room ID must be 3-32 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Room ID must only contain letters, numbers, hyphens, and underscores'),
  password: z
    .string()
    .min(4, 'Password must be 4-64 characters')
    .max(64, 'Password must be 4-64 characters'),
  displayName: z
    .string()
    .trim()
    .min(1, 'Display name must be 1-24 characters')
    .max(24, 'Display name must be 1-24 characters'),
});

// POST /api/rooms (Create room)
router.post('/rooms', roomAuthRateLimiter, async (req, res, next) => {
  try {
    const parseResult = roomAuthSchema.safeParse(req.body);
    if (!parseResult.success) {
      const issues = parseResult.error.issues || parseResult.error.errors || [];
      return res.status(400).json({
        error: issues.map((e) => e.message).join(', '),
      });
    }

    const { roomId, password, displayName } = parseResult.data;
    const existing = await roomStore.getRoom(roomId);
    if (existing) {
      return res.status(409).json({ error: 'Room ID already taken. Please choose another or join it.' });
    }

    const passwordHash = hashPassword(password);
    const memberId = generateMemberId();

    await roomStore.createRoom({
      roomId,
      passwordHash,
      creatorDisplayName: displayName,
      creatorMemberId: memberId,
    });

    const token = signSessionToken({
      roomId,
      memberId,
      displayName,
    });

    return res.status(201).json({
      token,
      roomId,
      memberId,
      displayName,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/rooms/join (Join room)
router.post('/rooms/join', roomAuthRateLimiter, async (req, res, next) => {
  try {
    const parseResult = roomAuthSchema.safeParse(req.body);
    if (!parseResult.success) {
      const issues = parseResult.error.issues || parseResult.error.errors || [];
      return res.status(400).json({
        error: issues.map((e) => e.message).join(', '),
      });
    }

    const { roomId, password, displayName } = parseResult.data;
    const room = await roomStore.getRoom(roomId);

    // Generic error to prevent room enumeration
    if (!room || !verifyPassword(password, room.passwordHash)) {
      return res.status(401).json({ error: 'Invalid room ID or password' });
    }

    const activeMembers = Object.values(room.members || {}).filter((m) => m.isOnline);
    if (activeMembers.length >= 20) {
      return res.status(403).json({ error: 'Room is full (maximum 20 participants)' });
    }

    const memberId = generateMemberId();
    const token = signSessionToken({
      roomId,
      memberId,
      displayName,
    });

    return res.json({
      token,
      roomId,
      memberId,
      displayName,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

