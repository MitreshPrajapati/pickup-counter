'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Product, CartItem, Order } from '../types';
import { fetchProducts, createOrder } from '../lib/api';
import { ProductCard } from '../components/ProductCard';
import { CartDrawer } from '../components/CartDrawer';
import { ReservationModal } from '../components/ReservationModal';

export default function KioskPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load products catalog
  const loadProducts = useCallback(async () => {
    try {
      const data = await fetchProducts();
      setProducts(data);
    } catch (err: any) {
      console.error('Failed to load products:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
    // Refresh products catalog every 6 seconds to reflect active holds from other kiosks
    const interval = setInterval(loadProducts, 6000);
    return () => clearInterval(interval);
  }, [loadProducts]);

  // Add to cart
  const handleAddToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.available_stock) return prev;
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  // Update quantity in cart
  const handleUpdateQuantity = (productId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.product.id !== productId) return item;
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          if (newQty > item.product.available_stock) return item;
          return { ...item, quantity: newQty };
        })
        .filter(Boolean) as CartItem[];
    });
  };

  // Clear cart
  const handleClearCart = () => setCart([]);

  // Initiate reservation
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsSubmitting(true);
    setToastMessage(null);

    try {
      const items = cart.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
      }));

      const order = await createOrder(items);
      setActiveOrder(order);
      setCart([]);
      await loadProducts();
    } catch (err: any) {
      setToastMessage(err.message || 'Stock reservation failed');
      await loadProducts();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOrderCompleted = async () => {
    await loadProducts();
  };

  const handleCloseModal = async () => {
    setActiveOrder(null);
    await loadProducts();
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-emerald-500/20">
      {/* Kiosk Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-xl shadow-lg shadow-emerald-950">
              🥨
            </div>
            <div>
              <h1 className="font-bold text-lg text-zinc-100 leading-tight">
                Snack Dispenser & Locker Counter
              </h1>
              <p className="text-xs text-zinc-400">
                Self-Service Kiosk • Real-time Concurrency Control
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-medium text-zinc-400">
              System Active
            </span>
          </div>
        </div>
      </header>

      {/* Main Kiosk Content */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Banner Alert for Concurrency Conflicts */}
        {toastMessage && (
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-between text-amber-300 text-sm">
            <span>⚠️ {toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="text-xs bg-amber-500/20 px-2 py-1 rounded-lg hover:bg-amber-500/30 transition"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Product Catalog Grid (2 Columns) */}
          <section className="lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-zinc-100">
                  Select Snacks
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Dynamic zero-cron inventory calculation (paise precision)
                </p>
              </div>

              <button
                onClick={loadProducts}
                className="text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg transition"
              >
                ↻ Refresh
              </button>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-44 bg-zinc-900/40 rounded-2xl border border-zinc-800/50 animate-pulse"
                  />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="p-12 text-center bg-zinc-900/40 rounded-2xl border border-zinc-800 text-zinc-500 text-sm">
                No products found in catalog. Run database seed to populate.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {products.map((product) => {
                  const inCart =
                    cart.find((c) => c.product.id === product.id)?.quantity ?? 0;
                  return (
                    <ProductCard
                      key={product.id}
                      product={product}
                      cartQuantity={inCart}
                      onAddToCart={handleAddToCart}
                    />
                  );
                })}
              </div>
            )}
          </section>

          {/* Cart & Reservation Sidebar (1 Column) */}
          <aside className="lg:col-span-1 sticky top-28">
            <CartDrawer
              items={cart}
              onUpdateQuantity={handleUpdateQuantity}
              onClearCart={handleClearCart}
              onCheckout={handleCheckout}
              isSubmitting={isSubmitting}
            />
          </aside>
        </div>
      </div>

      {/* Reservation & Checkout Modal */}
      {activeOrder && (
        <ReservationModal
          order={activeOrder}
          onClose={handleCloseModal}
          onOrderCompleted={handleOrderCompleted}
        />
      )}
    </main>
  );
}
