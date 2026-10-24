import { Request, Response } from 'express';
import { productsService } from './products.service';
import { asyncHandler } from '../../utils/asyncHandler';

export class ProductsController {
  getProducts = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const products = await productsService.getProductsWithAvailableStock();
    res.status(200).json({
      success: true,
      data: products,
    });
  });
}

export const productsController = new ProductsController();
