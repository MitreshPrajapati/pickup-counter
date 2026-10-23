import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { paymentsService } from './payments.service';
import { RequestWithRawBody } from '../../types';
import { AppError } from '../../utils/errors';

const webhookSchema = z.object({
  eventId: z.string().min(1, 'eventId is required'),
  orderId: z.string().uuid('Invalid order UUID format'),
  amountPaise: z.number().int().positive('amountPaise must be a positive integer'),
  status: z.string().optional(),
});

export class PaymentsController {
  async handleWebhook(req: RequestWithRawBody, res: Response, next: NextFunction): Promise<void> {
    try {
      const signatureHeader = req.headers['x-signature'] as string | undefined;

      const parseResult = webhookSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new AppError(parseResult.error.errors.map((e) => e.message).join(', '), 400);
      }

      const result = await paymentsService.processPaymentWebhook(
        req.rawBody,
        signatureHeader,
        parseResult.data
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const paymentsController = new PaymentsController();
