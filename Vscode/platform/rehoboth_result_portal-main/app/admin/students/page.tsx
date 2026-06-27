'use client';

import { useState, useEffect, useCallback } from 'react';

interface Student {
  id: string;
  admission_no: string;
  full_name: string;
  class: string;
  email: string | null;
  phone: string | null;
  created_at: string;
}

const BLANK_FORM = { admission_no: '', full_name: '', class: '', email: '', phone: '' };

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // CSV import
  const [importLoading, setImportLoading] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20', ...(search ? { search } : {}) });
      const res = await fetch(`/api/admin/students?${params}`);
      const data = await res.json();
      setStudents(data.students ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const openAdd = () => {
    setEditingStudent(null);
    setForm(BLANK_FORM);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (student: Student) => {
    setEditingStudent(student);
    setForm({
      admission_no: student.admission_no,
      full_name: student.full_name,
      class: student.class,
      email: student.email ?? '',
      phone: student.phone ?? '',
    });
    setError('');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const method = editingStudent ? 'PATCH' : 'POST';
      const body = editingStudent
        ? { id: editingStudent.id, ...form }
        : form;

      const res = await fetch('/api/admin/students', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to save student');
        return;
      }

      setModalOpen(false);
      fetchStudents();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    await fetch(`/api/admin/students?id=${id}`, { method: 'DELETE' });
    fetchStudents();
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    setImportMsg('');

    const formData = new FormData();
    formData.append('csv', file);

    try {
      const res = await fetch('/api/admin/students', {
        method: 'POST',
        body: formData,
        headers: { 'content-type': 'text/csv' },
      });
      const data = await res.json();

      if (res.ok) {
        setImportMsg(`✅ Successfully imported ${data.imported} students`);
        fetchStudents();
      } else {
        setImportMsg(`❌ Import failed: ${data.error}`);
      }
    } catch {
      setImportMsg('❌ Import failed: Network error');
    } finally {
      setImportLoading(false);
      e.target.value = '';
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.size) return;
    if (!confirm(`Delete ${selectedIds.size} student${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    const ids = Array.from(selectedIds).join(',');
    await fetch(`/api/admin/students?ids=${ids}`, { method: 'DELETE' });
    setSelectedIds(new Set());
    fetchStudents();
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-garamond text-2xl font-bold text-[#1a1a2e]">Students</h1>
          <p className="text-gray-500 text-sm mt-1">{total} student{total !== 1 ? 's' : ''} registered</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* CSV Import */}
          <label className="border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-md text-sm cursor-pointer flex items-center gap-2">
            {importLoading ? (
              <span>Importing...</span>
            ) : (
              <>
                <span>📥</span>
                <span>Import CSV</span>
              </>
            )}
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleCsvImport}
              disabled={importLoading}
            />
          </label>
          <button
            onClick={openAdd}
            className="bg-[#4169E1] hover:bg-[#2c4fc9] text-white font-medium px-4 py-2 rounded-md text-sm flex items-center gap-2"
          >
            <span>➕</span>
            Add Student
          </button>
        </div>
      </div>

      {importMsg && (
        <div className={`mb-4 p-3 rounded-md text-sm ${importMsg.startsWith('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {importMsg}
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <form
          onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); setPage(1); }}
          className="flex gap-3"
        >
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, admission number, or class..."
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4169E1]"
          />
          <button type="submit" className="bg-[#4169E1] text-white font-medium px-4 py-2 rounded-md text-sm">
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
              className="border border-gray-300 text-gray-600 px-4 py-2 rounded-md text-sm"
            >
              Clear
            </button>
          )}
        </form>
        <p className="text-xs text-gray-400 mt-2">
          CSV format: <code className="bg-gray-100 px-1 rounded">admission_no, full_name, class, email, phone</code>
        </p>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <span className="text-sm text-blue-700 font-medium">{selectedIds.size} selected</span>
          <button onClick={handleBulkDelete}
            className="bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 rounded-md">
            Delete Selected
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-gray-500 text-xs hover:text-gray-700 ml-auto">
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <svg className="animate-spin w-6 h-6 text-[#4169E1] mx-auto" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">👥</p>
            <p className="text-sm">No students found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox" className="rounded"
                      checked={selectedIds.size === students.length && students.length > 0}
                      onChange={(e) => setSelectedIds(e.target.checked ? new Set(students.map(s => s.id)) : new Set())} />
                  </th>
                  {['Admission No', 'Full Name', 'Class', 'Email', 'Phone', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input type="checkbox" className="rounded" checked={selectedIds.has(student.id)}
                        onChange={() => { const n = new Set(selectedIds); n.has(student.id) ? n.delete(student.id) : n.add(student.id); setSelectedIds(n); }} />
                    </td>
                    <td className="px-4 py-3 font-mono-custom text-xs font-medium text-[#4169E1]">
                      {student.admission_no}
                    </td>
                    <td className="px-4 py-3 font-medium text-[#1a1a2e]">{student.full_name}</td>
                    <td className="px-4 py-3 text-gray-600">{student.class}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{student.email ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{student.phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(student)}
                          className="text-[#4169E1] hover:underline text-xs font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(student.id, student.full_name)}
                          className="text-red-500 hover:underline text-xs font-medium"
                        >
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
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-xs disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-xs disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-[#4169E1] px-5 py-4">
              <h2 className="font-semibold text-white text-base">
                {editingStudent ? 'Edit Student' : 'Add New Student'}
              </h2>
            </div>
            <form onSubmit={handleSave} className="px-5 py-5 space-y-3">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}
              {[
                { name: 'admission_no', label: 'Admission Number', required: true, disabled: !!editingStudent },
                { name: 'full_name', label: 'Full Name', required: true },
                { name: 'class', label: 'Class', required: true },
                { name: 'email', label: 'Email Address', required: false },
                { name: 'phone', label: 'Phone Number', required: false },
              ].map((field) => (
                <div key={field.name}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    value={form[field.name as keyof typeof form]}
                    onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4169E1] disabled:bg-gray-100 disabled:text-gray-500"
                    required={field.required}
                    disabled={field.disabled}
                  />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-[#4169E1] hover:bg-[#2c4fc9] disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-md text-sm"
                >
                  {saving ? 'Saving...' : (editingStudent ? 'Save Changes' : 'Add Student')}
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-md text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
