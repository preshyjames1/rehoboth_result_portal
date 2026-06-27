'use client';

import { useState, useEffect, useCallback } from 'react';

const TERMS = ['First Term', 'Second Term', 'Third Term'];
const currentYear = new Date().getFullYear();
const SESSIONS = Array.from({ length: 5 }, (_, i) => {
  const year = currentYear - i;
  return `${year}/${year + 1}`;
});

interface MasterPin {
  id: string;
  master_number: string;
  pin_code: string; // masked in list view
  label: string | null;
  usage_limit: number;
  usage_count: number;
  is_active: boolean;
  scope: 'all' | 'student';
  term: string | null;
  session: string | null;
  created_at: string;
  last_used: string | null;
  students: { admission_no: string; full_name: string } | null;
}

interface UsageLog {
  id: string;
  used_at: string;
  ip_address: string | null;
  term: string;
  session: string;
  students: { admission_no: string; full_name: string } | null;
}

interface StudentOption {
  id: string;
  admission_no: string;
  full_name: string;
  class: string;
}

const BLANK_FORM = {
  label: '',
  master_number: '',
  pin_code: '',
  scope: 'all' as 'all' | 'student',
  scoped_student_id: '',
  term: '',
  session: '',
  usage_limit: 5,
};

export default function AdminMasterPinsPage() {
  const [masterPins, setMasterPins] = useState<MasterPin[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Created credential reveal modal
  const [revealModal, setRevealModal] = useState<{ master_number: string; pin_code: string } | null>(null);
  const [copiedField, setCopiedField] = useState('');

  // Usage logs modal
  const [logsModal, setLogsModal] = useState<{ id: string; label: string } | null>(null);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Student search for scoped PIN
  const [studentSearch, setStudentSearch] = useState('');
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);

  const fetchMasterPins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/master-pins');
      const data = await res.json();
      setMasterPins(data.master_pins ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMasterPins(); }, [fetchMasterPins]);

  const searchStudents = async (q: string) => {
    if (q.length < 2) { setStudentOptions([]); return; }
    const res = await fetch(`/api/admin/students?search=${encodeURIComponent(q)}&limit=10`);
    const data = await res.json();
    setStudentOptions(data.students ?? []);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true); setCreateError('');
    try {
      const body = {
        ...form,
        scoped_student_id: form.scope === 'student' ? selectedStudent?.id : undefined,
        term: form.term || undefined,
        session: form.session || undefined,
        master_number: form.master_number || undefined,
        pin_code: form.pin_code || undefined,
      };
      const res = await fetch('/api/admin/master-pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setShowCreate(false);
        setRevealModal({ master_number: data.master_pin.master_number, pin_code: data.master_pin.pin_code });
        setForm(BLANK_FORM); setSelectedStudent(null); setStudentSearch('');
        fetchMasterPins();
      } else {
        setCreateError(data.error ?? 'Failed to create');
      }
    } catch { setCreateError('Network error'); }
    finally { setCreating(false); }
  };

  const toggleActive = async (id: string, is_active: boolean) => {
    await fetch('/api/admin/master-pins', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !is_active }),
    });
    fetchMasterPins();
  };

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Delete master credential "${label}"? All usage logs will also be deleted.`)) return;
    await fetch(`/api/admin/master-pins?id=${id}`, { method: 'DELETE' });
    fetchMasterPins();
  };

  const openLogs = async (id: string, label: string) => {
    setLogsModal({ id, label });
    setLogsLoading(true);
    const res = await fetch(`/api/admin/master-pins?id=${id}`);
    const data = await res.json();
    setLogs(data.logs ?? []);
    setLogsLoading(false);
  };

  const copy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2000);
  };

  const exportUsageLogs = () => {
    const rows = [['Date', 'Student', 'Admission No', 'Term', 'Session', 'IP Address']];
    logs.forEach((l) => {
      rows.push([
        new Date(l.used_at).toLocaleString(),
        l.students?.full_name ?? '—',
        l.students?.admission_no ?? '—',
        l.term, l.session,
        l.ip_address ?? '—',
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `master-pin-logs-${logsModal?.label ?? 'export'}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-garamond text-2xl font-bold text-[#1a1a2e]">Master PIN Management</h1>
          <p className="text-gray-500 text-sm mt-1">
            Staff access credentials for previewing results without student PINs
          </p>
        </div>
        <button onClick={() => { setShowCreate(true); setCreateError(''); setForm(BLANK_FORM); setSelectedStudent(null); }}
          className="bg-[#4169E1] hover:bg-[#2c4fc9] text-white font-medium px-4 py-2 rounded-md text-sm flex items-center gap-2">
          <span>🛡</span> Create Master Credential
        </button>
      </div>

      {/* Security info banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5 flex gap-3">
        <span className="text-amber-600 text-lg mt-0.5">⚠️</span>
        <div className="text-sm text-amber-800">
          <p className="font-semibold">Security Notice</p>
          <p className="mt-0.5 text-amber-700">
            Master credentials bypass the student publish gate and can view unpublished results.
            The full PIN is shown <strong>only once</strong> at creation. Store it securely.
            Master PINs are never purchasable and are admin-only.
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin w-6 h-6 text-[#4169E1]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : masterPins.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">🛡</p>
            <p className="text-sm">No master credentials created yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Label', 'Access Number', 'PIN (Masked)', 'Scope', 'Restrictions', 'Usage', 'Status', 'Last Used', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {masterPins.map((mp) => (
                  <tr key={mp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-[#1a1a2e]">{mp.label ?? '—'}</td>
                    <td className="px-4 py-3 font-mono-custom text-xs font-bold text-[#4169E1]">{mp.master_number}</td>
                    <td className="px-4 py-3 font-mono-custom text-xs text-gray-400">{mp.pin_code}</td>
                    <td className="px-4 py-3">
                      {mp.scope === 'all' ? (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">All Students</span>
                      ) : (
                        <div>
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">Specific</span>
                          {mp.students && (
                            <p className="text-xs text-gray-500 mt-0.5">{mp.students.full_name}</p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      <div className="space-y-0.5">
                        <p>{mp.term ?? <span className="text-gray-300">Any term</span>}</p>
                        <p>{mp.session ?? <span className="text-gray-300">Any session</span>}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-1.5">
                          <div className="bg-purple-500 h-1.5 rounded-full"
                            style={{ width: `${(mp.usage_count / mp.usage_limit) * 100}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 font-mono-custom">
                          {mp.usage_count}/{mp.usage_limit}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        mp.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                      }`}>
                        {mp.is_active ? '● Active' : '● Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {mp.last_used ? new Date(mp.last_used).toLocaleDateString('en-NG') : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <button onClick={() => openLogs(mp.id, mp.label ?? mp.master_number)}
                          className="text-blue-500 hover:underline">Logs</button>
                        <button onClick={() => toggleActive(mp.id, mp.is_active)}
                          className={mp.is_active ? 'text-yellow-600 hover:underline' : 'text-green-600 hover:underline'}>
                          {mp.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => handleDelete(mp.id, mp.label ?? mp.master_number)}
                          className="text-red-500 hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create Modal ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg my-4 overflow-hidden">
            <div className="bg-[#252545] px-5 py-4 flex items-center justify-between">
              <h2 className="font-semibold text-white text-base">Create Master Credential</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleCreate} className="px-5 py-5 space-y-4">
              {createError && (
                <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-red-700 text-sm">{createError}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Label (admin-facing name)</label>
                <input type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="e.g. Principal's Access"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4169E1]" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Access Number <span className="text-gray-400 text-xs font-normal">(auto if blank)</span>
                  </label>
                  <input type="text" value={form.master_number} onChange={(e) => setForm({ ...form, master_number: e.target.value })}
                    placeholder="MASTER-XXXX"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono-custom focus:outline-none focus:ring-2 focus:ring-[#4169E1]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    PIN <span className="text-gray-400 text-xs font-normal">(auto if blank)</span>
                  </label>
                  <input type="text" value={form.pin_code} onChange={(e) => setForm({ ...form, pin_code: e.target.value })}
                    placeholder="Auto-generated"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono-custom focus:outline-none focus:ring-2 focus:ring-[#4169E1]" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
                <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as 'all' | 'student' })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]">
                  <option value="all">All Students (can browse any student)</option>
                  <option value="student">Specific Student only</option>
                </select>
              </div>

              {form.scope === 'student' && (
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Student *</label>
                  {selectedStudent ? (
                    <div className="flex items-center gap-2 border border-gray-300 rounded-md px-3 py-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{selectedStudent.full_name}</p>
                        <p className="text-xs text-gray-500">{selectedStudent.admission_no} — {selectedStudent.class}</p>
                      </div>
                      <button type="button" onClick={() => { setSelectedStudent(null); setStudentSearch(''); }}
                        className="text-gray-400 hover:text-red-500 text-xs">Clear</button>
                    </div>
                  ) : (
                    <>
                      <input type="text" value={studentSearch}
                        onChange={(e) => { setStudentSearch(e.target.value); searchStudents(e.target.value); }}
                        placeholder="Search student..."
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4169E1]" />
                      {studentOptions.length > 0 && (
                        <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow-lg mt-1 max-h-40 overflow-y-auto">
                          {studentOptions.map((s) => (
                            <button key={s.id} type="button"
                              onClick={() => { setSelectedStudent(s); setStudentSearch(''); setStudentOptions([]); }}
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
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Term restriction <span className="text-gray-400 text-xs font-normal">(blank = all)</span>
                  </label>
                  <select value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]">
                    <option value="">All Terms</option>
                    {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Session restriction <span className="text-gray-400 text-xs font-normal">(blank = all)</span>
                  </label>
                  <select value={form.session} onChange={(e) => setForm({ ...form, session: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]">
                    <option value="">All Sessions</option>
                    {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usage Limit</label>
                <input type="number" min={1} max={100} value={form.usage_limit}
                  onChange={(e) => setForm({ ...form, usage_limit: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4169E1]" />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={creating || (form.scope === 'student' && !selectedStudent)}
                  className="flex-1 bg-[#252545] hover:bg-[#1a1a2e] disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-md text-sm">
                  {creating ? 'Creating...' : 'Create Credential'}
                </button>
                <button type="button" onClick={() => setShowCreate(false)}
                  className="border border-gray-300 text-gray-700 font-medium px-4 py-2 rounded-md text-sm">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Credential Reveal Modal (shown once) ── */}
      {revealModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-amber-500 px-5 py-4">
              <h2 className="font-semibold text-white text-base">⚠️ Save These Credentials Now</h2>
              <p className="text-amber-100 text-xs mt-1">The full PIN will NOT be shown again after closing this window.</p>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-md p-4 space-y-3">
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Access Number</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono-custom text-lg font-bold text-[#4169E1] bg-white border border-gray-200 rounded px-3 py-2">
                      {revealModal.master_number}
                    </code>
                    <button onClick={() => copy(revealModal.master_number, 'number')}
                      className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-md">
                      {copiedField === 'number' ? '✅ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">PIN (Full — Save Now!)</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono-custom text-lg font-bold text-[#1a1a2e] bg-white border border-2 border-amber-400 rounded px-3 py-2">
                      {revealModal.pin_code}
                    </code>
                    <button onClick={() => copy(revealModal.pin_code, 'pin')}
                      className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-md">
                      {copiedField === 'pin' ? '✅ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-700">
                🔒 This PIN is shown in full only once. After closing, only the masked version (XXXX-XXXX-****) will be visible in the table.
              </div>
              <button onClick={() => setRevealModal(null)}
                className="w-full bg-[#1a1a2e] hover:bg-[#252545] text-white font-semibold py-2.5 rounded-md text-sm">
                I've saved the credentials — Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Usage Logs Modal ── */}
      {logsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden max-h-[80vh] flex flex-col">
            <div className="bg-[#1a1a2e] px-5 py-4 flex items-center justify-between flex-shrink-0">
              <div>
                <p className="text-xs text-gray-400">Usage Logs</p>
                <p className="font-semibold text-white text-sm mt-0.5">{logsModal.label}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={exportUsageLogs} className="text-xs text-gray-300 hover:text-white border border-gray-600 px-3 py-1.5 rounded-md">
                  Export CSV
                </button>
                <button onClick={() => setLogsModal(null)} className="text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {logsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <svg className="animate-spin w-6 h-6 text-[#4169E1]" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-sm">No usage recorded yet</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr>
                      {['Date & Time', 'Student', 'Admission No', 'Term', 'Session', 'IP Address'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                          {new Date(log.used_at).toLocaleString('en-NG')}
                        </td>
                        <td className="px-4 py-3 font-medium text-[#1a1a2e]">{log.students?.full_name ?? '—'}</td>
                        <td className="px-4 py-3 font-mono-custom text-xs text-[#4169E1]">{log.students?.admission_no ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{log.term}</td>
                        <td className="px-4 py-3 text-gray-600">{log.session}</td>
                        <td className="px-4 py-3 font-mono-custom text-xs text-gray-400">{log.ip_address ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
