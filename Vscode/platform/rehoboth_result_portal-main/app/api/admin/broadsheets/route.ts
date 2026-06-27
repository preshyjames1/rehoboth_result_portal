/**
 * app/api/admin/broadsheets/route.ts
 *
 * Security fixes:
 *   M-02 — PDF magic-byte validation (replaces browser Content-Type check).
 *   L-03 — Bulk delete capped at 200 IDs per request.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getAdminSession } from '@/lib/session';

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) throw new Error('UNAUTHORIZED');
  return session;
}

function isPdf(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.slice(0, 4).toString('ascii') === '%PDF';
}

// GET — list broadsheets
export async function GET(request: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const term    = searchParams.get('term');
  const session = searchParams.get('session');
  const cls     = searchParams.get('class');
  const type    = searchParams.get('type');

  const supabase = createSupabaseServer();

  let query = supabase
    .from('broadsheets')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (term)    query = query.eq('term', term);
  if (session) query = query.eq('session', session);
  if (cls)     query = query.eq('class', cls);
  if (type)    query = query.eq('type', type);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ broadsheets: data, total: count });
}

// POST — upload a broadsheet PDF
export async function POST(request: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const formData = await request.formData();
  const file    = formData.get('file')    as File | null;
  const term    = formData.get('term')    as string;
  const session = formData.get('session') as string;
  const cls     = formData.get('class')   as string;
  const type    = formData.get('type')    as string;
  const title   = formData.get('title')   as string | null;

  if (!file || !term || !session || !cls || !type) {
    return NextResponse.json({ error: 'file, term, session, class and type are required' }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const fileBuffer  = Buffer.from(arrayBuffer);

  // M-02: validate PDF magic bytes — ignore browser-supplied MIME type
  if (!isPdf(fileBuffer)) {
    return NextResponse.json({ error: 'Only valid PDF files are accepted' }, { status: 400 });
  }

  const supabase = createSupabaseServer();

  const safeCls     = cls.replace(/\s+/g, '_');
  const safeTerm    = term.replace(/\s+/g, '_');
  const safeSession = session.replace(/\//g, '-');
  const pdfPath     = `broadsheets/${safeSession}/${safeTerm}/${safeCls}/${type}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from('results')
    .upload(pdfPath, fileBuffer, { contentType: 'application/pdf', upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data, error: dbError } = await supabase
    .from('broadsheets')
    .upsert(
      {
        term,
        session,
        class:    cls,
        type,
        pdf_path: pdfPath,
        title:    title || `${cls} — ${type.replace('_', ' ').toUpperCase()} (${term} ${session})`,
      },
      { onConflict: 'term,session,class,type' },
    )
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ broadsheet: data }, { status: 201 });
}

// DELETE — remove one or many broadsheets
export async function DELETE(request: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id  = searchParams.get('id');
  const ids = searchParams.get('ids');

  if (!id && !ids) return NextResponse.json({ error: 'id or ids required' }, { status: 400 });

  const supabase = createSupabaseServer();
  // L-03: cap bulk deletes at 200
  const idList = (ids ? ids.split(',') : [id!])
    .map((s) => s.trim()).filter(Boolean).slice(0, 200);

  const { data: rows } = await supabase.from('broadsheets').select('pdf_path').in('id', idList);
  const paths = (rows ?? []).map((r: { pdf_path: string }) => r.pdf_path).filter(Boolean);
  if (paths.length > 0) {
    await supabase.storage.from('results').remove(paths);
  }

  const { error } = await supabase.from('broadsheets').delete().in('id', idList);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, deleted: idList.length });
}

// PATCH — get signed URL for viewing a broadsheet
export async function PATCH(request: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = await request.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createSupabaseServer();

  const { data: sheet } = await supabase
    .from('broadsheets').select('pdf_path').eq('id', id).single();

  if (!sheet) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: signed, error: signErr } = await supabase.storage
    .from('results')
    .createSignedUrl(sheet.pdf_path, 600);

  if (signErr || !signed) return NextResponse.json({ error: 'Could not generate URL' }, { status: 500 });
  return NextResponse.json({ signed_url: signed.signedUrl });
}
