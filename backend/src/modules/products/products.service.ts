import { prisma } from '../../db';
import { ProductWithAvailableStock } from '../../types';

export class ProductsService {
  /**
   * Fetches all products with dynamically calculated available stock (Zero-Cron).
   * Active holds:
   *  - PENDING orders with expires_at > NOW()
   *  - PAID orders awaiting locker pickup
   */
  async getProductsWithAvailableStock(): Promise<ProductWithAvailableStock[]> {
    const products = await prisma.$queryRaw<ProductWithAvailableStock[]>`
      SELECT 
        p.id,
        p.name,
        p.price_paise,
        p.physical_stock,
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
        ))::int AS available_stock,
        p.created_at
      FROM products p
      ORDER BY p.name ASC;
    `;

    return products;
  }
}

export const productsService = new ProductsService();
