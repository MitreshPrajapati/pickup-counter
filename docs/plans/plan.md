# Engineering Execution Plan: Snack Dispenser & Locker Pickup Counter

## 1. High-Level Overview & Objective

The objective of this project is to build a robust, fault-tolerant self-service snack dispenser and locker pickup system. The operational flow consists of four key phases:

```
[ Kiosk UI ] --(1. Select & Reserve 120s TTL)--> [ Backend API / PostgreSQL ]
      |
(2. Customer scans UPI QR)
      |
[ UPI / Payment Gateway ] --(3. Webhook with HMAC)--> [ POST /payments/webhook ]
                                                               |
                                                   (Validates & Marks PAID)
                                                               |
[ Physical Locker Controller ] --(4. Claim on Open)--> [ POST /orders/:id/pickup-claim ]
                                                               |
                                                   (Atomically Decrements Stock)
```

### Core Engineering Invariants
1. **Financial Precision:** Currency is exclusively stored in integer **paise** (1 INR = 100 paise) to prevent floating-point inaccuracies.
2. **Dynamic Stock Reservation (Zero-Cron):** Available stock is calculated dynamically. Expired reservations immediately lapse without background workers or cron dependencies.
3. **Strict Concurrency Control:** High concurrency must not cause overselling, duplicate payment credits, or double-dispensing from physical lockers.
4. **Clock-Drift Immunity:** Kiosk displays must base countdowns on server-authoritative remaining duration rather than client system clocks.

---

## 2. Technical Stack & Architecture

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Backend Runtime** | Node.js (TypeScript) + Express | Lightweight, auditable, predictable middleware pipeline for raw body HMAC handling. |
| **Database** | PostgreSQL (Dockerized) | ACID guarantees, row-level locking (`SELECT ... FOR UPDATE`), transaction isolation. |
| **Database Client** | `pg` (Node-Postgres Pool) | Transparent connection pooling, explicit transaction control (`BEGIN`, `FOR UPDATE`, `COMMIT`/`ROLLBACK`). |
| **Frontend** | Next.js (TypeScript) + Tailwind CSS | Modern React framework with App Router, server-rendering capabilities, and clean client component state handling for live cart, monotonic timer, and status polling. |
| **Testing** | Vitest / Jest + Supertest | Parallel test execution with real Postgres container integration. |
| **Containerization** | Docker Compose | One-command orchestration (`docker compose up`) for Postgres, migrations, backend, and kiosk UI. |

---

## 3. Database Schema Design & Invariants

```
               +----------------------------------+
               |             products             |
               +----------------------------------+
               | id: UUID (PK)                    |
               | name: VARCHAR(255)               |
               | price_paise: INTEGER             |
               | physical_stock: INTEGER          |
               | created_at: TIMESTAMPTZ          |
               +----------------------------------+
                                | 1
                                |
                                | *
               +----------------------------------+
               |           order_items            |
               +----------------------------------+
               | id: UUID (PK)                    |
               | order_id: UUID (FK -> orders)    |
               | product_id: UUID (FK -> products)|
               | quantity: INTEGER                |
               | price_paise_at_purchase: INTEGER |
               +----------------------------------+
                                * |
                                  | 1
               +----------------------------------+          +----------------------------------+
               |              orders              |          |          payment_events          |
               +----------------------------------+          +----------------------------------+
               | id: UUID (PK)                    |          | id: UUID (PK)                    |
               | total_paise: INTEGER             |          | event_id: VARCHAR(255) (UNIQUE)  |
               | status: order_status (ENUM)      |          | order_id: UUID (FK -> orders)    |
               | expires_at: TIMESTAMPTZ          |          | amount_paise: INTEGER            |
               | created_at: TIMESTAMPTZ          |          | raw_payload: JSONB               |
               | updated_at: TIMESTAMPTZ          |          | processed_at: TIMESTAMPTZ        |
               +----------------------------------+          +----------------------------------+
```

### PostgreSQL Enums & Schema Definition
```sql
CREATE TYPE order_status AS ENUM (
  'PENDING',
  'PAID',
  'CLAIMED',
  'EXPIRED',
  'NEEDS_REVIEW',
  'EXPIRED_PAID_PENDING_REFUND'
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
  physical_stock INTEGER NOT NULL CHECK (physical_stock >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
  status order_status NOT NULL DEFAULT 'PENDING',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_paise_at_purchase INTEGER NOT NULL CHECK (price_paise_at_purchase >= 0)
);

CREATE TABLE payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(255) UNIQUE NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id),
  amount_paise INTEGER NOT NULL,
  raw_payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_status_expires ON orders(status, expires_at);
CREATE INDEX idx_order_items_product_order ON order_items(product_id, order_id);
```

---

## 4. Deep-Dive Concurrency Strategies & Critical Pitfalls

### 4.1 Dynamic Stock Calculation (Zero-Cron Formula)
Instead of running a cron job that polls and updates orders every minute, available stock is computed dynamically in SQL:

$$\text{Available Stock} = \text{physical\_stock} - \sum (\text{Active Holds})$$

Where an active hold is any quantity from an order where:
- `orders.status = 'PENDING'` AND `orders.expires_at > NOW()`
- `orders.status = 'PAID'` (held until locker pickup claims it)

```sql
SELECT 
  p.id,
  p.name,
  p.price_paise,
  p.physical_stock,
  p.physical_stock - COALESCE(
    (
      SELECT SUM(oi.quantity)
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE oi.product_id = p.id
        AND (
          (o.status = 'PENDING' AND o.expires_at > NOW())
          OR o.status = 'PAID'
        )
    ), 0
  ) AS available_stock
FROM products p;
```
*Why this avoids the pitfall:* A cron job firing every 30–60 seconds leaves gaps where expired holds block other buyers. A dynamic SQL query immediately returns the real available inventory at microsecond resolution.

---

### 4.2 Order Placement & Reservation Concurrency (`POST /orders`)
When reserving items:
1. Begin SQL Transaction (`BEGIN`).
2. Lock target products using row-level locks sorted by `product_id` to prevent deadlocks:
   ```sql
   SELECT id, physical_stock 
   FROM products 
   WHERE id = ANY($1::uuid[])
   ORDER BY id ASC
   FOR UPDATE;
   ```
3. Compute the current available stock for each requested item inside the transaction.
4. Verify whether `available_stock >= requested_quantity`.
   - If any item is insufficient: `ROLLBACK` and return `HTTP 409 Conflict` (or `400 Bad Request`) with details.
   - If all items are available:
     - Insert into `orders` with `expires_at = NOW() + INTERVAL '120 seconds'`.
     - Insert into `order_items`.
     - `COMMIT` transaction.
5. Return order details with `expiresInSeconds: 120`.

---

### 4.3 Webhook Ingestion, Raw Body HMAC & Idempotency (`POST /payments/webhook`)

#### Pitfall: Raw Body Buffering
Express's default `express.json()` parses and serializes the body into an object, discarding whitespace and property ordering, which invalidates HMAC signatures.
- **Solution:** Configure Express to preserve `req.rawBody`:
  ```typescript
  app.use(express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));
  ```

#### HMAC Verification
```typescript
const computedSignature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(req.rawBody)
  .digest('hex');

if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computedSignature))) {
  return res.status(401).json({ error: 'Invalid HMAC signature' });
}
```

#### Idempotency & Database Flow
1. Execute inside a transaction:
   ```sql
   INSERT INTO payment_events (event_id, order_id, amount_paise, raw_payload)
   VALUES ($1, $2, $3, $4)
   ON CONFLICT (event_id) DO NOTHING
   RETURNING id;
   ```
2. If no row returned, this `eventId` was already processed: immediately return `HTTP 200 OK` (idempotent acknowledge).
3. If new event, lock the order:
   ```sql
   SELECT * FROM orders WHERE id = $1 FOR UPDATE;
   ```
4. **Amount Verification:**
   - If `amount_paise !== order.total_paise`: set `status = 'NEEDS_REVIEW'`.
5. **The Late-Payment Dilemma (Payment arrives at second 125):**
   - Check if `order.expires_at <= NOW()`:
     - If expired, verify if requested stock is still free. If another customer already took the stock, mark status as `'EXPIRED_PAID_PENDING_REFUND'` or `'NEEDS_REVIEW'` to guarantee zero overselling.
     - If stock remains unreserved, the system can choose to honor the payment by moving status to `'PAID'`.
6. If on time and valid: set `status = 'PAID'`. Commit transaction and respond `HTTP 200`.

---

### 4.4 Locker Pickup Claim Concurrency (`POST /orders/:id/pickup-claim`)
When a locker door triggers a claim, multiple controller callbacks might hit simultaneously.
- **Atomic Transition:**
  ```sql
  BEGIN;
  
  -- Lock order row and ensure it is currently PAID
  SELECT id, status FROM orders WHERE id = $1 FOR UPDATE;
  
  -- Check condition
  -- If status != 'PAID', rollback and return HTTP 409 Conflict.
  
  UPDATE orders SET status = 'CLAIMED', updated_at = NOW() WHERE id = $1;
  
  -- Permanently decrement physical stock
  UPDATE products p
  SET physical_stock = p.physical_stock - oi.quantity
  FROM order_items oi
  WHERE oi.order_id = $1 AND p.id = oi.product_id;
  
  COMMIT;
  ```
- Result: Only 1 request transitions the state from `PAID` to `CLAIMED` and gets `HTTP 200`. Any concurrent or subsequent request receives `HTTP 409 Conflict`.

---

### 4.5 Kiosk Client Clock Drift Mitigation
The client tablet clock can easily drift or be maliciously altered.
- **Rule:** Never compute `timer = order.expiresAt - new Date()`.
- **Implementation:**
  1. The server returns `expiresInSeconds` (e.g., `120`).
  2. The kiosk initializes local state: `timeLeft = data.expiresInSeconds`.
  3. A React `useEffect` runs an interval ticking down every 1000ms:
     ```typescript
     useEffect(() => {
       if (timeLeft <= 0) return;
       const interval = setInterval(() => {
         setTimeLeft((prev) => Math.max(0, prev - 1));
       }, 1000);
       return () => clearInterval(interval);
     }, [timeLeft]);
     ```
  4. Concurrently, the UI polls `GET /orders/:id` every 2 seconds. When the server marks the order `PAID` or `EXPIRED`, the UI immediately reflects the authoritative state.

---

## 5. End-to-End Implementation Roadmap

### Phase 1: Workspace Setup & Database Containerization
- [ ] Initialize repository structure (`backend/`, `frontend/`, `tests/`, `docker-compose.yml`).
- [ ] Configure `backend/package.json` with TypeScript, Express, `pg`, `@types/pg`, `dotenv`.
- [ ] Create `docker-compose.yml` defining PostgreSQL service with volume persistence and healthcheck.
- [ ] Write SQL migration scripts (`001_init.sql`) and seed script (`002_seed.sql` with 5 sample snack products, prices in paise).

### Phase 2: Core Backend Engine & API Routes
- [ ] Implement database pool module (`backend/src/db.ts`).
- [ ] Express server initialization with `rawBody` capture middleware (`backend/src/app.ts`).
- [ ] Implement `GET /products`:
  - Returns product catalog with dynamically calculated `available_stock`.
- [ ] Implement `POST /orders`:
  - Validates payload.
  - Acquires ordered locks (`SELECT ... FOR UPDATE`).
  - Checks stock availability.
  - Creates order + items with 120s TTL.
  - Returns order ID, total, and `expiresInSeconds`.
- [ ] Implement `GET /orders/:id`:
  - Returns order status, item breakdown, and recalculated remaining `expiresInSeconds`.
- [ ] Implement `POST /payments/webhook`:
  - HMAC-SHA256 verification against `X-Signature`.
  - Idempotent deduplication via `payment_events`.
  - Amount validation.
  - Late-payment handler.
- [ ] Implement `POST /orders/:id/pickup-claim`:
  - Atomic conditional update (`PAID -> CLAIMED`).
  - Decrements physical stock.
  - Returns 200 for winner, 409 for duplicate/invalid claim.

### Phase 3: Testing Harness & CLI Runner
- [ ] Build CLI script `backend/scripts/send-webhook.ts` (`npm run send-webhook -- <orderId> <amountPaise>`):
  - Generates realistic JSON webhook body.
  - Signs payload using HMAC-SHA256 and shared secret.
  - Dispatches `POST /payments/webhook` with `X-Signature` header.
- [ ] Verify manual end-to-end lifecycle from CLI.

### Phase 4: Concurrency & Stress Integration Test Suite
Configure tests using real PostgreSQL:
- [ ] **Test 1: Stock Contention Race Condition**
  - Setup: Product with `physical_stock = 2`.
  - Action: Fire 10 concurrent requests (`Promise.all()`) attempting to buy 1 item each.
  - Assertions: Exactly 2 succeed (HTTP 201), exactly 8 fail (HTTP 409/400). Physical stock and hold calculations remain strictly consistent.
- [ ] **Test 2: Duplicate Webhook Race Condition**
  - Setup: One pending order.
  - Action: Send 2 identical webhook requests simultaneously with the same `eventId`.
  - Assertions: Both return HTTP 200, only 1 payment event recorded, order status transitions to `PAID` without double credit or error.
- [ ] **Test 3: Double Locker Claim Race Condition**
  - Setup: One order in `PAID` status.
  - Action: Fire 2 simultaneous `POST /orders/:id/pickup-claim` requests.
  - Assertions: Exactly one returns HTTP 200 (Claimed); the second returns HTTP 409 (Conflict). Stock decremented exactly once.

### Phase 5: Kiosk Frontend Application (Next.js + Tailwind CSS)
- [ ] Initialize Next.js TypeScript app in `frontend/` (using App Router and Tailwind CSS).
- [ ] Build Catalog View:
  - Product card grid showing name, price in ₹ (converted from paise: `(paise / 100).toFixed(2)`), and dynamic available stock badge.
  - Cart drawer with quantity controls bounded by available stock.
- [ ] Build Checkout & Reservation Modal:
  - Triggers `POST /orders`.
  - Shows mock UPI QR Code and Order ID.
  - Displays countdown timer initialized from server `expiresInSeconds`.
  - Implements interval-based local tick to guard against clock drift.
- [ ] Build Order Status Poller:
  - Polls `GET /orders/:id` every 2s.
  - Transitions UI on `PAID` (Unlock locker simulation / Claim button), `EXPIRED` (Release modal), or `NEEDS_REVIEW`.
  - Locker Pickup simulation button triggers `/pickup-claim` with visual feedback for 200 vs 409.

### Phase 6: Full Orchestration & Polish
- [ ] Finalize `docker-compose.yml`:
  - `postgres` (with healthcheck)
  - `backend` (runs migrations, seeds, starts API server)
  - `frontend` (serves kiosk UI)
  - Single command test: `docker compose up --build`.

### Phase 7: Comprehensive Documentation Deliverables
- [ ] **`README.md`**:
  - Step-by-step setup (`docker compose up`).
  - Architecture overview & diagram.
  - Concurrency design rationale (Row locks, dynamic stock query, idempotency keys).
  - Explicit rationale for handling the Late-Payment Dilemma.
  - Potential production improvements (Redis pub/sub, distributed locks, WebSockets).
- [ ] **`AI_NOTES.md`**:
  - AI tools utilized.
  - Key prompt and workflow.
  - Concrete bug/hallucination encountered (e.g., Express JSON body mutator breaking HMAC or un-ordered SELECT locks causing deadlocks) and how it was diagnosed and resolved.

---

## 6. Verification & Quality Acceptance Checklist

| Requirement | Acceptance Criteria | Verification Method |
| :--- | :--- | :--- |
| **Paise Integrity** | No floating point values in database or API contract (`price_paise`). | Schema inspection and unit tests. |
| **Hold Expiration** | Unpaid orders >120s do not reduce available stock without cron. | Integration test with simulated expired timestamp. |
| **Overselling Guard** | 10 concurrent requests for 2 items results in exactly 2 orders. | Real PostgreSQL concurrency test suite. |
| **HMAC Security** | Invalid signature returns 401; valid raw body returns 200. | Webhook unit & integration tests. |
| **Idempotency** | Duplicate webhook `eventId` does not re-process or crash. | Parallel webhook test. |
| **Locker Claim Lock** | 2 parallel claims result in 1x 200 and 1x 409. | Concurrency claim test. |
| **Clock Drift Safety** | UI timer does not drift or jump if system clock changes. | Monotonic timer implementation check. |
| **Docker Compose** | Entire system starts with a single `docker compose up`. | Clean environment smoke test. |
