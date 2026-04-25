// Thin wrapper around the Supabase JS client.
//
// Lina is account-backed: profile, progress, sessions, homework, plan and
// AI-provider settings (including the user's API key) all live in the
// user's Supabase row, gated by Row-Level Security. The user's data only
// flows between THEIR devices via THEIR account — never across users.
//
// If the env vars below are missing at build time the client is `null`
// and the rest of the code falls back to localStorage-only mode. That's
// only intended for local development / forks without a Supabase project;
// production builds should always be wired up so users have a real account.

import { createClient } from '@supabase/supabase-js'

const URL  = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

let client = null
if (URL && ANON && /^https?:\/\//.test(URL)) {
  client = createClient(URL, ANON, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true   // needed for magic-link redirects
    }
  })
}

/** Returns the Supabase client, or `null` if backend is not configured. */
export function getSupabase() { return client }

/** True iff the build is wired up to a Supabase project. */
export function isSupabaseConfigured() { return !!client }
