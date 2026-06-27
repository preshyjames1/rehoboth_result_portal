/**
 * Setup Admin Script
 * Usage: npm run setup-admin
 *
 * This script generates a bcrypt hash of your admin password
 * and inserts the first admin into the database.
 *
 * Run once after deploying and setting env variables.
 */

import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing environment variables. Set in .env.local:');
  console.error('  ADMIN_EMAIL, ADMIN_PASSWORD (plain text for hashing),');
  console.error('  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY');
  process.exit(1);
}

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD!, 12);
  console.log('\n✅ Generated password hash:');
  console.log(passwordHash);
  console.log('\nAdd this to your .env.local as ADMIN_PASSWORD_HASH\n');

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

  const { data, error } = await supabase
    .from('admins')
    .upsert({ email: ADMIN_EMAIL!, password_hash: passwordHash }, { onConflict: 'email' })
    .select()
    .single();

  if (error) {
    console.error('❌ Failed to create admin:', error.message);
    process.exit(1);
  }

  console.log(`✅ Admin created/updated: ${data.email}`);
  console.log('   You can now log in at /admin');
}

main().catch(console.error);
