/**
 * app/api/admin/broadsheets/pdf-proxy/route.ts
 *
 * Streams a broadsheet PDF for admin users.
 * Requires valid admin_session cookie. Takes ?id=X query param.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getAdminSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return new NextResponse('id is required', { status: 400 });
  }

  const supabase = createSupabaseServer();

  const { data: bs, error } = await supabase
    .from('broadsheets')
    .select('file_path, class, term, session, type')
    .eq('id', id)
    .single();

  if (error || !bs) {
    return new NextResponse('Broadsheet not found', { status: 404 });
  }

  const { data: signedData, error: signedErr } = await supabase.storage
    .from('results')
    .createSignedUrl(bs.file_path, 60);

  if (signedErr || !signedData?.signedUrl) {
    return new NextResponse('Could not generate PDF link', { status: 500 });
  }

  const pdfRes = await fetch(signedData.signedUrl);
  if (!pdfRes.ok) {
    return new NextResponse('Could not retrieve PDF', { status: 502 });
  }

  const pdfBuffer = await pdfRes.arrayBuffer();
  const filename  = `${bs.class}-${bs.type}-${bs.term}-${bs.session}.pdf`
    .replace(/\s+/g, '-').toLowerCase();

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
