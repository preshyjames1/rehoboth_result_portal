import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type {
  ResultSessionPayload,
  MasterSessionPayload,
  AdminSessionPayload,
} from '@/types';

const secret = new TextEncoder().encode(process.env.SESSION_SECRET!);

// ── Result Session (5 min) ─────────────────────────────────────────────────

export async function setResultSession(payload: Omit<ResultSessionPayload, 'iat' | 'exp'>) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);

  const cookieStore = await cookies();
  cookieStore.set('result_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 5,
    path: '/',
  });
}

export async function getResultSession(): Promise<ResultSessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('result_session')?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as ResultSessionPayload;
  } catch {
    return null;
  }
}

export async function clearResultSession() {
  const cookieStore = await cookies();
  cookieStore.delete('result_session');
}

// ── Master Session (15 min) ────────────────────────────────────────────────

export async function setMasterSession(payload: Omit<MasterSessionPayload, 'iat' | 'exp'>) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret);

  const cookieStore = await cookies();
  cookieStore.set('master_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 15,
    path: '/',
  });
}

export async function getMasterSession(): Promise<MasterSessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('master_session')?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as MasterSessionPayload;
  } catch {
    return null;
  }
}

export async function clearMasterSession() {
  const cookieStore = await cookies();
  cookieStore.delete('master_session');
}

// ── Admin Session (30 min inactivity, 8 hr absolute max) ──────────────────

export async function setAdminSession(
  payload: Omit<AdminSessionPayload, 'exp' | 'iat'> & { iat?: number }
) {
  const builder = new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30m');

  // Preserve original login time so middleware can enforce 8-hour absolute max.
  // On first login, iat is undefined so jose sets it to now.
  // On every refresh, we pass the original iat so it never resets.
  if (payload.iat) {
    builder.setIssuedAt(payload.iat);
  } else {
    builder.setIssuedAt();
  }

  const token = await builder.sign(secret);

  const cookieStore = await cookies();
  cookieStore.set('admin_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 30, // 30 minutes
    path: '/',
  });
}

export async function getAdminSession(): Promise<AdminSessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_session')?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as AdminSessionPayload;
  } catch {
    return null;
  }
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete('admin_session');
}

// ── Verify token (middleware-safe, takes raw token string) ─────────────────

export async function verifyToken<T>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as T;
  } catch {
    return null;
  }
}