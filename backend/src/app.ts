import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config';
import { RequestWithRawBody } from './types';
import productsRouter from './modules/products/products.routes';
import ordersRouter from './modules/orders/orders.routes';
import paymentsRouter from './modules/payments/payments.routes';
import { AppError } from './utils/errors';

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

// Modular Feature Routes
app.use('/products', productsRouter);
app.use('/orders', ordersRouter);
app.use('/payments', paymentsRouter);

// Global Error Handling Middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err instanceof AppError ? err.statusCode : err.status || 500;
  const message = err.message || 'Internal Server Error';

  if (statusCode >= 500) {
    console.error('[Server Error]', err);
  }

  res.status(statusCode).json({
    success: false,
    error: message,
  });
});

export default app;
