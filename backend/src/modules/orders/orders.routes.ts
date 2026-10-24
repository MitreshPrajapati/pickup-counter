import { Router } from 'express';
import { ordersController } from './orders.controller';

const router = Router();

// POST /orders - Create reservation with 120s TTL
router.post('/', (req, res, next) => ordersController.createOrder(req, res, next));

// GET /orders/:id - Get order status and remaining duration
router.get('/:id', (req, res, next) => ordersController.getOrder(req, res, next));

// POST /orders/:id/pickup-claim - Atomically claim locker pickup and decrement stock
router.post('/:id/pickup-claim', (req, res, next) => ordersController.claimPickup(req, res, next));

export default router;
