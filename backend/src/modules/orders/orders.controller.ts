import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ordersService } from './orders.service';
import { AppError } from '../../utils/errors';

const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid('Invalid product UUID format'),
        quantity: z.number().int().positive('Quantity must be an integer greater than 0'),
      })
    )
    .nonempty('Order must contain at least one product item'),
});

export class OrdersController {
  async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parseResult = createOrderSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new AppError(parseResult.error.errors.map((e) => e.message).join(', '), 400);
      }

      const order = await ordersService.createOrder(parseResult.data.items);
      res.status(201).json({
        success: true,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  async getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const order = await ordersService.getOrderById(id);
      res.status(200).json({
        success: true,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  async claimPickup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await ordersService.claimOrderPickup(id);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const ordersController = new OrdersController();
