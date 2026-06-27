import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getAdminSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createSupabaseServer();

  const { data: result, error } = await supabase
    .from('results')
    .select('pdf_path')
    .eq('id', id)
    .single();

  if (error || !result) return NextResponse.json({ error: 'Result not found' }, { status: 404 });

  const { data: signed, error: signErr } = await supabase.storage
    .from('results')
    .createSignedUrl(result.pdf_path, 300);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Could not generate URL' }, { status: 500 });
  }

  return NextResponse.json({ signed_url: signed.signedUrl });
}
