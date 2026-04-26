// Central localStorage data layer.
//
// localStorage is the runtime source of truth — the UI reads from it
// synchronously, so the app keeps working offline and on first paint.
// Writes additionally fire fire-and-forget push helpers from sync.js so
// signed-in users get cross-device persistence. Push failures are silent
// (logged in sync.js) and never affect UI behaviour.

import {
  pushProfile, pushProgress, pushHomework, pushPlan, pushSession, pushSettings
} from './sync.js'

const KEYS = {
  settings: 'gt_settings',       // { apiKey, model, micLang }
  profile: 'gt_profile',         // { name, level, createdAt }
  progress: 'gt_progress',       // { xp, streakDays, lastSessionDate, vocabLearned: [], grammarCovered: [], totalMinutes }
  sessions: 'gt_sessions',       // [{ id, mode, startedAt, endedAt, messages, summary }]
  homework: 'gt_homework',       // { pending: string|null, history: [{ date, prompt, completed }] }
  onboardingStep: 'gt_onboard',  // 'setup' | 'intake' | 'test' | 'done'
  plan: 'gt_plan',               // { goalLevel, dailyMinutes, startedAt, sessionsCompleted }
  wordCache: 'gt_word_cache',    // { '<lowercase word>': { word, lemma, pos, meaning, note, ts } }
}

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch { return fallback }
}
function write(key, val) { localStorage.setItem(key, JSON.stringify(val)) }

// ---------- Settings ----------
// `apiKey` is the main key used for chat/summaries (Groq or Gemini).
// `voiceKey` is an OPTIONAL second key (always Gemini) used only for bilingual
// voice transcription. Whisper can't handle mixed En+De audio, so when the main
// provider is Groq we route bilingual voice through Gemini with this key.
export function getSettings() {
  return read(KEYS.settings, {
    provider: 'groq',
    apiKey: '',
    model: 'llama-3.3-70b-versatile',
    voiceKey: '',
    micLang: 'auto'
  })
}
export function saveSettings(patch) {
  const s = { ...getSettings(), ...patch }
  write(KEYS.settings, s)
  pushSettings()
  return s
}

// ---------- Profile ----------
export function getProfile() {
  return read(KEYS.profile, null)
}
export function saveProfile(patch) {
  const p = { ...(getProfile() || {}), ...patch }
  if (!p.createdAt) p.createdAt = new Date().toISOString()
  write(KEYS.profile, p)
  pushProfile()
  return p
}

// ---------- Progress ----------
const EMPTY_PROGRESS = {
  xp: 0,
  streakDays: 0,
  lastSessionDate: null,
  vocabLearned: [],
  grammarCovered: [],
  totalMinutes: 0,
  sessionsCompleted: 0
}
export function getProgress() { return read(KEYS.progress, EMPTY_PROGRESS) }
export function saveProgress(patch) {
  const p = { ...getProgress(), ...patch }
  write(KEYS.progress, p)
  pushProgress()
  return p
}

// Adds new vocab entries (dedup by `de`), returns count added.
export function addVocab(items) {
  const p = getProgress()
  const existing = new Map(p.vocabLearned.map(v => [v.de.toLowerCase(), v]))
  let added = 0
  for (const item of items) {
    if (!item?.de) continue
    const k = item.de.toLowerCase()
    if (!existing.has(k)) {
      existing.set(k, { ...item, firstSeen: new Date().toISOString(), strength: 1 })
      added++
    }
  }
  p.vocabLearned = Array.from(existing.values())
  write(KEYS.progress, p)
  if (added > 0) pushProgress()
  return added
}

export function addGrammar(topics) {
  const p = getProgress()
  const set = new Set(p.grammarCovered.map(g => g.topic.toLowerCase()))
  for (const t of topics) {
    if (!t) continue
    const key = t.toLowerCase()
    if (!set.has(key)) {
      p.grammarCovered.push({ topic: t, firstCovered: new Date().toISOString(), mastery: 1 })
      set.add(key)
    }
  }
  write(KEYS.progress, p)
  pushProgress()
  return p.grammarCovered
}

// Streak: increment if last session was yesterday, reset to 1 if gap > 1 day, keep if today.
export function bumpStreak({ minutes = 0 } = {}) {
  const p = getProgress()
  const today = new Date().toISOString().slice(0, 10)
  const last = p.lastSessionDate
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

  let newStreak = p.streakDays
  if (last !== today) {
    newStreak = last === yesterday ? p.streakDays + 1 : 1
  }

  return saveProgress({
    lastSessionDate: today,
    streakDays: newStreak,
    sessionsCompleted: p.sessionsCompleted + 1,
    totalMinutes: (p.totalMinutes || 0) + minutes
  })
}

// Check last 3 sessions' levelSignal; if all >= next level, promote profile.
// Returns { promoted: bool, fromLevel, toLevel }.
const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1']
export function maybePromoteLevel() {
  const profile = getProfile()
  if (!profile?.level) return { promoted: false }
  const sessions = getSessions()
  const recent = sessions.slice(-3)
  if (recent.length < 3) return { promoted: false }
  const curIdx = LEVEL_ORDER.indexOf(profile.level)
  if (curIdx < 0 || curIdx >= LEVEL_ORDER.length - 1) return { promoted: false }
  const nextLevel = LEVEL_ORDER[curIdx + 1]
  const allAboveOrEqual = recent.every(s => {
    const sig = s?.summary?.levelSignal
    return sig && LEVEL_ORDER.indexOf(sig) >= curIdx + 1
  })
  if (allAboveOrEqual) {
    saveProfile({ level: nextLevel })
    return { promoted: true, fromLevel: profile.level, toLevel: nextLevel }
  }
  return { promoted: false }
}

// Minutes between two ISO timestamps, rounded up to at least 1.
export function minutesBetween(startIso, endIso) {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  return Math.max(1, Math.round(ms / 60000))
}

// Weekly activity: returns array of {date:'YYYY-MM-DD', count, minutes} for last 7 days (oldest first).
export function getWeeklyActivity() {
  const sessions = getSessions()
  const byDate = {}
  for (const s of sessions) {
    if (!s.endedAt) continue
    const d = s.endedAt.slice(0, 10)
    if (!byDate[d]) byDate[d] = { count: 0, minutes: 0 }
    byDate[d].count++
    byDate[d].minutes += minutesBetween(s.startedAt, s.endedAt)
  }
  const out = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
    out.push({
      date: d,
      count: byDate[d]?.count || 0,
      minutes: byDate[d]?.minutes || 0
    })
  }
  return out
}

export function addXp(amount) {
  const p = getProgress()
  return saveProgress({ xp: p.xp + amount })
}

// ---------- Sessions ----------
export function getSessions() { return read(KEYS.sessions, []) }
// Insert OR replace by `id`. Auto-save during a live session calls this on
// every turn so the in-progress transcript survives a tab close — without
// piling up a duplicate row each time. The original `saveSession` shape
// (push only) was the cause of users losing whole conversations: if they
// forgot to hit ✓, nothing was ever written. Now the latest snapshot is
// always one upsert away.
export function saveSession(session) {
  const all = getSessions()
  const idx = session?.id ? all.findIndex(s => s.id === session.id) : -1
  if (idx >= 0) all[idx] = session
  else all.push(session)
  // Keep last 50 sessions only to avoid bloating storage
  const trimmed = all.slice(-50)
  write(KEYS.sessions, trimmed)
  pushSession(session)
  return session
}
export function getLastSession() {
  const all = getSessions()
  // Return the most recent COMPLETED session — in-progress ones (no
  // endedAt) shouldn't seed revision hints because the AI summary hasn't
  // been generated yet for them.
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i]?.endedAt) return all[i]
  }
  return null
}

// ---------- Homework ----------
export function getHomework() {
  return read(KEYS.homework, { pending: null, history: [] })
}
export function setPendingHomework(prompt) {
  const hw = getHomework()
  hw.pending = prompt
  write(KEYS.homework, hw)
  pushHomework()
}
export function completeHomework() {
  const hw = getHomework()
  if (hw.pending) {
    hw.history.push({ prompt: hw.pending, completed: new Date().toISOString() })
    hw.pending = null
    write(KEYS.homework, hw)
    pushHomework()
  }
}

// ---------- Plan (Zero-to-Hero) ----------
export function getPlan() { return read(KEYS.plan, null) }
export function savePlan(patch) {
  const p = { ...(getPlan() || {}), ...patch }
  if (!p.startedAt) p.startedAt = new Date().toISOString()
  if (p.sessionsCompleted == null) p.sessionsCompleted = 0
  write(KEYS.plan, p)
  pushPlan()
  return p
}
export function bumpPlanSession() {
  const p = getPlan()
  if (!p) return null
  return savePlan({ sessionsCompleted: (p.sessionsCompleted || 0) + 1 })
}

// ---------- Vocab strength (spaced repetition) ----------
// Adjust a word's strength after review. correct=true bumps up, false resets toward 1.
export function updateVocabStrength(deWord, correct) {
  const p = getProgress()
  const idx = p.vocabLearned.findIndex(v => v.de.toLowerCase() === deWord.toLowerCase())
  if (idx < 0) return
  const cur = p.vocabLearned[idx]
  const newStrength = correct
    ? Math.min((cur.strength || 1) + 1, 5)
    : Math.max(Math.floor((cur.strength || 1) / 2), 1)
  p.vocabLearned[idx] = { ...cur, strength: newStrength, lastReviewed: new Date().toISOString() }
  write(KEYS.progress, p)
  pushProgress()
}

// ---------- Onboarding ----------
export function getOnboardingStep() { return read(KEYS.onboardingStep, 'setup') }
export function setOnboardingStep(step) { write(KEYS.onboardingStep, step) }

// First-run walkthrough flag. Stored separately from onboardingStep so it
// persists even if the user resets profile mid-flow. Cleared by the
// owner-mismatch wipe in sync.js when a different account signs into the
// same browser, so each new user sees the tour once.
const WALKTHROUGH_KEY = 'gt_walkthrough_seen'
export function hasSeenWalkthrough() {
  try { return localStorage.getItem(WALKTHROUGH_KEY) === '1' } catch { return false }
}
export function markWalkthroughSeen() {
  try { localStorage.setItem(WALKTHROUGH_KEY, '1') } catch {}
}

// ---------- Reset (for debugging / user request) ----------
export function resetAll() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k))
  try { localStorage.removeItem(WALKTHROUGH_KEY) } catch {}
}

// ---------- Export / Import (backup) ----------
export function exportAll() {
  const dump = {}
  for (const [name, key] of Object.entries(KEYS)) {
    const raw = localStorage.getItem(key)
    dump[name] = raw ? JSON.parse(raw) : null
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: dump
  }
}

export function importAll(payload) {
  if (!payload || !payload.data) throw new Error('Invalid backup file')
  for (const [name, key] of Object.entries(KEYS)) {
    if (payload.data[name] != null) {
      localStorage.setItem(key, JSON.stringify(payload.data[name]))
    }
  }
}

// ---------- Word lookup cache ----------
// Caches translations of single German words so the same click is free next
// time. Keyed by lowercased word (German nouns are capitalized in source but
// learners click both forms — we de-dupe by lowercasing).
export function getCachedWord(word) {
  if (!word) return null
  const cache = read(KEYS.wordCache, {})
  return cache[word.toLowerCase()] || null
}
export function cacheWord(word, payload) {
  if (!word || !payload) return
  const cache = read(KEYS.wordCache, {})
  cache[word.toLowerCase()] = { ...payload, ts: Date.now() }
  write(KEYS.wordCache, cache)
}
