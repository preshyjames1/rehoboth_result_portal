import { createHmac } from 'crypto';

const PAYSTACK_BASE = 'https://api.paystack.co';

interface PaystackInitResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    status: string; // 'success' | 'failed' | 'abandoned'
    reference: string;
    amount: number;
    paid_at: string;
    customer: {
      email: string;
    };
    metadata: Record<string, string>;
  };
}

export async function initializePaystackTransaction(params: {
  email: string;
  amount: number; // in kobo
  reference: string;
  callback_url: string;
  metadata?: Record<string, string>;
}): Promise<PaystackInitResponse> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error(`Paystack init failed: ${res.status}`);
  }

  return res.json();
}

export async function verifyPaystackTransaction(reference: string): Promise<PaystackVerifyResponse> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Paystack verify failed: ${res.status}`);
  }

  return res.json();
}

export function verifyPaystackWebhookSignature(rawBody: string, signature: string): boolean {
  const hash = createHmac('sha512', process.env.PAYSTACK_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest('hex');
  return hash === signature;
}
