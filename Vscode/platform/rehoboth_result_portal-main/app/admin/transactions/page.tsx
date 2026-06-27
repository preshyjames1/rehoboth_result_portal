'use client';

import { useState, useEffect, useCallback } from 'react';

interface Transaction {
  id: string;
  reference: string;
  email: string;
  phone: string | null;
  admission_no: string;
  amount: number;
  status: 'pending' | 'success' | 'failed';
  paid_at: string | null;
  created_at: string;
  pins: { pin_code: string } | null;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    failed: 'bg-red-100 text-red-600',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50', ...(statusFilter ? { status: statusFilter } : {}) });
      const res = await fetch(`/api/admin/transactions?${params}`);
      const data = await res.json();
      setTransactions(data.transactions ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const exportCSV = () => {
    const rows = [['Reference', 'Admission No', 'Email', 'Phone', 'Amount (₦)', 'Status', 'PIN', 'Date']];
    transactions.forEach((t) => {
      rows.push([
        t.reference, t.admission_no, t.email, t.phone ?? '—',
        String(t.amount / 100),
        t.status, t.pins?.pin_code ?? '—',
        t.paid_at ? new Date(t.paid_at).toLocaleString() : new Date(t.created_at).toLocaleString(),
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'transactions.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const totalRevenue = transactions
    .filter((t) => t.status === 'success')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-garamond text-2xl font-bold text-[#1a1a2e]">Transactions</h1>
          <p className="text-gray-500 text-sm mt-1">
            {total} transaction{total !== 1 ? 's' : ''} · Revenue shown: ₦{(totalRevenue / 100).toLocaleString()}
          </p>
        </div>
        <button onClick={exportCSV} className="border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-md text-sm">
          📥 Export CSV
        </button>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Filter by status:</label>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4169E1]"
        >
          <option value="">All</option>
          <option value="success">Success</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
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
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">💳</p>
            <p className="text-sm">No transactions found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Reference', 'Admission No', 'Email', 'Amount', 'Status', 'PIN', 'Date'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono-custom text-xs text-gray-600 max-w-[120px] truncate" title={t.reference}>
                      {t.reference}
                    </td>
                    <td className="px-4 py-3 font-mono-custom text-xs text-[#4169E1] font-medium">{t.admission_no}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-[160px] truncate" title={t.email}>{t.email}</td>
                    <td className="px-4 py-3 font-semibold text-[#1a1a2e]">₦{(t.amount / 100).toLocaleString()}</td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-3 font-mono-custom text-xs text-gray-500">
                      {t.pins?.pin_code ?? <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {t.paid_at
                        ? new Date(t.paid_at).toLocaleDateString('en-NG')
                        : new Date(t.created_at).toLocaleDateString('en-NG')}
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
