import { useState, useEffect, useRef } from 'react'
import Setup from './components/Setup.jsx'
import LevelIntake from './components/LevelIntake.jsx'
import LevelTest from './components/LevelTest.jsx'
import Home from './components/Home.jsx'
import Session from './components/Session.jsx'
import ApiKeyModal from './components/ApiKeyModal.jsx'
import ZeroToHeroSetup from './components/ZeroToHeroSetup.jsx'
import GrammarPicker from './components/GrammarPicker.jsx'
import RoleplayPicker from './components/RoleplayPicker.jsx'
import Progress from './components/Progress.jsx'
import SessionDetail from './components/SessionDetail.jsx'
import Auth from './components/Auth.jsx'
import Walkthrough from './components/Walkthrough.jsx'
import {
  getOnboardingStep, getSettings, saveSettings, resetAll, getProfile, getPlan,
  hasSeenWalkthrough, markWalkthroughSeen
} from './lib/storage.js'
import { isSupabaseConfigured } from './lib/supabase.js'
import { initAuth, onAuthChange, syncAfterSignIn, signOut } from './lib/sync.js'

// Compute which screen to show based on what we have in localStorage.
// Used both at first paint and after a sync pull replaces local data.
function deriveScreen() {
  const step = getOnboardingStep()
  const settings = getSettings()
  const profile = getProfile()
  // Brand-new user: show the walkthrough first, then Setup. The seen flag
  // is wiped on owner mismatch (sync.js) so each new account gets the tour
  // once. Returning users with profile already set never see this.
  if (!settings.apiKey || !profile?.name) {
    return hasSeenWalkthrough() ? 'setup' : 'walkthrough'
  }
  if (step === 'intake') return 'intake'
  if (step === 'test') return 'test'
  return 'home'
}

export default function App() {
  // `null` = auth state still resolving (we briefly show nothing rather than
  // flashing the wrong screen). After initAuth, becomes user object or false.
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured())
  const [syncing, setSyncing] = useState(false)

  const [screen, setScreen] = useState(deriveScreen)
  const [sessionContext, setSessionContext] = useState({ mode: 'free' })
  const [showSettings, setShowSettings] = useState(false)
  const [viewingSession, setViewingSession] = useState(null)

  // Tracks whether we've already pulled+merged for this user this session.
  // Prevents duplicate syncs on token refresh / tab refocus events that
  // also fire onAuthStateChange.
  const syncedFor = useRef(null)

  // Boot auth + subscribe to changes.
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let cancelled = false

    async function syncOnce(u) {
      if (!u || syncedFor.current === u.id) return
      syncedFor.current = u.id
      setSyncing(true)
      try { await syncAfterSignIn() } catch {}
      if (!cancelled) {
        setSyncing(false)
        setScreen(deriveScreen())
      }
    }

    ;(async () => {
      const u = await initAuth()
      if (cancelled) return
      setUser(u || false)
      setAuthReady(true)
      // If we already had a session on boot (e.g. returning from a magic-link
      // redirect or refreshed page), pull remote data so local matches server.
      if (u) await syncOnce(u)
    })()

    const off = onAuthChange((u) => {
      setUser(u || false)
      if (u) {
        // Fresh sign-in → pull data, then re-derive screen.
        // Re-fire safely: syncOnce dedupes by user id so token refreshes are no-ops.
        syncOnce(u)
      } else {
        // Signed out → clear sync flag and recompute screen against local-only state.
        syncedFor.current = null
        setScreen(deriveScreen())
      }
    })
    return () => { cancelled = true; off() }
  }, [])

  function goHome() { setScreen('home') }

  function startSession(ctx) {
    setSessionContext(ctx)
    setScreen('session')
  }

  function handleStart(modeId) {
    switch (modeId) {
      case 'free':
        startSession({ mode: 'free' }); break
      case 'zero-hero':
        if (getPlan()?.goalLevel) startSession({ mode: 'zero-hero' })
        else setScreen('zero-hero-setup')
        break
      case 'grammar':
        setScreen('grammar-pick'); break
      case 'vocab':
        startSession({ mode: 'vocab' }); break
      case 'roleplay':
        setScreen('roleplay-pick'); break
      default:
        startSession({ mode: 'free' })
    }
  }

  function saveSettingsModal({ provider, apiKey, model, voiceKey }) {
    saveSettings({ provider, apiKey, model, voiceKey: voiceKey || '' })
    setShowSettings(false)
  }

  async function handleSignOut() {
    if (!confirm('Sign out? Your progress stays on the server — sign back in any time to pick up where you left off.')) return
    await signOut()
    setShowSettings(false)
    // The auth listener will surface the Auth screen automatically.
  }

  function resetProfile() {
    if (!confirm("Reset everything? You'll lose your progress and need to set up again.")) return
    resetAll()
    setScreen('setup')
  }

  // -- Render gates --

  // While auth is still resolving, show nothing rather than flashing setup.
  if (!authReady) {
    return (
      <div className="scene" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="scene-logo" aria-hidden="true">⏳</div>
      </div>
    )
  }

  // Auth is required whenever the backend is configured. No "skip offline"
  // escape hatch — without an account there's no leaderboard, no streak
  // recovery on a new device, and no key restore. The only fully-offline
  // path is a build with no Supabase env vars.
  if (isSupabaseConfigured() && !user) {
    return <Auth />
  }

  if (syncing) {
    return (
      <div className="scene" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="scene-logo">☁️</div>
        <h1 className="scene-title">Syncing your stuff…</h1>
        <p className="scene-subtitle">Pulling your progress from the cloud. One sec.</p>
      </div>
    )
  }

  return (
    <>
      {screen === 'walkthrough' && (
        <Walkthrough onDone={() => { markWalkthroughSeen(); setScreen('setup') }} />
      )}

      {screen === 'setup' && <Setup onDone={() => setScreen('intake')} />}

      {screen === 'intake' && (
        <LevelIntake onDone={(picked) => setScreen(picked === '?' ? 'test' : 'home')} />
      )}

      {screen === 'test' && <LevelTest onDone={() => setScreen('home')} />}

      {screen === 'home' && (
        <Home
          onStart={handleStart}
          onOpenSettings={() => setShowSettings(true)}
          onResetProfile={resetProfile}
          onOpenProgress={() => setScreen('progress')}
        />
      )}

      {screen === 'progress' && (
        <Progress
          onBack={goHome}
          onOpenSession={(s) => { setViewingSession(s); setScreen('session-detail') }}
        />
      )}

      {screen === 'session-detail' && viewingSession && (
        <SessionDetail
          session={viewingSession}
          onBack={() => { setViewingSession(null); setScreen('progress') }}
        />
      )}

      {screen === 'zero-hero-setup' && (
        <ZeroToHeroSetup
          onStart={() => startSession({ mode: 'zero-hero' })}
          onCancel={goHome}
        />
      )}

      {screen === 'grammar-pick' && (
        <GrammarPicker
          onPick={(topic) => startSession({ mode: 'grammar', topic })}
          onCancel={goHome}
        />
      )}

      {screen === 'roleplay-pick' && (
        <RoleplayPicker
          onPick={(scenario) => startSession({ mode: 'roleplay', scenario })}
          onCancel={goHome}
        />
      )}

      {screen === 'session' && (
        <Session context={sessionContext} onExit={goHome} />
      )}

      {showSettings && (
        <ApiKeyModal
          existingProvider={getSettings().provider}
          existingKey={getSettings().apiKey}
          existingModel={getSettings().model}
          existingVoiceKey={getSettings().voiceKey}
          user={user}
          onSignOut={handleSignOut}
          onSave={saveSettingsModal}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  )
}
