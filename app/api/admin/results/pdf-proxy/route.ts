/**
 * app/api/admin/results/pdf-proxy/route.ts
 *
 * Streams a student result PDF for admin users.
 * Requires valid admin_session cookie. Takes ?result_id=X query param.
 *
 * Admin opens this URL in a new tab — browser renders PDF natively.
 * Works on all devices without blob URLs, iframes, or window.open().
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getAdminSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const resultId = request.nextUrl.searchParams.get('result_id');
  if (!resultId) {
    return new NextResponse('result_id is required', { status: 400 });
  }

  const supabase = createSupabaseServer();

  const { data: result, error } = await supabase
    .from('results')
    .select('pdf_path, students(full_name, admission_no)')
    .eq('id', resultId)
    .single();

  if (error || !result) {
    return new NextResponse('Result not found', { status: 404 });
  }

  const { data: signedData, error: signedErr } = await supabase.storage
    .from('results')
    .createSignedUrl(result.pdf_path, 60);

  if (signedErr || !signedData?.signedUrl) {
    return new NextResponse('Could not generate PDF link', { status: 500 });
  }

  const pdfRes = await fetch(signedData.signedUrl);
  if (!pdfRes.ok) {
    return new NextResponse('Could not retrieve PDF', { status: 502 });
  }

  const pdfBuffer = await pdfRes.arrayBuffer();

  // Use student name as filename so the browser tab title is meaningful
  const studentInfo = result.students as { full_name: string; admission_no: string } | null;
  const filename = studentInfo
    ? `${studentInfo.admission_no}-result.pdf`
    : 'result.pdf';

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control':       'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
