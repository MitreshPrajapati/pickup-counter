# Challenge Documentation: Payment Simulation "Fetch Failed" Error

## 1. Problem Overview

During the end-to-end verification of the self-service kiosk system, clicking the **"⚡ Simulate Instant UPI Payment"** button in the Kiosk checkout modal resulted in an unexpected failure:

```json
{
  "error": "fetch failed"
}
```

The checkout UI displayed a failed payment simulation, preventing the order from transitioning from `PENDING` to `PAID` via the simulated webhook.

---

## 2. Root Cause Analysis

### The Dual Network Boundary Problem
Next.js App Router applications run code in two distinct execution environments:
1. **Client-Side (User's Browser):** Requests originated in the browser (e.g. `fetchProducts()`, `fetchOrder()`) run on the user's host machine. The browser accesses the backend through the host-mapped port `http://localhost:4000`.
2. **Server-Side (Next.js Server / Route Handlers):** The payment simulation endpoint `/api/simulate-payment` is a Next.js Server-Side Route Handler (`route.ts`). It executes **inside** the Next.js Docker container.

### The Network Disconnect
In the original implementation, `route.ts` used the public environment variable:
```typescript
const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
await fetch(`${backendUrl}/payments/webhook`, ...);
```

When running inside Docker:
- `localhost` refers to the **loopback interface of the `client` container itself**, NOT the host and NOT the `backend` container.
- Because no server was listening on port `4000` inside the `client` container, Node's built-in `fetch` threw an unhandled network error:
  ```text
  TypeError: fetch failed
    cause: Error: connect ECONNREFUSED 127.0.0.1:4000
      at TCPConnectWrap.afterConnect
  ```
- In Docker's bridge network (`assignment_default`), containers must communicate using their Docker service names (e.g. `http://backend:4000`).

---

## 3. Step-by-Step Resolution

### Step 1: Diagnose Container Execution Context
Using Docker inspection and direct curl tests:
```bash
# Testing from host machine to Next.js API route:
Invoke-RestMethod -Uri http://localhost:3000/api/simulate-payment -Method Post -ContentType 'application/json' -Body '{"orderId":"...","amountPaise":2000}'
# Returned: 500 Internal Server Error {"error":"fetch failed"}
```
Inspecting the Docker container logs confirmed that the request was attempting to bind to `127.0.0.1:4000` rather than the Docker internal DNS name.

---

### Step 2: Implement Multi-Target Network Resolution
We updated the route handler (`client/src/app/api/simulate-payment/route.ts`) to be network-aware. It resolves `INTERNAL_API_URL` first (for Docker internal network communication) and gracefully falls back to `NEXT_PUBLIC_API_URL` or `localhost` (for standalone local development outside Docker):

```typescript
// In Docker container, internal network hostname is "backend:4000"
// In local dev outside Docker, it falls back to "localhost:4000"
const primaryUrl = process.env.INTERNAL_API_URL || 'http://backend:4000';
const fallbackUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
  // 1. Attempt internal container network communication first
  backendRes = await fetch(`${primaryUrl}/payments/webhook`, {
    method: 'POST',
    headers,
    body: payloadString,
  });
} catch {
  // 2. Fall back to host-mapped endpoint for local standalone execution
  backendRes = await fetch(`${fallbackUrl}/payments/webhook`, {
    method: 'POST',
    headers,
    body: payloadString,
  });
}
```

---

### Step 3: Configure Docker Compose Environment
In `docker-compose.yml`, we explicitly injected the internal service URL into the `client` service environment:

```yaml
  client:
    container_name: snack_dispenser_client
    build:
      context: ./client
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_API_URL: http://localhost:4000
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:4000
      INTERNAL_API_URL: http://backend:4000
      WEBHOOK_SECRET: super_secret_webhook_signing_key_snack_dispenser_2026
    depends_on:
      backend:
        condition: service_started
```

---

### Step 4: Rebuild Container & Verify End-to-End
We rebuilt the client container and verified the complete checkout and payment lifecycle:

```bash
docker compose up -d --build client
```

#### Verification Results:
1. **Order Creation:**
   ```bash
   POST http://localhost:4000/orders
   -> HTTP 201 Created (Order ID: 08461007-d2b6-476f-88a7-2071e16bb242)
   ```
2. **Payment Webhook Simulation:**
   ```bash
   POST http://localhost:3000/api/simulate-payment
   -> HTTP 200 OK
   {
     "success": true,
     "status": 200,
     "data": {
       "status": "PAID",
       "message": "Payment confirmed. Order marked as PAID."
     }
   }
   ```
3. **Locker Pickup Claim:**
   ```bash
   POST http://localhost:4000/orders/08461007-d2b6-476f-88a7-2071e16bb242/pickup-claim
   -> HTTP 200 OK ("Locker unlocked successfully. Order items claimed.")
   ```
4. **Duplicate Claim Race Condition Guard:**
   ```bash
   POST http://localhost:4000/orders/08461007-d2b6-476f-88a7-2071e16bb242/pickup-claim
   -> HTTP 409 Conflict ("Only PAID orders can be claimed.")
   ```

---

## 4. Key Takeaways & Best Practices

1. **Distinguish Client vs Server Network Contexts in Next.js:**
   - Any code inside `useEffect`, event handlers, or browser callbacks uses public host addresses (`localhost:4000`).
   - Any code inside `route.ts`, Server Actions, or Server Components executes inside the container and requires internal Docker service DNS (`backend:4000`).
2. **Defensive Fallback Design:**
   - By implementing a `try...catch` fallback between `INTERNAL_API_URL` and `NEXT_PUBLIC_API_URL`, the application works universally both inside containerized Docker Compose setups and across bare-metal `pnpm dev` workflows.
