import { createClient } from '@supabase/supabase-js';

// Client-side Supabase client — uses anon key only
// All real data operations happen server-side via API routes
let client: ReturnType<typeof createClient> | null = null;

export function createSupabaseClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

  if (!url || !anonKey) {
    throw new Error('Missing Supabase client environment variables');
  }

  client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return client;
}
