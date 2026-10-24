# AI Engineering & Architecture Notes

This document details the engineering methodology, AI-assisted development workflow, architectural decisions, and concrete challenges resolved during the implementation of the Snack Dispenser & Locker Pickup Counter.

---

## 1. AI Tooling & Workflow

- **Assistant:** DeepMind Advanced Agentic Coding Pair Programmer (Antigravity).
- **Core Workflow:**
  1. Specification & schema definition aligned with strict engineering invariants.
  2. Incremental, step-by-step implementation with human-in-the-loop verification and git commits at each milestone.
  3. Strict concurrency enforcement with row-level locks, zero-cron formula, and transactional isolation.
  4. Real PostgreSQL integration & concurrency test suite validating race conditions before full Docker orchestration.

---

## 2. Invariants & Key Architectural Decisions

### Invariant 1: Integer Paise Financial Precision
Floating-point mathematics in standard IEEE 754 engines introduces truncation and rounding errors (e.g. `0.1 + 0.2 !== 0.3`). Currency is stored exclusively in integer paise (`price_paise`, `total_paise`, `amount_paise`) throughout PostgreSQL, Prisma, Express, and client API contracts.

### Invariant 2: Dynamic Stock Reservation (Zero-Cron)
Instead of scheduling a background worker or polling cron job (which creates 30–60s lag intervals where expired holds artificially lock inventory), available stock is computed dynamically in SQL:
$$\text{available\_stock} = \text{physical\_stock} - \sum (\text{Active Holds})$$
Active holds encompass:
- `orders.status = 'PENDING'` AND `orders.expires_at > NOW()`
- `orders.status = 'PAID'` (held until locker pickup claims it)

When 120 seconds elapse, unpaid holds immediately lapse at microsecond resolution.

### Invariant 3: Deadlock Elimination via Sorted Row Locking
When multiple products are reserved in `POST /orders`, concurrent buyers requesting items in different orders (e.g. User A requesting [Product 1, Product 2] while User B requests [Product 2, Product 1]) can trigger deadlocks.
- **Solution:** Sort product IDs alphabetically (`ORDER BY id ASC`) before executing `SELECT ... FOR UPDATE`.

### Invariant 4: Clock-Drift Immunity
The client tablet clock can drift or be altered. The kiosk countdown never computes `expires_at - new Date()`. Instead, it initializes a monotonic local interval from the server-authoritative `expires_in_seconds` duration and synchronizes with authoritative server status polling every 2 seconds.

---

## 3. Real Bugs Diagnosed & Resolved

### Challenge 1: Windows Native PostgreSQL Port Collision
- **Symptom:** Database connection failed with `Authentication failed against database server for user 'postgres'` during startup.
- **Diagnosis:** A native Windows service (`postgresql-x64-17`) was already installed and listening on port `5432` on the host machine. Incoming connections to `localhost:5432` hit the native Windows installation rather than the Docker container.
- **Resolution:** Re-mapped Docker host port to `5433:5432` and updated `POSTGRES_PORT=5433` in `.env`. Tested directly with Prisma, successfully restoring connectivity without disturbing the host machine's native database.

### Challenge 2: Raw Body Buffer Mutator Breaking HMAC-SHA256
- **Symptom:** Express's default `express.json()` parses the request body and normalizes whitespace and key ordering, altering raw byte sequences and invalidating HMAC signatures.
- **Resolution:** Configured `express.json` with a custom `verify` callback to preserve the pristine `req.rawBody` Buffer prior to JSON deserialization. Used `crypto.timingSafeEqual()` to eliminate side-channel timing attacks.

### Challenge 3: Locker Pickup Double-Dispense Race Condition
- **Symptom:** Rapid concurrent callback requests from locker hardware door switches could trigger multiple stock decrements and locker door unlocks.
- **Resolution:** Wrapped `claimOrderPickup` in an atomic transaction locking the order with `SELECT ... FOR UPDATE`. The condition requires `order.status === 'PAID'`. The first caller updates the state to `'CLAIMED'` and decrements stock. The second caller receives `409 Conflict`.

---

## 4. Production Roadmap & Scalability Considerations
- **Distributed Caching:** Introduce Redis pub/sub or WebSockets to replace client polling with push notifications.
- **Locker Hardware Reliability:** Introduce hardware-ack timeouts and automatic reversal/circuit breakers if physical locker solenoid fails to actuate.
