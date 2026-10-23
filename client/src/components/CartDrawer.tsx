'use client';

import React from 'react';
import { CartItem } from '../types';

interface CartDrawerProps {
  items: CartItem[];
  onUpdateQuantity: (productId: string, delta: number) => void;
  onClearCart: () => void;
  onCheckout: () => void;
  isSubmitting: boolean;
}

export function CartDrawer({
  items,
  onUpdateQuantity,
  onClearCart,
  onCheckout,
  isSubmitting,
}: CartDrawerProps) {
  const totalPaise = items.reduce(
    (sum, item) => sum + item.product.price_paise * item.quantity,
    0
  );
  const totalRupees = (totalPaise / 100).toFixed(2);
  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);

  if (items.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center text-zinc-500">
        <p className="text-sm">Your cart is empty.</p>
        <p className="text-xs text-zinc-600 mt-1">
          Select snacks from the catalog to begin reservation.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between shadow-xl">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-4">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-zinc-100 text-lg">Your Tray</h2>
            <span className="bg-zinc-800 text-zinc-300 text-xs px-2 py-0.5 rounded-full">
              {totalCount} items
            </span>
          </div>
          <button
            onClick={onClearCart}
            disabled={isSubmitting}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition"
          >
            Clear
          </button>
        </div>

        <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
          {items.map(({ product, quantity }) => (
            <div
              key={product.id}
              className="flex items-center justify-between bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/80"
            >
              <div className="min-w-0 pr-2">
                <p className="text-sm font-medium text-zinc-200 truncate">
                  {product.name}
                </p>
                <p className="text-xs text-zinc-500">
                  ₹{(product.price_paise / 100).toFixed(2)} each
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => onUpdateQuantity(product.id, -1)}
                  disabled={isSubmitting}
                  className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center justify-center font-bold text-sm transition"
                >
                  -
                </button>
                <span className="text-sm font-semibold w-5 text-center text-zinc-100">
                  {quantity}
                </span>
                <button
                  onClick={() => onUpdateQuantity(product.id, 1)}
                  disabled={isSubmitting || quantity >= product.available_stock}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm transition ${
                    quantity >= product.available_stock
                      ? 'bg-zinc-800/40 text-zinc-600 cursor-not-allowed'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                  }`}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-6 border-t border-zinc-800 mt-6">
        <div className="flex items-baseline justify-between mb-4">
          <span className="text-zinc-400 text-sm">Total Due</span>
          <div className="text-right">
            <span className="text-2xl font-bold text-emerald-400">
              ₹{totalRupees}
            </span>
            <span className="block text-xs text-zinc-500">
              ({totalPaise} paise)
            </span>
          </div>
        </div>

        <button
          onClick={onCheckout}
          disabled={isSubmitting}
          className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-semibold rounded-xl transition shadow-lg shadow-emerald-950 flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <span>Holding stock...</span>
          ) : (
            <span>Hold Stock & Pay (120s TTL)</span>
          )}
        </button>

        <p className="text-[11px] text-zinc-500 text-center mt-2.5">
          Holding inventory for 120 seconds. Zero cron worker required.
        </p>
      </div>
    </div>
  );
}
