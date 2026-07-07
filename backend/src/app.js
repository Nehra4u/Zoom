import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createServer } from 'http';
import { connectDb } from './config/db.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admins.js';
import userRoutes from './routes/users.js';
import sessionRoutes from './routes/session.js';
import clientAuthRoutes from './routes/clientAuth.js';
import clientProfileRoutes from './routes/clientProfile.js';
import homeRoutes from './routes/home.js';
import webhookRoutes from './routes/webhooks.js';
import tokenRoutes from './routes/token.js';
import recordingRoutes from './routes/recordings.js';
import settingsRoutes from './routes/settings.js';
import auditLogRoutes from './routes/auditLogs.js';
import { setupSocket } from './socket/index.js';
import { handleZoomWebhookEvent } from './webhooks/zoom.js';
import { startReconciliationJob, getReconciliationStatus } from './services/reconciliationService.js';
import { startRecordingRetentionJob } from './services/settingsService.js';

const app = express();
const httpServer = createServer(app);

app.use(helmet());

app.use(
  cors({
    origin: process.env.ADMIN_PORTAL_URL || 'http://localhost:5173',
    credentials: true,
  })
);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, status: 'RATE_LIMITED', message: 'Too many login attempts. Please try again in 15 minutes.' },
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'zoomcontrol-backend',
    reconciliation: getReconciliationStatus(),
  });
});

app.use('/api/webhooks/zoom', express.raw({ type: 'application/json' }), webhookRoutes);

if (process.env.NODE_ENV !== 'production') {
  app.post('/api/webhooks/dev/simulate', express.json(), async (req, res) => {
    try {
      await handleZoomWebhookEvent(req.body);
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });
}

app.use(express.json({ limit: '10kb' }));

app.use('/api/auth/admin/login', loginLimiter);
app.use('/api/auth/login', loginLimiter);

app.use('/api/auth/admin', authRoutes);
app.use('/api/auth', clientAuthRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/users', clientProfileRoutes);
app.use('/api/users', userRoutes);
app.use('/api', homeRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/token', tokenRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/audit-logs', auditLogRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3001;

async function start() {
  await connectDb();
  setupSocket(httpServer);
  startReconciliationJob();
  startRecordingRetentionJob();
  httpServer.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
