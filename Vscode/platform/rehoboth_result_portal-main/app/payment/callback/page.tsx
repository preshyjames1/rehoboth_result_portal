'use client';

/**
 * app/payment/callback/page.tsx
 *
 * Security fix:
 *   I-01 — The GET /api/payment endpoint no longer returns the payer's
 *           email. The callback page now shows a generic success message
 *           rather than displaying the email address, eliminating the
 *           unauthenticated PII leak via reference enumeration.
 */

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const reference    = searchParams.get('reference');
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading');
  const [error,  setError]  = useState('');

  useEffect(() => {
    if (!reference) {
      setStatus('failed');
      setError('No payment reference found.');
      return;
    }

    const verify = async () => {
      try {
        const res  = await fetch(`/api/payment?reference=${reference}`);
        const data = await res.json();

        if (res.ok && data.status === 'success') {
          setStatus('success');
        } else {
          setStatus('failed');
          setError(data.message ?? 'Payment verification failed.');
        }
      } catch {
        setStatus('failed');
        setError('Could not verify payment. If you were charged, please contact the school.');
      }
    };

    verify();
  }, [reference]);

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
      <nav className="bg-[#1a1a2e] text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#FFD700] flex items-center justify-center font-bold text-[#1a1a2e] text-sm">RC</div>
          <div>
            <p className="font-semibold text-sm">Rehoboth College</p>
            <p className="text-xs text-[#FFD700]">Result Portal</p>
          </div>
        </div>
      </nav>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 max-w-md w-full text-center">

          {status === 'loading' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
                <svg className="animate-spin w-8 h-8 text-[#4169E1]" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <h2 className="font-garamond text-xl font-semibold text-[#1a1a2e]">Verifying Payment...</h2>
              <p className="text-gray-500 text-sm mt-2">Please wait while we confirm your payment.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                <span className="text-3xl">✅</span>
              </div>
              <h2 className="font-garamond text-2xl font-bold text-green-700">Payment Successful!</h2>
              <div className="bg-green-50 border border-green-200 rounded-md p-4 mt-4 text-left">
                <p className="text-green-800 text-sm font-medium">Your PIN has been sent!</p>
                {/* I-01 FIX: email address no longer displayed here */}
                <p className="text-green-700 text-sm mt-1">
                  Your result-checking PIN has been sent to your email address.
                  Please check your inbox and spam folder.
                </p>
              </div>
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-left">
                <p className="text-yellow-800 text-xs font-semibold">⚠️ Important:</p>
                <ul className="text-yellow-700 text-xs mt-1 space-y-1 list-disc list-inside">
                  <li>Your PIN can be used up to 5 times</li>
                  <li>After first use, it is permanently linked to your admission number</li>
                  <li>Do not share your PIN with anyone</li>
                </ul>
              </div>
              <Link
                href="/"
                className="mt-6 inline-block bg-[#4169E1] hover:bg-[#2c4fc9] text-white font-semibold px-6 py-3 rounded-md text-sm"
              >
                Check My Result →
              </Link>
            </>
          )}

          {status === 'failed' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                <span className="text-3xl">❌</span>
              </div>
              <h2 className="font-garamond text-2xl font-bold text-red-700">Payment Failed</h2>
              <p className="text-gray-600 text-sm mt-3">
                {error || 'Your payment could not be confirmed.'}
              </p>
              <p className="text-gray-500 text-xs mt-2">
                Reference: <span className="font-mono">{reference}</span>
              </p>
              <div className="flex gap-3 mt-6 justify-center">
                <Link
                  href="/buy-pin"
                  className="bg-[#4169E1] hover:bg-[#2c4fc9] text-white font-semibold px-5 py-2.5 rounded-md text-sm"
                >
                  Try Again
                </Link>
                <Link
                  href="/"
                  className="border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium px-5 py-2.5 rounded-md text-sm"
                >
                  Home
                </Link>
              </div>
            </>
          )}

        </div>
      </main>

      <footer className="bg-[#1a1a2e] text-gray-400 text-xs text-center py-4">
        <p>© {new Date().getFullYear()} Rehoboth College. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <PaymentCallbackContent />
    </Suspense>
  );
}
