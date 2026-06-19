---
name: QTecnico backend architecture
description: Key decisions for the Express+PostgreSQL backend added to the QTecnico app.
---

# QTecnico Backend Architecture

## Stack
- Frontend: React + Vite on port 5000 (`pnpm run dev --port 5000 --host 0.0.0.0`)
- Backend: Express + tsx on port 3000 (`npm run server` → `tsx server/index.ts`)
- DB: Replit PostgreSQL via `DATABASE_URL` env var
- Auth: JWT (`jsonwebtoken`) with 30-day expiry, secret from `JWT_SECRET` env var (fallback: `qtecnico_jwt_secret_2024`)

## Key decisions

### Full-replace update strategy for orders
PUT /api/orders/:id deletes and re-inserts expenses, attendances, and photos on every update.
**Why:** Simplifies diffing nested arrays with no stable IDs from the client.

### Demo seed user
`lucas.qtech@gmail.com` / `123456` — seeded on first startup if the email doesn't exist in users table.
All seed data (5 clients, 9 orders) is inserted under this user.

### ESM imports in server
All inter-server imports use `.js` extension (tsx resolves `.js` → `.ts` at runtime).
**Why:** `"type": "module"` in package.json requires ESM-style imports.

### Vite proxy
`/api` → `http://localhost:3000` via vite.config.ts proxy. Frontend uses relative `/api/...` URLs.

### localStorage token key
`qtecnico_token` — JWT stored here; auto-login useEffect checks for it on mount.

### ClientsTab prop change
Props changed from `onUpdate: (c: Client[]) => void` to `onSave: (c: Client) => void; onDelete: (id: string) => void`.
**Why:** Individual operations map cleanly to API calls.

### express.json limit
`express.json({ limit: '50mb' })` needed for base64 photo uploads in attendance records.

### DB schema cascade
expenses, attendances, attendance_photos all use ON DELETE CASCADE from their parent.
