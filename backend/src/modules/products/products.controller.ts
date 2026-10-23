import { Request, Response, NextFunction } from 'express';
import { productsService } from './products.service';

export class ProductsController {
  async getProducts(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const products = await productsService.getProductsWithAvailableStock();
      res.status(200).json({
        success: true,
        data: products,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const productsController = new ProductsController();
