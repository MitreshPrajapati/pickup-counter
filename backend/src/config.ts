import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const postgresUser = process.env.POSTGRES_USER || 'postgres';
const postgresPassword = process.env.POSTGRES_PASSWORD || 'postgres';
const postgresHost = process.env.POSTGRES_HOST || 'localhost';
const postgresPort = process.env.POSTGRES_PORT || '5432';
const postgresDb = process.env.POSTGRES_DB || 'snack_dispenser';

const defaultDatabaseUrl = `postgresql://${postgresUser}:${postgresPassword}@${postgresHost}:${postgresPort}/${postgresDb}?schema=public`;

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || defaultDatabaseUrl,
  postgresUser,
  postgresPassword,
  postgresHost,
  postgresPort,
  postgresDb,
  webhookSecret: process.env.WEBHOOK_SECRET || 'super_secret_webhook_signing_key_snack_dispenser_2026',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  orderTtlSeconds: 120, // 120s TTL for dynamic stock reservation
};
