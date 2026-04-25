import { useState } from 'react'
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
import { getOnboardingStep, getSettings, saveSettings, resetAll, getProfile, getPlan } from './lib/storage.js'

export default function App() {
  const [screen, setScreen] = useState(() => {
    const step = getOnboardingStep()
    const settings = getSettings()
    const profile = getProfile()
    if (!settings.apiKey || !profile?.name) return 'setup'
    if (step === 'intake') return 'intake'
    if (step === 'test') return 'test'
    return 'home'
  })
  const [sessionContext, setSessionContext] = useState({ mode: 'free' })
  const [showSettings, setShowSettings] = useState(false)
  const [viewingSession, setViewingSession] = useState(null)

  function goHome() { setScreen('home') }

  function startSession(ctx) {
    setSessionContext(ctx)
    setScreen('session')
  }

  // Home → mode tap routes here
  function handleStart(modeId) {
    switch (modeId) {
      case 'free':
        startSession({ mode: 'free' }); break
      case 'zero-hero':
        // If plan exists, go straight into session. Else show setup.
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

  function resetProfile() {
    if (!confirm("Reset everything? You'll lose your progress and need to set up again.")) return
    resetAll()
    setScreen('setup')
  }

  return (
    <>
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
          onSave={saveSettingsModal}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  )
}
