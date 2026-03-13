'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

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
  { value: 'exam', label: 'Exam' },
  { value: 'combined', label: 'Combined' },
];

interface Result {
  id: string; term: string; session: string;
  is_published: boolean; publish_at: string | null; published_at: string | null; created_at: string;
  students: { admission_no: string; full_name: string; class: string } | null;
}
interface BulkReport {
  total: number; uploaded: number; failed: number;
  failures: { filename: string; reason: string }[];
}
interface StudentOption { id: string; admission_no: string; full_name: string; class: string; }
interface Broadsheet {
  id: string; term: string; session: string; class: string;
  type: string; title: string; pdf_path: string; created_at: string;
}

function StatusBadge({ result }: { result: Result }) {
  if (result.is_published)
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">Published</span>;
  if (result.publish_at)
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">Scheduled</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium">Draft</span>;
}

export default function AdminResultsPage() {
  const [tab, setTab] = useState<'list' | 'single' | 'bulk' | 'broadsheets'>('list');
  const [results, setResults] = useState<Result[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [studentSearch, setStudentSearch] = useState('');
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [singleForm, setSingleForm] = useState({ term: '', session: '', publish_mode: 'unpublished', publish_at: '' });
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [singleLoading, setSingleLoading] = useState(false);
  const [singleMsg, setSingleMsg] = useState('');

  const [bulkForm, setBulkForm] = useState({ term: '', session: '', publish_mode: 'unpublished', publish_at: '' });
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkReport, setBulkReport] = useState<BulkReport | null>(null);

  const [reuploadTarget, setReuploadTarget] = useState<Result | null>(null);
  const [reuploadFile, setReuploadFile] = useState<File | null>(null);
  const [reuploadLoading, setReuploadLoading] = useState(false);
  const [reuploadMsg, setReuploadMsg] = useState('');
  const reuploadInputRef = useRef<HTMLInputElement>(null);


  // Broadsheets
  const [broadsheets, setBroadsheets] = useState<Broadsheet[]>([]);
  const [bsLoading, setBsLoading] = useState(false);
  const [bsFilterTerm, setBsFilterTerm] = useState('');
  const [bsFilterSession, setBsFilterSession] = useState('');
  const [bsFilterClass, setBsFilterClass] = useState('');
  const [bsFilterType, setBsFilterType] = useState('');
  const [showBsUpload, setShowBsUpload] = useState(false);
  const [bsForm, setBsForm] = useState({ term: '', session: '', class: '', type: '' });
  const [bsFile, setBsFile] = useState<File | null>(null);
  const [bsUploading, setBsUploading] = useState(false);
  const [bsMsg, setBsMsg] = useState('');
  const [bsSelectedIds, setBsSelectedIds] = useState<Set<string>>(new Set());

  const handleBsBulkDelete = async () => {
    if (!bsSelectedIds.size) return;
    if (!confirm(`Delete ${bsSelectedIds.size} broadsheet${bsSelectedIds.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    await fetch(`/api/admin/broadsheets?ids=${Array.from(bsSelectedIds).join(',')}`, { method: 'DELETE' });
    setBsSelectedIds(new Set());
    fetchBroadsheets();
  };

  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/results?limit=100');
      const data = await res.json();
      setResults(data.results ?? []);
      setTotal(data.total ?? 0);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  const fetchBroadsheets = useCallback(async () => {
    setBsLoading(true);
    try {
      const params = new URLSearchParams();
      if (bsFilterTerm) params.set('term', bsFilterTerm);
      if (bsFilterSession) params.set('session', bsFilterSession);
      if (bsFilterClass) params.set('class', bsFilterClass);
      if (bsFilterType) params.set('type', bsFilterType);
      const res = await fetch(`/api/admin/broadsheets?${params}`);
      const data = await res.json();
      setBroadsheets(data.broadsheets ?? []);
    } finally { setBsLoading(false); }
  }, [bsFilterTerm, bsFilterSession, bsFilterClass, bsFilterType]);

  useEffect(() => { if (tab === 'broadsheets') fetchBroadsheets(); }, [tab, fetchBroadsheets]);

  const searchStudents = async (q: string) => {
    if (q.length < 2) { setStudentOptions([]); return; }
    const res = await fetch(`/api/admin/students?search=${encodeURIComponent(q)}&limit=10`);
    const data = await res.json();
    setStudentOptions(data.students ?? []);
  };

  const handleSingleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !singleFile) return;
    setSingleLoading(true); setSingleMsg('');
    const fd = new FormData();
    fd.append('pdf', singleFile); fd.append('student_id', selectedStudent.id);
    fd.append('term', singleForm.term); fd.append('session', singleForm.session);
    fd.append('publish_mode', singleForm.publish_mode);
    if (singleForm.publish_at) fd.append('publish_at', singleForm.publish_at);
    try {
      const res = await fetch('/api/admin/results', { method: 'POST', body: fd });
      if (res.ok) {
        setSingleMsg('Result uploaded successfully!');
        setSelectedStudent(null); setStudentSearch(''); setSingleFile(null);
        setSingleForm({ term: '', session: '', publish_mode: 'unpublished', publish_at: '' });
        fetchResults();
      } else { const d = await res.json(); setSingleMsg(`Error: ${d.error}`); }
    } catch { setSingleMsg('Network error'); }
    finally { setSingleLoading(false); }
  };

  const handleBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkFile) return;
    setBulkLoading(true); setBulkReport(null);
    const fd = new FormData();
    fd.append('zip_file', bulkFile); fd.append('term', bulkForm.term); fd.append('session', bulkForm.session);
    fd.append('publish_mode', bulkForm.publish_mode);
    if (bulkForm.publish_at) fd.append('publish_at', bulkForm.publish_at);
    try {
      const res = await fetch('/api/admin/results', { method: 'POST', body: fd });
      const data = await res.json();
      setBulkReport(data);
      if (res.ok) fetchResults();
    } catch {
      setBulkReport({ total: 0, uploaded: 0, failed: 1, failures: [{ filename: 'unknown', reason: 'Network error' }] });
    } finally { setBulkLoading(false); }
  };

  const handleAction = async (id: string, action: string, publish_at?: string) => {
    await fetch('/api/admin/results', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, publish_at }),
    });
    fetchResults();
  };

  const handleBulkAction = async (action: string) => {
    if (!selectedIds.size) return;
    await fetch('/api/admin/results', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds), action }),
    });
    setSelectedIds(new Set()); fetchResults();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete result for ${name}? This permanently removes the PDF.`)) return;
    if ((await fetch(`/api/admin/results?id=${id}`, { method: 'DELETE' })).ok) fetchResults();
    else alert('Failed to delete result.');
  };

  const handleReupload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reuploadTarget || !reuploadFile) return;
    setReuploadLoading(true); setReuploadMsg('');
    const fd = new FormData();
    fd.append('pdf', reuploadFile); fd.append('result_id', reuploadTarget.id);
    fd.append('term', reuploadTarget.term); fd.append('session', reuploadTarget.session);
    fd.append('publish_mode', reuploadTarget.is_published ? 'now' : 'unpublished');
    try {
      const res = await fetch('/api/admin/results/reupload', { method: 'POST', body: fd });
      if (res.ok) {
        setReuploadMsg('Result replaced successfully!');
        setTimeout(() => { setReuploadTarget(null); setReuploadMsg(''); setReuploadFile(null); fetchResults(); }, 1500);
      } else { const d = await res.json(); setReuploadMsg(d.error); }
    } catch { setReuploadMsg('Network error'); }
    finally { setReuploadLoading(false); }
  };
 setViewUrl(''); setViewError(''); setViewLoading(true);
    try {
      const res = await fetch(`/api/admin/results/view-pdf?result_id=${result.id}`, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const blob = await (await fetch(data.signed_url)).blob();
      setViewUrl(URL.createObjectURL(blob));
    } catch { setViewError('Could not load PDF. Try again.'); }
    finally { setViewLoading(false); }
  };
 setViewTarget(null); setViewUrl(''); setViewError(''); };

  const handleBsUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bsFile) return;
    setBsUploading(true); setBsMsg('');
    const fd = new FormData();
    fd.append('file', bsFile); fd.append('term', bsForm.term); fd.append('session', bsForm.session);
    fd.append('class', bsForm.class); fd.append('type', bsForm.type);
    try {
      const res = await fetch('/api/admin/broadsheets', { method: 'POST', body: fd });
      if (res.ok) {
        setBsMsg('Broadsheet uploaded!');
        setBsForm({ term: '', session: '', class: '', type: '' }); setBsFile(null);
        setTimeout(() => { setShowBsUpload(false); setBsMsg(''); fetchBroadsheets(); }, 1500);
      } else { const d = await res.json(); setBsMsg(d.error); }
    } catch { setBsMsg('Network error'); }
    finally { setBsUploading(false); }
  };

  const handleBsDelete = async (bs: Broadsheet) => {
    if (!confirm(`Delete broadsheet for ${bs.class} — ${typeLabel(bs.type)}?`)) return;
    if ((await fetch(`/api/admin/broadsheets?id=${bs.id}`, { method: 'DELETE' })).ok) fetchBroadsheets();
    else alert('Failed to delete broadsheet.');
  };
 setBsViewUrl(''); setBsViewError(''); setBsViewLoading(true);
    try {
      const res = await fetch('/api/admin/broadsheets', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bs.id }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const blob = await (await fetch(data.signed_url)).blob();
      setBsViewUrl(URL.createObjectURL(blob));
    } catch { setBsViewError('Could not load PDF. Try again.'); }
    finally { setBsViewLoading(false); }
  };
 setBsViewTarget(null); setBsViewUrl(''); setBsViewError(''); };
  const typeLabel = (v: string) => BROADSHEET_TYPES.find((t) => t.value === v)?.label ?? v;

  const Spinner = () => (
    <svg className="animate-spin w-6 h-6 text-[#4169E1]" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );

  const PublishFields = ({ form, setForm }: { form: typeof singleForm; setForm: (f: typeof singleForm) => void }) => (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Publish Mode</label>
        <select value={form.publish_mode} onChange={(e) => setForm({ ...form, publish_mode: e.target.value })}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]">
          <option value="unpublished">Unpublished (draft)</option>
          <option value="now">Publish Now</option>
          <option value="scheduled">Schedule</option>
        </select>
      </div>
      {form.publish_mode === 'scheduled' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Publish At *</label>
          <input type="datetime-local" value={form.publish_at} onChange={(e) => setForm({ ...form, publish_at: e.target.value })}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4169E1]" required />
        </div>
      )}
    </>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-garamond text-2xl font-bold text-[#1a1a2e]">Results Management</h1>
        <p className="text-gray-500 text-sm mt-1">Upload, view, replace and manage student results and broadsheets</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit flex-wrap">
        {[
          { key: 'list', label: `All Results (${total})` },
          { key: 'single', label: 'Upload Single' },
          { key: 'bulk', label: 'Bulk ZIP' },
          { key: 'broadsheets', label: '📊 Broadsheets' },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t.key ? 'bg-white text-[#1a1a2e] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── SINGLE UPLOAD ── */}
      {tab === 'single' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden max-w-lg">
          <div className="bg-[#4169E1] px-5 py-4">
            <h2 className="font-semibold text-white">Upload Single Result</h2>
            <p className="text-blue-100 text-xs mt-0.5">Existing result for same student/term/session will be replaced.</p>
          </div>
          <form onSubmit={handleSingleUpload} className="px-5 py-5 space-y-4">
            {singleMsg && (
              <div className={`p-3 rounded-md text-sm border ${singleMsg.includes('Error') || singleMsg.includes('error') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>{singleMsg}</div>
            )}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Student *</label>
              {selectedStudent ? (
                <div className="flex items-center gap-2 border border-gray-300 rounded-md px-3 py-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{selectedStudent.full_name}</p>
                    <p className="text-xs text-gray-500">{selectedStudent.admission_no} — {selectedStudent.class}</p>
                  </div>
                  <button type="button" onClick={() => { setSelectedStudent(null); setStudentSearch(''); }} className="text-gray-400 hover:text-red-500 text-xs font-medium">Clear</button>
                </div>
              ) : (
                <>
                  <input type="text" value={studentSearch} onChange={(e) => { setStudentSearch(e.target.value); searchStudents(e.target.value); }}
                    placeholder="Search by name or admission no..."
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4169E1]" />
                  {studentOptions.length > 0 && (
                    <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow-lg mt-1 max-h-44 overflow-y-auto">
                      {studentOptions.map((s) => (
                        <button key={s.id} type="button" onClick={() => { setSelectedStudent(s); setStudentSearch(''); setStudentOptions([]); }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-100 last:border-0">
                          <p className="font-medium">{s.full_name}</p>
                          <p className="text-xs text-gray-500">{s.admission_no} — {s.class}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Term *</label>
                <select value={singleForm.term} onChange={(e) => setSingleForm({ ...singleForm, term: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]" required>
                  <option value="">— Term —</option>
                  {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Session *</label>
                <select value={singleForm.session} onChange={(e) => setSingleForm({ ...singleForm, session: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]" required>
                  <option value="">— Session —</option>
                  {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Result PDF *</label>
              <input type="file" accept="application/pdf" onChange={(e) => setSingleFile(e.target.files?.[0] ?? null)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm file:mr-3 file:py-1 file:px-3 file:border-0 file:rounded file:bg-blue-50 file:text-blue-700 file:text-xs" required />
            </div>
            <PublishFields form={singleForm} setForm={setSingleForm} />
            <button type="submit" disabled={singleLoading || !selectedStudent}
              className="w-full bg-[#4169E1] hover:bg-[#2c4fc9] disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-md text-sm">
              {singleLoading ? 'Uploading...' : 'Upload Result'}
            </button>
          </form>
        </div>
      )}

      {/* ── BULK UPLOAD ── */}
      {tab === 'bulk' && (
        <div className="max-w-lg space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-[#4169E1] px-5 py-4">
              <h2 className="font-semibold text-white">Bulk Upload (ZIP)</h2>
              <p className="text-blue-100 text-xs mt-0.5">Existing results for matched students will be replaced.</p>
            </div>
            <form onSubmit={handleBulkUpload} className="px-5 py-5 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
                <p className="font-semibold mb-1">ZIP structure:</p>
                <code className="text-xs block bg-white px-2 py-1 rounded border border-blue-100">results.zip / RC-2024-001.pdf / RC-2024-002.pdf</code>
                <p className="text-xs text-blue-600 mt-1">Each PDF named with the student&apos;s admission number</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Term *</label>
                  <select value={bulkForm.term} onChange={(e) => setBulkForm({ ...bulkForm, term: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]" required>
                    <option value="">— Term —</option>
                    {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Session *</label>
                  <select value={bulkForm.session} onChange={(e) => setBulkForm({ ...bulkForm, session: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]" required>
                    <option value="">— Session —</option>
                    {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP File *</label>
                <input type="file" accept=".zip" onChange={(e) => setBulkFile(e.target.files?.[0] ?? null)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm file:mr-3 file:py-1 file:px-3 file:border-0 file:rounded file:bg-blue-50 file:text-blue-700 file:text-xs" required />
              </div>
              <PublishFields form={bulkForm} setForm={setBulkForm} />
              <button type="submit" disabled={bulkLoading || !bulkFile}
                className="w-full bg-[#4169E1] hover:bg-[#2c4fc9] disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-md text-sm">
                {bulkLoading ? 'Uploading...' : 'Upload ZIP'}
              </button>
            </form>
          </div>
          {bulkReport && (
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="font-semibold text-[#1a1a2e] mb-3">Upload Report</h3>
              <div className="border border-gray-200 rounded-md overflow-hidden text-sm">
                <div className="px-4 py-2.5 flex justify-between border-b border-gray-100"><span className="text-gray-600">Total</span><span className="font-bold">{bulkReport.total}</span></div>
                <div className="px-4 py-2.5 flex justify-between border-b border-gray-100 bg-green-50"><span className="text-green-700">Uploaded</span><span className="font-bold text-green-700">{bulkReport.uploaded}</span></div>
                <div className={`px-4 py-2.5 flex justify-between ${bulkReport.failed > 0 ? 'bg-red-50' : ''}`}>
                  <span className={bulkReport.failed > 0 ? 'text-red-600' : 'text-gray-400'}>Failed</span>
                  <span className={`font-bold ${bulkReport.failed > 0 ? 'text-red-600' : 'text-gray-400'}`}>{bulkReport.failed}</span>
                </div>
              </div>
              {bulkReport.failures.map((f, i) => (
                <p key={i} className="text-xs text-red-500 mt-1"><span className="font-mono">{f.filename}</span> — {f.reason}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── RESULTS LIST ── */}
      {tab === 'list' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {selectedIds.size > 0 && (
            <div className="bg-blue-50 border-b border-blue-200 px-5 py-3 flex items-center gap-3 flex-wrap">
              <span className="text-sm text-blue-700 font-medium">{selectedIds.size} selected</span>
              <button onClick={() => handleBulkAction('publish')} className="bg-green-600 text-white text-xs font-medium px-3 py-1.5 rounded-md">Publish All</button>
              <button onClick={() => handleBulkAction('unpublish')} className="bg-yellow-500 text-white text-xs font-medium px-3 py-1.5 rounded-md">Unpublish All</button>
              <button onClick={() => setSelectedIds(new Set())} className="text-gray-500 text-xs ml-auto">Clear</button>
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-12"><Spinner /></div>
          ) : results.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">📄</p><p className="text-sm">No results yet</p>
              <button onClick={() => setTab('single')} className="mt-3 text-[#4169E1] text-sm hover:underline">Upload a result →</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 w-8">
                      <input type="checkbox" className="rounded" checked={selectedIds.size === results.length && results.length > 0}
                        onChange={(e) => setSelectedIds(e.target.checked ? new Set(results.map((r) => r.id)) : new Set())} />
                    </th>
                    {['Student', 'Adm. No', 'Class', 'Term', 'Session', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <input type="checkbox" className="rounded" checked={selectedIds.has(r.id)}
                          onChange={() => { const n = new Set(selectedIds); n.has(r.id) ? n.delete(r.id) : n.add(r.id); setSelectedIds(n); }} />
                      </td>
                      <td className="px-4 py-3 font-medium text-[#1a1a2e]">{r.students?.full_name ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#4169E1]">{r.students?.admission_no ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{r.students?.class ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{r.term}</td>
                      <td className="px-4 py-3 text-gray-600">{r.session}</td>
                      <td className="px-4 py-3"><StatusBadge result={r} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-xs font-medium flex-wrap">
                          <a href={`/api/admin/results/pdf-proxy?result_id=${r.id}`} target="_blank" rel="noreferrer" className="text-[#4169E1] hover:underline">View PDF</a>
                          {!r.is_published && <button onClick={() => handleAction(r.id, 'publish')} className="text-green-600 hover:underline">Publish</button>}
                          {r.is_published && <button onClick={() => handleAction(r.id, 'unpublish')} className="text-yellow-600 hover:underline">Unpublish</button>}
                          {!r.is_published && !r.publish_at && (
                            <button onClick={() => { const dt = prompt('Schedule (YYYY-MM-DDTHH:MM):'); if (dt) handleAction(r.id, 'schedule', dt); }} className="text-blue-500 hover:underline">Schedule</button>
                          )}
                          <button onClick={() => { setReuploadTarget(r); setReuploadFile(null); setReuploadMsg(''); }} className="text-purple-600 hover:underline">Replace PDF</button>
                          <button onClick={() => handleDelete(r.id, r.students?.full_name ?? 'this student')} className="text-red-500 hover:underline">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── BROADSHEETS ── */}
      {tab === 'broadsheets' && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <p className="text-sm text-gray-500">Class-level PDF broadsheets for 1st C.A., 2nd C.A., Exam, or combined assessments</p>
            <button onClick={() => { setShowBsUpload(true); setBsMsg(''); }}
              className="bg-[#4169E1] hover:bg-[#2c4fc9] text-white text-sm font-semibold px-4 py-2 rounded-md">
              + Upload Broadsheet
            </button>
          </div>
          <div className="flex gap-3 mb-4 flex-wrap">
            {[
              { value: bsFilterTerm, setter: setBsFilterTerm, opts: TERMS.map(v => ({ value: v, label: v })), ph: 'All Terms' },
              { value: bsFilterSession, setter: setBsFilterSession, opts: SESSIONS.map(v => ({ value: v, label: v })), ph: 'All Sessions' },
              { value: bsFilterClass, setter: setBsFilterClass, opts: CLASSES.map(v => ({ value: v, label: v })), ph: 'All Classes' },
              { value: bsFilterType, setter: setBsFilterType, opts: BROADSHEET_TYPES, ph: 'All Types' },
            ].map((f, i) => (
              <select key={i} value={f.value} onChange={(e) => f.setter(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]">
                <option value="">{f.ph}</option>
                {f.opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ))}
            <button onClick={fetchBroadsheets} className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">Refresh</button>
          </div>
          {bsSelectedIds.size > 0 && (
            <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center gap-3 flex-wrap">
              <span className="text-sm text-blue-700 font-medium">{bsSelectedIds.size} selected</span>
              <button onClick={handleBsBulkDelete} className="bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 rounded-md">Delete Selected</button>
              <button onClick={() => setBsSelectedIds(new Set())} className="text-gray-500 text-xs hover:text-gray-700 ml-auto">Clear selection</button>
            </div>
          )}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {bsLoading ? (
              <div className="flex items-center justify-center py-12"><Spinner /></div>
            ) : broadsheets.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-4xl mb-3">📊</p><p className="text-sm">No broadsheets uploaded yet</p>
                <button onClick={() => setShowBsUpload(true)} className="mt-3 text-[#4169E1] text-sm hover:underline">Upload one →</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 w-8">
                        <input type="checkbox" className="rounded"
                          checked={bsSelectedIds.size === broadsheets.length && broadsheets.length > 0}
                          onChange={(e) => setBsSelectedIds(e.target.checked ? new Set(broadsheets.map(b => b.id)) : new Set())} />
                      </th>
                      {['Class', 'Type', 'Term', 'Session', 'Date', 'Actions'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {broadsheets.map((bs) => (
                      <tr key={bs.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <input type="checkbox" className="rounded" checked={bsSelectedIds.has(bs.id)}
                            onChange={() => { const n = new Set(bsSelectedIds); n.has(bs.id) ? n.delete(bs.id) : n.add(bs.id); setBsSelectedIds(n); }} />
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#1a1a2e]">{bs.class}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            bs.type === '1st_ca' ? 'bg-blue-100 text-blue-700' :
                            bs.type === '2nd_ca' ? 'bg-purple-100 text-purple-700' :
                            bs.type === 'exam' ? 'bg-orange-100 text-orange-700' :
                            'bg-green-100 text-green-700'
                          }`}>{typeLabel(bs.type)}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{bs.term}</td>
                        <td className="px-4 py-3 text-gray-600">{bs.session}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{new Date(bs.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 text-xs font-medium">
                            <a href={`/api/admin/broadsheets/pdf-proxy?id=${bs.id}`} target="_blank" rel="noreferrer" className="text-[#4169E1] hover:underline">View PDF</a>
                            <button onClick={() => handleBsDelete(bs)} className="text-red-500 hover:underline">Delete</button>
                          </div>
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

      {/* ── UPLOAD BROADSHEET MODAL ── */}
      {showBsUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-[#4169E1] px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white">Upload Broadsheet</h2>
                <p className="text-blue-100 text-xs mt-0.5">Select class, assessment type, term and session</p>
              </div>
              <button onClick={() => setShowBsUpload(false)} className="text-blue-200 hover:text-white text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleBsUpload} className="px-5 py-5 space-y-4">
              {bsMsg && (
                <div className={`p-3 rounded-md text-sm border ${bsMsg.includes('error') || bsMsg.includes('Error') || bsMsg.includes('❌') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>{bsMsg}</div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Class *</label>
                  <select value={bsForm.class} onChange={(e) => setBsForm({ ...bsForm, class: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]" required>
                    <option value="">— Class —</option>
                    {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                  <select value={bsForm.type} onChange={(e) => setBsForm({ ...bsForm, type: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]" required>
                    <option value="">— Type —</option>
                    {BROADSHEET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Term *</label>
                  <select value={bsForm.term} onChange={(e) => setBsForm({ ...bsForm, term: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]" required>
                    <option value="">— Term —</option>
                    {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Session *</label>
                  <select value={bsForm.session} onChange={(e) => setBsForm({ ...bsForm, session: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]" required>
                    <option value="">— Session —</option>
                    {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PDF File *</label>
                <input type="file" accept="application/pdf" onChange={(e) => setBsFile(e.target.files?.[0] ?? null)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm file:mr-3 file:py-1 file:px-3 file:border-0 file:rounded file:bg-blue-50 file:text-blue-700 file:text-xs" required />
                <p className="text-xs text-gray-400 mt-1">Uploading again for same class/type/term/session replaces the existing file.</p>
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={bsUploading || !bsFile}
                  className="flex-1 bg-[#4169E1] hover:bg-[#2c4fc9] disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-md text-sm">
                  {bsUploading ? 'Uploading...' : 'Upload Broadsheet'}
                </button>
                <button type="button" onClick={() => setShowBsUpload(false)}
                  className="border border-gray-300 text-gray-700 font-medium px-4 py-2 rounded-md text-sm">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── REUPLOAD MODAL ── */}
      {reuploadTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-purple-600 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white text-sm">Replace Result PDF</h2>
                <p className="text-purple-200 text-xs mt-0.5">{reuploadTarget.students?.full_name} — {reuploadTarget.term} {reuploadTarget.session}</p>
              </div>
              <button onClick={() => setReuploadTarget(null)} className="text-purple-200 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleReupload} className="px-5 py-5 space-y-4">
              {reuploadMsg && (
                <div className={`p-3 rounded-md text-sm border ${reuploadMsg.includes('Error') || reuploadMsg.includes('error') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>{reuploadMsg}</div>
              )}
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800">
                This will permanently replace the existing PDF. Publish state is preserved.
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New PDF *</label>
                <input ref={reuploadInputRef} type="file" accept="application/pdf" onChange={(e) => setReuploadFile(e.target.files?.[0] ?? null)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm file:mr-3 file:py-1 file:px-3 file:border-0 file:rounded file:bg-purple-50 file:text-purple-700 file:text-xs" required />
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={reuploadLoading || !reuploadFile}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-md text-sm">
                  {reuploadLoading ? 'Replacing...' : 'Replace PDF'}
                </button>
                <button type="button" onClick={() => setReuploadTarget(null)} className="border border-gray-300 text-gray-700 font-medium px-4 py-2 rounded-md text-sm">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
