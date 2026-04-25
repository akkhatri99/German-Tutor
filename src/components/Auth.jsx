import { useState } from 'react'
import { signInWithEmail, signInWithProvider } from '../lib/sync.js'

// Inline SVG marks so we don't ship an icon library for two icons.
// Google's official multi-color "G", and Apple's monochrome white logo.
function GoogleIcon() {
  return (
    <svg className="btn-oauth-icon" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.4 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.2 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.5 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C41 35 44 30 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg className="btn-oauth-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.42 2.21-1.13 2.99-.78.85-2.04 1.5-3.07 1.42-.13-1.1.42-2.27 1.13-3.04.78-.86 2.13-1.49 3.07-1.37zM20.5 17.17c-.55 1.27-.81 1.84-1.52 2.97-1 1.56-2.4 3.5-4.14 3.51-1.55.01-1.95-1.01-4.05-1-2.1.01-2.55 1.02-4.1 1.01-1.74-.01-3.07-1.77-4.07-3.33C0 16.95-.4 11.92 1.34 9.31c1.24-1.86 3.2-2.95 5.04-2.95 1.88 0 3.07 1.03 4.62 1.03 1.5 0 2.42-1.03 4.6-1.03 1.65 0 3.4.9 4.65 2.45-4.08 2.24-3.42 8.07.25 8.36z"/>
    </svg>
  )
}

// Magic-link auth gate. Shown whenever Supabase is configured and the user
// isn't signed in. Sign-in is REQUIRED — it's the only way to:
//   - keep streaks/progress when switching device or browser
//   - show up on the leaderboard (planned)
//   - restore the AI provider + API key on a fresh device without
//     re-running the whole setup wizard
//
// If Supabase isn't configured at build time (no env vars), App.jsx skips
// this screen entirely and the app runs in localStorage-only fallback mode.
export default function Auth() {
  const [email, setEmail] = useState('')
  const [stage, setStage] = useState('form') // 'form' | 'sent'
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSend() {
    const value = email.trim()
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError('Please enter a valid email address.')
      return
    }
    setError(''); setBusy(true)
    try {
      await signInWithEmail(value)
      setStage('sent')
    } catch (e) {
      setError(e.message || 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleOAuth(provider) {
    setError(''); setBusy(true)
    try {
      // Triggers a full-page redirect to the provider — control returns
      // to the app at window.location.origin after consent. We don't reset
      // `busy` because the page is leaving.
      await signInWithProvider(provider)
    } catch (e) {
      const msg = e.message || ''
      // Supabase returns a generic "provider not enabled" if the dashboard
      // toggle is off — surface that helpfully to whoever is integrating.
      if (/provider.*not enabled/i.test(msg)) {
        setError(`${provider[0].toUpperCase() + provider.slice(1)} sign-in isn't enabled yet. Use email below for now.`)
      } else {
        setError(msg || 'Sign-in failed. Try again.')
      }
      setBusy(false)
    }
  }

  if (stage === 'sent') {
    return (
      <div className="scene">
        <div className="scene-logo">📬</div>
        <h1 className="scene-title">Check your inbox</h1>
        <p className="scene-subtitle">
          I sent a magic link to <strong>{email}</strong>. Tap it on this device to finish signing in — no password needed.
        </p>
        <p className="scene-subtitle" style={{ fontSize: 14, color: 'var(--text-soft)' }}>
          The tab will refresh automatically once you click the link.
        </p>
        <button className="btn btn-ghost btn-full" onClick={() => setStage('form')}>
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <div className="scene">
      <div className="scene-logo">☁️</div>
      <h1 className="scene-title">Sign in to start</h1>
      <p className="scene-subtitle">
        Your streaks, vocab and homework live in your account so they follow you between phone, laptop and tablet — and so you can show up on the leaderboard. No password: I'll email you a one-tap link.
      </p>

      <div className="oauth-row">
        <button
          type="button"
          className="btn-oauth"
          onClick={() => handleOAuth('google')}
          disabled={busy}
        >
          <GoogleIcon />
          <span>Continue with Google</span>
        </button>
        <button
          type="button"
          className="btn-oauth btn-oauth-apple"
          onClick={() => handleOAuth('apple')}
          disabled={busy}
        >
          {/* <AppleIcon />
          <span>Continue with Apple</span> */}
        </button>
      </div>

      <div className="auth-divider">or use email</div>

      <input
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={e => setEmail(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !busy && handleSend()}
        autoComplete="email"
        inputMode="email"
        aria-label="Email address"
      />

      {error && <div className="error-bubble" style={{ marginTop: 6 }}>{error}</div>}

      <button
        className="btn btn-primary btn-lg btn-full"
        onClick={handleSend}
        disabled={busy || !email.trim()}
        style={{ marginTop: 10 }}
      >
        {busy ? 'Sending…' : 'Send magic link →'}
      </button>

      <p style={{ fontSize: 12, color: 'var(--text-soft)', textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
        Your account is private. Only you can read your data — protected by per-row access policies in our database.
      </p>
    </div>
  )
}
