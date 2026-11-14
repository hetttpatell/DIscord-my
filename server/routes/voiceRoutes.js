import { Router } from 'express';
import { requireSessionToken } from './searchRoutes.js';
import { generateLiveKitVoiceToken } from '../services/voiceService.js';

const router = Router();

// POST /api/voice-token
router.post('/voice-token', requireSessionToken, async (req, res, next) => {
  try {
    const { roomId, memberId, displayName } = req.member;
    const voiceData = await generateLiveKitVoiceToken({
      roomId,
      memberId,
      displayName,
    });
    return res.json(voiceData);
  } catch (err) {
    next(err);
  }
});

export default router;

