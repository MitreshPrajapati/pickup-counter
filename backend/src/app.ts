import express from 'express';
import cors from 'cors';
import { config } from './config';
import { RequestWithRawBody } from './types';
import productsRouter from './modules/products/products.routes';
import ordersRouter from './modules/orders/orders.routes';
import paymentsRouter from './modules/payments/payments.routes';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { requestLogger } from './middlewares/logger.middleware';

export const app = express();

// Request logging middleware
app.use(requestLogger);

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

// 404 handler for unknown endpoints
app.use(notFoundHandler);

// Centralized Global Error Handling Middleware
app.use(errorHandler);

export default app;
