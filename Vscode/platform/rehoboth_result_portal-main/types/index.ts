// ============================================================
// REHOBOTH COLLEGE RESULT PORTAL — Types
// ============================================================

export interface Student {
  id: string;
  admission_no: string;
  full_name: string;
  class: string;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export interface Result {
  id: string;
  student_id: string;
  term: string;
  session: string;
  pdf_path: string;
  is_published: boolean;
  publish_at: string | null;
  published_at: string | null;
  created_at: string;
}

export interface Pin {
  id: string;
  pin_code: string;
  usage_limit: number;
  usage_count: number;
  is_active: boolean;
  claimed_by_student_id: string | null;
  term: string;
  session: string;
  created_at: string;
}

export interface MasterPin {
  id: string;
  master_number: string;
  pin_code: string;
  label: string | null;
  usage_limit: number;
  usage_count: number;
  is_active: boolean;
  scope: 'all' | 'student';
  scoped_student_id: string | null;
  term: string | null;
  session: string | null;
  created_by_admin_id: string | null;
  created_at: string;
}

export interface MasterPinUsage {
  id: string;
  master_pin_id: string;
  accessed_student_id: string | null;
  term: string;
  session: string;
  used_at: string;
  ip_address: string | null;
}

export interface PinUsage {
  id: string;
  pin_id: string;
  student_id: string;
  used_at: string;
  ip_address: string | null;
}

export interface Transaction {
  id: string;
  reference: string;
  email: string;
  phone: string | null;
  admission_no: string;
  amount: number;
  status: 'pending' | 'success' | 'failed';
  pin_id: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface Admin {
  id: string;
  email: string;
  password_hash: string;
  role: 'super' | 'school';
  created_at: string;
}

// Session payloads
export interface ResultSessionPayload {
  student_id: string;
  result_id: string;
  iat: number;
  exp: number;
}

export interface MasterSessionPayload {
  master_pin_id: string;
  scope: 'all' | 'student';
  scoped_student_id: string | null;
  term: string;
  session: string;
  iat: number;
  exp: number;
}

export interface AdminSessionPayload {
  admin_id: string;
  email: string;
  role: 'super' | 'school'; // 'super' = full access, 'school' = no PIN management
  iat: number;
  exp: number;
}

// API responses
export type ApiError =
  | 'INVALID_CREDENTIALS'
  | 'PIN_INACTIVE'
  | 'PIN_LIMIT_EXCEEDED'
  | 'PIN_BELONGS_TO_ANOTHER_STUDENT'
  | 'NO_RESULT_FOUND'
  | 'RESULT_NOT_YET_PUBLISHED'
  | 'INVALID_MASTER_CREDENTIALS'
  | 'MASTER_PIN_INACTIVE'
  | 'MASTER_PIN_LIMIT_EXCEEDED'
  | 'MASTER_PIN_TERM_MISMATCH'
  | 'MASTER_PIN_SESSION_MISMATCH'
  | 'STUDENT_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMITED';

export interface ApiErrorResponse {
  error: ApiError;
  message?: string;
}

export interface VerifyResponse {
  student: Pick<Student, 'id' | 'admission_no' | 'full_name' | 'class'>;
  result: { term: string; session: string };
  signed_url: string;
  pin_usage_count: number;
  pin_usage_limit: number;
}

export interface MasterVerifyResponse {
  redirect: 'result' | 'browse';
  student?: Pick<Student, 'id' | 'admission_no' | 'full_name' | 'class'>;
  signed_url?: string;
  term?: string;
  session?: string;
}

export interface SignedUrlResponse {
  signed_url: string;
  expires_at: string;
}

// Admin-facing enriched types
export interface StudentWithResult extends Student {
  result?: {
    is_published: boolean;
    publish_at: string | null;
    pdf_path: string;
  };
}

export interface PinWithStudent extends Pin {
  student?: Pick<Student, 'admission_no' | 'full_name'> | null;
}

export interface MasterPinWithStudent extends MasterPin {
  scoped_student?: Pick<Student, 'admission_no' | 'full_name'> | null;
  last_used?: string | null;
}

export interface TransactionWithPin extends Transaction {
  pin?: Pick<Pin, 'pin_code'> | null;
}
