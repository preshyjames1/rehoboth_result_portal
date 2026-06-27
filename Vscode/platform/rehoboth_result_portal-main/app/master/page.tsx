'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const TERMS = ['First Term', 'Second Term', 'Third Term'];
const currentYear = new Date().getFullYear();
const SESSIONS = Array.from({ length: 5 }, (_, i) => {
  const year = currentYear - i;
  return `${year}/${year + 1}`;
});

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_MASTER_CREDENTIALS: 'Invalid access number or PIN.',
  MASTER_PIN_INACTIVE: 'This credential has been deactivated.',
  MASTER_PIN_LIMIT_EXCEEDED: 'This credential has reached its usage limit.',
  MASTER_PIN_TERM_MISMATCH: 'This credential is not valid for the selected term.',
  MASTER_PIN_SESSION_MISMATCH: 'This credential is not valid for the selected session.',
  RATE_LIMITED: 'Too many requests. Please wait a minute.',
};

export default function MasterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    master_number: '',
    pin_code: '',
    term: '',
    session: '',
  });
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(ERROR_MESSAGES[data.error] ?? 'Authentication failed. Please check your credentials.');
        return;
      }

      if (data.redirect === 'browse') {
        router.push(`/master/browse?term=${encodeURIComponent(form.term)}&session=${encodeURIComponent(form.session)}`);
      } else if (data.redirect === 'result') {
        // Store student info for result page
        sessionStorage.setItem(
          'result_student',
          JSON.stringify({
            ...data.student,
            term: form.term,
            session: form.session,
            signed_url: data.signed_url,
          })
        );
        router.push('/result');
      }
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
      {/* Minimal header - no link from main nav */}
      <div className="bg-[#1a1a2e] border-b border-[#252545]">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#FFD700] flex items-center justify-center font-bold text-[#1a1a2e] text-xs">
            RC
          </div>
          <span className="text-gray-300 text-sm">Rehoboth College</span>
        </div>
      </div>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="bg-[#252545] px-6 py-5 border-b border-gray-700">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-[#FFD700]"></span>
                <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">
                  Restricted Access
                </span>
              </div>
              <h1 className="font-garamond text-xl font-semibold text-white">
                Admin Result Preview Access
              </h1>
              <p className="text-gray-400 text-xs mt-1">
                Enter your staff access credentials to preview results
              </p>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              {/* Access Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Access Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="master_number"
                  value={form.master_number}
                  onChange={handleChange}
                  placeholder="e.g. MASTER-XXXX"
                  className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm font-mono-custom uppercase focus:outline-none focus:ring-2 focus:ring-[#4169E1]"
                  required
                  autoComplete="off"
                />
              </div>

              {/* Master PIN */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Access PIN <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    name="pin_code"
                    value={form.pin_code}
                    onChange={handleChange}
                    placeholder="XXXX-XXXX-XXXX"
                    className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm font-mono-custom uppercase pr-12 focus:outline-none focus:ring-2 focus:ring-[#4169E1]"
                    required
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    {showPin ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
              </div>

              {/* Term */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Term <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="term"
                    value={form.term}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]"
                    required
                  >
                    <option value="">— Select —</option>
                    {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Session <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="session"
                    value={form.session}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]"
                    required
                  >
                    <option value="">— Select —</option>
                    {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#252545] hover:bg-[#1a1a2e] disabled:bg-gray-400 text-white font-semibold py-3 rounded-md text-sm mt-2"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Authenticating...
                  </span>
                ) : (
                  'Access Results'
                )}
              </button>
            </form>
          </div>

          {/* Footer note */}
          <p className="text-center text-xs text-gray-400 mt-4">
            🔒 This page is for authorised staff only.
          </p>
        </div>
      </main>

      <footer className="text-center py-4 text-xs text-gray-400">
        Rehoboth College — Staff Access Portal
      </footer>
    </div>
  );
}
