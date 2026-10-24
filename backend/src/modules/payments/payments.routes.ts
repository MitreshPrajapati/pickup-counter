import { Router } from 'express';
import { paymentsController } from './payments.controller';

const router = Router();

// POST /payments/webhook - HMAC-verified, idempotent payment webhook ingestion
router.post('/webhook', (req, res, next) => paymentsController.handleWebhook(req, res, next));

export default router;
