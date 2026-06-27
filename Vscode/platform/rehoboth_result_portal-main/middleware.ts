/**
 * middleware.ts
 *
 * Security fix:
 *   H-03 — /school-admin/pins was missing from both isSchoolAdminPage
 *           and the matcher config, meaning the page was served to
 *           unauthenticated users. Added to both locations.
 */
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import type { MasterSessionPayload, AdminSessionPayload } from '@/types';

const secret = new TextEncoder().encode(process.env.SESSION_SECRET!);

async function verifyJwt<T>(token: string | undefined): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as T;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cookies = request.cookies;

  // ── /result → requires result_session OR master_session (scope=student) ──
  if (pathname.startsWith('/result')) {
    const resultToken = cookies.get('result_session')?.value;
    const masterToken = cookies.get('master_session')?.value;

    const resultSession = await verifyJwt(resultToken);
    if (resultSession) return NextResponse.next();

    const masterSession = await verifyJwt<MasterSessionPayload>(masterToken);
    if (masterSession && masterSession.scope === 'student') return NextResponse.next();

    return NextResponse.redirect(new URL('/', request.url));
  }

  // ── /master/browse → requires master_session (scope=all) ─────────────────
  if (pathname.startsWith('/master/browse')) {
    const masterToken   = cookies.get('master_session')?.value;
    const masterSession = await verifyJwt<MasterSessionPayload>(masterToken);
    if (masterSession && masterSession.scope === 'all') return NextResponse.next();
    return NextResponse.redirect(new URL('/master', request.url));
  }

  // ── /admin/* (super admin only) ───────────────────────────────────────────
  const isAdminPage =
    pathname.startsWith('/admin/dashboard')     ||
    pathname.startsWith('/admin/students')      ||
    pathname.startsWith('/admin/results')       ||
    pathname.startsWith('/admin/pins')          ||
    pathname.startsWith('/admin/master-pins')   ||
    pathname.startsWith('/admin/transactions')  ||
    pathname.startsWith('/admin/publish');

  if (isAdminPage) {
    const adminToken   = cookies.get('admin_session')?.value;
    const adminSession = await verifyJwt<AdminSessionPayload>(adminToken);

    if (!adminSession) return NextResponse.redirect(new URL('/admin', request.url));

    if (adminSession.role === 'school') {
      return NextResponse.redirect(new URL('/school-admin/dashboard', request.url));
    }

    // ── Absolute max: 8 hours from original login ──────────────────
    // iat is in seconds (JWT standard), Date.now() is milliseconds
    const loginTime = adminSession.iat * 1000;
    const eightHours = 8 * 60 * 60 * 1000;
    if (Date.now() - loginTime > eightHours) {
      const response = NextResponse.redirect(new URL('/admin', request.url));
      response.cookies.delete('admin_session');
      return response;
    }

    // ── Sliding inactivity: refresh 30-min window on every visit ───
    const { setAdminSession } = await import('@/lib/session');
    await setAdminSession({
      admin_id: adminSession.admin_id,
      email: adminSession.email,
      role: adminSession.role,
      iat: adminSession.iat, // preserve original login time
    });

    return NextResponse.next();
  }

  // ── /school-admin/* → requires admin_session (any role) ──────────────────
  const isSchoolAdminPage =
    pathname.startsWith('/school-admin/dashboard')    ||
    pathname.startsWith('/school-admin/students')     ||
    pathname.startsWith('/school-admin/results')      ||
    pathname.startsWith('/school-admin/pins')         ||  // ← H-03 FIX: was missing
    pathname.startsWith('/school-admin/master-pins')  ||
    pathname.startsWith('/school-admin/transactions') ||
    pathname.startsWith('/school-admin/publish');

 if (isSchoolAdminPage) {
    const adminToken   = cookies.get('admin_session')?.value;
    const adminSession = await verifyJwt<AdminSessionPayload>(adminToken);

    if (!adminSession) return NextResponse.redirect(new URL('/school-admin', request.url));

    // ── Absolute max: 8 hours from original login ──────────────────
    const loginTime = adminSession.iat * 1000;
    const eightHours = 8 * 60 * 60 * 1000;
    if (Date.now() - loginTime > eightHours) {
      const response = NextResponse.redirect(new URL('/school-admin', request.url));
      response.cookies.delete('admin_session');
      return response;
    }

    // ── Sliding inactivity: refresh 30-min window on every visit ───
    const { setAdminSession } = await import('@/lib/session');
    await setAdminSession({
      admin_id: adminSession.admin_id,
      email: adminSession.email,
      role: adminSession.role,
      iat: adminSession.iat,
    });

    return NextResponse.next();
  }
 return NextResponse.next(); // fallback for any unmatched routes
}                             // ← THIS was missing — closes the middleware() function

export const config = {
  matcher: [
    '/result/:path*',
    '/master/browse/:path*',
    '/admin/dashboard/:path*',
    '/admin/students/:path*',
    '/admin/results/:path*',
    '/admin/pins/:path*',
    '/admin/master-pins/:path*',
    '/admin/transactions/:path*',
    '/admin/publish/:path*',
    '/school-admin/dashboard/:path*',
    '/school-admin/students/:path*',
    '/school-admin/results/:path*',
    '/school-admin/pins/:path*',          // ← H-03 FIX: was missing
    '/school-admin/master-pins/:path*',
    '/school-admin/transactions/:path*',
    '/school-admin/publish/:path*',
  ],
};