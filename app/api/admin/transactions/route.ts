/**
 * app/api/admin/transactions/route.ts
 *
 * Security fix:
 *   C-02 — Restricted to super admin only. School admins have no
 *           business reading financial transaction records.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getAdminSession } from '@/lib/session';

async function requireSuperAdmin() {
  const session = await getAdminSession();
  if (!session) throw new Error('UNAUTHORIZED');
  if (session.role !== 'super') throw new Error('FORBIDDEN');
  return session;
}

export async function GET(request: NextRequest) {
  try { await requireSuperAdmin(); } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'FORBIDDEN')
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page   = parseInt(searchParams.get('page')   ?? '1',  10);
  const limit  = parseInt(searchParams.get('limit')  ?? '50', 10);
  const status = searchParams.get('status');
  const from   = (page - 1) * limit;
  const to     = from + limit - 1;

  const supabase = createSupabaseServer();

  let query = supabase
    .from('transactions')
    .select(`*, pins(pin_code)`, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status) query = query.eq('status', status);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transactions: data, total: count });
}
