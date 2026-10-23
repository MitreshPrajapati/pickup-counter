'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Order, OrderStatus } from '../types';
import { fetchOrder, claimOrderPickup, simulateUpiPayment } from '../lib/api';

interface ReservationModalProps {
  order: Order;
  onClose: () => void;
  onOrderCompleted: () => void;
}

export function ReservationModal({
  order: initialOrder,
  onClose,
  onOrderCompleted,
}: ReservationModalProps) {
  const [currentOrder, setCurrentOrder] = useState<Order>(initialOrder);
  // Monotonic local countdown initialized exclusively from server duration (Clock-Drift Immunity)
  const [timeLeft, setTimeLeft] = useState<number>(
    initialOrder.expires_in_seconds ?? 120
  );
  const [isSimulatingPayment, setIsSimulatingPayment] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Monotonic Countdown Timer (Section 4.5 of plan.md)
  useEffect(() => {
    if (timeLeft <= 0 || currentOrder.status !== 'PENDING') return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [timeLeft, currentOrder.status]);

  // 2. Authoritative Server Polling every 2 seconds
  const pollOrder = useCallback(async () => {
    try {
      const updated = await fetchOrder(initialOrder.id);
      setCurrentOrder(updated);

      if (updated.status !== 'PENDING') {
        if (updated.status === 'CLAIMED') {
          onOrderCompleted();
        }
      }
    } catch (err: any) {
      console.warn('Polling error:', err.message);
    }
  }, [initialOrder.id, onOrderCompleted]);

  useEffect(() => {
    if (currentOrder.status === 'CLAIMED') return;

    const poller = setInterval(() => {
      pollOrder();
    }, 2000);

    return () => clearInterval(poller);
  }, [pollOrder, currentOrder.status]);

  // Handle instant UPI Simulation
  const handleSimulatePayment = async () => {
    setIsSimulatingPayment(true);
    setErrorMessage(null);
    try {
      await simulateUpiPayment(currentOrder.id, currentOrder.total_paise);
      await pollOrder();
    } catch (err: any) {
      setErrorMessage(err.message || 'Payment simulation failed');
    } finally {
      setIsSimulatingPayment(false);
    }
  };

  // Handle Locker Claim Trigger
  const handleClaimPickup = async () => {
    setIsClaiming(true);
    setErrorMessage(null);
    try {
      const result = await claimOrderPickup(currentOrder.id);
      setClaimMessage(result.message);
      await pollOrder();
    } catch (err: any) {
      setErrorMessage(err.message || 'Claim pickup failed');
    } finally {
      setIsClaiming(false);
    }
  };

  const isExpired =
    timeLeft <= 0 && currentOrder.status === 'PENDING';
  const totalRupees = (currentOrder.total_paise / 100).toFixed(2);

  // Timer format (mm:ss)
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-6">
          <div>
            <h2 className="text-xl font-bold text-zinc-100">Kiosk Checkout</h2>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">
              Order ID: {currentOrder.id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 flex items-center justify-center text-sm transition"
          >
            ✕
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-red-300 text-xs">
            {errorMessage}
          </div>
        )}

        {/* Status Views */}
        {currentOrder.status === 'PENDING' && !isExpired && (
          <div className="flex flex-col items-center text-center">
            {/* Monotonic Countdown Banner */}
            <div className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 mb-6">
              <span className="text-xs uppercase tracking-wider text-zinc-400 font-medium">
                Server-Authoritative Stock Hold
              </span>
              <div className="text-4xl font-mono font-bold text-emerald-400 mt-1">
                {formattedTime}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">
                Zero-Cron dynamic reservation • Immune to local clock drift
              </p>
            </div>

            {/* Simulated UPI QR Code */}
            <div className="bg-white p-4 rounded-2xl shadow-inner mb-4 inline-block">
              <svg
                className="w-44 h-44 text-black"
                viewBox="0 0 100 100"
                fill="currentColor"
              >
                {/* Visual QR Code Mock Pattern */}
                <rect x="5" y="5" width="25" height="25" rx="3" />
                <rect x="9" y="9" width="17" height="17" fill="white" />
                <rect x="13" y="13" width="9" height="9" />
                <rect x="70" y="5" width="25" height="25" rx="3" />
                <rect x="74" y="9" width="17" height="17" fill="white" />
                <rect x="78" y="13" width="9" height="9" />
                <rect x="5" y="70" width="25" height="25" rx="3" />
                <rect x="9" y="74" width="17" height="17" fill="white" />
                <rect x="13" y="78" width="9" height="9" />
                <rect x="36" y="15" width="8" height="8" />
                <rect x="48" y="25" width="8" height="8" />
                <rect x="36" y="45" width="12" height="12" />
                <rect x="65" y="45" width="8" height="8" />
                <rect x="45" y="65" width="10" height="10" />
                <rect x="65" y="70" width="15" height="15" />
              </svg>
            </div>

            <p className="text-sm font-semibold text-zinc-200">
              Scan with any UPI App
            </p>
            <p className="text-xs text-zinc-500 mb-6">
              Amount Due: <span className="text-emerald-400 font-bold">₹{totalRupees}</span> ({currentOrder.total_paise} paise)
            </p>

            {/* Test Simulation Button */}
            <div className="w-full pt-2 border-t border-zinc-800">
              <button
                onClick={handleSimulatePayment}
                disabled={isSimulatingPayment}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-sm font-semibold transition border border-zinc-700/80 flex items-center justify-center gap-2"
              >
                {isSimulatingPayment ? (
                  <span>Signing HMAC & dispatching...</span>
                ) : (
                  <span>⚡ Simulate Instant UPI Payment</span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Expired View */}
        {isExpired && (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center text-2xl mx-auto mb-4 border border-red-500/20">
              ⏱️
            </div>
            <h3 className="text-lg font-bold text-zinc-100 mb-2">
              Reservation Hold Expired
            </h3>
            <p className="text-sm text-zinc-400 max-w-xs mx-auto mb-6">
              The 120s TTL has lapsed. Stock has been dynamically released back
              to the inventory.
            </p>
            <button
              onClick={onClose}
              className="py-2.5 px-6 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-sm font-medium transition"
            >
              Return to Catalog
            </button>
          </div>
        )}

        {/* Paid & Locker Ready View */}
        {currentOrder.status === 'PAID' && (
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-3xl mx-auto mb-4 border border-emerald-500/20">
              ✓
            </div>
            <h3 className="text-xl font-bold text-zinc-100 mb-1">
              Payment Confirmed!
            </h3>
            <p className="text-sm text-emerald-400 font-semibold mb-6">
              Locker Door #03 Unlocked & Ready for Pickup
            </p>

            {claimMessage ? (
              <div className="p-4 bg-emerald-950/40 border border-emerald-800/80 rounded-2xl text-emerald-300 text-sm mb-6">
                {claimMessage}
              </div>
            ) : (
              <button
                onClick={handleClaimPickup}
                disabled={isClaiming}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition shadow-lg shadow-emerald-950 mb-3"
              >
                {isClaiming ? 'Claiming Locker...' : '🔓 Claim Pickup & Close Locker Door'}
              </button>
            )}

            <p className="text-[11px] text-zinc-500">
              Clicking triggers atomic row lock transition from PAID to CLAIMED
              and permanently decrements physical stock.
            </p>
          </div>
        )}

        {/* Claimed View */}
        {currentOrder.status === 'CLAIMED' && (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center text-3xl mx-auto mb-4 border border-blue-500/20">
              🎉
            </div>
            <h3 className="text-xl font-bold text-zinc-100 mb-1">
              Snacks Collected!
            </h3>
            <p className="text-sm text-zinc-400 mb-6">
              Locker has been closed. Thank you for your purchase!
            </p>
            <button
              onClick={onClose}
              className="py-2.5 px-6 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-sm font-medium transition"
            >
              Start New Order
            </button>
          </div>
        )}

        {/* Needs Review / Pending Refund View */}
        {(currentOrder.status === 'NEEDS_REVIEW' ||
          currentOrder.status === 'EXPIRED_PAID_PENDING_REFUND') && (
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center text-3xl mx-auto mb-4 border border-amber-500/20">
              ⚠️
            </div>
            <h3 className="text-lg font-bold text-zinc-100 mb-1">
              Payment Status: {currentOrder.status}
            </h3>
            <p className="text-sm text-zinc-400 mb-6">
              Payment was received with a price discrepancy or after reservation
              expiry. Flagged for review or automatic refund.
            </p>
            <button
              onClick={onClose}
              className="py-2.5 px-6 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-sm font-medium transition"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
