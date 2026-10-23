import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let details: any = undefined;

  // 1. Custom Application Errors (AppError, ConflictError, NotFoundError, UnauthorizedError)
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  }
  // 2. Zod Schema Validation Errors
  else if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Validation error';
    details = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
  }
  // 3. Prisma Database Errors
  else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      statusCode = 409;
      message = 'A resource with this unique value already exists';
      details = { target: err.meta?.target };
    } else if (err.code === 'P2025') {
      statusCode = 404;
      message = 'Requested record not found in database';
    } else {
      statusCode = 400;
      message = `Database query error: ${err.message}`;
    }
  }
  // 4. JSON Parser Syntax Errors (e.g. malformed JSON body)
  else if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400) {
    statusCode = 400;
    message = 'Invalid JSON payload format';
  }
  // 5. Default Generic Errors
  else if (err && err.message) {
    message = err.message;
    if (typeof err.statusCode === 'number') {
      statusCode = err.statusCode;
    } else if (typeof err.status === 'number') {
      statusCode = err.status;
    }
  }

  // Log 500 server errors with stack trace
  if (statusCode >= 500) {
    logger.error(`[Unhandled Exception] ${req.method} ${req.originalUrl}`, err);
  } else {
    logger.warn(`[Client Error ${statusCode}] ${req.method} ${req.originalUrl}: ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      statusCode,
      ...(details ? { details } : {}),
      ...(process.env.NODE_ENV !== 'production' && statusCode >= 500 ? { stack: err.stack } : {}),
    },
  });
}

/**
 * 404 Handler for undefined routes.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      message: `Cannot ${req.method} ${req.originalUrl} - Route not found`,
      statusCode: 404,
    },
  });
}
