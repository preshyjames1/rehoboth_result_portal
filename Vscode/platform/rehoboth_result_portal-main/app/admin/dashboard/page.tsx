'use client';

import { useEffect, useState } from 'react';

interface Stats {
  total_students: number;
  total_pins: number;
  pins_used_today: number;
  revenue_this_month: number;
  results_pending_publish: number;
  results_scheduled: number;
  active_master_pins: number;
}

function StatCard({ title, value, icon, color }: {
  title: string;
  value: string | number;
  icon: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [studentsRes, pinsRes, transactionsRes, resultsRes, masterPinsRes] = await Promise.all([
          fetch('/api/admin/students?limit=1'),
          fetch('/api/admin/pins?limit=1'),
          fetch('/api/admin/transactions'),
          fetch('/api/admin/results'),
          fetch('/api/admin/master-pins'),
        ]);

        const [studentsData, pinsData, transactionsData, resultsData, masterPinsData] =
          await Promise.all([
            studentsRes.json(),
            pinsRes.json(),
            transactionsRes.json(),
            resultsRes.json(),
            masterPinsRes.json(),
          ]);

        // Calculate stats
        const today = new Date().toDateString();
        const pinsUsedToday = (pinsData.pins ?? []).filter((p: { usage_count: number; created_at: string }) => {
          return p.usage_count > 0 && new Date(p.created_at).toDateString() === today;
        }).length;

        const thisMonthStart = new Date();
        thisMonthStart.setDate(1);
        thisMonthStart.setHours(0, 0, 0, 0);

        const revenueThisMonth = (transactionsData.transactions ?? [])
          .filter((t: { status: string; paid_at: string }) => {
            return t.status === 'success' && t.paid_at && new Date(t.paid_at) >= thisMonthStart;
          })
          .reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);

        const results = resultsData.results ?? [];
        const pendingPublish = results.filter((r: { is_published: boolean; publish_at: string | null }) =>
          !r.is_published && !r.publish_at
        ).length;
        const scheduled = results.filter((r: { is_published: boolean; publish_at: string | null }) =>
          !r.is_published && r.publish_at
        ).length;

        const activeMasterPins = (masterPinsData.master_pins ?? []).filter(
          (mp: { is_active: boolean }) => mp.is_active
        ).length;

        setStats({
          total_students: studentsData.total ?? 0,
          total_pins: pinsData.total ?? 0,
          pins_used_today: pinsUsedToday,
          revenue_this_month: revenueThisMonth / 100,
          results_pending_publish: pendingPublish,
          results_scheduled: scheduled,
          active_master_pins: activeMasterPins,
        });
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-garamond text-2xl font-bold text-[#1a1a2e]">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Overview of the result portal</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-3"></div>
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <StatCard title="Total Students" value={stats.total_students} icon="👥" color="text-[#1a1a2e]" />
          <StatCard title="Total PINs" value={stats.total_pins} icon="🔑" color="text-[#4169E1]" />
          <StatCard title="PINs Used Today" value={stats.pins_used_today} icon="📊" color="text-green-600" />
          <StatCard
            title="Revenue This Month"
            value={`₦${stats.revenue_this_month.toLocaleString()}`}
            icon="💰"
            color="text-green-600"
          />
          <StatCard title="Pending Publish" value={stats.results_pending_publish} icon="⏳" color="text-yellow-600" />
          <StatCard title="Scheduled Results" value={stats.results_scheduled} icon="📅" color="text-blue-600" />
          <StatCard title="Active Master PINs" value={stats.active_master_pins} icon="🛡" color="text-purple-600" />
        </div>
      ) : (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-700 text-sm">
          Failed to load dashboard statistics.
        </div>
      )}

      {/* Quick actions */}
      <div className="mt-8 bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="font-semibold text-[#1a1a2e] text-base mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { href: '/admin/students', label: 'Add Student', icon: '➕' },
            { href: '/admin/results', label: 'Upload Result', icon: '📤' },
            { href: '/admin/pins', label: 'Create PIN', icon: '🔑' },
            { href: '/admin/publish', label: 'Publish Results', icon: '✅' },
          ].map((action) => (
            <a
              key={action.href}
              href={action.href}
              className="flex items-center gap-2 p-3 border border-gray-200 rounded-md hover:bg-gray-50 text-sm font-medium text-gray-700"
            >
              <span>{action.icon}</span>
              <span>{action.label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
