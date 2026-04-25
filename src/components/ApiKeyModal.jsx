import { useState } from 'react'
import { validateKey, PROVIDERS, DEFAULT_PROVIDER } from '../lib/ai.js'
import { isSupabaseConfigured } from '../lib/supabase.js'
import KeyWalkthrough from './KeyWalkthrough.jsx'

export default function ApiKeyModal({ onSave, existingProvider, existingKey, existingModel, existingVoiceKey, user, onSignOut, onClose }) {
  // Migrate unknown / legacy provider ids (e.g. 'openrouter') back to default.
  const safeProvider = PROVIDERS[existingProvider] ? existingProvider : DEFAULT_PROVIDER
  const [provider, setProvider] = useState(safeProvider)
  const [key, setKey] = useState(existingKey || '')
  const [model, setModel] = useState(
    (existingModel && PROVIDERS[safeProvider].models.some(m => m.id === existingModel))
      ? existingModel
      : PROVIDERS[safeProvider].defaultModel
  )
  const [voiceKey, setVoiceKey] = useState(existingVoiceKey || '')
  const [showVoiceHelp, setShowVoiceHelp] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  function switchProvider(p) {
    setProvider(p)
    // If the current model doesn't belong to the new provider, reset to default
    const owns = PROVIDERS[p].models.some(m => m.id === model)
    if (!owns) setModel(PROVIDERS[p].defaultModel)
    // Clear the key if switching to a different provider (different key format)
    if (p !== safeProvider) setKey('')
    setError('')
  }

  async function handleSave() {
    if (!key.trim()) { setError('Please enter a key.'); return }
    setChecking(true); setError('')
    try {
      await validateKey({ provider, apiKey: key.trim(), model })
      // Optionally validate voice key (always Gemini)
      if (voiceKey.trim() && provider !== 'gemini') {
        try {
          await validateKey({ provider: 'gemini', apiKey: voiceKey.trim() })
        } catch (e) {
          setError('Voice key looks invalid: ' + (e.message || 'check the key'))
          setChecking(false)
          return
        }
      }
      onSave({ provider, apiKey: key.trim(), model, voiceKey: voiceKey.trim() })
    } catch (e) {
      setError(e.message || 'Invalid key')
    } finally {
      setChecking(false)
    }
  }

  const pInfo = PROVIDERS[provider]

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Settings</h2>
        <p style={{ fontSize: 14 }}>
          Your key stays in your browser only. Hitting quota on one provider? Switch to another — your progress stays put.
        </p>

        {isSupabaseConfigured() && (
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '10px 12px',
              marginBottom: 16,
              background: 'var(--surface-soft, #f7f7fb)'
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              Account
            </div>
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  ✓ Signed in as <span style={{ color: 'var(--primary)' }}>{user.email}</span>
                </div>
                <button
                  className="btn btn-ghost"
                  onClick={onSignOut}
                  disabled={checking}
                  style={{ flexShrink: 0, padding: '4px 10px', fontSize: 13 }}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-soft)' }}>
                Not signed in — progress lives only on this device. Reset and use the email link in setup to sync across devices.
              </div>
            )}
          </div>
        )}

        <label className="form-label">Provider</label>
        <div className="level-grid" style={{ maxWidth: '100%', gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
          {Object.values(PROVIDERS).map(p => (
            <button
              key={p.id}
              className={`level-btn ${provider === p.id ? 'selected' : ''}`}
              onClick={() => switchProvider(p.id)}
              style={{ height: 'auto', padding: '10px 8px' }}
            >
              <span className="level-btn-code" style={{ fontSize: 13 }}>{p.name}</span>
            </button>
          ))}
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 500, marginBottom: 10 }}>
          {pInfo.blurb}
        </p>

        <KeyWalkthrough provider={provider} providerInfo={pInfo} defaultOpen={!existingKey} />

        <label className="form-label">API key</label>
        <input
          type="password"
          placeholder={pInfo.keyPlaceholder}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
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
              For mixed English + German voice. Whisper (Groq) can't transcribe code-switched audio — it forces everything into one language. Add a free Gemini key here just for voice. Leave blank to use English-only or German-only mic.
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
              placeholder="AIza...  (Gemini key, used only for voice)"
              value={voiceKey}
              onChange={(e) => setVoiceKey(e.target.value)}
              autoComplete="off"
            />
          </div>
        )}

        {error && <div className="error-bubble" style={{ marginTop: 14 }}>{error}</div>}

        <div className="actions">
          {existingKey && <button className="btn btn-ghost" onClick={onClose} disabled={checking}>Cancel</button>}
          <button className="btn btn-primary" onClick={handleSave} disabled={checking}>
            {checking ? 'Checking…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
