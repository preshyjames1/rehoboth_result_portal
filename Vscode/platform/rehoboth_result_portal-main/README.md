# Rehoboth College — Secure Result Portal

A production-grade, WAEC/NECO-standard school result checking portal with PIN-based access, Paystack payment, scheduled publishing, master PIN staff access, and a full admin dashboard.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Database + Storage | Supabase (PostgreSQL + Storage) |
| Payment | Paystack (inline + webhook) |
| Styling | Tailwind CSS |
| Deployment | Vercel |
| Session | HTTP-only JWT cookies (jose) |
| Email | Resend |

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/your-org/rehoboth-portal.git
cd rehoboth-portal
npm install
cp .env.local.example .env.local
```

### 2. Set up Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Run the full schema in **SQL Editor**:
   ```
   Copy and paste the contents of schema.sql
   ```
3. Create the storage bucket:
   - Go to **Storage** → **New Bucket**
   - Name: `results`
   - Uncheck "Public bucket" (must be **private**)
4. Copy your project URL and keys to `.env.local`

### 3. Set up Paystack

1. Create a [Paystack](https://paystack.com) account
2. Get your **Public Key** and **Secret Key** from the dashboard
3. Set up a webhook endpoint:
   - URL: `https://your-domain.com/api/payment/webhook`
   - Events: `charge.success`
4. Copy the webhook secret to `.env.local`

### 4. Set up Resend (Email)

1. Create a [Resend](https://resend.com) account
2. Verify your sending domain (e.g. `rehobothcollege.edu.ng`)
3. Create an API key and add to `.env.local`

### 5. Create first admin

```bash
# Add ADMIN_EMAIL and ADMIN_PASSWORD to .env.local (plain text password)
npm run setup-admin
```

This creates the admin in the database and prints the password hash. You can then remove `ADMIN_PASSWORD` from `.env.local` and keep only `ADMIN_PASSWORD_HASH`.

### 6. Generate session secret

```bash
openssl rand -hex 32
# Add to SESSION_SECRET in .env.local
```

### 7. Run locally

```bash
npm run dev
# Visit http://localhost:3000
```

---

## Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add SUPABASE_SECRET_KEY
# ... (add all vars from .env.local.example)

# Redeploy after setting env vars
vercel --prod
```

### Cron job (auto-publish)

The `vercel.json` includes a cron that runs every minute to auto-publish scheduled results.
You must set `CRON_SECRET` in your Vercel environment. Vercel will send this as the
`x-cron-secret` header (or you can use Vercel's built-in cron authentication).

---

## Project Structure

```
/app
  /page.tsx                    ← Landing / result check
  /buy-pin/page.tsx            ← PIN purchase with Paystack
  /result/page.tsx             ← Secure PDF result viewer
  /master/page.tsx             ← Staff access login (direct URL only)
  /master/browse/page.tsx      ← Student selector for scope=all
  /payment/callback/page.tsx   ← Paystack payment callback
  /admin/
    /page.tsx                  ← Admin login
    /dashboard/page.tsx        ← Overview stats
    /students/page.tsx         ← Student management + CSV import
    /results/page.tsx          ← Single & bulk result upload
    /pins/page.tsx             ← Standard PIN management
    /master-pins/page.tsx      ← Master credential management
    /publish/page.tsx          ← Publish scheduling
    /transactions/page.tsx     ← Payment logs

/api
  /verify/route.ts             ← Standard PIN verification
  /master/verify/route.ts      ← Master credential auth
  /master/get-result/route.ts  ← Browse a student's result
  /get-pdf-url/route.ts        ← Refresh signed URL
  /payment/initialize/route.ts ← Start Paystack payment
  /payment/webhook/route.ts    ← Paystack webhook handler
  /payment/verify/route.ts     ← Verify payment on callback
  /admin/login/route.ts        ← Admin auth
  /admin/students/route.ts     ← Student CRUD + CSV import
  /admin/results/route.ts      ← Result management
  /admin/results/bulk/route.ts ← ZIP bulk upload
  /admin/pins/route.ts         ← Standard PIN CRUD
  /admin/master-pins/route.ts  ← Master credential CRUD
  /admin/publish/route.ts      ← Publish control
  /admin/publish/cron/route.ts ← Auto-publish cron job
  /admin/transactions/route.ts ← Transaction logs
```

---

## Pages Guide

| URL | Access | Purpose |
|---|---|---|
| `/` | Public | Student result check |
| `/buy-pin` | Public | Purchase PIN via Paystack |
| `/payment/callback` | Public | Post-payment confirmation |
| `/result` | result_session cookie | View result PDF |
| `/master` | Direct URL (staff only) | Staff credential login |
| `/master/browse` | master_session cookie | Browse student results |
| `/admin` | Public | Admin login |
| `/admin/dashboard` | admin_session | Stats overview |
| `/admin/students` | admin_session | Manage students |
| `/admin/results` | admin_session | Upload results |
| `/admin/pins` | admin_session | Manage standard PINs |
| `/admin/master-pins` | admin_session | Manage master credentials |
| `/admin/publish` | admin_session | Publishing schedule |
| `/admin/transactions` | admin_session | Payment history |

---

## PIN System

### Standard PINs

- Created by admin or auto-generated after Paystack payment
- **Unbound on creation** — `claimed_by_student_id` is NULL
- **Locked to first student** who uses them (permanent, atomic transaction)
- **Usage limit: 5** (configurable)
- Every use logged to `pin_usage` table
- Subject to `is_published` gate — students cannot see unpublished results

### Master Credentials

Master credentials are a **pair**: `master_number` + `pin_code`.

| Feature | Standard PIN | Master Credential |
|---|---|---|
| Purchasable | ✅ Yes (Paystack) | ❌ No (admin only) |
| Student-locked | ✅ After first use | ❌ Never |
| Scope | One student | All students OR one specific |
| Bypasses publish gate | ❌ No | ✅ Yes |
| Usage log | `pin_usage` | `master_pin_usage` |

**Two scopes:**
- `all` — After auth, admin can look up any student at `/master/browse`
- `student` — After auth, admin is redirected directly to the scoped student's result

**Security:**
- The full PIN is displayed **only once** at creation (shown in a modal with copy button)
- Thereafter, only the masked version (`XXXX-XXXX-****`) is visible in the table
- PINs are stored as **plaintext** in the database (protected by RLS — service role key only)
- All routes require `admin_session` to access the master PIN management API

**Usage counting:**
- `usage_count` is incremented **once per `/api/master/verify` call**, not per student viewed in browse mode
- Each student view in browse mode is logged to `master_pin_usage` for auditing

---

## Scheduled Publishing

Results have three states:

| State | `is_published` | `publish_at` | Student can view |
|---|---|---|---|
| Draft | `false` | `NULL` | ❌ No |
| Scheduled | `false` | `[datetime]` | ❌ Not yet |
| Published | `true` | any | ✅ Yes |

The cron job at `/api/admin/publish/cron` runs every minute via Vercel Crons and publishes any results whose `publish_at <= now()`.

Master credentials bypass the publish gate entirely.

---

## Security Design

- All DB access uses `SUPABASE_SECRET_KEY` server-side only (never exposed to client)
- RLS enabled on all tables with `USING (false)` — only service role can query
- All result access gated by signed JWT cookies (HTTP-only, Secure, SameSite=Strict)
- Signed URLs expire in **120 seconds**; page refreshes them every 90 seconds
- Paystack webhook verified via **HMAC SHA512**
- Cron endpoint protected by `CRON_SECRET` header
- Rate limiting on `/api/verify` and `/api/master/verify`: 5 requests/minute per IP
- Standard PIN claim is done with an **optimistic lock** to prevent race conditions
- IP address logged on every PIN use
- `/master` page is not linked from the public navigation (security by obscurity + session gating)
- `Cache-Control: no-store` on all result-related responses

---

## Bulk Upload Format

Upload a ZIP file where each PDF is named `{ADMISSION_NO}.pdf`:

```
results-2024.zip
├── RC-2024-001.pdf
├── RC-2024-002.pdf
└── RC-2024-003.pdf
```

The system:
1. Extracts each PDF in memory (no temp files)
2. Matches by admission number (case-insensitive)
3. Uploads to Supabase Storage at `/{session}/{class}/{student_id}.pdf`
4. Upserts the `results` row
5. Returns a detailed report

Max ZIP size is controlled by `MAX_BULK_ZIP_SIZE_MB` (default: 50MB).

---

## TODO (scaffold only)

```typescript
// TODO: CBT exam module
// TODO: Parent portal
// TODO: Multi-school support
// TODO: Dynamic (non-PDF) result rendering
```

---

## Environment Variables Reference

See `.env.local.example` for the full list with descriptions.

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase anon key (client-side) |
| `SUPABASE_SECRET_KEY` | ✅ | Supabase service role key (server-side only) |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | ✅ | Paystack public key |
| `PAYSTACK_SECRET_KEY` | ✅ | Paystack secret key |
| `PAYSTACK_WEBHOOK_SECRET` | ✅ | Paystack webhook HMAC secret |
| `PIN_PRICE_KOBO` | ✅ | PIN price in kobo (50000 = ₦500) |
| `SESSION_SECRET` | ✅ | JWT signing secret (min 32 chars) |
| `RESEND_API_KEY` | ✅ | Resend API key |
| `EMAIL_FROM` | ✅ | Sender email address |
| `NEXT_PUBLIC_APP_URL` | ✅ | Your deployed app URL |
| `CRON_SECRET` | ✅ | Secret for protecting cron endpoint |
| `MAX_BULK_ZIP_SIZE_MB` | — | Max ZIP size in MB (default: 50) |

---

## License

Proprietary — Rehoboth College. All rights reserved.

