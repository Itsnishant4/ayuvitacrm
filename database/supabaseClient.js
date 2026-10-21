const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env
dotenv.config();

const supabaseUrl = process.env.supabase_url || 'https://hffejglwnhaxzvwufvyx.supabase.co';
const supabaseAnonKey = process.env.anon || 'sb_publishable_zor8H6rSooIjyHhNXsh1bg_8j5gEOYg';

// Shared secret required by the token-gated RLS policy (see database/supabase-setup.sql).
// Clients without this header are denied even when they hold the publishable key.
// SECURITY: never hardcode this value — set it in .env (SUPABASE_RLS_SECRET).
const rlsSecret = process.env.SUPABASE_RLS_SECRET || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase URL or Anon key is missing in environment variables.");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
  global: {
    headers: rlsSecret ? { 'x-crm-secret': rlsSecret } : {},
  },
});

module.exports = { supabase };
