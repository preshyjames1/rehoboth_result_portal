'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const TERMS = ['First Term', 'Second Term', 'Third Term'];
const currentYear = new Date().getFullYear();
const SESSIONS = Array.from({ length: 5 }, (_, i) => {
  const year = currentYear - i;
  return `${year}/${year + 1}`;
});

interface Pin {
  id: string;
  pin_code: string;
  usage_limit: number;
  usage_count: number;
  is_active: boolean;
  term: string;
  session: string;
  created_at: string;
  students: { admission_no: string; full_name: string } | null;
}

const PIN_UNIT_PRICE = parseInt(process.env.NEXT_PUBLIC_PIN_PRICE_KOBO ?? '50000', 10) / 100;

function formatPin(pin: string) {
  return pin.replace(/(.{4})/g, '$1-').slice(0, -1);
}

function PinsPageContent() {
  const searchParams = useSearchParams();
  const paymentStatus = searchParams.get('payment');

  const [tab, setTab] = useState<'buy' | 'manage'>(paymentStatus === 'success' ? 'manage' : 'buy');
  const [showSuccess, setShowSuccess] = useState(paymentStatus === 'success');

  const [buyForm, setBuyForm] = useState({ email: '', term: '', session: '', quantity: 1 });
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState('');
  const submittingRef = useRef(false);

  const [pins, setPins] = useState<Pin[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterTerm, setFilterTerm] = useState('');
  const [filterSession, setFilterSession] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleBulkDelete = async () => {
    if (!selectedIds.size) return;
    if (!confirm(`Delete ${selectedIds.size} PIN${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    await fetch(`/api/admin/pins?ids=${Array.from(selectedIds).join(',')}`, { method: 'DELETE' });
    setSelectedIds(new Set());
    fetchPins();
  };

  const handleBulkToggle = async (active: boolean) => {
    if (!selectedIds.size) return;
    await Promise.all(Array.from(selectedIds).map(id =>
      fetch('/api/admin/pins', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_active: active }) })
    ));
    setSelectedIds(new Set());
    fetchPins();
  };

  const totalAmount = buyForm.quantity * PIN_UNIT_PRICE;

  const fetchPins = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filterTerm) params.set('term', filterTerm);
      if (filterSession) params.set('session', filterSession);
      const res = await fetch(`/api/admin/pins?${params}`);
      const data = await res.json();
      setPins(data.pins ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [filterTerm, filterSession]);

  useEffect(() => {
    if (tab === 'manage') fetchPins();
  }, [tab, fetchPins]);

  useEffect(() => {
    if (showSuccess) {
      const t = setTimeout(() => setShowSuccess(false), 8000);
      return () => clearTimeout(t);
    }
  }, [showSuccess]);

  const handleBuy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setBuyError('');
    setBuying(true);
    try {
      const res = await fetch('/api/admin/pins/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buyForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setBuyError(data.error ?? 'Payment initialization failed. Please try again.');
        submittingRef.current = false;
        setBuying(false);
        return;
      }
      window.location.href = data.authorization_url;
    } catch {
      setBuyError('A network error occurred. Please try again.');
      submittingRef.current = false;
      setBuying(false);
    }
  };

  const handleToggle = async (pin: Pin) => {
    setTogglingId(pin.id);
    try {
      await fetch('/api/admin/pins', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pin.id, is_active: !pin.is_active }),
      });
      fetchPins();
    } finally {
      setTogglingId(null);
    }
  };

  const usagePercent = (pin: Pin) => Math.round((pin.usage_count / pin.usage_limit) * 100);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-garamond text-2xl font-bold text-[#1a1a2e]">PIN Management</h1>
        <p className="text-gray-500 text-sm mt-1">Purchase new PINs and manage existing ones</p>
      </div>

      {showSuccess && (
        <div className="mb-5 bg-green-50 border border-green-300 rounded-lg px-5 py-4 flex items-start gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <p className="font-semibold text-green-800">Payment Successful!</p>
            <p className="text-green-700 text-sm mt-0.5">Your PINs have been generated and are being sent to your email. Check your inbox shortly.</p>
          </div>
          <button onClick={() => setShowSuccess(false)} className="ml-auto text-green-400 hover:text-green-600 text-lg leading-none">✕</button>
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {[{ key: 'buy', label: '🛒 Buy PINs' }, { key: 'manage', label: `📋 All PINs${total > 0 ? ` (${total})` : ''}` }].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t.key ? 'bg-white text-[#1a1a2e] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'buy' && (
        <div className="max-w-2xl grid md:grid-cols-[1fr_260px] gap-6 items-start">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-[#1a2e1a] px-5 py-4">
              <h2 className="font-semibold text-white">Purchase PINs</h2>
              <p className="text-green-200 text-xs mt-0.5">All PINs delivered to the email below after payment</p>
            </div>
            <form onSubmit={handleBuy} className="px-5 py-5 space-y-4">
              {buyError && (
                <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3 flex items-start gap-2">
                  <span className="text-red-500">⚠</span>
                  <p className="text-red-700 text-sm">{buyError}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Email <span className="text-red-500">*</span></label>
                <input type="email" value={buyForm.email} onChange={(e) => setBuyForm({ ...buyForm, email: e.target.value })}
                  placeholder="PINs will be sent here"
                  className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e1a]" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Term <span className="text-red-500">*</span></label>
                  <select value={buyForm.term} onChange={(e) => setBuyForm({ ...buyForm, term: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2e1a]" required>
                    <option value="">— Term —</option>
                    {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Session <span className="text-red-500">*</span></label>
                  <select value={buyForm.session} onChange={(e) => setBuyForm({ ...buyForm, session: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2e1a]" required>
                    <option value="">— Session —</option>
                    {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of PINs <span className="text-red-500">*</span></label>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setBuyForm(f => ({ ...f, quantity: Math.max(1, f.quantity - 1) }))}
                    className="w-10 h-10 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 font-bold text-lg flex items-center justify-center flex-shrink-0">−</button>
                  <input type="number" min={1} max={200} value={buyForm.quantity}
                    onChange={(e) => setBuyForm({ ...buyForm, quantity: Math.max(1, Math.min(200, parseInt(e.target.value) || 1)) })}
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2.5 text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-[#1a2e1a]" />
                  <button type="button" onClick={() => setBuyForm(f => ({ ...f, quantity: Math.min(200, f.quantity + 1) }))}
                    className="w-10 h-10 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 font-bold text-lg flex items-center justify-center flex-shrink-0">+</button>
                </div>
                <p className="text-xs text-gray-400 mt-1">Maximum 200 PINs per purchase</p>
              </div>
              <div className="bg-gray-50 rounded-md p-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600"><span>Unit price</span><span>₦{PIN_UNIT_PRICE.toLocaleString()}</span></div>
                <div className="flex justify-between text-gray-600"><span>Quantity</span><span>× {buyForm.quantity}</span></div>
                <div className="border-t border-gray-200 pt-1.5 flex justify-between font-bold text-[#1a1a2e]">
                  <span>Total</span><span className="text-[#1a2e1a] text-base">₦{totalAmount.toLocaleString()}</span>
                </div>
              </div>
              <button type="submit" disabled={buying}
                className="w-full bg-[#1a2e1a] hover:bg-[#2d5a1b] disabled:bg-gray-400 text-white font-semibold py-3 rounded-md text-sm">
                {buying ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Redirecting to Paystack...
                  </span>
                ) : `Pay ₦${totalAmount.toLocaleString()} · Get ${buyForm.quantity} PIN${buyForm.quantity > 1 ? 's' : ''}`}
              </button>
              <p className="text-xs text-gray-400 text-center">You will be redirected to Paystack&apos;s secure payment page</p>
            </form>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-[#1a1a2e] text-sm mb-3">📦 What happens next</h3>
              <ol className="space-y-2.5">
                {['Pay securely on Paystack', `${buyForm.quantity > 1 ? buyForm.quantity + ' PINs generated' : 'PIN generated'} instantly`, 'Delivered to your email in one message', 'Distribute to students individually'].map((step, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-gray-600">
                    <span className="w-5 h-5 rounded-full bg-[#1a2e1a] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              <p className="font-semibold mb-1">📌 Per-PIN details</p>
              <p>Each PIN: <strong>5 uses</strong>, locks to first student who uses it, valid for selected term only.</p>
            </div>
          </div>
        </div>
      )}

      {tab === 'manage' && (
        <div>
          <div className="flex gap-3 mb-4 flex-wrap">
            <select value={filterTerm} onChange={(e) => setFilterTerm(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2e1a]">
              <option value="">All Terms</option>
              {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterSession} onChange={(e) => setFilterSession(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2e1a]">
              <option value="">All Sessions</option>
              {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={fetchPins} className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">Refresh</button>
          </div>

          {selectedIds.size > 0 && (
            <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center gap-3 flex-wrap">
              <span className="text-sm text-blue-700 font-medium">{selectedIds.size} selected</span>
              <button onClick={() => handleBulkToggle(true)} className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded-md">Activate</button>
              <button onClick={() => handleBulkToggle(false)} className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-medium px-3 py-1.5 rounded-md">Deactivate</button>
              <button onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 rounded-md">Delete Selected</button>
              <button onClick={() => setSelectedIds(new Set())} className="text-gray-500 text-xs hover:text-gray-700 ml-auto">Clear selection</button>
            </div>
          )}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <svg className="animate-spin w-6 h-6 text-[#1a2e1a]" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : pins.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-4xl mb-3">🔑</p>
                <p className="text-sm">No PINs found</p>
                <button onClick={() => setTab('buy')} className="mt-3 text-[#1a2e1a] text-sm hover:underline font-medium">Buy PINs →</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 w-8">
                        <input type="checkbox" className="rounded"
                          checked={selectedIds.size === pins.length && pins.length > 0}
                          onChange={(e) => setSelectedIds(e.target.checked ? new Set(pins.map(p => p.id)) : new Set())} />
                      </th>
                      {['PIN Code', 'Term', 'Session', 'Usage', 'Claimed By', 'Status', 'Action'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pins.map((pin) => (
                      <tr key={pin.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <input type="checkbox" className="rounded" checked={selectedIds.has(pin.id)}
                            onChange={() => { const n = new Set(selectedIds); n.has(pin.id) ? n.delete(pin.id) : n.add(pin.id); setSelectedIds(n); }} />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-[#1a1a2e] tracking-wider">{formatPin(pin.pin_code)}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{pin.term}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{pin.session}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${usagePercent(pin) >= 100 ? 'bg-red-500' : usagePercent(pin) >= 60 ? 'bg-amber-500' : 'bg-green-500'}`}
                                style={{ width: `${Math.min(100, usagePercent(pin))}%` }} />
                            </div>
                            <span className="text-xs text-gray-500">{pin.usage_count}/{pin.usage_limit}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {pin.students ? (
                            <span>{pin.students.full_name}<br /><span className="font-mono text-[#4169E1]">{pin.students.admission_no}</span></span>
                          ) : <span className="text-gray-300 italic">Unclaimed</span>}
                        </td>
                        <td className="px-4 py-3">
                          {pin.is_active
                            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">✅ Active</span>
                            : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">❌ Inactive</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => handleToggle(pin)} disabled={togglingId === pin.id}
                            className={`text-xs font-medium hover:underline ${pin.is_active ? 'text-red-500' : 'text-green-600'}`}>
                            {togglingId === pin.id ? '...' : pin.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SchoolAdminPinsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading...</div>}>
      <PinsPageContent />
    </Suspense>
  );
}
