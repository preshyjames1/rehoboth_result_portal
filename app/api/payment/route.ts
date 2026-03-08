/**
 * app/api/payment/route.ts
 *
 * Security fixes:
 *   I-01 — GET /api/payment?reference=xxx no longer returns the payer's
 *           email. Only status is returned. (The callback page does not
 *           need it for security — only for a "sent to" display message,
 *           which we now omit to avoid leaking PII.)
 *   I-02 — Webhook handler now validates the event timestamp. Events
 *           older than 5 minutes are rejected to close the replay window.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import {
  initializePaystackTransaction,
  verifyPaystackTransaction,
  verifyPaystackWebhookSignature,
} from '@/lib/paystack';
import { generatePin } from '@/lib/pin-generator';
import { sendPinEmail, sendBulkPinEmail } from '@/lib/resend';
import { randomBytes } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// GET ?reference=xxx  →  verify payment status (callback page)
// I-01 FIX: returns only {status} — email omitted to prevent PII leakage.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get('reference');

  if (!reference) {
    return NextResponse.json({ error: 'Reference required' }, { status: 400 });
  }

  try {
    const result = await verifyPaystackTransaction(reference);
    if (result.data.status !== 'success') {
      return NextResponse.json(
        { status: 'failed', message: 'Payment was not successful' },
        { status: 400 },
      );
    }
    // I-01: only return status — no email
    return NextResponse.json({ status: 'success' });
  } catch {
    return NextResponse.json(
      { status: 'failed', message: 'Could not verify payment' },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — two handlers in one:
//   Has x-paystack-signature header  →  webhook
//   No signature header              →  initialize payment
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const paystackSig = request.headers.get('x-paystack-signature');

  // ── Webhook handler ──────────────────────────────────────────────
  if (paystackSig) {
    const rawBody = await request.text();

    if (!verifyPaystackWebhookSignature(rawBody, paystackSig)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let event: { event: string; data: Record<string, unknown> };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (event.event !== 'charge.success') {
      return NextResponse.json({ received: true });
    }

    const data = event.data as {
      reference: string;
      status:    string;
      paid_at:   string;
      amount:    number;
      customer:  { email: string };
      metadata:  {
        admission_no:   string;
        full_name:      string;
        term:           string;
        session:        string;
        phone?:         string;
        purchase_type?: string;
        quantity?:      string;
      };
    };

    if (data.status !== 'success') {
      return NextResponse.json({ received: true });
    }

    // I-02: Reject events older than 5 minutes (replay attack prevention)
    const eventAge = Date.now() - new Date(data.paid_at).getTime();
    if (eventAge > 5 * 60 * 1000) {
      console.warn(`[webhook] Stale event rejected: ref=${data.reference} age=${Math.round(eventAge / 1000)}s`);
      return NextResponse.json({ received: true });
    }

    const supabase = createSupabaseServer();

    const { data: transaction } = await supabase
      .from('transactions')
      .select('*')
      .eq('reference', data.reference)
      .single();

    if (!transaction || transaction.status === 'success') {
      return NextResponse.json({ received: true });
    }

    const { admission_no, full_name, term, session, purchase_type, quantity } =
      data.metadata as {
        admission_no: string; full_name: string; term: string; session: string;
        purchase_type?: string; quantity?: string;
      };

    const isAdminBulk = purchase_type === 'admin_bulk';
    const qty = isAdminBulk ? Math.max(1, Math.min(200, parseInt(quantity ?? '1', 10))) : 1;

    const generatedPins: string[] = [];
    for (let i = 0; i < qty; i++) {
      let pinCode = '';
      let attempts = 0;
      do {
        pinCode = generatePin();
        const { data: existing } = await supabase
          .from('pins').select('id').eq('pin_code', pinCode).single();
        if (!existing) break;
        attempts++;
      } while (attempts < 10);

      const { data: newPin, error: pinErr } = await supabase
        .from('pins')
        .insert({
          pin_code: pinCode, usage_limit: 5, usage_count: 0,
          is_active: true, claimed_by_student_id: null, term, session,
        })
        .select('id')
        .single();

      if (!pinErr && newPin) generatedPins.push(pinCode);
    }

    if (generatedPins.length === 0) {
      return NextResponse.json({ received: true });
    }

    await supabase
      .from('transactions')
      .update({ status: 'success', paid_at: data.paid_at })
      .eq('id', transaction.id);

    try {
      if (isAdminBulk) {
        await sendBulkPinEmail({
          to: data.customer.email,
          pins: generatedPins,
          term,
          session,
          quantity: qty,
        });
      } else {
        await sendPinEmail({
          to:           data.customer.email,
          full_name:    full_name ?? admission_no,
          pin_code:     generatedPins[0],
          admission_no,
          term,
          session,
        });
      }
    } catch (emailErr) {
      console.error('Email send failed:', emailErr);
    }

    return NextResponse.json({ received: true });
  }

  // ── Initialize payment ────────────────────────────────────────────
  let body: {
    email:        string;
    admission_no: string;
    full_name:    string;
    phone?:       string;
    term:         string;
    session:      string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { email, admission_no, full_name, phone, term, session } = body;

  if (!email || !admission_no || !full_name || !term || !session) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = createSupabaseServer();

  const { data: student } = await supabase
    .from('students').select('id')
    .eq('admission_no', admission_no.trim().toUpperCase())
    .single();

  if (!student) {
    return NextResponse.json(
      { error: 'Student not found. Please verify your admission number.' },
      { status: 404 },
    );
  }

  const amount      = parseInt(process.env.PIN_PRICE_KOBO ?? '50000', 10);
  const reference   = `RHB-${randomBytes(8).toString('hex').toUpperCase()}`;
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/payment/callback?reference=${reference}`;

  try {
    const paystackResponse = await initializePaystackTransaction({
      email, amount, reference, callback_url: callbackUrl,
      metadata: {
        admission_no: admission_no.trim().toUpperCase(),
        full_name, term, session, phone: phone ?? '',
      },
    });

    await supabase.from('transactions').insert({
      reference,
      email,
      phone:        phone ?? null,
      admission_no: admission_no.trim().toUpperCase(),
      amount,
      status:       'pending',
    });

    return NextResponse.json({
      access_code:       paystackResponse.data.access_code,
      authorization_url: paystackResponse.data.authorization_url,
      reference,
    });
  } catch (error) {
    console.error('Paystack init error:', error);
    return NextResponse.json({ error: 'Payment initialization failed' }, { status: 500 });
  }
}
