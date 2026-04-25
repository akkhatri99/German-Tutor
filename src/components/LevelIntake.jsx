import { useState } from 'react'
import { saveProfile, setOnboardingStep, getProfile } from '../lib/storage.js'

const LEVELS = [
  { code: 'A1', label: 'Beginner' },
  { code: 'A2', label: 'Elementary' },
  { code: 'B1', label: 'Intermediate' },
  { code: 'B2', label: 'Upper Intm.' },
  { code: 'C1', label: 'Advanced' },
  { code: '?',  label: 'Not sure' }
]

export default function LevelIntake({ onDone }) {
  const name = getProfile()?.name || 'Friend'
  const [picked, setPicked] = useState(null)

  function confirm() {
    if (!picked) return
    if (picked === '?') {
      // route to the test conversation
      setOnboardingStep('test')
    } else {
      saveProfile({ level: picked })
      setOnboardingStep('done')
    }
    onDone(picked)
  }

  return (
    <div className="scene">
      <div className="scene-logo">📚</div>
      <h1 className="scene-title">What's your German level, {name}?</h1>
      <p className="scene-subtitle">
        Pick the one that feels right. If you're not sure, I'll figure it out with you in a 2-minute chat.
      </p>

      <div className="level-grid">
        {LEVELS.map(lv => (
          <button
            key={lv.code}
            className={`level-btn ${picked === lv.code ? 'selected' : ''}`}
            onClick={() => setPicked(lv.code)}
          >
            <span className="level-btn-code">{lv.code}</span>
            <span className="level-btn-label">{lv.label}</span>
          </button>
        ))}
      </div>

      <button
        className="btn btn-primary btn-lg btn-full"
        onClick={confirm}
        disabled={!picked}
      >
        {picked === '?' ? 'Let\'s find out →' : 'Continue →'}
      </button>
    </div>
  )
}
