/**
 * app/api/school-admin/broadsheets/route.ts
 *
 * School admin can LIST available broadsheets (metadata only, no PDF)
 * and REQUEST access to a specific broadsheet. Access is gated behind
 * a successful payment (transaction) for the broadsheet's term + session.
 *
 * GET  /api/school-admin/broadsheets          — list broadsheets (filterable)
 * POST /api/school-admin/broadsheets          — get signed URL (payment check)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getAdminSession } from '@/lib/session';

async function requireSchoolAdmin() {
  const session = await getAdminSession();
  if (!session) throw new Error('UNAUTHORIZED');
  // Both 'school' and 'super' roles are allowed; super can also use this endpoint
  return session;
}

// ── GET — list available broadsheets (metadata, no PDF) ───────────────────
export async function GET(request: NextRequest) {
  let session;
  try { session = await requireSchoolAdmin(); } catch {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const term    = searchParams.get('term');
  const sess    = searchParams.get('session');
  const cls     = searchParams.get('class');
  const type    = searchParams.get('type');

  const supabase = createSupabaseServer();

  let query = supabase
    .from('broadsheets')
    .select('id, term, session, class, type, title, created_at', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (term) query = query.eq('term', term);
  if (sess) query = query.eq('session', sess);
  if (cls)  query = query.eq('class', cls);
  if (type) query = query.eq('type', type);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // For each broadsheet, flag whether this admin has paid for its term+session
  const adminEmail = session.email;

  // Collect all unique term/session combos present in the results
  const combos = new Set<string>(
    (data ?? []).map((b: { term: string; session: string }) => `${b.term}||${b.session}`)
  );

  // Batch-check paid combos for this admin
  const paidCombos = new Set<string>();

  if (combos.size > 0) {
    // Super admins always have access (they uploaded the files)
    if (session.role === 'super') {
      combos.forEach((c) => paidCombos.add(c));
    } else {
      const { data: txns } = await supabase
        .from('transactions')
        .select('term, session')
        .eq('email', adminEmail)
        .eq('status', 'success')
        .not('term', 'is', null);

      (txns ?? []).forEach((t: { term: string | null; session: string | null }) => {
        if (t.term && t.session) paidCombos.add(`${t.term}||${t.session}`);
      });
    }
  }

  const enriched = (data ?? []).map((b: {
    id: string; term: string; session: string; class: string;
    type: string; title: string; created_at: string;
  }) => ({
    ...b,
    has_access: paidCombos.has(`${b.term}||${b.session}`),
  }));

  return NextResponse.json({ broadsheets: enriched, total: count });
}

// ── POST — request signed URL for a broadsheet (payment-gated) ────────────
export async function POST(request: NextRequest) {
  let session;
  try { session = await requireSchoolAdmin(); } catch {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { id } = body as { id?: string };
  if (!id) return NextResponse.json({ error: 'broadsheet id required' }, { status: 400 });

  const supabase = createSupabaseServer();

  // Fetch the broadsheet record (metadata only — no pdf_path exposed to client)
  const { data: sheet, error: sheetErr } = await supabase
    .from('broadsheets')
    .select('id, term, session, class, type, title, pdf_path')
    .eq('id', id)
    .single();

  if (sheetErr || !sheet) {
    return NextResponse.json({ error: 'Broadsheet not found' }, { status: 404 });
  }

  // Super admins bypass the payment check
  if (session.role !== 'super') {
    const { data: txn } = await supabase
      .from('transactions')
      .select('id')
      .eq('email', session.email)
      .eq('status', 'success')
      .eq('term', sheet.term)
      .eq('session', sheet.session)
      .limit(1)
      .maybeSingle();

    if (!txn) {
      return NextResponse.json(
        {
          error: 'PAYMENT_REQUIRED',
          term: sheet.term,
          session: sheet.session,
          message: `You have not made a payment for ${sheet.term}, ${sheet.session}. Please purchase pins for this term/session to access broadsheets.`,
        },
        { status: 402 },
      );
    }
  }

  // Payment verified — generate a short-lived signed URL (10 min)
  const { data: signed, error: signErr } = await supabase.storage
    .from('results')
    .createSignedUrl(sheet.pdf_path, 600);

  if (signErr || !signed) {
    return NextResponse.json({ error: 'Could not generate PDF link' }, { status: 500 });
  }

  return NextResponse.json({
    signed_url: signed.signedUrl,
    title: sheet.title,
    class: sheet.class,
    type: sheet.type,
    term: sheet.term,
    session: sheet.session,
  });
}
