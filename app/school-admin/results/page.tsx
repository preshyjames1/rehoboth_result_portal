'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const TERMS = ['First Term', 'Second Term', 'Third Term'];
const currentYear = new Date().getFullYear();
const SESSIONS = Array.from({ length: 5 }, (_, i) => {
  const year = currentYear - i;
  return `${year}/${year + 1}`;
});
const CLASSES = ['JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3'];
const BROADSHEET_TYPES = [
  { value: '1st_ca', label: '1st C.A.' },
  { value: '2nd_ca', label: '2nd C.A.' },
  { value: 'exam',   label: 'Exam' },
  { value: 'combined', label: 'Combined' },
];

interface Broadsheet {
  id: string;
  term: string;
  session: string;
  class: string;
  type: string;
  title: string;
  created_at: string;
  has_access: boolean;
}

const Spinner = () => (
  <svg className="animate-spin w-5 h-5 text-[#4169E1]" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

function typeLabel(v: string) {
  return BROADSHEET_TYPES.find((t) => t.value === v)?.label ?? v;
}

function TypeBadge({ type }: { type: string }) {
  const colours: Record<string, string> = {
    '1st_ca':  'bg-blue-100 text-blue-700',
    '2nd_ca':  'bg-purple-100 text-purple-700',
    exam:      'bg-orange-100 text-orange-700',
    combined:  'bg-green-100 text-green-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colours[type] ?? 'bg-gray-100 text-gray-700'}`}>
      {typeLabel(type)}
    </span>
  );
}

export default function SchoolAdminResultsPage() {
  const router = useRouter();

  const [broadsheets, setBroadsheets]     = useState<Broadsheet[]>([]);
  const [bsLoading, setBsLoading]         = useState(false);
  const [filterTerm, setFilterTerm]       = useState('');
  const [filterSession, setFilterSession] = useState('');
  const [filterClass, setFilterClass]     = useState('');
  const [filterType, setFilterType]       = useState('');

  const [showModal, setShowModal]         = useState(false);
  const [form, setForm]                   = useState({ term: '', session: '', class: '', type: '' });
  const [fetching, setFetching]           = useState(false);
  const [pdfUrl, setPdfUrl]               = useState<string | null>(null);
  const [pdfTitle, setPdfTitle]           = useState('');
  const [paymentError, setPaymentError]   = useState<{ term: string; session: string; message: string } | null>(null);
  const [generalError, setGeneralError]   = useState('');
  const [showViewer, setShowViewer]       = useState(false);

  const fetchBroadsheets = useCallback(async () => {
    setBsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterTerm)    params.set('term',    filterTerm);
      if (filterSession) params.set('session', filterSession);
      if (filterClass)   params.set('class',   filterClass);
      if (filterType)    params.set('type',    filterType);
      const res  = await fetch(`/api/school-admin/broadsheets?${params}`);
      const data = await res.json();
      setBroadsheets(data.broadsheets ?? []);
    } finally {
      setBsLoading(false);
    }
  }, [filterTerm, filterSession, filterClass, filterType]);

  useEffect(() => { fetchBroadsheets(); }, [fetchBroadsheets]);

  const openModalFor = (bs: Broadsheet) => {
    setForm({ term: bs.term, session: bs.session, class: bs.class, type: bs.type });
    resetModalState();
    setShowModal(true);
  };

  const openBlankModal = () => {
    setForm({ term: '', session: '', class: '', type: '' });
    resetModalState();
    setShowModal(true);
  };

  const resetModalState = () => {
    setPdfUrl(null); setPdfTitle('');
    setPaymentError(null); setGeneralError('');
  };

  const closeModal = () => { setShowModal(false); resetModalState(); };

  const handleGetResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.term || !form.session || !form.class || !form.type) return;
    setFetching(true); resetModalState();

    try {
      // Step 1 — find the matching broadsheet
      const params = new URLSearchParams({
        term: form.term, session: form.session,
        class: form.class, type: form.type,
      });
      const listRes  = await fetch(`/api/school-admin/broadsheets?${params}`);
      const listData = await listRes.json();
      const matches: Broadsheet[] = listData.broadsheets ?? [];

      if (matches.length === 0) {
        setGeneralError(
          `No broadsheet found for ${form.class} — ${typeLabel(form.type)}, ${form.term} ${form.session}. ` +
          'The super admin may not have uploaded it yet.'
        );
        return;
      }

      // Step 2 — request signed URL (payment check happens server-side)
      const accessRes = await fetch('/api/school-admin/broadsheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: matches[0].id }),
      });

      if (accessRes.status === 402) {
        const err = await accessRes.json();
        setPaymentError({ term: err.term, session: err.session, message: err.message });
        return;
      }

      if (!accessRes.ok) {
        setGeneralError('Could not load broadsheet. Please try again.');
        return;
      }

      const accessData = await accessRes.json();
      setPdfUrl(accessData.signed_url);
      setPdfTitle(accessData.title ?? `${accessData.class} — ${typeLabel(accessData.type)}`);
      setShowModal(false);
      setShowViewer(true);
    } catch {
      setGeneralError('Network error. Please try again.');
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a2e]">Broadsheets</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Class-level result broadsheets uploaded by the super admin
          </p>
        </div>
        <button
          onClick={openBlankModal}
          className="bg-[#4169E1] hover:bg-[#2c4fc9] text-white text-sm font-semibold px-4 py-2 rounded-md flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Get Broadsheet
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        {[
          { value: filterTerm,    setter: setFilterTerm,    opts: TERMS.map((v) => ({ value: v, label: v })), ph: 'All Terms' },
          { value: filterSession, setter: setFilterSession, opts: SESSIONS.map((v) => ({ value: v, label: v })), ph: 'All Sessions' },
          { value: filterClass,   setter: setFilterClass,   opts: CLASSES.map((v) => ({ value: v, label: v })), ph: 'All Classes' },
          { value: filterType,    setter: setFilterType,    opts: BROADSHEET_TYPES, ph: 'All Types' },
        ].map((f, i) => (
          <select key={i} value={f.value} onChange={(e) => f.setter(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]">
            <option value="">{f.ph}</option>
            {f.opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        <button onClick={fetchBroadsheets}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {bsLoading ? (
          <div className="flex items-center justify-center py-14"><Spinner /></div>
        ) : broadsheets.length === 0 ? (
          <div className="text-center py-14 text-gray-400">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-sm">No broadsheets available yet</p>
            <p className="text-xs mt-1 text-gray-300">The super admin needs to upload broadsheets first</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Class', 'Type', 'Term', 'Session', 'Date', 'Access', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {broadsheets.map((bs) => (
                  <tr key={bs.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-[#1a1a2e]">{bs.class}</td>
                    <td className="px-4 py-3"><TypeBadge type={bs.type} /></td>
                    <td className="px-4 py-3 text-gray-600">{bs.term}</td>
                    <td className="px-4 py-3 text-gray-600">{bs.session}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(bs.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {bs.has_access ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                          ✓ Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-medium">
                          ✗ Not paid
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openModalFor(bs)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                          bs.has_access
                            ? 'bg-[#4169E1] text-white hover:bg-[#2c4fc9]'
                            : 'border border-[#4169E1] text-[#4169E1] hover:bg-blue-50'
                        }`}
                      >
                        {bs.has_access ? 'View PDF' : 'Get Broadsheet'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Get Broadsheet Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-[#4169E1] px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white">Get Broadsheet</h2>
                <p className="text-blue-100 text-xs mt-0.5">Select the broadsheet you want to access</p>
              </div>
              <button onClick={closeModal} className="text-blue-200 hover:text-white text-xl leading-none">✕</button>
            </div>

            <form onSubmit={handleGetResult} className="px-5 py-5 space-y-4">
              {paymentError && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <span className="text-amber-500 text-lg leading-none mt-0.5">⚠️</span>
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Payment Required</p>
                      <p className="text-xs text-amber-700 mt-1">{paymentError.message}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { closeModal(); router.push('/school-admin/pins'); }}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold py-2 rounded-md"
                  >
                    Buy Pins for {paymentError.term} {paymentError.session} →
                  </button>
                </div>
              )}

              {generalError && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
                  {generalError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Class *</label>
                  <select value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]" required>
                    <option value="">— Class —</option>
                    {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]" required>
                    <option value="">— Type —</option>
                    {BROADSHEET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Term *</label>
                  <select value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]" required>
                    <option value="">— Term —</option>
                    {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Session *</label>
                  <select value={form.session} onChange={(e) => setForm({ ...form, session: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]" required>
                    <option value="">— Session —</option>
                    {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <p className="text-xs text-gray-400">
                Access requires a successful payment (pin purchase) for the selected term and session.
              </p>

              <div className="flex gap-3">
                <button type="submit"
                  disabled={fetching || !form.term || !form.session || !form.class || !form.type}
                  className="flex-1 bg-[#4169E1] hover:bg-[#2c4fc9] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-2">
                  {fetching ? (<><Spinner /><span>Checking access...</span></>) : 'Get Broadsheet'}
                </button>
                <button type="button" onClick={closeModal}
                  className="border border-gray-300 text-gray-700 font-medium px-4 py-2 rounded-md text-sm hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PDF Viewer Modal */}
      {showViewer && pdfUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80">
          <div className="bg-[#1a1a2e] px-5 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#4169E1] flex items-center justify-center text-white text-xs font-bold">
                PDF
              </div>
              <div>
                <p className="text-white text-sm font-semibold">{pdfTitle}</p>
                <p className="text-gray-400 text-xs">Broadsheet — view only</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <a href={pdfUrl} download={`${pdfTitle.replace(/\s+/g, '-')}.pdf`}
                className="bg-[#4169E1] hover:bg-[#2c4fc9] text-white text-xs font-medium px-3 py-1.5 rounded-md">
                Download
              </a>
              <button onClick={() => { setShowViewer(false); setPdfUrl(null); }}
                className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <iframe src={pdfUrl} className="w-full h-full border-0" title={pdfTitle} />
          </div>
        </div>
      )}
    </div>
  );
}
