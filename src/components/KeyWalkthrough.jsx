import { useState } from 'react'

// Per-provider step lists. Each step is a short, action-y line.
// Keep it concrete: tell the user EXACTLY what to click.
const STEPS = {
  groq: [
    { t: 'Open the Groq Console.', sub: 'It\'s free. No credit card. Sign in with Google or GitHub in one click.' },
    { t: 'On the page, look for the button "Create API Key".', sub: 'It\'s usually a blue/orange button in the top right of the keys table.' },
    { t: 'Give the key a name (anything — e.g. "Lina") and click Submit.', sub: 'A key starting with gsk_ will appear once.' },
    { t: 'Click the copy icon next to the key.', sub: 'Important: you can only see it once. Copy it now.' },
    { t: 'Come back here and paste it in the API Key box below. ↓', sub: 'That\'s it. Lina will check the key and you\'re done.' }
  ],
  gemini: [
    { t: 'Open Google AI Studio.', sub: 'Sign in with your normal Google account if asked.' },
    { t: 'Click the blue "Create API key" button.', sub: 'If asked, choose "Create API key in new project".' },
    { t: 'Click the copy icon next to the key.', sub: 'It starts with AIza...' },
    { t: 'Come back here and paste it in the API Key box below. ↓', sub: 'Lina will validate it for you.' }
  ]
}

/**
 * A friendly numbered walkthrough for getting a free API key.
 * Collapsible so it doesn't dominate the screen for users who already know.
 */
export default function KeyWalkthrough({ provider, providerInfo, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  const steps = STEPS[provider] || STEPS.groq

  return (
    <div className="key-help">
      <button
        type="button"
        className="key-help-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span>🪄 How to get a free key — step by step</span>
        <span className="key-help-chevron">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="key-help-body">
          <a
            href={providerInfo.keyUrl}
            target="_blank"
            rel="noreferrer"
            className="key-help-cta"
          >
            ① Open {providerInfo.short || providerInfo.name} in a new tab →
          </a>

          <ol className="steps">
            {steps.map((s, i) => (
              <li key={i} className="step">
                <span className="step-num">{i + 1}</span>
                <div className="step-text">
                  <div className="step-title">{s.t}</div>
                  {s.sub && <div className="step-sub">{s.sub}</div>}
                </div>
              </li>
            ))}
          </ol>

          <div className="key-help-foot">
            Stuck? The key is just a long string. Paste anywhere it fits — your key never leaves your browser.
          </div>
        </div>
      )}
    </div>
  )
}
