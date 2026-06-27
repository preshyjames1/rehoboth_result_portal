'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function AdminLoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        const data = await res.json();
        // school role → redirect to school-admin dashboard
        if (data.role === 'school') {
          router.push('/school-admin/dashboard');
        } else {
          router.push('/admin/dashboard');
        }
      } else {
        const data = await res.json();
        setError(data.error ?? 'Invalid credentials');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src="/logo.png" alt="Rehoboth College" width={72} height={72}
            className="mx-auto mb-3 rounded-full bg-white p-1" />
          <h1 className="font-garamond text-2xl font-bold text-white">Rehoboth College</h1>
          <p className="text-gray-400 text-sm mt-1">Admin Portal</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-xl overflow-hidden">
          <div className="bg-[#252545] px-6 py-4 border-b border-gray-700">
            <h2 className="font-semibold text-white text-base">Administrator Login</h2>
            <p className="text-gray-400 text-xs mt-0.5">Authorised personnel only</p>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="admin@rehobothcollege.edu.ng"
                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4169E1]"
                required autoFocus />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••••"
                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4169E1]"
                required />
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-[#4169E1] hover:bg-[#2c4fc9] disabled:bg-gray-400 text-white font-semibold py-3 rounded-md text-sm mt-2">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-500 mt-4">
          Rehoboth College — Secure Admin Portal
        </p>
      </div>
    </div>
  );
}
