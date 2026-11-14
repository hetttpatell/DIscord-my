import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { config } from './config.js';
import healthRoutes from './routes/healthRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import voiceRoutes from './routes/voiceRoutes.js';
import { setupSocketIO } from './sockets/index.js';
import { roomStore } from './services/roomStore.js';

export const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: ['req.headers.authorization', 'req.body.password', '*.password'],
});

const app = express();
const httpServer = createServer(app);

// CORS configuration locked strictly to CLIENT_ORIGIN (with local dev allowance)
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, or same-origin)
    if (
      !origin ||
      origin === config.CLIENT_ORIGIN ||
      (config.NODE_ENV !== 'production' &&
        (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')))
    ) {
      return callback(null, true);
    }
    return callback(new Error('CORS policy: Not allowed by origin'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));

// Helmet with Content Security Policy allowing YouTube iframe, LiveKit wss, and Socket.IO
const liveKitHost = (() => {
  try {
    return new URL(config.LIVEKIT_URL).host;
  } catch {
    return '*.livekit.cloud';
  }
})();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://www.youtube.com', 'https://s.ytimg.com'],
        frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com'],
        imgSrc: ["'self'", 'data:', 'https://i.ytimg.com', 'https://*.ytimg.com'],
        connectSrc: [
          "'self'",
          config.CLIENT_ORIGIN,
          `wss://${liveKitHost}`,
          `https://${liveKitHost}`,
          'https://*.livekit.cloud',
          'wss://*.livekit.cloud',
        ],
        mediaSrc: ["'self'", 'blob:', 'data:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json({ limit: '100kb' }));

// Pino request logging (excluding secrets and health checks)
app.use((req, res, next) => {
  if (req.path === '/healthz' || req.path === '/api/health') {
    return next();
  }
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
});

// Mount Routes
app.use(healthRoutes);
app.use('/api', roomRoutes);
app.use('/api', searchRoutes);
app.use('/api', voiceRoutes);

// Global Error Handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message =
    status >= 500 && config.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Something went wrong';

  logger.error({
    status,
    message: err.message,
    path: req.path,
    stack: config.NODE_ENV === 'development' ? err.stack : undefined,
  });

  res.status(status).json({ error: message });
});

// Socket.IO configuration
const io = new Server(httpServer, {
  cors: corsOptions,
  transports: ['websocket', 'polling'],
});

// Configure Redis adapter if REDIS_URL is provided
let redisPubClient = null;
let redisSubClient = null;

if (config.REDIS_URL) {
  try {
    redisPubClient = new Redis(config.REDIS_URL);
    redisSubClient = redisPubClient.duplicate();
    io.adapter(createAdapter(redisPubClient, redisSubClient));
    logger.info('[Socket.IO] Redis adapter connected');
  } catch (err) {
    logger.warn(`[Socket.IO] Redis adapter init failed: ${err.message}`);
  }
}

// Setup Socket.IO events and room handlers
setupSocketIO(io);

// Graceful Shutdown
async function shutdown() {
  logger.info('Shutting down server gracefully...');
  io.close();
  if (redisPubClient) await redisPubClient.quit().catch(() => {});
  if (redisSubClient) await redisSubClient.quit().catch(() => {});
  await roomStore.close();

  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forceful shutdown timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server if not running in test mode
if (config.NODE_ENV !== 'test') {
  httpServer.listen(config.PORT, () => {
    logger.info(`🚀 Afterspot server running on port ${config.PORT} (${config.NODE_ENV})`);
  });
}

export { app, httpServer, io };

