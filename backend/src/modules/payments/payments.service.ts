import crypto from 'crypto';
import { prisma } from '../../db';
import { config } from '../../config';
import { NotFoundError, UnauthorizedError } from '../../utils/errors';

export interface WebhookPayload {
  eventId: string;
  orderId: string;
  amountPaise: number;
  status?: string;
  [key: string]: any;
}

export interface WebhookResult {
  status: string;
  message: string;
  orderId: string;
  orderStatus?: string;
}

export class PaymentsService {
  /**
   * Verifies the HMAC-SHA256 signature using timingSafeEqual.
   */
  verifyHmacSignature(rawBody: Buffer | undefined, signatureHeader?: string): boolean {
    if (!rawBody || !signatureHeader) {
      return false;
    }

    try {
      const computed = crypto
        .createHmac('sha256', config.webhookSecret)
        .update(rawBody)
        .digest('hex');

      const expectedBuffer = Buffer.from(computed, 'utf8');
      const actualBuffer = Buffer.from(signatureHeader, 'utf8');

      if (expectedBuffer.length !== actualBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Processes payment webhook with strict deduplication and row-level locks.
   */
  async processPaymentWebhook(
    rawBody: Buffer | undefined,
    signatureHeader: string | undefined,
    payload: WebhookPayload
  ): Promise<WebhookResult> {
    // 1. HMAC Signature Verification
    const isValidSignature = this.verifyHmacSignature(rawBody, signatureHeader);
    if (!isValidSignature) {
      throw new UnauthorizedError('Invalid or missing HMAC webhook signature');
    }

    const { eventId, orderId, amountPaise } = payload;

    return await prisma.$transaction(async (tx) => {
      // 2. Idempotent Deduplication via payment_events table
      const insertedEvent = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO payment_events (id, event_id, order_id, amount_paise, raw_payload)
        VALUES (gen_random_uuid(), ${eventId}, ${orderId}::uuid, ${amountPaise}, ${JSON.stringify(payload)}::jsonb)
        ON CONFLICT (event_id) DO NOTHING
        RETURNING id;
      `;

      // If already recorded, acknowledge immediately (idempotent 200 OK)
      if (insertedEvent.length === 0) {
        return {
          status: 'ALREADY_PROCESSED',
          message: 'Payment event already processed and deduplicated',
          orderId,
        };
      }

      // 3. Lock target order row
      const lockedOrders = await tx.$queryRaw<{ id: string; total_paise: number; status: string; expires_at: Date }[]>`
        SELECT id, total_paise, status::text as status, expires_at
        FROM orders
        WHERE id = ${orderId}::uuid
        FOR UPDATE;
      `;

      if (lockedOrders.length === 0) {
        throw new NotFoundError(`Order with ID ${orderId} not found`);
      }

      const order = lockedOrders[0];

      // 4. Financial verification: Amount must strictly match integer paise total
      if (amountPaise !== order.total_paise) {
        await tx.$executeRaw`
          UPDATE orders
          SET status = 'NEEDS_REVIEW'::order_status, updated_at = NOW()
          WHERE id = ${orderId}::uuid;
        `;

        return {
          status: 'NEEDS_REVIEW',
          message: `Amount mismatch: expected ${order.total_paise} paise, received ${amountPaise} paise`,
          orderId,
          orderStatus: 'NEEDS_REVIEW',
        };
      }

      // 5. Late Payment Handling (Payment arrives after expires_at)
      const now = Date.now();
      const isExpired = new Date(order.expires_at).getTime() <= now;

      if (isExpired && order.status === 'PENDING') {
        // Check if items are still free
        const stockCheck = await tx.$queryRaw<{ has_shortage: boolean }[]>`
          SELECT EXISTS (
            SELECT 1
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ${orderId}::uuid
              AND oi.quantity > (
                p.physical_stock - COALESCE(
                  (
                    SELECT SUM(other_oi.quantity)
                    FROM order_items other_oi
                    JOIN orders other_o ON other_oi.order_id = other_o.id
                    WHERE other_oi.product_id = p.id
                      AND other_o.id != ${orderId}::uuid
                      AND (
                        (other_o.status = 'PENDING'::order_status AND other_o.expires_at > NOW())
                        OR other_o.status = 'PAID'::order_status
                      )
                  ), 0
                )
              )
          ) as has_shortage;
        `;

        const hasShortage = stockCheck[0]?.has_shortage ?? false;

        if (hasShortage) {
          // Stock was claimed by another customer while expired; flag for refund to prevent overselling
          await tx.$executeRaw`
            UPDATE orders
            SET status = 'EXPIRED_PAID_PENDING_REFUND'::order_status, updated_at = NOW()
            WHERE id = ${orderId}::uuid;
          `;

          return {
            status: 'EXPIRED_PAID_PENDING_REFUND',
            message: 'Payment received after reservation expired and stock is no longer available. Queued for refund.',
            orderId,
            orderStatus: 'EXPIRED_PAID_PENDING_REFUND',
          };
        }
      }

      // 6. Transition Order state to PAID
      await tx.$executeRaw`
        UPDATE orders
        SET status = 'PAID'::order_status, updated_at = NOW()
        WHERE id = ${orderId}::uuid;
      `;

      return {
        status: 'PAID',
        message: 'Payment confirmed. Order marked as PAID.',
        orderId,
        orderStatus: 'PAID',
      };
    });
  }
}

export const paymentsService = new PaymentsService();
