'use client';

import React from 'react';
import { Product } from '../types';

interface ProductCardProps {
  product: Product;
  cartQuantity: number;
  onAddToCart: (product: Product) => void;
}

export function ProductCard({
  product,
  cartQuantity,
  onAddToCart,
}: ProductCardProps) {
  const isOutOfStock = product.available_stock <= 0;
  const isMaxInCart = cartQuantity >= product.available_stock;
  const formattedPrice = (product.price_paise / 100).toFixed(2);

  // Badge color based on stock
  const getBadgeClass = () => {
    if (isOutOfStock) return 'bg-red-500/10 text-red-400 border-red-500/20';
    if (product.available_stock <= 3)
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  };

  return (
    <div className="flex flex-col justify-between bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition shadow-sm">
      <div>
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="font-semibold text-lg text-zinc-100 line-clamp-2">
            {product.name}
          </h3>
          <span
            className={`text-xs px-2.5 py-1 rounded-full border font-medium shrink-0 ${getBadgeClass()}`}
          >
            {isOutOfStock ? 'Sold Out' : `${product.available_stock} left`}
          </span>
        </div>

        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-2xl font-bold text-emerald-400">
            ₹{formattedPrice}
          </span>
          <span className="text-xs text-zinc-500">
            ({product.price_paise} paise)
          </span>
        </div>
      </div>

      <div className="pt-2">
        <button
          onClick={() => onAddToCart(product)}
          disabled={isOutOfStock || isMaxInCart}
          className={`w-full py-2.5 px-4 rounded-xl font-medium text-sm transition flex items-center justify-center gap-2 ${
            isOutOfStock || isMaxInCart
              ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950'
          }`}
        >
          {isOutOfStock
            ? 'Out of Stock'
            : isMaxInCart
            ? `Max Selected (${cartQuantity})`
            : cartQuantity > 0
            ? `Add More (${cartQuantity})`
            : 'Add to Cart'}
        </button>
      </div>
    </div>
  );
}
