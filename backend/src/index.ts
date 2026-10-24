import { app } from './app';
import { config } from './config';
import { prisma, checkDbConnection } from './db';
import { logger } from './utils/logger';

const server = app.listen(config.port, async () => {
  logger.info(`[Backend] Snack Dispenser server running on http://localhost:${config.port}`);

  const isConnected = await checkDbConnection();
  if (isConnected) {
    logger.info('[Prisma/PostgreSQL] Database connected successfully.');
  } else {
    logger.warn('[Prisma/PostgreSQL] Database not connected. Ensure container is running (docker compose up -d postgres).');
  }
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server and disconnecting Prisma');
  server.close(async () => {
    await prisma.$disconnect();
  });
});
