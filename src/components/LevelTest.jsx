import { useState, useEffect } from 'react'
import ChatSurface from './ChatSurface.jsx'
import { levelTestPrompt } from '../lib/prompt.js'
import { getProfile, saveProfile, setOnboardingStep } from '../lib/storage.js'

export default function LevelTest({ onDone }) {
  const profile = getProfile()
  const [messages, setMessages] = useState([])
  const [detectedLevel, setDetectedLevel] = useState(null)

  const systemPrompt = levelTestPrompt({ name: profile?.name || 'Friend' })

  // Assistant-turn count is the primary progress signal
  const assistantTurns = messages.filter(m => m.role === 'assistant' && m.text).length
  const progress = Math.min(assistantTurns / 10, 1)

  // Parse <level>XX</level> tag from assistant output on the 10th turn
  useEffect(() => {
    const lastAi = [...messages].reverse().find(m => m.role === 'assistant')
    if (!lastAi) return
    const m = lastAi.text.match(/<level>([A-C][12])<\/level>/i)
    if (m && !detectedLevel) setDetectedLevel(m[1].toUpperCase())
  }, [messages, detectedLevel])

  function finish() {
    const level = detectedLevel || 'A1'
    saveProfile({ level })
    setOnboardingStep('done')
    onDone(level)
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <div className="topbar-title">Level Check</div>
          <div className="topbar-status">A quick friendly chat</div>
        </div>
        <div style={{ width: 160 }}>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textAlign: 'right', marginTop: 4 }}>
            {Math.min(assistantTurns, 10)} / 10
          </div>
        </div>
      </div>

      {detectedLevel ? (
        <div className="scene" style={{ flex: 1, justifyContent: 'center' }}>
          <div className="scene-logo">🎉</div>
          <h1 className="scene-title">You're at <span style={{ color: 'var(--accent)' }}>{detectedLevel}</span>!</h1>
          <p className="scene-subtitle">That's where we'll start. Don't worry — we'll go at your pace, and you'll grow fast.</p>
          <button className="btn btn-accent btn-lg btn-full" onClick={finish}>
            Take me home →
          </button>
        </div>
      ) : (
        <ChatSurface
          systemPrompt={systemPrompt}
          messages={messages}
          setMessages={setMessages}
        />
      )}
    </div>
  )
}
