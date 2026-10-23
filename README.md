# Snack Dispenser & Locker Pickup System

A high-concurrency self-service snack dispenser and locker pickup counter with raw-body HMAC webhook verification, dynamic stock calculation (zero cron), and integer paise financial precision.

---

## Prerequisites

- **Node.js**: v20+ or v24+
- **pnpm**: v10+ or v12+ (`npm install -g pnpm`)
- **Docker & Docker Compose**: (Docker Desktop running for PostgreSQL)

---

## Quickstart Guide

### 1. Install Dependencies
Run from the root of the monorepo:
```bash
pnpm install
```

### 2. Start PostgreSQL Database
Ensure Docker Desktop is running, then start the PostgreSQL service:
```bash
pnpm db:up
```
> **Note:** The database container automatically runs `001_init.sql` (schema) and `002_seed.sql` (5 sample snack products) upon first initialization.

If you ever need to apply migrations or seed data manually:
```bash
# Run schema migration
pnpm db:migrate

# Seed sample snack products
pnpm db:seed
```

### 3. Start Development Servers
Run both backend (Port `4000`) and frontend (Port `3000`) concurrently:
```bash
pnpm dev
```

Or start them individually in separate terminal windows:
```bash
# Start Backend API (http://localhost:4000)
pnpm dev:backend

# Start Frontend Kiosk UI (http://localhost:3000)
pnpm dev:frontend
```

---

## Testing & Quality Assurance

### Run Unit & Integration Tests
```bash
pnpm test
```

### Build All Workspaces
```bash
pnpm build
```

---

## Simulating Payments via Webhook CLI

To test payment ingestion with HMAC-SHA256 signature verification:
```bash
pnpm send-webhook <orderId> [amountPaise]
```
Example:
```bash
pnpm send-webhook 11111111-1111-1111-1111-111111111111 2000
```

---

## Stopping the Database
```bash
pnpm db:down
```
