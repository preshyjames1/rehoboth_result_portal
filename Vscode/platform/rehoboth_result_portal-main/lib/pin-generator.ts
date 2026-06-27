import { randomBytes } from 'crypto';

// Chars chosen to avoid visually confusing pairs: O/0, I/1
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate a 16-character alphanumeric PIN (no dashes).
 * Stored in DB without dashes. Use formatPin() for display.
 * e.g. "ABCD2345EFGH6789"
 */
export function generatePin(): string {
  const bytes = randomBytes(16);
  let pin = '';
  for (let i = 0; i < 16; i++) {
    pin += CHARS[bytes[i] % CHARS.length];
  }
  return pin;
}

/**
 * Format a raw 16-char PIN for display: XXXX-XXXX-XXXX-XXXX
 * Also handles legacy 12-char PINs: XXXX-XXXX-XXXX
 */
export function formatPin(raw: string): string {
  // Strip any existing dashes first
  const clean = raw.replace(/-/g, '');
  if (clean.length === 16) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}`;
  }
  if (clean.length === 12) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}`;
  }
  return raw; // Unknown format — return as-is
}

/**
 * Normalize PIN input from a user: strip all dashes, spaces, and lowercase.
 * The DB stores PINs without dashes, so this is used before DB lookup.
 */
export function normalizePin(input: string): string {
  return input.replace(/[-\s]/g, '').toUpperCase().trim();
}

/**
 * Generate a master access number: MASTER-XXXX
 */
export function generateMasterNumber(): string {
  const bytes = randomBytes(4);
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += CHARS[bytes[i] % CHARS.length];
  }
  return `MASTER-${suffix}`;
}

/**
 * Mask a PIN for display — shows only last 4 chars.
 * Works for both 16-char and legacy 12-char PINs.
 * e.g., "ABCD2345EFGH6789" → "XXXX-XXXX-XXXX-6789"
 */
export function maskPin(pin: string): string {
  const clean = pin.replace(/-/g, '');
  const visible = clean.slice(-4);
  const masked = clean.slice(0, -4).replace(/./g, 'X');
  return formatPin(masked + visible);
}
