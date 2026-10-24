import crypto from 'crypto';
import http from 'http';
import { config } from '../src/config';

interface WebhookPayload {
  eventId: string;
  orderId: string;
  amountPaise: number;
  status: string;
  timestamp: string;
}

async function sendWebhook() {
  const args = process.argv.slice(2);
  const orderId = args[0];
  const amountPaise = args[1] ? parseInt(args[1], 10) : 2000;
  const customEventId = args[2];

  if (!orderId) {
    console.error('Usage: pnpm run send-webhook <orderId> [amountPaise] [eventId]');
    console.error('Example: pnpm run send-webhook 11111111-1111-1111-1111-111111111111 2000');
    process.exit(1);
  }

  const payload: WebhookPayload = {
    eventId: customEventId || `evt_${crypto.randomUUID()}`,
    orderId,
    amountPaise,
    status: 'SUCCESS',
    timestamp: new Date().toISOString(),
  };

  const payloadString = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', config.webhookSecret)
    .update(payloadString)
    .digest('hex');

  console.log(`[Webhook CLI] Target: http://localhost:${config.port}/payments/webhook`);
  console.log(`[Webhook CLI] Event ID: ${payload.eventId}`);
  console.log(`[Webhook CLI] Order ID: ${payload.orderId}`);
  console.log(`[Webhook CLI] Amount: ${payload.amountPaise} paise (₹${(payload.amountPaise / 100).toFixed(2)})`);
  console.log(`[Webhook CLI] HMAC Signature: ${signature}`);

  const url = new URL(`http://localhost:${config.port}/payments/webhook`);
  const req = http.request(
    {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payloadString),
        'X-Signature': signature,
      },
    },
    (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        console.log(`[Webhook CLI] Response HTTP ${res.statusCode}: ${data}`);
      });
    }
  );

  req.on('error', (err) => {
    console.error(`[Webhook CLI] Request failed: ${err.message}`);
  });

  req.write(payloadString);
  req.end();
}

sendWebhook();
