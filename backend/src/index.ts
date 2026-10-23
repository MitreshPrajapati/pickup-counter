import { app } from './app';
import { config } from './config';

const server = app.listen(config.port, () => {
  console.log(`[Backend] Snack Dispenser server running on http://localhost:${config.port}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close();
});
