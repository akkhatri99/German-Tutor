import { useState } from 'react'
import { validateKey, PROVIDERS, DEFAULT_PROVIDER } from '../lib/ai.js'
import { saveSettings, saveProfile, setOnboardingStep, getProfile } from '../lib/storage.js'
import { flagOf } from '../lib/countries.js'
import CountryPicker from './CountryPicker.jsx'
import KeyWalkthrough from './KeyWalkthrough.jsx'

// Four-step onboarding: welcome → name → country → provider + API key.
// Country is optional (used only for the future leaderboard) but we ask now
// so we don't have to nag later.
export default function Setup({ onDone }) {
  const initialProfile = getProfile() || {}
  const [step, setStep] = useState(0)
  const [name, setName] = useState(initialProfile.name || '')
  const [country, setCountry] = useState(initialProfile.country || '')
  const [provider, setProvider] = useState(DEFAULT_PROVIDER)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(PROVIDERS[DEFAULT_PROVIDER].defaultModel)
  const [voiceKey, setVoiceKey] = useState('')
  const [showVoiceHelp, setShowVoiceHelp] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  function switchProvider(p) {
    setProvider(p)
    setModel(PROVIDERS[p].defaultModel)
    setError('')
  }

  async function handleFinish() {
    if (!apiKey.trim()) { setError('Please paste your API key.'); return }
    setError(''); setChecking(true)
    try {
      await validateKey({ provider, apiKey: apiKey.trim(), model })
      // If a voice key was provided and main provider isn't Gemini, validate it too.
      if (voiceKey.trim() && provider !== 'gemini') {
        try {
          await validateKey({ provider: 'gemini', apiKey: voiceKey.trim() })
        } catch (e) {
          setError('Voice key looks invalid: ' + (e.message || 'check the key, or leave it blank to skip voice'))
          setChecking(false)
          return
        }
      }
      saveSettings({ provider, apiKey: apiKey.trim(), model, voiceKey: voiceKey.trim() })
      saveProfile({
        name: name.trim() || 'Friend',
        country: country || null
      })
      setOnboardingStep('intake')
      onDone()
    } catch (e) {
      setError(e.message || 'Invalid key. Double-check and try again.')
    } finally {
      setChecking(false)
    }
  }

  if (step === 0) {
    return (
      <div className="scene">
        <div className="scene-logo">🇩🇪</div>
        <h1 className="scene-title">Hallo! I'm Lina.</h1>
        <p className="scene-subtitle">
          I'm going to teach you German by chatting with you — one tiny step at a time. No textbooks. No stress. Just a friendly conversation.
        </p>
        <button className="btn btn-primary btn-lg btn-full" onClick={() => setStep(1)}>
          Let's start →
        </button>
      </div>
    )
  }

  if (step === 1) {
    return (
      <div className="scene">
        <div className="scene-logo">👋</div>
        <h1 className="scene-title">What should I call you?</h1>
        <p className="scene-subtitle">So I can greet you like a friend.</p>
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name.trim() && setStep(2)}
          autoFocus
          maxLength={30}
        />
        <div className="row-wrap" style={{ width: '100%', justifyContent: 'space-between' }}>
          <button className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>
          <button
            className="btn btn-primary"
            onClick={() => setStep(2)}
            disabled={!name.trim()}
          >
            Continue →
          </button>
        </div>
      </div>
    )
  }

  if (step === 2) {
    return (
      <div className="scene">
        <div className="scene-logo">{country ? flagOf(country) : '🌍'}</div>
        <h1 className="scene-title">Where are you from?</h1>
        <p className="scene-subtitle">
          Optional — we'll show this on the leaderboard once it's live. Skip if you'd rather not say.
        </p>
        <CountryPicker value={country} onChange={setCountry} autoFocus />
        <div className="row-wrap" style={{ width: '100%', justifyContent: 'space-between' }}>
          <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
          <button className="btn btn-primary" onClick={() => setStep(3)}>
            Continue →
          </button>
        </div>
      </div>
    )
  }

  // step 3 — provider + API key
  const pInfo = PROVIDERS[provider]
  return (
    <div className="scene">
      <div className="scene-logo">🔑</div>
      <h1 className="scene-title">Pick your AI</h1>
      <p className="scene-subtitle">
        Lina runs on your choice of free AI. Your key stays only in your browser.
      </p>

      <div style={{ width: '100%' }}>
        <label className="form-label">Provider</label>
        <div className="level-grid" style={{ maxWidth: '100%', gridTemplateColumns: '1fr 1fr' }}>
          {Object.values(PROVIDERS).map(p => (
            <button
              key={p.id}
              className={`level-btn ${provider === p.id ? 'selected' : ''}`}
              onClick={() => switchProvider(p.id)}
              style={{ height: 'auto', padding: '12px 10px' }}
            >
              <span className="level-btn-code" style={{ fontSize: 14 }}>{p.name}</span>
            </button>
          ))}
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-soft)', fontWeight: 500, margin: '10px 0 12px' }}>
          {pInfo.blurb}
        </p>

        <KeyWalkthrough provider={provider} providerInfo={pInfo} defaultOpen={true} />

        <label className="form-label">API Key</label>
        <input
          type="password"
          placeholder={pInfo.keyPlaceholder}
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleFinish()}
          autoFocus
        />

        <label className="form-label">Model</label>
        <select value={model} onChange={e => setModel(e.target.value)}>
          {pInfo.models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>

        {provider !== 'gemini' && (
          <div className="voice-key-section">
            <div className="voice-key-head">
              <span className="voice-key-title">🎙 Bilingual voice key <span className="optional-badge">optional</span></span>
              <button
                type="button"
                className="key-help-toggle"
                onClick={() => setShowVoiceHelp(s => !s)}
                style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
              >
                {showVoiceHelp ? 'Hide steps ▾' : 'How? ▸'}
              </button>
            </div>
            <p className="voice-key-blurb">
              Want to speak English + German mixed in one sentence? That needs a Gemini key (free, separate from Groq). Skip if you'll only practice voice in one language at a time — you can always add it later in Settings.
            </p>
            {showVoiceHelp && (
              <div className="voice-key-steps">
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="key-help-cta"
                >
                  ① Open Google AI Studio →
                </a>
                <ol className="steps">
                  <li className="step"><span className="step-num">1</span><div className="step-text"><div className="step-title">Sign in with your Google account.</div></div></li>
                  <li className="step"><span className="step-num">2</span><div className="step-text"><div className="step-title">Click the blue "Create API key" button.</div><div className="step-sub">Pick "Create API key in new project" if asked.</div></div></li>
                  <li className="step"><span className="step-num">3</span><div className="step-text"><div className="step-title">Copy the key (starts with AIza…) and paste below. ↓</div></div></li>
                </ol>
              </div>
            )}
            <input
              type="password"
              placeholder="AIza...  (Gemini, voice only — optional)"
              value={voiceKey}
              onChange={e => setVoiceKey(e.target.value)}
              autoComplete="off"
            />
          </div>
        )}

        {error && <div className="error-bubble" style={{ marginTop: 14 }}>{error}</div>}
      </div>

      <div className="row-wrap" style={{ width: '100%', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" onClick={() => setStep(2)} disabled={checking}>Back</button>
        <button
          className="btn btn-primary"
          onClick={handleFinish}
          disabled={checking || !apiKey.trim()}
        >
          {checking ? 'Checking…' : 'Finish setup →'}
        </button>
      </div>
    </div>
  )
}
