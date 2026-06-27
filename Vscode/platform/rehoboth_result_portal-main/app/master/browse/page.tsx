'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface Student {
  id: string;
  admission_no: string;
  full_name: string;
  class: string;
  result?: {
    is_published: boolean;
    pdf_path: string;
  };
}

interface PageState {
  students: Student[];
  total: number;
  loading: boolean;
}

function MasterBrowseContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const term = searchParams.get('term') ?? '';
  const session = searchParams.get('session') ?? '';

  const [state, setState] = useState<PageState>({ students: [], total: 0, loading: true });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [usageRemaining, setUsageRemaining] = useState<number | null>(null);
  const [sessionExpiry, setSessionExpiry] = useState<number>(15 * 60); // 15 min in seconds

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStudent, setModalStudent] = useState<Student | null>(null);
  const [modalPdfUrl, setModalPdfUrl] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionExpiry((prev) => {
        if (prev <= 0) {
          router.replace('/master');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [router]);

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const fetchStudents = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        ...(search ? { search } : {}),
      });
      const res = await fetch(`/api/admin/students?${params}`);
      if (res.status === 401) {
        router.replace('/master');
        return;
      }
      const data = await res.json();
      setState({ students: data.students ?? [], total: data.total ?? 0, loading: false });
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [page, search, router]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleViewResult = async (student: Student) => {
    setModalStudent(student);
    setModalOpen(true);
    setModalLoading(true);
    setModalError('');
    setModalPdfUrl('');

    try {
      const res = await fetch('/api/master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-result', admission_no: student.admission_no }),
      });

      const data = await res.json();

      if (!res.ok) {
        setModalError(
          data.error === 'NO_RESULT_FOUND'
            ? 'No result uploaded for this student.'
            : `Error: ${data.error}`
        );
        return;
      }

      setModalPdfUrl(data.signed_url);
    } catch {
      setModalError('Failed to load result. Please try again.');
    } finally {
      setModalLoading(false);
    }
  };

  const totalPages = Math.ceil(state.total / 20);

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
      {/* Header */}
      <div className="bg-[#1a1a2e] text-white">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#FFD700] flex items-center justify-center font-bold text-[#1a1a2e] text-xs">
                RC
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Admin Result Viewer</p>
                <p className="font-garamond text-base font-semibold text-white">
                  {term} — {session}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <div className="bg-[#252545] px-3 py-1.5 rounded-md text-xs">
                <span className="text-gray-400">Session expires: </span>
                <span className={`font-mono font-bold ${sessionExpiry < 120 ? 'text-red-400' : 'text-[#FFD700]'}`}>
                  {formatCountdown(sessionExpiry)}
                </span>
              </div>
              <button
                onClick={() => router.replace('/master')}
                className="text-gray-400 hover:text-white text-xs border border-gray-600 px-3 py-1.5 rounded-md"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {/* Search bar */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <form onSubmit={handleSearchSubmit} className="flex gap-3">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, admission number, or class..."
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4169E1]"
            />
            <button
              type="submit"
              className="bg-[#4169E1] hover:bg-[#2c4fc9] text-white font-medium px-5 py-2 rounded-md text-sm"
            >
              Search
            </button>
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
                className="border border-gray-300 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-md text-sm"
              >
                Clear
              </button>
            )}
          </form>
        </div>

        {/* Students table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-[#1a1a2e] text-sm">
              Students {search && `— Searching: "${search}"`}
            </h2>
            <span className="text-xs text-gray-400">{state.total} student{state.total !== 1 ? 's' : ''}</span>
          </div>

          {state.loading ? (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin w-6 h-6 text-[#4169E1]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : state.students.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">👤</p>
              <p className="text-sm">No students found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Admission No', 'Full Name', 'Class', 'Action'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {state.students.map((student) => (
                    <tr key={student.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono-custom text-xs font-medium text-[#4169E1]">
                        {student.admission_no}
                      </td>
                      <td className="px-4 py-3 font-garamond text-base text-[#1a1a2e]">
                        {student.full_name}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-sm">{student.class}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleViewResult(student)}
                          className="bg-[#4169E1] hover:bg-[#2c4fc9] text-white text-xs font-medium px-3 py-1.5 rounded-md"
                        >
                          View Result
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-xs disabled:opacity-50 hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-xs disabled:opacity-50 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Result Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal header */}
            <div className="bg-[#1a1a2e] text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Result Preview</p>
                <p className="font-garamond text-base font-semibold text-white mt-0.5">
                  {modalStudent?.full_name} — {modalStudent?.admission_no}
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            {/* Modal content */}
            <div className="flex-1 overflow-auto">
              {modalLoading ? (
                <div className="flex items-center justify-center h-64">
                  <svg className="animate-spin w-8 h-8 text-[#4169E1]" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : modalError ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <p className="text-3xl mb-3">📄</p>
                    <p className="text-red-500 font-medium text-sm">{modalError}</p>
                  </div>
                </div>
              ) : (
                <iframe
                  src={`${modalPdfUrl}#toolbar=0&navpanes=0`}
                  className="w-full border-none"
                  style={{ height: '70vh' }}
                  title="Result PDF"
                />
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setModalOpen(false)}
                className="border border-gray-300 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-md text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="text-center py-3 text-xs text-gray-400">
        Rehoboth College — Admin Result Viewer
      </footer>
    </div>
  );
}

export default function MasterBrowsePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    }>
      <MasterBrowseContent />
    </Suspense>
  );
}
