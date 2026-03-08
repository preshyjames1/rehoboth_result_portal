/**
 * app/api/admin/results/reupload/route.ts
 *
 * Security fix:
 *   M-02 — PDF magic-byte validation before accepting the file.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getAdminSession } from '@/lib/session';

function isPdf(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.slice(0, 4).toString('ascii') === '%PDF';
}

export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const formData  = await request.formData();
  const file      = formData.get('pdf')       as File;
  const result_id = formData.get('result_id') as string;

  if (!file || !result_id) {
    return NextResponse.json({ error: 'Missing file or result ID' }, { status: 400 });
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());

  // M-02: validate PDF magic bytes before uploading
  if (!isPdf(fileBuffer)) {
    return NextResponse.json({ error: 'File is not a valid PDF' }, { status: 400 });
  }

  const supabase = createSupabaseServer();

  const { data: existing, error: fetchErr } = await supabase
    .from('results')
    .select('*, students(id, class)')
    .eq('id', result_id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Result not found' }, { status: 404 });
  }

  const studentId    = existing.student_id;
  const studentClass = (existing.students as { id: string; class: string } | null)?.class ?? 'unknown';
  const path         = `${existing.session}/${studentClass}/${studentId}.pdf`;

  const { error: uploadErr } = await supabase.storage
    .from('results')
    .upload(path, fileBuffer, { contentType: 'application/pdf', upsert: true });

  if (uploadErr) {
    return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });
  }

  const { error: updateErr } = await supabase
    .from('results')
    .update({ pdf_path: path, updated_at: new Date().toISOString() })
    .eq('id', result_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
