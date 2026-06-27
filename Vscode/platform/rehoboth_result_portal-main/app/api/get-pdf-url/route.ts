import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getResultSession, getMasterSession } from '@/lib/session';
import type { ApiErrorResponse, SignedUrlResponse } from '@/types';

export async function GET() {
  const supabase = createSupabaseServer();

  // Check result_session first
  const resultSession = await getResultSession();
  if (resultSession) {
    const { data: result } = await supabase
      .from('results')
      .select('pdf_path')
      .eq('id', resultSession.result_id)
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

    const response: SignedUrlResponse = {
      signed_url: signedData.signedUrl,
      expires_at: new Date(Date.now() + 120 * 1000).toISOString(),
    };

    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
  }

  // Check master_session (scope=student)
  const masterSession = await getMasterSession();
  if (masterSession && masterSession.scope === 'student' && masterSession.scoped_student_id) {
    const { data: result } = await supabase
      .from('results')
      .select('pdf_path')
      .eq('student_id', masterSession.scoped_student_id)
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

    const response: SignedUrlResponse = {
      signed_url: signedData.signedUrl,
      expires_at: new Date(Date.now() + 120 * 1000).toISOString(),
    };

    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({ error: 'UNAUTHORIZED' } as ApiErrorResponse, { status: 401 });
}
