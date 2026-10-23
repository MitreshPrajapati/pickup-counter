import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const { orderId, amountPaise } = await req.json();

    if (!orderId || !amountPaise) {
      return NextResponse.json(
        { error: 'orderId and amountPaise are required' },
        { status: 400 }
      );
    }

    const secret =
      process.env.WEBHOOK_SECRET ||
      'super_secret_webhook_signing_key_snack_dispenser_2026';

    // In Docker container, internal network hostname is "backend:4000"
    // In local dev outside Docker, it falls back to "localhost:4000"
    const primaryUrl =
      process.env.INTERNAL_API_URL || 'http://backend:4000';
    const fallbackUrl =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

    const payload = {
      eventId: `evt_kiosk_sim_${crypto.randomUUID()}`,
      orderId,
      amountPaise,
      status: 'SUCCESS',
      timestamp: new Date().toISOString(),
    };

    const payloadString = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');

    const headers = {
      'Content-Type': 'application/json',
      'X-Signature': signature,
    };

    let backendRes: Response;
    try {
      backendRes = await fetch(`${primaryUrl}/payments/webhook`, {
        method: 'POST',
        headers,
        body: payloadString,
      });
    } catch {
      backendRes = await fetch(`${fallbackUrl}/payments/webhook`, {
        method: 'POST',
        headers,
        body: payloadString,
      });
    }

    const data = await backendRes.json();
    return NextResponse.json({
      success: backendRes.ok,
      status: backendRes.status,
      data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal simulation error' },
      { status: 500 }
    );
  }
}
