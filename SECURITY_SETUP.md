# Security Setup Guide — Rehoboth College Result Portal

Follow these steps **in order** before going live.

---

## Step 1 — Run Database Migration (Supabase)

1. Open **Supabase Dashboard** → your project → **SQL Editor**
2. Paste and run the entire contents of **`migration.sql`**
3. Confirm success — you should see no errors
4. Verify the `admins` table now has a `role` column:
   ```sql
   SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'admins';
   ```

> ⚠ **master_pins are wiped by the migration.** This is intentional — the new app hashes master PINs with bcrypt; old plaintext values cannot be verified. After deploying, log in as super admin and re-create your master PINs. Save the displayed plaintext PIN immediately — it is never stored and cannot be retrieved.

---

## Step 2 — Set Up Upstash Redis (Rate Limiting)

The old in-memory rate limiter was ineffective on Vercel (resets on cold start). Replace it with Upstash Redis:

1. Go to **https://console.upstash.com** → create a free account
2. Click **Create Database** → give it a name (e.g. `rehoboth-ratelimit`) → select a nearby region → click Create
3. On the database page, copy:
   - **REST URL** → `UPSTASH_REDIS_REST_URL`
   - **REST Token** → `UPSTASH_REDIS_REST_TOKEN`
4. Add both to **Vercel → Settings → Environment Variables** (Production only)

---

## Step 3 — Update All Vercel Environment Variables

In **Vercel → Settings → Environment Variables**, ensure every variable below is set for **Production**:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `SESSION_SECRET` | 64-char random hex |
| `PAYSTACK_SECRET_KEY` | `sk_live_...` |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | `pk_live_...` |
| `PAYSTACK_WEBHOOK_SECRET` | Same as `PAYSTACK_SECRET_KEY` |
| `PIN_PRICE_KOBO` | `70000` (₦700) |
| `NEXT_PUBLIC_PIN_PRICE_KOBO` | `70000` (₦700) |
| `NEXT_PUBLIC_SITE_URL` | `https://result.schuwap.xyz` |
| `NEXT_PUBLIC_APP_URL` | `https://result.schuwap.xyz` |
| `RESEND_API_KEY` | `re_...` |
| `RESEND_FROM_EMAIL` | `noreply@schuwap.xyz` |
| `CRON_SECRET` | 32-char random hex |
| `UPSTASH_REDIS_REST_URL` | From Upstash (Step 2) |
| `UPSTASH_REDIS_REST_TOKEN` | From Upstash (Step 2) |
| `MAX_BULK_ZIP_SIZE_MB` | `50` |

To generate random secrets locally:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Step 4 — Deploy to Vercel

```bash
git add -A
git commit -m "security: apply all audit fixes"
git push origin main
```

Vercel will auto-deploy from `main`. Check the deployment logs for any build errors.

---

## Step 5 — Supabase Hardening

In your **Supabase Dashboard**:

1. **Disable email auth** — Authentication → Providers → Email → toggle **OFF** (you use service role only)
2. **Enable 2FA** on your Supabase account — Profile (top right) → Security → Two-Factor Authentication
3. **Storage bucket** — Storage → `results` bucket → Policies → confirm only service_role can read/write
4. **Review API keys** — Settings → API → if the service role key was ever committed to git, click **Regenerate** and update Vercel

---

## Step 6 — GitHub Hardening

1. **Scan git history for secrets**:
   ```bash
   git log --all --full-history -- "**/.env*"
   git log --all --full-history -- ".env"
   ```
   If any `.env` file was ever committed → **rotate every key immediately**

2. **Enable secret scanning** — Repository → Settings → Code Security → Secret scanning → Enable

3. **Enable Dependabot** — Settings → Code Security → Dependabot → Enable alerts + security updates

4. **Branch protection** — Settings → Branches → Add rule for `main`:
   - Require pull request reviews before merging
   - Require status checks to pass
   - Do not allow bypassing the above settings

5. **Confirm repo is private** — Settings → Danger Zone → Change visibility → Private

---

## Step 7 — Paystack Hardening

In **Paystack Dashboard**:

1. **Live webhook URL** — Settings → API Keys & Webhooks → Webhook URL:
   ```
   https://result.schuwap.xyz/api/payment
   ```
2. **Enable 2FA** — Settings → Security → Two-Factor Authentication
3. **Review team access** — Settings → Team → remove anyone who no longer needs access

---

## Step 8 — Resend Hardening

In **Resend Dashboard**:

1. **Verify DNS records** — Domains → `schuwap.xyz` → confirm DKIM ✅, SPF ✅, DMARC ✅
2. **DMARC policy** — In your DNS, set:
   ```
   _dmarc.schuwap.xyz  TXT  "v=DMARC1; p=quarantine; rua=mailto:admin@schuwap.xyz"
   ```
3. **Enable 2FA** on your Resend account
4. If `RESEND_API_KEY` was ever in git → regenerate it in Resend → API Keys

---

## Step 9 — Re-create Master PINs

After migration and deployment:

1. Log in at `https://result.schuwap.xyz/admin`
2. Go to **Master PINs** → **Create Master PIN**
3. The system generates a master number + PIN pair
4. **Write down the displayed plaintext PIN immediately** — it is shown once and stored only as a hash
5. Repeat for each master PIN you need

---

## Step 10 — Final Verification

Run through these checks manually:

- [ ] Super admin login at `/admin` works
- [ ] School admin login at `/school-admin` works
- [ ] School admin **cannot** reach `/admin/master-pins` (should redirect to `/school-admin/dashboard`)
- [ ] School admin calling `GET /api/admin/transactions` directly returns `403`
- [ ] Student PIN verify at `/` works end-to-end
- [ ] Result PDF displays correctly
- [ ] Bulk PIN purchase via Paystack works (school admin flow)
- [ ] Master PIN verify at `/master` works with a newly created PIN
- [ ] Upstash rate limiting: 6+ rapid verify attempts returns `429`

---

## Summary of Code Changes

| File | Fix | Finding |
|---|---|---|
| `lib/ratelimit.ts` | New — Upstash Redis rate limiter | C-03 |
| `app/api/admin/login/route.ts` | Rate limiting + timing attack fix | H-01, H-02 |
| `app/api/verify/route.ts` | Upstash rate limiter | C-03 |
| `app/api/master/route.ts` | Upstash + bcrypt PIN verify | C-03, M-01 |
| `app/api/admin/students/route.ts` | Mass assignment whitelist + bulk cap | C-01, L-03 |
| `app/api/admin/pins/route.ts` | Super-admin only POST + bulk cap | C-02, L-03 |
| `app/api/admin/master-pins/route.ts` | Super-admin only + bcrypt hash store | C-02, M-01 |
| `app/api/admin/transactions/route.ts` | Super-admin only | C-02 |
| `app/api/admin/results/route.ts` | PDF magic-byte validation + bulk cap | M-02, L-03 |
| `app/api/admin/results/reupload/route.ts` | PDF magic-byte validation | M-02 |
| `app/api/admin/broadsheets/route.ts` | PDF magic-byte validation + bulk cap | M-02, L-03 |
| `app/api/admin/publish/route.ts` | CRON_SECRET guard | I-03 |
| `app/api/payment/route.ts` | No email leak + webhook timestamp | I-01, I-02 |
| `middleware.ts` | `/school-admin/pins` added to matcher | H-03 |
| `next.config.js` | HSTS, CSP, Permissions-Policy, allowedOrigins | L-01, M-04 |
| `app/page.tsx` | Remove `signed_url` from sessionStorage | L-02 |
| `app/result/page.tsx` | Fetch URL from server, not sessionStorage | L-02 |
| `app/payment/callback/page.tsx` | Remove email from success page | I-01 |
| `schema.sql` | `role` column + bcrypt note for master_pins | M-03, M-01 |
| `migration.sql` | All DB changes for existing deployment | All DB fixes |
| `package.json` | Add `@upstash/ratelimit`, `@upstash/redis` | C-03 |
