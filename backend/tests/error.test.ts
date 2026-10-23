import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

describe('Global Error & Not Found Handling', () => {
  it('GET /undefined-route returns 404 with structured JSON', async () => {
    const res = await request(app).get('/api/unknown/endpoint');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toHaveProperty('statusCode', 404);
    expect(res.body.error.message).toContain('Route not found');
  });

  it('POST /orders with invalid payload returns 400 validation error from Zod & asyncHandler', async () => {
    const res = await request(app)
      .post('/orders')
      .send({
        items: [{ productId: 'invalid-uuid', quantity: -5 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.statusCode).toBe(400);
    expect(res.body.error.message).toBe('Validation error');
    expect(Array.isArray(res.body.error.details)).toBe(true);
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('GET /orders/:id with non-existent UUID returns 404 NotFoundError', async () => {
    const nonExistentUuid = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).get(`/orders/${nonExistentUuid}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.statusCode).toBe(404);
    expect(res.body.error.message).toContain('not found');
  });
});
