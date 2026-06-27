import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getAdminSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  // Allow both super and school admins to view PDFs
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const resultId = searchParams.get('result_id');

  if (!resultId) {
    return NextResponse.json({ error: 'result_id required' }, { status: 400 });
  }

  const supabase = createSupabaseServer();

  const { data: result, error } = await supabase
    .from('results')
    .select('pdf_path, students(full_name, admission_no)')
    .eq('id', resultId)
    .single();

  if (error || !result) {
    return NextResponse.json({ error: 'Result not found' }, { status: 404 });
  }

  // Generate a longer-lived signed URL for admin use (10 minutes)
  const { data: signedData, error: signedErr } = await supabase.storage
    .from('results')
    .createSignedUrl(result.pdf_path, 600);

  if (signedErr || !signedData?.signedUrl) {
    return NextResponse.json({ error: 'Failed to generate URL' }, { status: 500 });
  }

  return NextResponse.json({
    signed_url: signedData.signedUrl,
    expires_in: 600,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
