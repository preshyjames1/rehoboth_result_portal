'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/admin/students', label: 'Students', icon: '👥' },
  { href: '/admin/results', label: 'Upload Results', icon: '📄' },
  { href: '/admin/pins', label: 'PIN Management', icon: '🔑' },
  { href: '/admin/master-pins', label: 'Master PINs', icon: '🛡' },
  { href: '/admin/publish', label: 'Publish Schedule', icon: '📅' },
  { href: '/admin/transactions', label: 'Transactions', icon: '💳' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (pathname === '/admin') return <>{children}</>;

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch('/api/admin/login', { method: 'DELETE' });
    router.push('/admin');
  };

  return (
    <div className="min-h-screen flex bg-[#F5F5F5]">
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed md:static inset-y-0 left-0 z-30 w-60 bg-[#1a1a2e] text-white flex flex-col transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        {/* Logo */}
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Rehoboth College" width={38} height={38} className="rounded-full bg-white p-0.5 flex-shrink-0" />
            <div>
              <p className="font-garamond text-sm font-semibold text-white leading-tight">Rehoboth College</p>
              <p className="text-xs text-[#FFD700] leading-tight">Admin Portal</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${isActive ? 'bg-[#4169E1] text-white font-medium' : 'text-gray-300 hover:bg-white/10 hover:text-white'}`}>
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-white/10">
          <button onClick={handleLogout} disabled={loggingOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-gray-400 hover:text-white hover:bg-white/10 text-left">
            <span>🚪</span>
            <span>{loggingOut ? 'Logging out...' : 'Logout'}</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-500 hover:text-gray-700">☰</button>
          <p className="font-semibold text-[#1a1a2e] text-sm">Admin Portal</p>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
