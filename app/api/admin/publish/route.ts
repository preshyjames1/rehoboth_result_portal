/**
 * app/api/admin/publish/route.ts
 *
 * Security fix:
 *   I-03 — CRON_SECRET is now validated at request time with a clear
 *           error if the env var is missing, rather than silently
 *           rejecting all cron calls.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getAdminSession } from '@/lib/session';

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) throw new Error('UNAUTHORIZED');
  return session;
}

async function publishDueResults() {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('results')
    .update({ is_published: true, published_at: new Date().toISOString() })
    .lte('publish_at', new Date().toISOString())
    .eq('is_published', false)
    .not('publish_at', 'is', null)
    .select('id');
  return { data, error };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Cron path
  if (searchParams.get('cron') === '1') {
    // I-03: explicit check — fail loudly if env var is not configured
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('[publish] CRON_SECRET env var is not set — cron endpoint is disabled');
      return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
    }

    const suppliedSecret = request.headers.get('x-cron-secret');
    if (!suppliedSecret || suppliedSecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await publishDueResults();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ published_count: data?.length ?? 0 });
  }

  // Normal admin list
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('results')
    .select(`*, students(admission_no, full_name, class)`)
    .or('is_published.eq.false,publish_at.not.is.null')
    .order('publish_at', { ascending: true, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data });
}

// POST — manually trigger publish (admin)
export async function POST() {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { data, error } = await publishDueResults();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ published_count: data?.length ?? 0 });
}
