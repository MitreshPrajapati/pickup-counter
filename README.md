# Snack Dispenser & Locker Pickup Counter

A fault-tolerant, high-concurrency self-service snack dispenser and locker pickup system with integer paise financial precision, dynamic zero-cron stock calculation, raw body HMAC-SHA256 webhook verification, and clock-drift immune kiosk countdowns.

---

## 1. Quickstart (One-Command Run)

Run the entire stack (PostgreSQL + Express Backend + Next.js Kiosk UI) using a single command:

```bash
docker compose up --build
```

### Services Started:
| Service | URL / Port | Description |
| :--- | :--- | :--- |
| **Kiosk UI** | [http://localhost:3000](http://localhost:3000) | Next.js Kiosk Tablet Interface with dynamic tray and countdown |
| **Backend API** | [http://localhost:4000](http://localhost:4000) | Express REST API server |
| **PostgreSQL** | `localhost:5433` (internal `5432`) | PostgreSQL 16 container with persistent data volume |

> **Note:** The backend automatically executes Prisma schema push (`prisma db push`) and seeds the 5 sample snack products upon container startup.

To stop the system:
```bash
docker compose down
```

---

## 2. Architecture & Operational Flow

```
[ Kiosk UI (Port 3000) ]
        |
        | 1. Select items & Hold (120s TTL)
        v
[ Backend API (Port 4000) ]  <--(Row Lock `SELECT ... FOR UPDATE`)--> [ PostgreSQL ]
        |
        | 2. Customer scans mock UPI QR Code
        v
[ Payment Gateway / Webhook CLI ]
        |
        | 3. POST /payments/webhook (HMAC-SHA256 signature in X-Signature)
        v
[ Backend API ] --(Validates Amount & Marks PAID)--> [ PostgreSQL ]
        |
        | 4. Customer presses "Claim Pickup" on Kiosk / Hardware Solenoid triggers
        v
[ POST /orders/:id/pickup-claim ] --(Atomically transitions PAID -> CLAIMED & decrements physical_stock)
```

---

## 3. Core Concurrency Invariants & Design Rationale

### 3.1 Financial Precision in Integer Paise
All monetary values (`price_paise`, `total_paise`, `amount_paise`) are strictly modeled as integers (1 INR = 100 paise). This prevents floating-point rounding errors native to IEEE 754 representations.

### 3.2 Dynamic Stock Reservation (Zero-Cron Formula)
Instead of running a cron job that polls every 30–60 seconds (leaving windows where expired holds block real customers), available stock is computed dynamically in SQL:
$$\text{available\_stock} = \text{physical\_stock} - \sum (\text{Active Holds})$$
Active holds encompass:
- `orders.status = 'PENDING'` AND `orders.expires_at > NOW()`
- `orders.status = 'PAID'` (held until locker pickup claims it)

When 120 seconds elapse, holds immediately lapse at microsecond resolution without cron workers.

### 3.3 Deadlock-Free Product Row Locks
When reserving multiple products in `POST /orders`, product IDs are sorted alphabetically (`ORDER BY id ASC`) before executing `SELECT ... FOR UPDATE`. This ensures consistent lock acquisition ordering across all concurrent transactions, eliminating deadlock conditions.

### 3.4 Raw Body Buffering for HMAC-SHA256
Express's default JSON parser alters whitespace and property ordering, breaking HMAC signatures. The backend captures the unparsed `req.rawBody` Buffer during ingestion and uses `crypto.timingSafeEqual()` to verify signatures, preventing side-channel timing attacks.

### 3.5 The Late-Payment Dilemma
If a customer makes a payment at second 125 (after the 120s hold expired):
1. The backend locks the order row with `SELECT FOR UPDATE`.
2. It dynamically checks if the requested items are still available.
3. If stock is still available: the order is promoted to `PAID`.
4. If another customer claimed the stock while it was expired: the order is marked `EXPIRED_PAID_PENDING_REFUND` (or `NEEDS_REVIEW`), guaranteeing zero overselling while providing an audit trail for automated refund processing.

### 3.6 Clock-Drift Immune Countdown Timer
The client kiosk tablet clock can drift or be altered by users. The frontend initializes its countdown state strictly from the server-authoritative `expires_in_seconds` duration and ticks down locally using a monotonic interval, backed by authoritative server polling every 2 seconds.

---

## 4. Manual Testing & CLI Webhook Simulation

You can simulate payment webhook delivery using the built-in CLI tool:

```bash
# In backend directory
cd backend
pnpm run send-webhook <orderId> [amountPaise]
```
Example:
```bash
pnpm run send-webhook 11111111-1111-1111-1111-111111111111 2000
```
This CLI generates a unique `eventId`, computes a valid HMAC-SHA256 signature using the shared `WEBHOOK_SECRET`, and dispatches `POST /payments/webhook` with the `X-Signature` header.

---

## 5. Running the Test Suite Locally

To run the complete integration and concurrency test suite against the PostgreSQL container:

```bash
cd backend
pnpm test
```

### Verified Test Suites:
- **`tests/health.test.ts`**: API healthcheck.
- **`tests/error.test.ts`**: 404 routing, Zod validation errors, and custom exceptions.
- **`tests/api.test.ts`**: Product catalog, order lifecycle, HMAC security, idempotency, and locker claims.
- **`tests/concurrency.test.ts`**:
  - **Race Condition 1:** 10 concurrent buyers for 2 items results in exactly 2 orders (HTTP 201) and 8 conflicts (HTTP 409).
  - **Race Condition 2:** Parallel duplicate webhooks do not double-credit or fail.
  - **Race Condition 3:** Simultaneous locker claim callbacks allow only 1 claim and decrement stock once.
  - **Zero-Cron Invariant:** Expired holds immediately release stock dynamically.
