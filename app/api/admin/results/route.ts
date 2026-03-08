/**
 * app/api/admin/results/route.ts
 *
 * Security fixes:
 *   M-02 — File upload magic-byte validation: checks PDF header bytes
 *           before accepting any upload, regardless of the browser-
 *           supplied Content-Type (which is trivially spoofable).
 *   L-03 — Bulk delete capped at 200 IDs per request.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getAdminSession } from '@/lib/session';
import JSZip from 'jszip';

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) throw new Error('UNAUTHORIZED');
  return session;
}

/** Verify the first 4 bytes are %PDF (0x25 0x50 0x44 0x46) */
function isPdf(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.slice(0, 4).toString('ascii') === '%PDF';
}

// GET — list results
export async function GET(request: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const term    = searchParams.get('term');
  const session = searchParams.get('session');
  const page    = parseInt(searchParams.get('page')  ?? '1',  10);
  const limit   = parseInt(searchParams.get('limit') ?? '50', 10);
  const from    = (page - 1) * limit;
  const to      = from + limit - 1;

  const supabase = createSupabaseServer();

  let query = supabase
    .from('results')
    .select(`*, students(admission_no, full_name, class)`, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (term)    query = query.eq('term', term);
  if (session) query = query.eq('session', session);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data, total: count });
}

// POST — single result upload OR bulk ZIP upload
export async function POST(request: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const formData = await request.formData();
  const zipFile  = formData.get('zip_file') as File | null;

  // ── BULK UPLOAD (ZIP) ─────────────────────────────────────────────
  if (zipFile) {
    const term         = formData.get('term')         as string;
    const session      = formData.get('session')      as string;
    const publish_mode = formData.get('publish_mode') as string;
    const publish_at   = formData.get('publish_at')   as string | null;

    if (!term || !session) {
      return NextResponse.json({ error: 'Term and session are required' }, { status: 400 });
    }

    const maxMB = parseInt(process.env.MAX_BULK_ZIP_SIZE_MB ?? '50', 10);
    if (zipFile.size > maxMB * 1024 * 1024) {
      return NextResponse.json({ error: `ZIP file exceeds ${maxMB}MB limit` }, { status: 400 });
    }

    const supabase     = createSupabaseServer();
    const is_published = publish_mode === 'now';
    const scheduledAt  = publish_mode === 'scheduled' && publish_at ? publish_at : null;

    let zip: JSZip;
    try {
      const buffer = Buffer.from(await zipFile.arrayBuffer());
      zip = await JSZip.loadAsync(buffer);
    } catch {
      return NextResponse.json({ error: 'Invalid or corrupt ZIP file' }, { status: 400 });
    }

    const pdfFiles = Object.entries(zip.files).filter(
      ([name, entry]) =>
        !entry.dir &&
        name.toLowerCase().endsWith('.pdf') &&
        !name.startsWith('__MACOSX'),
    );

    const total = pdfFiles.length;
    let uploaded = 0;
    let failed   = 0;
    const failures: { filename: string; reason: string }[] = [];

    for (const [filename, entry] of pdfFiles) {
      const baseName    = filename.split('/').pop() ?? filename;
      const admissionNo = baseName.replace(/\.pdf$/i, '').trim().toUpperCase();

      const { data: student } = await supabase
        .from('students').select('id, class').eq('admission_no', admissionNo).single();

      if (!student) {
        failed++;
        failures.push({ filename: baseName, reason: `Student not found: ${admissionNo}` });
        continue;
      }

      try {
        const pdfBuffer = Buffer.from(await entry.async('arraybuffer'));

        // M-02: validate PDF magic bytes
        if (!isPdf(pdfBuffer)) {
          failed++;
          failures.push({ filename: baseName, reason: 'File is not a valid PDF (bad header bytes)' });
          continue;
        }

        const path = `${session}/${student.class}/${student.id}.pdf`;

        const { error: uploadErr } = await supabase.storage
          .from('results')
          .upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true });

        if (uploadErr) {
          failed++;
          failures.push({ filename: baseName, reason: `Upload failed: ${uploadErr.message}` });
          continue;
        }

        const { error: dbErr } = await supabase
          .from('results')
          .upsert(
            {
              student_id:   student.id,
              term,
              session,
              pdf_path:     path,
              is_published,
              publish_at:   scheduledAt,
              published_at: is_published ? new Date().toISOString() : null,
            },
            { onConflict: 'student_id,term,session' },
          );

        if (dbErr) {
          failed++;
          failures.push({ filename: baseName, reason: `Database error: ${dbErr.message}` });
          continue;
        }

        uploaded++;
      } catch (err) {
        failed++;
        failures.push({ filename: baseName, reason: `Unexpected error: ${String(err)}` });
      }
    }

    return NextResponse.json({ total, uploaded, failed, failures });
  }

  // ── SINGLE UPLOAD ─────────────────────────────────────────────────
  const file         = formData.get('pdf')          as File;
  const student_id   = formData.get('student_id')   as string;
  const term         = formData.get('term')         as string;
  const session      = formData.get('session')      as string;
  const publish_mode = formData.get('publish_mode') as string;
  const publish_at   = formData.get('publish_at')   as string | null;

  if (!file || !student_id || !term || !session) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());

  // M-02: validate PDF magic bytes
  if (!isPdf(fileBuffer)) {
    return NextResponse.json({ error: 'File is not a valid PDF' }, { status: 400 });
  }

  const supabase = createSupabaseServer();

  const { data: student } = await supabase
    .from('students').select('id, class').eq('id', student_id).single();

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  const path = `${session}/${student.class}/${student_id}.pdf`;

  const { error: uploadErr } = await supabase.storage
    .from('results')
    .upload(path, fileBuffer, { contentType: 'application/pdf', upsert: true });

  if (uploadErr) {
    return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });
  }

  const is_published = publish_mode === 'now';
  const scheduledAt  = publish_mode === 'scheduled' && publish_at ? publish_at : null;

  const { data, error } = await supabase
    .from('results')
    .upsert(
      {
        student_id,
        term,
        session,
        pdf_path:     path,
        is_published,
        publish_at:   scheduledAt,
        published_at: is_published ? new Date().toISOString() : null,
      },
      { onConflict: 'student_id,term,session' },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ result: data }, { status: 201 });
}

// PATCH — update publish state (single or bulk)
export async function PATCH(request: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = await request.json();
  const { id, action, publish_at, ids } = body;
  const supabase = createSupabaseServer();

  if (ids && Array.isArray(ids)) {
    let updates: Record<string, unknown> = {};
    if (action === 'publish') {
      updates = { is_published: true, published_at: new Date().toISOString(), publish_at: null };
    } else if (action === 'unpublish') {
      updates = { is_published: false, publish_at: null, published_at: null };
    } else {
      return NextResponse.json({ error: 'Invalid bulk action' }, { status: 400 });
    }
    const { error } = await supabase.from('results').update(updates).in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, updated: ids.length });
  }

  if (!id) return NextResponse.json({ error: 'Result ID required' }, { status: 400 });

  let updates: Record<string, unknown> = {};
  if (action === 'publish') {
    updates = { is_published: true, published_at: new Date().toISOString(), publish_at: null };
  } else if (action === 'unpublish') {
    updates = { is_published: false, publish_at: null, published_at: null };
  } else if (action === 'schedule' && publish_at) {
    updates = { publish_at, is_published: false, published_at: null };
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('results').update(updates).eq('id', id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ result: data });
}

// DELETE — remove one or many results (and their PDFs from storage)
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

  const { data: rows } = await supabase.from('results').select('pdf_path').in('id', idList);
  const paths = (rows ?? []).map((r: { pdf_path: string }) => r.pdf_path).filter(Boolean);
  if (paths.length > 0) {
    await supabase.storage.from('results').remove(paths);
  }

  const { error } = await supabase.from('results').delete().in('id', idList);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, deleted: idList.length });
}
