import { Request, Response } from 'express';
import { z } from 'zod';
import { ordersService } from './orders.service';
import { asyncHandler } from '../../utils/asyncHandler';

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
  createOrder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const validatedData = createOrderSchema.parse(req.body);
    const order = await ordersService.createOrder(validatedData.items);
    res.status(201).json({
      success: true,
      data: order,
    });
  });

  getOrder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const order = await ordersService.getOrderById(id);
    res.status(200).json({
      success: true,
      data: order,
    });
  });

  claimPickup = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const result = await ordersService.claimOrderPickup(id);
    res.status(200).json({
      success: true,
      data: result,
    });
  });
}

export const ordersController = new OrdersController();
