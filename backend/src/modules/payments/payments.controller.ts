import { Response } from 'express';
import { z } from 'zod';
import { paymentsService } from './payments.service';
import { RequestWithRawBody } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';

const webhookSchema = z.object({
  eventId: z.string().min(1, 'eventId is required'),
  orderId: z.string().uuid('Invalid order UUID format'),
  amountPaise: z.number().int().positive('amountPaise must be a positive integer'),
  status: z.string().optional(),
});

export class PaymentsController {
  handleWebhook = asyncHandler(async (req: RequestWithRawBody, res: Response): Promise<void> => {
    const signatureHeader = req.headers['x-signature'] as string | undefined;
    const validatedData = webhookSchema.parse(req.body);

    const result = await paymentsService.processPaymentWebhook(
      req.rawBody,
      signatureHeader,
      validatedData
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  });
}

export const paymentsController = new PaymentsController();
