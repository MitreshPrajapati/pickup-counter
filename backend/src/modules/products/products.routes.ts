import { Router } from 'express';
import { productsController } from './products.controller';

const router = Router();

// GET /products - Returns product catalog with dynamically calculated available_stock
router.get('/', (req, res, next) => productsController.getProducts(req, res, next));

export default router;
