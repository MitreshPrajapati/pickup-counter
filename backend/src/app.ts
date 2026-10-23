import express from 'express';
import cors from 'cors';
import { config } from './config';
import { RequestWithRawBody } from './types';

export const app = express();

// Enable CORS for frontend client
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);

// Capture raw body Buffer for HMAC-SHA256 signature verification
app.use(
  express.json({
    verify: (req: RequestWithRawBody, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
