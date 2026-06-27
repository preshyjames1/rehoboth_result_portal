'use client';

import { useState, useEffect, useCallback } from 'react';

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

export default function AdminPinsPage() {
  const [pins, setPins] = useState<Pin[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ term: '', session: '', usage_limit: 5, quantity: 1 });
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  const [newPins, setNewPins] = useState<string[]>([]);

  const fetchPins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/pins?page=${page}&limit=50`);
      const data = await res.json();
      setPins(data.pins ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchPins(); }, [fetchPins]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true); setCreateMsg(''); setNewPins([]);
    try {
      const res = await fetch('/api/admin/pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (res.ok) {
        setCreateMsg(`✅ Created ${data.created} PIN${data.created !== 1 ? 's' : ''}`);
        setNewPins(data.pins ?? []);
        fetchPins();
      } else {
        setCreateMsg(`❌ ${data.error}`);
      }
    } catch { setCreateMsg('❌ Network error'); }
    finally { setCreating(false); }
  };

  const toggleActive = async (id: string, is_active: boolean) => {
    await fetch('/api/admin/pins', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !is_active }),
    });
    fetchPins();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this PIN? This cannot be undone.')) return;
    await fetch(`/api/admin/pins?id=${id}`, { method: 'DELETE' });
    fetchPins();
  };

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

  const exportCSV = () => {
    const rows = [['PIN Code', 'Term', 'Session', 'Claimed By', 'Admission No', 'Usage', 'Status']];
    pins.forEach((p) => {
      rows.push([
        p.pin_code, p.term, p.session,
        p.students?.full_name ?? 'Unclaimed',
        p.students?.admission_no ?? '—',
        `${p.usage_count}/${p.usage_limit}`,
        p.is_active ? 'Active' : 'Inactive',
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'pins.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-garamond text-2xl font-bold text-[#1a1a2e]">PIN Management</h1>
          <p className="text-gray-500 text-sm mt-1">{total} PIN{total !== 1 ? 's' : ''} total</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-md text-sm">
            📥 Export CSV
          </button>
          <button onClick={() => { setShowCreate(!showCreate); setCreateMsg(''); setNewPins([]); }}
            className="bg-[#4169E1] hover:bg-[#2c4fc9] text-white font-medium px-4 py-2 rounded-md text-sm flex items-center gap-2">
            <span>➕</span> Create PIN
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-5 max-w-lg">
          <div className="bg-[#4169E1] px-5 py-3">
            <h2 className="font-semibold text-white text-sm">Create New PIN(s)</h2>
          </div>
          <form onSubmit={handleCreate} className="px-5 py-4 space-y-3">
            {createMsg && (
              <div className={`p-3 rounded-md text-sm ${createMsg.startsWith('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {createMsg}
              </div>
            )}
            {newPins.length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">Generated PINs:</p>
                <div className="space-y-1">
                  {newPins.map((pin) => (
                    <div key={pin} className="font-mono-custom text-sm font-bold text-[#4169E1] bg-white border border-gray-200 rounded px-3 py-1.5 flex items-center justify-between">
                      <span>{pin}</span>
                      <button type="button" onClick={() => navigator.clipboard.writeText(pin)}
                        className="text-gray-400 hover:text-gray-600 text-xs ml-2">Copy</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Term *</label>
                <select value={createForm.term} onChange={(e) => setCreateForm({ ...createForm, term: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]" required>
                  <option value="">— Select —</option>
                  {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Session *</label>
                <select value={createForm.session} onChange={(e) => setCreateForm({ ...createForm, session: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]" required>
                  <option value="">— Select —</option>
                  {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usage Limit</label>
                <input type="number" min={1} max={50} value={createForm.usage_limit}
                  onChange={(e) => setCreateForm({ ...createForm, usage_limit: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4169E1]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity (max 100)</label>
                <input type="number" min={1} max={100} value={createForm.quantity}
                  onChange={(e) => setCreateForm({ ...createForm, quantity: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4169E1]" />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={creating}
                className="flex-1 bg-[#4169E1] hover:bg-[#2c4fc9] disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-md text-sm">
                {creating ? 'Creating...' : 'Generate PINs'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)}
                className="border border-gray-300 text-gray-700 font-medium px-4 py-2 rounded-md text-sm">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <span className="text-sm text-blue-700 font-medium">{selectedIds.size} selected</span>
          <button onClick={() => handleBulkToggle(true)} className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded-md">Activate</button>
          <button onClick={() => handleBulkToggle(false)} className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-medium px-3 py-1.5 rounded-md">Deactivate</button>
          <button onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 rounded-md">Delete Selected</button>
          <button onClick={() => setSelectedIds(new Set())} className="text-gray-500 text-xs hover:text-gray-700 ml-auto">Clear selection</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin w-6 h-6 text-[#4169E1]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : pins.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">🔑</p>
            <p className="text-sm">No PINs created yet</p>
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
                  {['PIN Code', 'Term', 'Session', 'Claimed By', 'Usage', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
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
                    <td className="px-4 py-3 font-mono-custom text-sm font-bold text-[#1a1a2e] tracking-wider">
                      {pin.pin_code}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{pin.term}</td>
                    <td className="px-4 py-3 text-gray-600">{pin.session}</td>
                    <td className="px-4 py-3">
                      {pin.students ? (
                        <div>
                          <p className="text-sm font-medium text-[#1a1a2e]">{pin.students.full_name}</p>
                          <p className="text-xs text-gray-400">{pin.students.admission_no}</p>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs italic">Unclaimed</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-1.5">
                          <div className="bg-[#4169E1] h-1.5 rounded-full"
                            style={{ width: `${(pin.usage_count / pin.usage_limit) * 100}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 font-mono-custom">
                          {pin.usage_count}/{pin.usage_limit}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        pin.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                      }`}>
                        {pin.is_active ? '● Active' : '● Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <button onClick={() => toggleActive(pin.id, pin.is_active)}
                          className={pin.is_active ? 'text-yellow-600 hover:underline' : 'text-green-600 hover:underline'}>
                          {pin.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => handleDelete(pin.id)} className="text-red-500 hover:underline">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-xs disabled:opacity-50">Previous</button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-xs disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
