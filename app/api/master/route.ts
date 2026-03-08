/**
 * app/api/master/route.ts
 *
 * Security fix:
 *   C-03 — Replace in-memory Map rate limiter with Upstash Redis.
 *   M-01 — Master PIN verification now uses bcrypt.compare against
 *           the stored hash instead of plaintext equality check.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { setMasterSession, getMasterSession } from '@/lib/session';
import { verifyLimiter } from '@/lib/ratelimit';
import bcrypt from 'bcryptjs';
import type { ApiErrorResponse, MasterVerifyResponse } from '@/types';

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_CREDENTIALS' } as ApiErrorResponse, { status: 400 });
  }

  const action = body.action ?? 'verify';

  // ── ACTION: get-result (browse mode) ──────────────────────────────
  if (action === 'get-result') {
    const masterSession = await getMasterSession();
    if (!masterSession) {
      return NextResponse.json({ error: 'UNAUTHORIZED' } as ApiErrorResponse, { status: 401 });
    }
    if (masterSession.scope !== 'all') {
      return NextResponse.json({ error: 'UNAUTHORIZED' } as ApiErrorResponse, { status: 403 });
    }

    const { admission_no } = body;
    if (!admission_no) {
      return NextResponse.json({ error: 'STUDENT_NOT_FOUND' } as ApiErrorResponse, { status: 400 });
    }

    const supabase = createSupabaseServer();

    const { data: student } = await supabase
      .from('students')
      .select('id, admission_no, full_name, class')
      .eq('admission_no', admission_no.trim().toUpperCase())
      .single();

    if (!student) {
      return NextResponse.json({ error: 'STUDENT_NOT_FOUND' } as ApiErrorResponse, { status: 404 });
    }

    const { data: result } = await supabase
      .from('results')
      .select('*')
      .eq('student_id', student.id)
      .eq('term', masterSession.term)
      .eq('session', masterSession.session)
      .single();

    if (!result) {
      return NextResponse.json({ error: 'NO_RESULT_FOUND' } as ApiErrorResponse, { status: 404 });
    }

    const { data: signedData } = await supabase.storage
      .from('results')
      .createSignedUrl(result.pdf_path, 120);

    if (!signedData?.signedUrl) {
      return NextResponse.json({ error: 'INTERNAL_ERROR' } as ApiErrorResponse, { status: 500 });
    }

    await supabase.from('master_pin_usage').insert({
      master_pin_id: masterSession.master_pin_id,
      accessed_student_id: student.id,
      term: masterSession.term,
      session: masterSession.session,
      ip_address: ip,
    });

    return NextResponse.json(
      { student: { id: student.id, admission_no: student.admission_no, full_name: student.full_name, class: student.class }, signed_url: signedData.signedUrl },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // ── ACTION: verify (login) ─────────────────────────────────────────
  // Rate limit applies only to the verify action (login attempts)
  const { success: allowed } = await verifyLimiter.limit(`master:${ip}`);
  if (!allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Too many requests. Please wait a minute.' },
      { status: 429 },
    );
  }

  const { master_number, pin_code, term, session } = body;

  if (!master_number || !pin_code || !term || !session) {
    return NextResponse.json({ error: 'INVALID_MASTER_CREDENTIALS' } as ApiErrorResponse, { status: 400 });
  }

  const supabase = createSupabaseServer();

  const { data: masterPin, error: masterErr } = await supabase
    .from('master_pins')
    .select('*')
    .eq('master_number', master_number.trim())
    .eq('is_active', true)
    .single();

  // Use bcrypt.compare against stored hash (M-01 fix).
  // If masterPin not found, compare against dummy hash to prevent timing attacks.
  const DUMMY_HASH = '$2b$12$invalidhashfortimingprotectionXXXXXXXXXXXXXXXXXXXX';
  const hashToCompare = masterPin ? masterPin.pin_code : DUMMY_HASH;
  const pinValid = await bcrypt.compare(pin_code.trim(), hashToCompare);

  if (masterErr || !masterPin || !pinValid) {
    return NextResponse.json({ error: 'INVALID_MASTER_CREDENTIALS' } as ApiErrorResponse, { status: 401 });
  }

  if (masterPin.usage_count >= masterPin.usage_limit) {
    return NextResponse.json({ error: 'MASTER_PIN_LIMIT_EXCEEDED' } as ApiErrorResponse, { status: 403 });
  }
  if (masterPin.term && masterPin.term !== term) {
    return NextResponse.json({ error: 'MASTER_PIN_TERM_MISMATCH' } as ApiErrorResponse, { status: 403 });
  }
  if (masterPin.session && masterPin.session !== session) {
    return NextResponse.json({ error: 'MASTER_PIN_SESSION_MISMATCH' } as ApiErrorResponse, { status: 403 });
  }

  await supabase
    .from('master_pins')
    .update({ usage_count: masterPin.usage_count + 1 })
    .eq('id', masterPin.id);

  await setMasterSession({
    master_pin_id: masterPin.id,
    scope: masterPin.scope,
    scoped_student_id: masterPin.scoped_student_id,
    term,
    session,
  });

  if (masterPin.scope === 'student' && masterPin.scoped_student_id) {
    const { data: student } = await supabase
      .from('students')
      .select('id, admission_no, full_name, class')
      .eq('id', masterPin.scoped_student_id)
      .single();

    if (!student) {
      return NextResponse.json({ error: 'STUDENT_NOT_FOUND' } as ApiErrorResponse, { status: 404 });
    }

    const { data: result } = await supabase
      .from('results')
      .select('*')
      .eq('student_id', masterPin.scoped_student_id)
      .eq('term', term)
      .eq('session', session)
      .single();

    if (!result) {
      return NextResponse.json({ error: 'NO_RESULT_FOUND' } as ApiErrorResponse, { status: 404 });
    }

    const { data: signedData } = await supabase.storage
      .from('results')
      .createSignedUrl(result.pdf_path, 120);

    if (!signedData?.signedUrl) {
      return NextResponse.json({ error: 'INTERNAL_ERROR' } as ApiErrorResponse, { status: 500 });
    }

    await supabase.from('master_pin_usage').insert({
      master_pin_id: masterPin.id,
      accessed_student_id: masterPin.scoped_student_id,
      term, session, ip_address: ip,
    });

    const response: MasterVerifyResponse = {
      redirect: 'result',
      student: { id: student.id, admission_no: student.admission_no, full_name: student.full_name, class: student.class },
      signed_url: signedData.signedUrl,
    };
    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
  }

  const response: MasterVerifyResponse = { redirect: 'browse', term, session };
  return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
}
