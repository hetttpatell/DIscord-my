import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { verifySessionToken } from '../services/security.js';
import { searchYouTube } from '../services/youtubeService.js';

const router = Router();

// Per-member rate limiter: 30 requests per minute
const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    return req.member?.memberId || req.ip || 'anonymous';
  },
  message: { error: 'Search rate limit exceeded (max 30 queries per minute)' },
});

// Middleware to verify session token from Authorization header
export function requireSessionToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Session token required' });
  }

  const token = authHeader.slice(7).trim();
  const session = verifySessionToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }

  req.member = session;
  next();
}

// GET /api/search?q=...
router.get('/search', requireSessionToken, searchRateLimiter, async (req, res) => {
  const query = req.query.q;
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.json([]);
  }

  try {
    const results = await searchYouTube(query.trim());
    return res.json(results);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'YouTube search failed. Please try again.',
    });
  }
});

export default router;

