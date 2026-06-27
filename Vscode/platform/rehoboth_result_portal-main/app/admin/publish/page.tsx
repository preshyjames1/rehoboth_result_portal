'use client';

import { useState, useEffect, useCallback } from 'react';

interface ScheduledResult {
  id: string;
  term: string;
  session: string;
  is_published: boolean;
  publish_at: string | null;
  published_at: string | null;
  created_at: string;
  students: { admission_no: string; full_name: string; class: string } | null;
}

function StatusBadge({ result }: { result: ScheduledResult }) {
  if (result.is_published) {
    return <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">✅ Published</span>;
  }
  if (result.publish_at) {
    const isPast = new Date(result.publish_at) <= new Date();
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isPast ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
        {isPast ? '⏰ Due' : '📅 Scheduled'}
      </span>
    );
  }
  return <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">⏳ Draft</span>;
}

export default function AdminPublishPage() {
  const [results, setResults] = useState<ScheduledResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState('');

  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/publish');
      const data = await res.json();
      setResults(data.results ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  const handlePublishDue = async () => {
    setPublishing(true);
    setPublishMsg('');
    try {
      const res = await fetch('/api/admin/publish', { method: 'POST' });
      const data = await res.json();
      setPublishMsg(`✅ Published ${data.published_count} result${data.published_count !== 1 ? 's' : ''}`);
      fetchResults();
    } catch {
      setPublishMsg('❌ Failed to publish. Please try again.');
    } finally {
      setPublishing(false);
    }
  };

  const handleAction = async (id: string, action: string, publish_at?: string) => {
    await fetch('/api/admin/results', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, publish_at }),
    });
    fetchResults();
  };

  const dueCount = results.filter(
    (r) => !r.is_published && r.publish_at && new Date(r.publish_at) <= new Date()
  ).length;

  const scheduledCount = results.filter(
    (r) => !r.is_published && r.publish_at && new Date(r.publish_at) > new Date()
  ).length;

  const draftCount = results.filter((r) => !r.is_published && !r.publish_at).length;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-garamond text-2xl font-bold text-[#1a1a2e]">Publish Schedule</h1>
          <p className="text-gray-500 text-sm mt-1">Manage when students can access their results</p>
        </div>
        <button
          onClick={handlePublishDue}
          disabled={publishing || dueCount === 0}
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium px-4 py-2 rounded-md text-sm flex items-center gap-2"
        >
          {publishing ? 'Publishing...' : `✅ Publish All Due Now (${dueCount})`}
        </button>
      </div>

      {publishMsg && (
        <div className={`mb-4 p-3 rounded-md text-sm ${publishMsg.startsWith('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {publishMsg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Due for Publishing', value: dueCount, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
          { label: 'Scheduled (future)', value: scheduledCount, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
          { label: 'Draft (no schedule)', value: draftCount, color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200' },
        ].map((stat) => (
          <div key={stat.label} className={`rounded-lg border p-4 ${stat.bg}`}>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{stat.label}</p>
            <p className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Info about cron */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5 flex gap-3">
        <span className="text-blue-500 text-base mt-0.5">ℹ️</span>
        <div className="text-sm text-blue-800">
          <p className="font-semibold">Automatic Publishing</p>
          <p className="text-blue-700 mt-0.5">
            A background cron job runs every minute and automatically publishes scheduled results
            when their scheduled time arrives. You can also use the "Publish All Due Now" button
            to manually trigger publishing.
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
        ) : results.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">📅</p>
            <p className="text-sm">No unpublished results</p>
            <p className="text-xs mt-1">All results are currently published</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Student', 'Admission No', 'Class', 'Term', 'Session', 'Status', 'Scheduled For', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-[#1a1a2e]">{r.students?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 font-mono-custom text-xs text-[#4169E1]">{r.students?.admission_no ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.students?.class ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.term}</td>
                    <td className="px-4 py-3 text-gray-600">{r.session}</td>
                    <td className="px-4 py-3"><StatusBadge result={r} /></td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {r.publish_at
                        ? new Date(r.publish_at).toLocaleString('en-NG', { dateStyle: 'short', timeStyle: 'short' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        {!r.is_published && (
                          <button onClick={() => handleAction(r.id, 'publish')} className="text-green-600 hover:underline">
                            Publish Now
                          </button>
                        )}
                        {!r.is_published && !r.publish_at && (
                          <button onClick={() => {
                            const dt = prompt('Schedule publish at (YYYY-MM-DDTHH:MM):');
                            if (dt) handleAction(r.id, 'schedule', dt);
                          }} className="text-blue-500 hover:underline">
                            Schedule
                          </button>
                        )}
                        {r.publish_at && !r.is_published && (
                          <button onClick={() => handleAction(r.id, 'unpublish')} className="text-red-400 hover:underline">
                            Cancel
                          </button>
                        )}
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
  );
}
