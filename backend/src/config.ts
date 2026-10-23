import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env located in the backend root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/snack_dispenser',
  webhookSecret: process.env.WEBHOOK_SECRET || 'super_secret_webhook_signing_key_snack_dispenser_2026',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  orderTtlSeconds: 120, // 120s TTL for dynamic stock reservation
};
