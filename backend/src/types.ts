import { Request } from 'express';
import {
  OrderStatus,
  Product as PrismaProduct,
  Order as PrismaOrder,
  OrderItem as PrismaOrderItem,
  PaymentEvent as PrismaPaymentEvent,
} from '@prisma/client';

export { OrderStatus };
export type Product = PrismaProduct;
export type Order = PrismaOrder;
export type OrderItem = PrismaOrderItem;
export type PaymentEvent = PrismaPaymentEvent;

export interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

export interface ProductWithAvailableStock extends Product {
  available_stock: number;
}

export interface OrderWithDetails extends Order {
  items: (OrderItem & { product?: Product })[];
  expires_in_seconds?: number;
}
