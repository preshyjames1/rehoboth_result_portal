/**
 * app/api/result-pdf/route.ts
 *
 * Streams the student's result PDF directly from this domain.
 * Requires a valid result_session cookie (set by /api/verify).
 *
 * Why this approach instead of blob+iframe:
 *   - The browser navigates directly to this URL — no popup, no blob,
 *     no CSP issue. Works identically on desktop and every mobile browser.
 *   - The Supabase signed URL is never sent to the client. Only the
 *     final PDF bytes are returned, from your own domain.
 *   - Content-Disposition: inline tells the browser to render the PDF
 *     in its native viewer, not trigger a download.
 */
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getResultSession, getMasterSession } from '@/lib/session';

export async function GET() {
  const supabase = createSupabaseServer();

  // ── Resolve which result to serve ─────────────────────────────────────
  let pdfPath: string | null = null;

  const resultSession = await getResultSession();
  if (resultSession) {
    const { data: result } = await supabase
      .from('results')
      .select('pdf_path')
      .eq('id', resultSession.result_id)
      .single();
    pdfPath = result?.pdf_path ?? null;
  } else {
    // Also allow master session (scope=student)
    const masterSession = await getMasterSession();
    if (masterSession?.scope === 'student' && masterSession.scoped_student_id) {
      const { data: result } = await supabase
        .from('results')
        .select('pdf_path')
        .eq('student_id', masterSession.scoped_student_id)
        .eq('term', masterSession.term)
        .eq('session', masterSession.session)
        .single();
      pdfPath = result?.pdf_path ?? null;
    }
  }

  if (!pdfPath) {
    return new NextResponse('Unauthorized or result not found', { status: 401 });
  }

  // ── Fetch PDF bytes via a short-lived signed URL ───────────────────────
  const { data: signedData, error: signedErr } = await supabase.storage
    .from('results')
    .createSignedUrl(pdfPath, 60); // 60s is enough — we use it immediately

  if (signedErr || !signedData?.signedUrl) {
    return new NextResponse('Could not generate PDF link', { status: 500 });
  }

  const pdfRes = await fetch(signedData.signedUrl);
  if (!pdfRes.ok) {
    return new NextResponse('Could not retrieve PDF', { status: 502 });
  }

  const pdfBuffer = await pdfRes.arrayBuffer();

  // ── Stream back to browser ─────────────────────────────────────────────
  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': 'inline',          // render in browser, not download
      'Cache-Control':       'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
