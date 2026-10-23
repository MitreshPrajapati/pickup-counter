import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../src/app';
import { prisma } from '../src/db';
import { config } from '../src/config';

describe('Concurrency & Race Condition Stress Integration Suite', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * TEST 1: Stock Contention Race Condition
   * 10 concurrent requests competing for only 2 available items.
   * Invariant: Zero overselling. Exactly 2 succeed (201), exactly 8 fail (409).
   */
  it('Race Condition 1: 10 concurrent buyers for 2 items results in exactly 2 orders and 8 conflicts', async () => {
    // 1. Create a dedicated test product with physical_stock = 2
    const testProduct = await prisma.product.create({
      data: {
        name: `Contention Snack ${Date.now()}`,
        price_paise: 2500,
        physical_stock: 2,
      },
    });

    // 2. Fire 10 simultaneous requests attempting to reserve 1 item each
    const concurrentRequests = Array.from({ length: 10 }, () =>
      request(app)
        .post('/orders')
        .send({
          items: [{ productId: testProduct.id, quantity: 1 }],
        })
    );

    const responses = await Promise.all(concurrentRequests);

    const successes = responses.filter((res) => res.status === 201);
    const conflicts = responses.filter((res) => res.status === 409);

    // 3. Strict Concurrency Invariants
    expect(successes.length).toBe(2);
    expect(conflicts.length).toBe(8);

    // Verify all 8 conflict responses returned structured error message
    for (const conflict of conflicts) {
      expect(conflict.body.success).toBe(false);
      expect(conflict.body.error.message).toContain('Insufficient stock');
    }

    // 4. Verify Database State
    const productCheck = await request(app).get('/products');
    const updatedProduct = productCheck.body.data.find((p: any) => p.id === testProduct.id);
    expect(updatedProduct.physical_stock).toBe(2);
    expect(updatedProduct.available_stock).toBe(0); // All 2 items actively held
  });

  /**
   * TEST 2: Duplicate Webhook Race Condition
   * 2 identical payment webhook events dispatched simultaneously with same eventId.
   * Invariant: Both return 200 OK, exactly 1 payment event saved, order transitions to PAID once.
   */
  it('Race Condition 2: Simultaneous duplicate webhooks do not double-credit or fail', async () => {
    // 1. Create a pending order
    const testProduct = await prisma.product.create({
      data: {
        name: `Webhook Race Product ${Date.now()}`,
        price_paise: 1500,
        physical_stock: 5,
      },
    });

    const orderRes = await request(app)
      .post('/orders')
      .send({
        items: [{ productId: testProduct.id, quantity: 1 }],
      });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.data.id;
    const amountPaise = orderRes.body.data.total_paise;

    // 2. Create payload and HMAC signature
    const fixedEventId = `evt_race_${crypto.randomUUID()}`;
    const payload = {
      eventId: fixedEventId,
      orderId,
      amountPaise,
      status: 'SUCCESS',
      timestamp: new Date().toISOString(),
    };

    const payloadString = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', config.webhookSecret)
      .update(payloadString)
      .digest('hex');

    // 3. Fire 2 identical webhooks simultaneously
    const [webhook1, webhook2] = await Promise.all([
      request(app)
        .post('/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Signature', signature)
        .send(payloadString),
      request(app)
        .post('/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Signature', signature)
        .send(payloadString),
    ]);

    // 4. Both should succeed with 200 OK
    expect(webhook1.status).toBe(200);
    expect(webhook2.status).toBe(200);

    const statuses = [webhook1.body.data.status, webhook2.body.data.status];
    expect(statuses).toContain('PAID');
    expect(statuses).toContain('ALREADY_PROCESSED');

    // 5. Database invariants: Exactly 1 payment event recorded
    const savedEvents = await prisma.paymentEvent.findMany({
      where: { event_id: fixedEventId },
    });
    expect(savedEvents.length).toBe(1);

    // Order status is PAID
    const orderInDb = await prisma.order.findUnique({
      where: { id: orderId },
    });
    expect(orderInDb?.status).toBe('PAID');
  });

  /**
   * TEST 3: Double Locker Claim Race Condition
   * 2 physical locker callbacks hitting the claim endpoint simultaneously.
   * Invariant: Exactly 1 succeeds (200), exactly 1 fails with 409 Conflict.
   * Physical stock is decremented exactly once.
   */
  it('Race Condition 3: Simultaneous locker claims allow only 1 claim and decrement stock once', async () => {
    // 1. Create a product with physical stock = 10
    const testProduct = await prisma.product.create({
      data: {
        name: `Locker Claim Race Item ${Date.now()}`,
        price_paise: 3000,
        physical_stock: 10,
      },
    });

    // 2. Create order for 3 items and mark as PAID
    const orderRes = await request(app)
      .post('/orders')
      .send({
        items: [{ productId: testProduct.id, quantity: 3 }],
      });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.data.id;

    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'PAID' },
    });

    // 3. Fire 2 simultaneous claim requests
    const [claim1, claim2] = await Promise.all([
      request(app).post(`/orders/${orderId}/pickup-claim`),
      request(app).post(`/orders/${orderId}/pickup-claim`),
    ]);

    const statusCodes = [claim1.status, claim2.status].sort();
    expect(statusCodes).toEqual([200, 409]);

    // Winner gets success: true; loser gets 409 conflict
    const winner = claim1.status === 200 ? claim1 : claim2;
    const loser = claim1.status === 409 ? claim1 : claim2;

    expect(winner.body.success).toBe(true);
    expect(loser.body.success).toBe(false);
    expect(loser.body.error.message).toContain('Only PAID orders can be claimed');

    // 4. Invariant: Physical stock decremented exactly once (10 - 3 = 7)
    const productAfter = await prisma.product.findUnique({
      where: { id: testProduct.id },
    });
    expect(productAfter?.physical_stock).toBe(7);

    // Order status is now CLAIMED
    const orderAfter = await prisma.order.findUnique({
      where: { id: orderId },
    });
    expect(orderAfter?.status).toBe('CLAIMED');
  });

  /**
   * TEST 4: Zero-Cron Hold Expiration Invariant
   * Expired reservations must immediately lapse without any cron job or background worker.
   */
  it('Zero-Cron Invariant: Expired order hold immediately releases stock dynamically', async () => {
    // 1. Create product with physical stock = 1
    const testProduct = await prisma.product.create({
      data: {
        name: `Zero-Cron Item ${Date.now()}`,
        price_paise: 1000,
        physical_stock: 1,
      },
    });

    // 2. Reserve the only 1 available item
    const orderRes = await request(app)
      .post('/orders')
      .send({
        items: [{ productId: testProduct.id, quantity: 1 }],
      });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.data.id;

    // Available stock is now 0
    let productsList = await request(app).get('/products');
    let item = productsList.body.data.find((p: any) => p.id === testProduct.id);
    expect(item.available_stock).toBe(0);

    // 3. Simulate passage of 120s by setting expires_at to 10 seconds in the past
    await prisma.$executeRaw`
      UPDATE orders
      SET expires_at = NOW() - INTERVAL '10 seconds'
      WHERE id = ${orderId}::uuid;
    `;

    // 4. Without running any cron or background worker, query /products immediately
    productsList = await request(app).get('/products');
    item = productsList.body.data.find((p: any) => p.id === testProduct.id);

    // Stock must dynamically be available again (1)
    expect(item.available_stock).toBe(1);
  });
});
