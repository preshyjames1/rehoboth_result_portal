/**
 * app/api/admin/master-pins/route.ts
 *
 * Security fixes:
 *   C-02 — All operations restricted to super admin only.
 *   M-01 — Master PIN stored as bcrypt hash (not plaintext).
 *           The pin_code column now holds a bcrypt hash.
 *           On creation, plaintext is returned once and never stored.
 *           On verify (/api/master), bcrypt.compare is used.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getAdminSession } from '@/lib/session';
import { generatePin, generateMasterNumber, maskPin } from '@/lib/pin-generator';
import bcrypt from 'bcryptjs';

async function requireSuperAdmin() {
  const session = await getAdminSession();
  if (!session) throw new Error('UNAUTHORIZED');
  if (session.role !== 'super') throw new Error('FORBIDDEN');
  return session;
}

function forbidden() { return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }); }
function unauthorized() { return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }); }

// GET — list master pins (super admin only, pin_code masked)
export async function GET(request: NextRequest) {
  try { await requireSuperAdmin(); } catch (e: unknown) {
    return (e instanceof Error && e.message === 'FORBIDDEN') ? forbidden() : unauthorized();
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const supabase = createSupabaseServer();

  if (id) {
    const { data, error } = await supabase
      .from('master_pin_usage')
      .select(`*, students(admission_no, full_name)`)
      .eq('master_pin_id', id)
      .order('used_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ logs: data });
  }

  const { data, error } = await supabase
    .from('master_pins')
    .select(`*, students:scoped_student_id(admission_no, full_name)`)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enriched = await Promise.all(
    (data ?? []).map(async (mp: Record<string, unknown> & { id: string; pin_code: string }) => {
      const { data: lastUsage } = await supabase
        .from('master_pin_usage')
        .select('used_at')
        .eq('master_pin_id', mp.id)
        .order('used_at', { ascending: false })
        .limit(1)
        .single();

      return {
        ...mp,
        // pin_code is now a bcrypt hash — mask it for display
        pin_code: '••••••••••••••••',
        last_used: lastUsage?.used_at ?? null,
      };
    }),
  );

  return NextResponse.json({ master_pins: enriched });
}

// POST — create master PIN (super admin only)
// M-01 FIX: store bcrypt hash of the PIN, never the plaintext.
export async function POST(request: NextRequest) {
  let adminSession: Awaited<ReturnType<typeof requireSuperAdmin>>;
  try { adminSession = await requireSuperAdmin(); } catch (e: unknown) {
    return (e instanceof Error && e.message === 'FORBIDDEN') ? forbidden() : unauthorized();
  }

  const body = await request.json();
  const {
    label,
    master_number: providedMasterNumber,
    pin_code: providedPinCode,
    scope = 'all',
    scoped_student_id,
    term,
    session,
    usage_limit = 5,
  } = body;

  if (scope === 'student' && !scoped_student_id) {
    return NextResponse.json(
      { error: 'scoped_student_id required when scope is student' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServer();

  const masterNumber = providedMasterNumber?.trim() || generateMasterNumber();
  // Generate or accept a plaintext PIN — we will hash it immediately
  const plainPin     = providedPinCode?.trim() || generatePin();

  // Check uniqueness of master_number
  const { data: existingNumber } = await supabase
    .from('master_pins').select('id').eq('master_number', masterNumber).single();
  if (existingNumber) {
    return NextResponse.json({ error: 'Master number already exists' }, { status: 409 });
  }

  // Hash the PIN with bcrypt (cost factor 12)
  const pinHash = await bcrypt.hash(plainPin, 12);

  const { data: adminRecord } = await supabase
    .from('admins').select('id').eq('email', adminSession.email).single();

  const { data, error } = await supabase
    .from('master_pins')
    .insert({
      master_number: masterNumber,
      pin_code:      pinHash,   // stored as hash
      label:         label ?? null,
      scope,
      scoped_student_id: scoped_student_id ?? null,
      term:          term    ?? null,
      session:       session ?? null,
      usage_limit,
      created_by_admin_id: adminRecord?.id ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return full plaintext PIN ONCE on creation — it is never stored and cannot be recovered
  return NextResponse.json(
    {
      master_pin: {
        ...data,
        pin_code: plainPin,  // plaintext returned ONCE only
      },
      _creation_only: true,
      _warning: 'Save this PIN now — it cannot be retrieved again.',
    },
    { status: 201 },
  );
}

// PATCH — toggle active / update (super admin only)
export async function PATCH(request: NextRequest) {
  try { await requireSuperAdmin(); } catch (e: unknown) {
    return (e instanceof Error && e.message === 'FORBIDDEN') ? forbidden() : unauthorized();
  }

  const body = await request.json();
  const { id, is_active, usage_limit, label } = body;

  if (!id) return NextResponse.json({ error: 'Master PIN ID required' }, { status: 400 });

  const supabase = createSupabaseServer();
  const updates: Record<string, unknown> = {};
  if (is_active    !== undefined) updates.is_active    = is_active;
  if (usage_limit  !== undefined) updates.usage_limit  = usage_limit;
  if (label        !== undefined) updates.label        = label;

  const { data, error } = await supabase
    .from('master_pins').update(updates).eq('id', id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    master_pin: { ...data, pin_code: '••••••••••••••••' },
  });
}

// DELETE — remove master PIN (super admin only)
export async function DELETE(request: NextRequest) {
  try { await requireSuperAdmin(); } catch (e: unknown) {
    return (e instanceof Error && e.message === 'FORBIDDEN') ? forbidden() : unauthorized();
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Master PIN ID required' }, { status: 400 });

  const supabase = createSupabaseServer();
  await supabase.from('master_pin_usage').delete().eq('master_pin_id', id);
  const { error } = await supabase.from('master_pins').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
