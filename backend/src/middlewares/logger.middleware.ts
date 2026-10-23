import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, originalUrl } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;
    const logMsg = `${method} ${originalUrl} - ${statusCode} (${duration}ms)`;

    if (statusCode >= 500) {
      logger.error(`[HTTP] ${logMsg}`);
    } else if (statusCode >= 400) {
      logger.warn(`[HTTP] ${logMsg}`);
    } else {
      logger.info(`[HTTP] ${logMsg}`);
    }
  });

  next();
}
