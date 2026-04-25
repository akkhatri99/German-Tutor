// Auth + cross-device sync layer.
//
// Architecture:
//   - localStorage is the runtime source of truth (UI reads from it).
//   - When a user is signed in to Supabase, every storage write fires a
//     fire-and-forget push() to the backend. Network failures don't break
//     the UI — the local copy is still authoritative until the next pull.
//   - On sign-in / app boot, we pull() from Supabase, merge with local,
//     and write the merged state back to localStorage so reads pick it up.
//
// Conflict resolution:
//   - Profile / progress / homework / plan: last-write-wins by `updated_at`,
//     with a per-field union for vocab + grammar + history (additive sets).
//   - Sessions: deduped by `client_id` (the original startedAt ISO).
//
// Why this design: the rest of the app stays synchronous and offline-friendly.
// We don't need React Query / a state library — storage.js stays the same shape.

import { getSupabase, isSupabaseConfigured } from './supabase.js'

// ---------- Auth state ----------

let currentUser = null
const listeners = new Set()

export function onAuthChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function emitAuth() { for (const fn of listeners) try { fn(currentUser) } catch {} }

export function getCurrentUser() { return currentUser }

export async function initAuth() {
  const sb = getSupabase()
  if (!sb) return null
  const { data } = await sb.auth.getSession()
  currentUser = data?.session?.user || null
  sb.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null
    emitAuth()
  })
  return currentUser
}

export async function signInWithEmail(email) {
  const sb = getSupabase()
  if (!sb) throw new Error('Backend not configured')
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin }
  })
  if (error) throw error
}

// OAuth sign-in via Supabase. The provider must be enabled and configured
// in the Supabase dashboard (Authentication → Providers); otherwise the
// redirect will hit a "provider not enabled" error page from Supabase.
//
// The browser is navigated away to the provider's consent screen and
// comes back to `redirectTo`, where Supabase's detectSessionInUrl picks
// up the token and fires SIGNED_IN — same code path as magic-link.
export async function signInWithProvider(provider) {
  const sb = getSupabase()
  if (!sb) throw new Error('Backend not configured')
  const { error } = await sb.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin }
  })
  if (error) throw error
}

export async function signOut() {
  const sb = getSupabase()
  if (!sb) return
  await sb.auth.signOut()
  currentUser = null
  emitAuth()
}

export function syncEnabled() {
  return isSupabaseConfigured() && !!currentUser
}

// ---------- Helpers (local <-> snake_case) ----------

const LS = {
  profile: 'gt_profile',
  progress: 'gt_progress',
  sessions: 'gt_sessions',
  homework: 'gt_homework',
  plan: 'gt_plan',
  settings: 'gt_settings'
}

function readLS(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback } catch { return fallback }
}
function writeLS(key, val) { localStorage.setItem(key, JSON.stringify(val)) }

// Merge two arrays of {de}-keyed objects, picking the higher strength.
function mergeVocab(a = [], b = []) {
  const map = new Map()
  for (const v of [...a, ...b]) {
    if (!v?.de) continue
    const k = v.de.toLowerCase()
    const prev = map.get(k)
    if (!prev || (v.strength || 1) > (prev.strength || 1)) map.set(k, v)
  }
  return Array.from(map.values())
}
function mergeGrammar(a = [], b = []) {
  const map = new Map()
  for (const t of [...a, ...b]) {
    if (!t?.topic) continue
    const k = t.topic.toLowerCase()
    const prev = map.get(k)
    if (!prev || (t.mastery || 1) > (prev.mastery || 1)) map.set(k, t)
  }
  return Array.from(map.values())
}
function mergeHomeworkHistory(a = [], b = []) {
  const seen = new Set()
  const out = []
  for (const h of [...a, ...b]) {
    if (!h?.prompt) continue
    const k = h.prompt + '|' + (h.completed || '')
    if (seen.has(k)) continue
    seen.add(k); out.push(h)
  }
  return out
}

// ---------- Push (local → remote) ----------
// All push helpers swallow errors; they log, never throw, never block UI.

async function safe(label, fn) {
  try { await fn() } catch (e) { console.warn('[sync] ' + label + ' failed:', e.message || e) }
}

export async function pushProfile() {
  if (!syncEnabled()) return
  const sb = getSupabase(); const uid = currentUser.id
  const p = readLS(LS.profile, {}) || {}
  await safe('pushProfile', async () => {
    const { error } = await sb.from('profiles').upsert({
      id: uid,
      display_name: p.name || null,
      country: p.country || null,
      level: p.level || null
    }, { onConflict: 'id' })
    if (error) throw error
  })
}

export async function pushProgress() {
  if (!syncEnabled()) return
  const sb = getSupabase(); const uid = currentUser.id
  const p = readLS(LS.progress, {}) || {}
  await safe('pushProgress', async () => {
    const { error } = await sb.from('progress').upsert({
      user_id: uid,
      xp: p.xp || 0,
      streak_days: p.streakDays || 0,
      last_session_date: p.lastSessionDate || null,
      total_minutes: p.totalMinutes || 0,
      sessions_completed: p.sessionsCompleted || 0,
      vocab_learned: p.vocabLearned || [],
      grammar_covered: p.grammarCovered || []
    }, { onConflict: 'user_id' })
    if (error) throw error
  })
}

export async function pushHomework() {
  if (!syncEnabled()) return
  const sb = getSupabase(); const uid = currentUser.id
  const hw = readLS(LS.homework, { pending: null, history: [] })
  await safe('pushHomework', async () => {
    const { error } = await sb.from('homework').upsert({
      user_id: uid,
      pending: hw.pending || null,
      history: hw.history || []
    }, { onConflict: 'user_id' })
    if (error) throw error
  })
}

// Settings (provider, api_key, model, voice_key, mic_lang). Synced so a new
// device or browser can pull them after sign-in instead of re-running setup.
// RLS is what keeps these private — they're stored in a row only the owner
// can SELECT.
export async function pushSettings() {
  if (!syncEnabled()) return
  const sb = getSupabase(); const uid = currentUser.id
  const s = readLS(LS.settings, {}) || {}
  await safe('pushSettings', async () => {
    const { error } = await sb.from('settings').upsert({
      user_id: uid,
      provider: s.provider || null,
      api_key: s.apiKey || null,
      model: s.model || null,
      voice_key: s.voiceKey || null,
      mic_lang: s.micLang || null
    }, { onConflict: 'user_id' })
    if (error) throw error
  })
}

export async function pushPlan() {
  if (!syncEnabled()) return
  const sb = getSupabase(); const uid = currentUser.id
  const plan = readLS(LS.plan, null)
  if (!plan) return
  await safe('pushPlan', async () => {
    const { error } = await sb.from('plan').upsert({
      user_id: uid,
      goal_level: plan.goalLevel || null,
      daily_minutes: plan.dailyMinutes || null,
      started_at: plan.startedAt || null,
      sessions_completed: plan.sessionsCompleted || 0
    }, { onConflict: 'user_id' })
    if (error) throw error
  })
}

export async function pushSession(session) {
  if (!syncEnabled() || !session) return
  const sb = getSupabase(); const uid = currentUser.id
  await safe('pushSession', async () => {
    const { error } = await sb.from('sessions').upsert({
      user_id: uid,
      client_id: session.id || null,
      mode: session.mode || null,
      topic: session.topic || null,
      scenario: session.scenario || null,
      started_at: session.startedAt || null,
      ended_at: session.endedAt || null,
      messages: session.messages || [],
      summary: session.summary || null
    }, { onConflict: 'user_id,client_id' })
    if (error) throw error
  })
}

// ---------- Pull (remote → local), with merge ----------

export async function pullAll() {
  if (!syncEnabled()) return
  const sb = getSupabase(); const uid = currentUser.id

  // Fetch in parallel.
  const [profileRes, progressRes, homeworkRes, planRes, sessionsRes, settingsRes] = await Promise.all([
    sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
    sb.from('progress').select('*').eq('user_id', uid).maybeSingle(),
    sb.from('homework').select('*').eq('user_id', uid).maybeSingle(),
    sb.from('plan').select('*').eq('user_id', uid).maybeSingle(),
    sb.from('sessions').select('*').eq('user_id', uid).order('started_at', { ascending: true }).limit(50),
    sb.from('settings').select('*').eq('user_id', uid).maybeSingle()
  ])

  // -- Settings: server fields override local where present (so a new device
  //    inherits the user's chosen provider/keys/model). Fields the server
  //    hasn't seen yet (still null) keep the local value, so we don't blow
  //    away anything the user set up offline-first.
  const rs = settingsRes.data
  const ls = readLS(LS.settings, {})
  if (rs) {
    const mergedSettings = {
      ...ls,
      ...(rs.provider  != null ? { provider:  rs.provider  } : {}),
      ...(rs.api_key   != null ? { apiKey:    rs.api_key   } : {}),
      ...(rs.model     != null ? { model:     rs.model     } : {}),
      ...(rs.voice_key != null ? { voiceKey:  rs.voice_key } : {}),
      ...(rs.mic_lang  != null ? { micLang:   rs.mic_lang  } : {})
    }
    writeLS(LS.settings, mergedSettings)
  }

  // -- Profile: server fields override local if they exist; keep local createdAt.
  const remoteProfile = profileRes.data
  const localProfile = readLS(LS.profile, null) || {}
  const mergedProfile = {
    ...localProfile,
    ...(remoteProfile?.display_name != null ? { name: remoteProfile.display_name } : {}),
    ...(remoteProfile?.country      != null ? { country: remoteProfile.country }   : {}),
    ...(remoteProfile?.level        != null ? { level: remoteProfile.level }       : {}),
    createdAt: localProfile.createdAt || remoteProfile?.created_at || new Date().toISOString()
  }
  writeLS(LS.profile, mergedProfile)

  // -- Progress: union of vocab + grammar; max of counters.
  const r = progressRes.data
  const l = readLS(LS.progress, {
    xp: 0, streakDays: 0, lastSessionDate: null,
    vocabLearned: [], grammarCovered: [],
    totalMinutes: 0, sessionsCompleted: 0
  })
  const mergedProgress = {
    xp: Math.max(l.xp || 0, r?.xp || 0),
    streakDays: Math.max(l.streakDays || 0, r?.streak_days || 0),
    lastSessionDate: pickLatestDate(l.lastSessionDate, r?.last_session_date),
    totalMinutes: Math.max(l.totalMinutes || 0, r?.total_minutes || 0),
    sessionsCompleted: Math.max(l.sessionsCompleted || 0, r?.sessions_completed || 0),
    vocabLearned: mergeVocab(l.vocabLearned, r?.vocab_learned),
    grammarCovered: mergeGrammar(l.grammarCovered, r?.grammar_covered)
  }
  writeLS(LS.progress, mergedProgress)

  // -- Homework: server pending wins if set, else local; merged history.
  const rh = homeworkRes.data
  const lh = readLS(LS.homework, { pending: null, history: [] })
  const mergedHomework = {
    pending: rh?.pending ?? lh.pending ?? null,
    history: mergeHomeworkHistory(lh.history, rh?.history)
  }
  writeLS(LS.homework, mergedHomework)

  // -- Plan: server wins if exists, else keep local.
  const rp = planRes.data
  if (rp) {
    writeLS(LS.plan, {
      goalLevel: rp.goal_level,
      dailyMinutes: rp.daily_minutes,
      startedAt: rp.started_at,
      sessionsCompleted: rp.sessions_completed || 0
    })
  }

  // -- Sessions: dedupe by client_id, preferring remote (it has all messages).
  const remoteSessions = (sessionsRes.data || []).map(r => ({
    id: r.client_id || r.id,
    mode: r.mode,
    topic: r.topic,
    scenario: r.scenario,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    messages: r.messages || [],
    summary: r.summary || null
  }))
  const localSessions = readLS(LS.sessions, [])
  const seen = new Set(remoteSessions.map(s => s.id))
  const unsynced = localSessions.filter(s => !seen.has(s.id))
  const merged = [...remoteSessions, ...unsynced].sort(
    (a, b) => new Date(a.startedAt || 0) - new Date(b.startedAt || 0)
  ).slice(-50)
  writeLS(LS.sessions, merged)

  // -- After pull, push back any local-only sessions so the server catches up.
  for (const s of unsynced) {
    pushSession(s) // fire-and-forget
  }
}

function pickLatestDate(a, b) {
  if (!a) return b || null
  if (!b) return a
  return a > b ? a : b
}

// Push everything we have locally — used after sign-in so a brand-new server
// gets seeded with whatever the user already accumulated offline.
export async function pushAll() {
  if (!syncEnabled()) return
  const sessions = readLS(LS.sessions, [])
  await Promise.all([
    pushProfile(),
    pushProgress(),
    pushHomework(),
    pushPlan(),
    pushSettings(),
    ...sessions.map(s => pushSession(s))
  ])
}

// On sign-in: pull remote, then push any local extras. Idempotent.
export async function syncAfterSignIn() {
  if (!syncEnabled()) return
  await pullAll()
  await pushAll()
}
