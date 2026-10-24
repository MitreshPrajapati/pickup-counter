-- 001_init.sql: Schema for Snack Dispenser & Locker Pickup Counter

-- Create order_status enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE order_status AS ENUM (
      'PENDING',
      'PAID',
      'CLAIMED',
      'EXPIRED',
      'NEEDS_REVIEW',
      'EXPIRED_PAID_PENDING_REFUND'
    );
  END IF;
END $$;

-- Products table (financial precision in integer paise)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
  physical_stock INTEGER NOT NULL CHECK (physical_stock >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
  status order_status NOT NULL DEFAULT 'PENDING',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_paise_at_purchase INTEGER NOT NULL CHECK (price_paise_at_purchase >= 0)
);

-- Payment events table for HMAC verification and deduplication
CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(255) UNIQUE NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id),
  amount_paise INTEGER NOT NULL,
  raw_payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance & concurrency lookups
CREATE INDEX IF NOT EXISTS idx_orders_status_expires ON orders(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_order_items_product_order ON order_items(product_id, order_id);
