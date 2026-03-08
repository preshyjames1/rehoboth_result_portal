'use client';

/**
 * app/result/page.tsx
 *
 * Security fix:
 *   L-02 — The signed_url is no longer stored in or read from
 *           sessionStorage. Instead, the initial URL is fetched
 *           directly from /api/get-pdf-url on mount (same endpoint
 *           used for the existing 90-second refresh). This keeps
 *           the credential entirely server-side and out of browser
 *           storage where extensions could read it.
 *
 *   sessionStorage now holds only non-sensitive display data:
 *   id, admission_no, full_name, class, term, session,
 *   pin_usage_count, pin_usage_limit.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

interface StudentData {
  id:              string;
  admission_no:    string;
  full_name:       string;
  class:           string;
  term:            string;
  session:         string;
  pin_usage_count: number;
  pin_usage_limit: number;
  // signed_url intentionally removed — always fetched from /api/get-pdf-url
}

export default function ResultPage() {
  const router = useRouter();
  const [student, setStudent]   = useState<StudentData | null>(null);
  const [blobUrl, setBlobUrl]   = useState('');
  const [expired, setExpired]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const [pdfError, setPdfError] = useState(false);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const blobUrlRef      = useRef('');

  const loadPdfAsBlob = useCallback(async (url: string) => {
    setPdfError(false);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('fetch failed');
      const blob       = await res.blob();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      const newBlobUrl = URL.createObjectURL(blob);
      blobUrlRef.current = newBlobUrl;
      setBlobUrl(newBlobUrl);
    } catch {
      setPdfError(true);
    }
  }, []);

  /** Fetch a fresh signed URL from the server and reload the PDF blob */
  const refreshUrl = useCallback(async () => {
    try {
      const res = await fetch('/api/get-pdf-url', { cache: 'no-store' });
      if (res.status === 401) { setExpired(true); return; }
      if (res.ok) {
        const data = await res.json();
        await loadPdfAsBlob(data.signed_url);
      }
    } catch { /* expire naturally */ }
  }, [loadPdfAsBlob]);

  useEffect(() => {
    const stored = sessionStorage.getItem('result_student');
    if (!stored) { router.replace('/'); return; }

    let data: StudentData;
    try {
      data = JSON.parse(stored);
      setStudent(data);
    } catch {
      router.replace('/');
      return;
    }

    // L-02 FIX: fetch the first signed URL from the server rather than
    // reading it from sessionStorage (where it is no longer stored).
    refreshUrl().then(() => setLoading(false));

    // Refresh every 90 seconds (Supabase signed URLs live for 120s)
    refreshTimerRef.current = setInterval(refreshUrl, 90_000);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      if (blobUrlRef.current)      URL.revokeObjectURL(blobUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);   // run once on mount

  const handlePrint = async () => {
    try {
      const res      = await fetch('/api/get-pdf-url', { cache: 'no-store' });
      const freshUrl = res.ok ? (await res.json()).signed_url : null;
      const win      = window.open(freshUrl ?? blobUrl, '_blank');
      if (win) win.onload = () => { win.focus(); win.print(); };
    } catch {
      const win = window.open(blobUrl, '_blank');
      if (win) win.onload = () => { win.focus(); win.print(); };
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
        <div className="text-center">
          <svg className="animate-spin w-8 h-8 text-[#4169E1] mx-auto" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="mt-3 text-gray-500 text-sm">Loading your result...</p>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5] px-4">
        <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-sm w-full text-center">
          <span className="text-4xl">⏰</span>
          <h2 className="font-garamond text-xl font-semibold text-[#1a1a2e] mt-4">Session Expired</h2>
          <p className="text-gray-500 text-sm mt-2">Your result session has expired. Please re-enter your PIN to view again.</p>
          <button onClick={() => { sessionStorage.removeItem('result_student'); router.push('/'); }}
            className="mt-5 bg-[#4169E1] hover:bg-[#2c4fc9] text-white font-semibold px-6 py-2.5 rounded-md text-sm">
            Re-enter PIN
          </button>
        </div>
      </div>
    );
  }

  if (!student) return null;

  const usagePct  = (student.pin_usage_count / student.pin_usage_limit) * 100;
  const usagesLeft = student.pin_usage_limit - student.pin_usage_count;

  return (
    <>
      <style>{`
        @media print {
          .no-print  { display: none !important; }
          .print-only { display: block !important; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="min-h-screen flex flex-col bg-[#F5F5F5]">
        {/* Top nav */}
        <nav className="bg-[#1a1a2e] text-white no-print">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="Rehoboth College" width={34} height={34} className="rounded-full bg-white p-0.5" />
              <div>
                <p className="font-garamond font-semibold text-sm leading-none text-[#FFD700]">Rehoboth College</p>
                <p className="text-xs text-gray-400 leading-none mt-0.5">Official Result Portal</p>
              </div>
            </div>

            <div className="flex items-center gap-2 no-print">
              <button onClick={handlePrint}
                className="bg-[#FFD700] hover:bg-[#d4af00] text-[#1a1a2e] font-semibold px-4 py-2 rounded-md text-sm flex items-center gap-1.5">
                🖨 <span className="hidden sm:inline">Print Result</span>
              </button>
              <button onClick={() => { sessionStorage.removeItem('result_student'); router.push('/'); }}
                className="text-gray-300 hover:text-white text-xs px-3 py-2 border border-gray-600 rounded-md">
                Exit
              </button>
            </div>
            <div className="print-only text-xs text-gray-300">
              Printed: {new Date().toLocaleDateString('en-NG', { day: '2-digit', month: 'long', year: 'numeric' })}
            </div>
          </div>
        </nav>

        {/* Info strip */}
        <div className="bg-white border-b border-gray-200" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
          <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <span className="text-sm text-gray-500">Student: <span className="font-semibold text-[#1a1a2e]">{student.full_name}</span></span>
            <span className="text-gray-300 hidden sm:inline">|</span>
            <span className="text-sm text-gray-500">Adm No: <span className="font-mono font-semibold text-[#4169E1]">{student.admission_no}</span></span>
            <span className="text-gray-300 hidden sm:inline">|</span>
            <span className="text-sm text-gray-500">Class: <span className="font-semibold text-[#1a1a2e]">{student.class}</span></span>
            <span className="text-gray-300 hidden sm:inline">|</span>
            <span className="text-sm text-gray-500">{student.term} — <span className="font-semibold text-[#1a1a2e]">{student.session}</span></span>

            <div className="ml-auto flex items-center gap-2 no-print">
              <div className="text-right">
                <p className="text-xs text-gray-400 leading-none">PIN Usage</p>
                <p className="text-xs font-semibold text-[#1a1a2e] leading-none mt-0.5">
                  {student.pin_usage_count}/{student.pin_usage_limit} uses
                  {usagesLeft <= 1 && <span className="text-red-500 ml-1">({usagesLeft} left)</span>}
                </p>
              </div>
              <div className="w-12 bg-gray-200 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all ${usagePct >= 80 ? 'bg-red-500' : usagePct >= 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${usagePct}%` }} />
              </div>
            </div>

            <div className="print-only ml-auto text-xs text-gray-500">
              PIN used: {student.pin_usage_count}/{student.pin_usage_limit}
            </div>

            <span className="flex items-center gap-1 text-xs text-green-600 font-medium no-print">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>Secure
            </span>
          </div>
        </div>

        {/* PDF Viewer */}
        <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-4">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm"
            onContextMenu={(e) => e.preventDefault()}>
            {pdfError ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <span className="text-5xl mb-4">📄</span>
                <h3 className="font-semibold text-[#1a1a2e] mb-2">Result Ready</h3>
                <p className="text-gray-500 text-sm mb-5 max-w-xs">
                  Your result could not display inline on this browser. Use the Print button above to print directly.
                </p>
                <button onClick={handlePrint}
                  className="bg-[#4169E1] hover:bg-[#2c4fc9] text-white font-semibold px-6 py-3 rounded-md text-sm">
                  🖨 Print / Open Result
                </button>
              </div>
            ) : blobUrl ? (
              <iframe src={blobUrl} className="w-full border-none block"
                style={{ height: '82vh', minHeight: '500px' }} title="Your Result" />
            ) : (
              <div className="flex items-center justify-center h-64">
                <svg className="animate-spin w-6 h-6 text-[#4169E1]" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between no-print">
            <p className="text-xs text-gray-400">{usagesLeft} PIN use(s) remaining after this session.</p>
            <button onClick={handlePrint}
              className="bg-[#4169E1] hover:bg-[#2c4fc9] text-white font-semibold px-5 py-2 rounded-md text-sm flex items-center gap-2">
              🖨 Print Result
            </button>
          </div>
        </main>

        <footer className="bg-[#1a1a2e] text-gray-400 text-xs text-center py-3 mt-2 no-print">
          <p>© {new Date().getFullYear()} Rehoboth College. Official Result Portal.</p>
        </footer>
      </div>
    </>
  );
}
