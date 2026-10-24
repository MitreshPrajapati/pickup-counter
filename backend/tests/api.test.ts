import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../src/app';
import { prisma } from '../src/db';
import { config } from '../src/config';

describe('Modular API Endpoints Integration Tests', () => {
  let sampleProductId: string;
  let sampleProductPricePaise: number;

  beforeAll(async () => {
    // Fetch a sample product from the seeded database
    const product = await prisma.product.findFirst();
    if (!product) {
      throw new Error('Database not seeded with products');
    }
    sampleProductId = product.id;
    sampleProductPricePaise = product.price_paise;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /products', () => {
    it('should return products with dynamic available_stock', async () => {
      const res = await request(app).get('/products');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      const first = res.body.data[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('price_paise');
      expect(first).toHaveProperty('physical_stock');
      expect(first).toHaveProperty('available_stock');
      expect(typeof first.available_stock).toBe('number');
    });
  });

  describe('Order & Payment & Locker Lifecycle', () => {
    let orderId: string;
    let totalPaise: number;

    it('POST /orders - should reserve items with 120s TTL', async () => {
      const res = await request(app)
        .post('/orders')
        .send({
          items: [{ productId: sampleProductId, quantity: 1 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.expires_in_seconds).toBe(120);
      expect(res.body.data.total_paise).toBe(sampleProductPricePaise);

      orderId = res.body.data.id;
      totalPaise = res.body.data.total_paise;
    });

    it('GET /orders/:id - should retrieve order with remaining expiresInSeconds', async () => {
      const res = await request(app).get(`/orders/${orderId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(orderId);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.expires_in_seconds).toBeGreaterThan(0);
      expect(res.body.data.expires_in_seconds).toBeLessThanOrEqual(120);
    });

    it('POST /payments/webhook - rejects requests with invalid HMAC signature', async () => {
      const payload = {
        eventId: `evt_${crypto.randomUUID()}`,
        orderId,
        amountPaise: totalPaise,
        status: 'SUCCESS',
      };

      const res = await request(app)
        .post('/payments/webhook')
        .set('X-Signature', 'invalid_hmac_signature_hex')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('POST /payments/webhook - marks order as PAID with valid HMAC signature', async () => {
      const payload = {
        eventId: `evt_${crypto.randomUUID()}`,
        orderId,
        amountPaise: totalPaise,
        status: 'SUCCESS',
      };

      const payloadString = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', config.webhookSecret)
        .update(payloadString)
        .digest('hex');

      const res = await request(app)
        .post('/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Signature', signature)
        .send(payloadString);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PAID');

      // Verify order is now PAID
      const orderCheck = await request(app).get(`/orders/${orderId}`);
      expect(orderCheck.body.data.status).toBe('PAID');
    });

    it('POST /payments/webhook - idempotent deduplication with identical eventId', async () => {
      const fixedEventId = `evt_dedup_${crypto.randomUUID()}`;
      const payload = {
        eventId: fixedEventId,
        orderId,
        amountPaise: totalPaise,
        status: 'SUCCESS',
      };

      const payloadString = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', config.webhookSecret)
        .update(payloadString)
        .digest('hex');

      // First webhook
      const res1 = await request(app)
        .post('/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Signature', signature)
        .send(payloadString);
      expect(res1.status).toBe(200);

      // Duplicate webhook
      const res2 = await request(app)
        .post('/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Signature', signature)
        .send(payloadString);
      expect(res2.status).toBe(200);
      expect(res2.body.data.status).toBe('ALREADY_PROCESSED');
    });

    it('POST /orders/:id/pickup-claim - atomically transitions PAID -> CLAIMED', async () => {
      const res = await request(app).post(`/orders/${orderId}/pickup-claim`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.success).toBe(true);

      // Verify order is now CLAIMED
      const orderCheck = await request(app).get(`/orders/${orderId}`);
      expect(orderCheck.body.data.status).toBe('CLAIMED');
    });

    it('POST /orders/:id/pickup-claim - duplicate claim returns 409 Conflict', async () => {
      const res = await request(app).post(`/orders/${orderId}/pickup-claim`);
      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Only PAID orders can be claimed');
    });
  });
});
