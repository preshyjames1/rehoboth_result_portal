import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getAdminSession } from '@/lib/session';
import { initializePaystackTransaction } from '@/lib/paystack';
import { randomBytes } from 'crypto';

export async function POST(request: NextRequest) {
  // Must be a logged-in admin (super or school)
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  let body: { email: string; term: string; session: string; quantity: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { email, term, session: academicSession, quantity } = body;

  if (!email || !term || !academicSession || !quantity) {
    return NextResponse.json({ error: 'email, term, session and quantity are required' }, { status: 400 });
  }

  const qty = Math.max(1, Math.min(200, parseInt(String(quantity), 10)));
  const unitPrice = parseInt(process.env.PIN_PRICE_KOBO ?? '50000', 10);
  const totalAmount = qty * unitPrice;

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');

  if (!siteUrl) {
    return NextResponse.json({ error: 'Server configuration error: NEXT_PUBLIC_SITE_URL not set' }, { status: 500 });
  }

  const supabase = createSupabaseServer();
  const reference = `RHB-BULK-${randomBytes(8).toString('hex').toUpperCase()}`;
  const callbackUrl = `${siteUrl}/school-admin/pins?payment=success&ref=${reference}`;

  try {
    const paystackResponse = await initializePaystackTransaction({
      email,
      amount: totalAmount,
      reference,
      callback_url: callbackUrl,
      metadata: {
        quantity: String(qty),
        term,
        session: academicSession,
        purchase_type: 'admin_bulk',
        admin_email: email,
        // admission_no must be a non-empty string — use placeholder for admin bulk purchases
        admission_no: 'ADMIN-BULK',
        full_name: `Admin Bulk Purchase (${qty} PIN${qty > 1 ? 's' : ''})`,
        phone: '',
      },
    });

    const authUrl = paystackResponse.data.authorization_url;

    // Insert transaction — admission_no is required NOT NULL in DB so we use placeholder
    // authorization_url column requires migration.sql to be run first (see fix9/migration.sql)
    const { error: insertError } = await supabase.from('transactions').insert({
      reference,
      email,
      phone: null,
      admission_no: 'ADMIN-BULK',   // ← placeholder; NOT NULL column requires a value
      amount: totalAmount,
      status: 'pending',
      authorization_url: authUrl,   // ← requires migration.sql
    });

    if (insertError) {
      // If authorization_url column missing, retry without it
      if (insertError.message?.includes('authorization_url')) {
        const { error: retryError } = await supabase.from('transactions').insert({
          reference,
          email,
          phone: null,
          admission_no: 'ADMIN-BULK',
          amount: totalAmount,
          status: 'pending',
        });
        if (retryError) {
          console.error('Transaction insert failed (retry):', retryError);
          return NextResponse.json({ error: 'Failed to record transaction' }, { status: 500 });
        }
      } else {
        console.error('Transaction insert failed:', insertError);
        return NextResponse.json({ error: 'Failed to record transaction' }, { status: 500 });
      }
    }

    return NextResponse.json({
      authorization_url: authUrl,
      reference,
    });
  } catch (err) {
    console.error('Paystack init error (admin bulk):', err);
    return NextResponse.json({ error: 'Payment initialization failed' }, { status: 500 });
  }
}
