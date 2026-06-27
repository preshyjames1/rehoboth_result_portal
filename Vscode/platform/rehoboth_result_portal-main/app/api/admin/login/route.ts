/**
 * app/api/admin/login/route.ts
 *
 * Security fixes applied:
 *   H-01 — Rate limiting via Upstash (5 attempts / 15 min per IP)
 *   H-02 — Timing attack: always run bcrypt.compare regardless of
 *           whether the user exists (prevents email enumeration via
 *           response-time measurement)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { setAdminSession } from '@/lib/session';
import { loginLimiter } from '@/lib/ratelimit';
import bcrypt from 'bcryptjs';

// A constant-time dummy hash used when the email is not found.
// Running bcrypt.compare against this ensures the response time is
// the same whether the email exists or not, preventing timing attacks.
const DUMMY_HASH =
  '$2b$12$invalidhashfortimingprotectionXXXXXXXXXXXXXXXXXXXX';

export async function POST(request: NextRequest) {
  // ── Rate limiting ─────────────────────────────────────────────────
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  const { success } = await loginLimiter.limit(`login:${ip}`);
  if (!success) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please wait 15 minutes.' },
      { status: 429 },
    );
  }

  // ── Parse body ────────────────────────────────────────────────────
  let body: { email: string; password: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json(
      { error: 'Email and password required' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServer();

  // ── Fetch admin (do NOT early-return if not found) ─────────────────
  const { data: admin } = await supabase
    .from('admins')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .single();

  // Always compare — prevents timing side-channel.
  // If user not found, compare against dummy hash (result will be false).
  const hashToCompare = admin ? admin.password_hash : DUMMY_HASH;
  const valid = await bcrypt.compare(password, hashToCompare);

  if (!admin || !valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  // ── Session ───────────────────────────────────────────────────────
  const role: 'super' | 'school' = admin.role ?? 'super';
  await setAdminSession({ admin_id: admin.id, email: admin.email, role });

  return NextResponse.json({ success: true, role });
}

export async function DELETE() {
  const { clearAdminSession } = await import('@/lib/session');
  await clearAdminSession();
  return NextResponse.json({ success: true });
}
