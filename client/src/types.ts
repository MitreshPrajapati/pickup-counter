export type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'CLAIMED'
  | 'EXPIRED'
  | 'NEEDS_REVIEW'
  | 'EXPIRED_PAID_PENDING_REFUND';

export interface Product {
  id: string;
  name: string;
  price_paise: number;
  physical_stock: number;
  available_stock: number;
  created_at?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  price_paise_at_purchase: number;
  product?: Product;
}

export interface Order {
  id: string;
  total_paise: number;
  status: OrderStatus;
  expires_at: string;
  created_at: string;
  updated_at: string;
  expires_in_seconds?: number;
  items?: OrderItem[];
}
