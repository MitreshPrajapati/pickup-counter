import { Product, Order } from '../types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function fetchProducts(): Promise<Product[]> {
  const res = await fetch(`${API_BASE}/products`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch products: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
}

export async function createOrder(
  items: { productId: string; quantity: number }[]
): Promise<Order> {
  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message || json.error || 'Failed to place reservation');
  }
  return json.data;
}

export async function fetchOrder(orderId: string): Promise<Order> {
  const res = await fetch(`${API_BASE}/orders/${orderId}`, { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message || json.error || 'Failed to fetch order');
  }
  return json.data;
}

export async function claimOrderPickup(
  orderId: string
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/orders/${orderId}/pickup-claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message || json.error || 'Failed to claim pickup');
  }
  return json.data;
}

export async function simulateUpiPayment(
  orderId: string,
  amountPaise: number
): Promise<{ success: boolean; data?: any; error?: string }> {
  const res = await fetch('/api/simulate-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, amountPaise }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Simulation failed');
  }
  return json;
}
