import { prisma } from '../../db';
import { config } from '../../config';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { OrderWithDetails } from '../../types';

export interface CreateOrderItemInput {
  productId: string;
  quantity: number;
}

export class OrdersService {
  /**
   * Creates an order reservation with 120s TTL and row-level locks.
   * Prevents overselling under high concurrency via SELECT ... FOR UPDATE.
   */
  async createOrder(items: CreateOrderItemInput[]): Promise<OrderWithDetails> {
    if (!items || items.length === 0) {
      throw new ConflictError('Order must contain at least one item');
    }

    // Sort unique product IDs alphabetically to eliminate deadlock conditions
    const uniqueProductIds = Array.from(new Set(items.map((i) => i.productId))).sort();

    return await prisma.$transaction(async (tx) => {
      // 1. Lock products row-by-row in sorted order
      const lockedProducts = await tx.$queryRaw<{ id: string; name: string; price_paise: number; physical_stock: number }[]>`
        SELECT id, name, price_paise, physical_stock 
        FROM products 
        WHERE id = ANY(${uniqueProductIds}::uuid[])
        ORDER BY id ASC
        FOR UPDATE;
      `;

      if (lockedProducts.length !== uniqueProductIds.length) {
        throw new NotFoundError('One or more selected products do not exist');
      }

      const productMap = new Map(lockedProducts.map((p) => [p.id, p]));

      // 2. Compute dynamic available stock inside the transaction (Zero-Cron)
      const stockCheck = await tx.$queryRaw<{ id: string; available_stock: number }[]>`
        SELECT 
          p.id,
          (p.physical_stock - COALESCE(
            (
              SELECT SUM(oi.quantity)
              FROM order_items oi
              JOIN orders o ON oi.order_id = o.id
              WHERE oi.product_id = p.id
                AND (
                  (o.status = 'PENDING'::order_status AND o.expires_at > NOW())
                  OR o.status = 'PAID'::order_status
                )
            ), 0
          ))::int AS available_stock
        FROM products p
        WHERE p.id = ANY(${uniqueProductIds}::uuid[]);
      `;

      const availableStockMap = new Map(stockCheck.map((s) => [s.id, s.available_stock]));

      // 3. Verify stock sufficiency
      let totalPaise = 0;
      for (const item of items) {
        const product = productMap.get(item.productId)!;
        const available = availableStockMap.get(item.productId) ?? 0;

        if (available < item.quantity) {
          throw new ConflictError(
            `Insufficient stock for "${product.name}". Requested: ${item.quantity}, Available: ${available}`
          );
        }

        totalPaise += product.price_paise * item.quantity;
      }

      // 4. Create Order and OrderItems with authoritative 120-second TTL
      const expiresAt = new Date(Date.now() + config.orderTtlSeconds * 1000);

      const createdOrder = await tx.order.create({
        data: {
          total_paise: totalPaise,
          status: 'PENDING',
          expires_at: expiresAt,
          items: {
            create: items.map((item) => ({
              product_id: item.productId,
              quantity: item.quantity,
              price_paise_at_purchase: productMap.get(item.productId)!.price_paise,
            })),
          },
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      return {
        ...createdOrder,
        expires_in_seconds: config.orderTtlSeconds,
      };
    });
  }

  /**
   * Retrieves an order with remaining expiresInSeconds.
   */
  async getOrderById(orderId: string): Promise<OrderWithDetails> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundError(`Order with ID ${orderId} not found`);
    }

    const now = Date.now();
    let expiresInSeconds = 0;

    if (order.status === 'PENDING') {
      expiresInSeconds = Math.max(0, Math.floor((order.expires_at.getTime() - now) / 1000));
    }

    return {
      ...order,
      expires_in_seconds: expiresInSeconds,
    };
  }

  /**
   * Atomically claims a paid locker order.
   * State machine: PAID -> CLAIMED
   * Permanently decrements physical stock in products table.
   * Concurrency guarantee: Only 1 request can succeed; concurrent calls receive 409 Conflict.
   */
  async claimOrderPickup(orderId: string): Promise<{ success: boolean; message: string; orderId: string }> {
    return await prisma.$transaction(async (tx) => {
      // 1. Lock the order row
      const lockedOrders = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status::text as status
        FROM orders
        WHERE id = ${orderId}::uuid
        FOR UPDATE;
      `;

      if (lockedOrders.length === 0) {
        throw new NotFoundError(`Order with ID ${orderId} not found`);
      }

      const order = lockedOrders[0];

      // 2. Invariant verification: Must be currently PAID
      if (order.status !== 'PAID') {
        throw new ConflictError(
          `Cannot claim pickup for order. Current status is "${order.status}". Only PAID orders can be claimed.`
        );
      }

      // 3. Atomic transition: PAID -> CLAIMED
      await tx.$executeRaw`
        UPDATE orders
        SET status = 'CLAIMED'::order_status, updated_at = NOW()
        WHERE id = ${orderId}::uuid;
      `;

      // 4. Permanently decrement physical inventory
      await tx.$executeRaw`
        UPDATE products p
        SET physical_stock = p.physical_stock - oi.quantity
        FROM order_items oi
        WHERE oi.order_id = ${orderId}::uuid AND p.id = oi.product_id;
      `;

      return {
        success: true,
        message: 'Locker unlocked successfully. Order items claimed.',
        orderId,
      };
    });
  }
}

export const ordersService = new OrdersService();
