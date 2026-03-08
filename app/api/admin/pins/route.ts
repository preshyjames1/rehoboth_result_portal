/**
 * app/api/admin/pins/route.ts
 *
 * Security fixes:
 *   C-02 — POST (create free PINs) restricted to super admin only.
 *           School admins must purchase PINs via /api/admin/pins/purchase.
 *   L-03 — Bulk delete capped at 200 IDs per request.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getAdminSession } from '@/lib/session';
import { generatePin } from '@/lib/pin-generator';

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) throw new Error('UNAUTHORIZED');
  return session;
}

async function requireSuperAdmin() {
  const session = await getAdminSession();
  if (!session) throw new Error('UNAUTHORIZED');
  if (session.role !== 'super') throw new Error('FORBIDDEN');
  return session;
}

// GET — list pins (any admin role)
export async function GET(request: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page    = parseInt(searchParams.get('page')    ?? '1',  10);
  const limit   = parseInt(searchParams.get('limit')  ?? '50', 10);
  const term    = searchParams.get('term');
  const session = searchParams.get('session');
  const from    = (page - 1) * limit;
  const to      = from + limit - 1;

  const supabase = createSupabaseServer();

  let query = supabase
    .from('pins')
    .select(`*, students(admission_no, full_name)`, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (term)    query = query.eq('term', term);
  if (session) query = query.eq('session', session);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pins: data, total: count });
}

// POST — create PIN(s) manually — SUPER ADMIN ONLY
// School admins use /api/admin/pins/purchase (paid flow).
export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'FORBIDDEN')
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = await request.json();
  const { term, session, usage_limit = 5, quantity = 1 } = body;

  if (!term || !session) {
    return NextResponse.json({ error: 'Term and session required' }, { status: 400 });
  }

  const supabase = createSupabaseServer();
  const created: string[] = [];

  for (let i = 0; i < Math.min(quantity, 100); i++) {
    let pinCode: string;
    let attempts = 0;
    do {
      pinCode = generatePin();
      const { data: existing } = await supabase
        .from('pins').select('id').eq('pin_code', pinCode).single();
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    const { data, error } = await supabase
      .from('pins')
      .insert({ pin_code: pinCode!, usage_limit, term, session })
      .select('pin_code')
      .single();

    if (!error && data) created.push(data.pin_code);
  }

  return NextResponse.json({ created: created.length, pins: created }, { status: 201 });
}

// PATCH — toggle active status (any admin role)
export async function PATCH(request: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = await request.json();
  const { id, is_active } = body;

  if (!id) return NextResponse.json({ error: 'PIN ID required' }, { status: 400 });

  const supabase = createSupabaseServer();

  const { data, error } = await supabase
    .from('pins')
    .update({ is_active })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pin: data });
}

// DELETE — remove one or many pins
// Single:  DELETE /api/admin/pins?id=xxx
// Bulk:    DELETE /api/admin/pins?ids=a,b,c  (max 200)
export async function DELETE(request: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id  = searchParams.get('id');
  const ids = searchParams.get('ids');

  if (!id && !ids) return NextResponse.json({ error: 'id or ids required' }, { status: 400 });

  const supabase = createSupabaseServer();
  // L-03: cap bulk deletes at 200 items
  const idList = (ids ? ids.split(',') : [id!])
    .map((s) => s.trim()).filter(Boolean).slice(0, 200);

  // Null out transaction references first (belt-and-suspenders alongside migration)
  await supabase.from('transactions').update({ pin_id: null }).in('pin_id', idList);

  const { error } = await supabase.from('pins').delete().in('id', idList);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, deleted: idList.length });
}
