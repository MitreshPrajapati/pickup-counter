import { app } from './app';
import { config } from './config';
import { prisma, checkDbConnection } from './db';

const server = app.listen(config.port, async () => {
  console.log(`[Backend] Snack Dispenser server running on http://localhost:${config.port}`);

  const isConnected = await checkDbConnection();
  if (isConnected) {
    console.log('[Prisma/PostgreSQL] Database connected successfully.');
  } else {
    console.warn('[Prisma/PostgreSQL] Database not connected. Ensure PostgreSQL is running (docker compose up -d postgres).');
  }
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server and disconnecting Prisma');
  server.close(async () => {
    await prisma.$disconnect();
  });
});
