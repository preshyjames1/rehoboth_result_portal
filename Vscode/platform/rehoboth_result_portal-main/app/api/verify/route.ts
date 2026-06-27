/**
 * app/api/verify/route.ts
 *
 * Security fix:
 *   C-03 — Replace in-memory Map rate limiter with Upstash Redis.
 *           The old Map was reset on every serverless cold start,
 *           providing zero real protection on Vercel.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { setResultSession } from '@/lib/session';
import { normalizePin } from '@/lib/pin-generator';
import { verifyLimiter } from '@/lib/ratelimit';
import type { ApiErrorResponse, VerifyResponse } from '@/types';

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  // Upstash persistent rate limit — 5 attempts per minute per IP
  const { success: allowed } = await verifyLimiter.limit(`verify:${ip}`);
  if (!allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Too many requests. Please wait a minute.' },
      { status: 429 },
    );
  }

  let body: { admission_no: string; pin_code: string; term: string; session: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_CREDENTIALS' } as ApiErrorResponse, { status: 400 });
  }

  const { admission_no, pin_code, term, session } = body;
  if (!admission_no || !pin_code || !term || !session) {
    return NextResponse.json({ error: 'INVALID_CREDENTIALS' } as ApiErrorResponse, { status: 400 });
  }

  const normalizedPin = normalizePin(pin_code);
  const supabase = createSupabaseServer();

  // 1. Find student
  const { data: student, error: studentErr } = await supabase
    .from('students')
    .select('id, admission_no, full_name, class')
    .eq('admission_no', admission_no.trim().toUpperCase())
    .single();

  if (studentErr || !student) {
    return NextResponse.json({ error: 'INVALID_CREDENTIALS' } as ApiErrorResponse, { status: 401 });
  }

  // 2. Find PIN
  const { data: pin, error: pinErr } = await supabase
    .from('pins')
    .select('*')
    .eq('pin_code', normalizedPin)
    .eq('term', term)
    .eq('session', session)
    .single();

  if (pinErr || !pin) {
    return NextResponse.json({ error: 'INVALID_CREDENTIALS' } as ApiErrorResponse, { status: 401 });
  }

  if (!pin.is_active) {
    return NextResponse.json({ error: 'PIN_INACTIVE' } as ApiErrorResponse, { status: 403 });
  }
  if (pin.usage_count >= pin.usage_limit) {
    return NextResponse.json({ error: 'PIN_LIMIT_EXCEEDED' } as ApiErrorResponse, { status: 403 });
  }
  if (pin.claimed_by_student_id && pin.claimed_by_student_id !== student.id) {
    return NextResponse.json({ error: 'PIN_BELONGS_TO_ANOTHER_STUDENT' } as ApiErrorResponse, { status: 403 });
  }

  // 3. Lock PIN to student on first use (optimistic concurrency)
  if (!pin.claimed_by_student_id) {
    const { error: claimErr } = await supabase
      .from('pins')
      .update({ claimed_by_student_id: student.id })
      .eq('id', pin.id)
      .is('claimed_by_student_id', null);

    if (claimErr) {
      const { data: refreshedPin } = await supabase
        .from('pins').select('claimed_by_student_id').eq('id', pin.id).single();
      if (refreshedPin?.claimed_by_student_id && refreshedPin.claimed_by_student_id !== student.id) {
        return NextResponse.json({ error: 'PIN_BELONGS_TO_ANOTHER_STUDENT' } as ApiErrorResponse, { status: 403 });
      }
    }
  }

  // 4. Increment usage
  const newUsageCount = pin.usage_count + 1;
  await supabase.from('pins').update({ usage_count: newUsageCount }).eq('id', pin.id);
  await supabase.from('pin_usage').insert({ pin_id: pin.id, student_id: student.id, ip_address: ip });

  // 5. Find result with lazy-publish
  const { data: result, error: resultErr } = await supabase
    .from('results')
    .select('*')
    .eq('student_id', student.id)
    .eq('term', term)
    .eq('session', session)
    .single();

  if (resultErr || !result) {
    return NextResponse.json({ error: 'NO_RESULT_FOUND' } as ApiErrorResponse, { status: 404 });
  }

  if (!result.is_published && result.publish_at && new Date(result.publish_at) <= new Date()) {
    await supabase
      .from('results')
      .update({ is_published: true, published_at: new Date().toISOString() })
      .eq('id', result.id);
    result.is_published = true;
  }

  if (!result.is_published) {
    return NextResponse.json({ error: 'RESULT_NOT_YET_PUBLISHED' } as ApiErrorResponse, { status: 403 });
  }

  // 6. Generate signed URL (120s)
  const { data: signedData, error: signedErr } = await supabase.storage
    .from('results')
    .createSignedUrl(result.pdf_path, 120);

  if (signedErr || !signedData?.signedUrl) {
    return NextResponse.json({ error: 'INTERNAL_ERROR' } as ApiErrorResponse, { status: 500 });
  }

  // 7. Set session cookie
  await setResultSession({ student_id: student.id, result_id: result.id });

  const response: VerifyResponse = {
    student: {
      id: student.id,
      admission_no: student.admission_no,
      full_name: student.full_name,
      class: student.class,
    },
    result: { term, session },
    signed_url: signedData.signedUrl,
    pin_usage_count: newUsageCount,
    pin_usage_limit: pin.usage_limit,
  };

  return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
}
