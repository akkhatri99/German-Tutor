import { useState } from 'react'
import { getProfile, savePlan, getPlan } from '../lib/storage.js'

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1']
const MINUTES = [10, 15, 30, 60]

// Rough estimate: ~40-60 hours between CEFR levels at conversational pace
const HOURS_PER_LEVEL = 50

function estimateWeeks(fromLevel, toLevel, minutesPerDay) {
  const fromIdx = LEVELS.indexOf(fromLevel)
  const toIdx = LEVELS.indexOf(toLevel)
  if (toIdx <= fromIdx) return 0
  const hoursNeeded = (toIdx - fromIdx) * HOURS_PER_LEVEL
  const hoursPerWeek = (minutesPerDay * 7) / 60
  return Math.ceil(hoursNeeded / hoursPerWeek)
}

export default function ZeroToHeroSetup({ onStart, onCancel }) {
  const profile = getProfile()
  const existing = getPlan()
  const current = profile?.level || 'A1'

  const [goal, setGoal] = useState(existing?.goalLevel || (LEVELS[LEVELS.indexOf(current) + 1] || 'B1'))
  const [minutes, setMinutes] = useState(existing?.dailyMinutes || 15)

  const weeks = estimateWeeks(current, goal, minutes)
  const months = (weeks / 4.33).toFixed(1)

  const validGoals = LEVELS.slice(LEVELS.indexOf(current) + 1)

  function confirm() {
    savePlan({
      goalLevel: goal,
      dailyMinutes: minutes,
      sessionsCompleted: existing?.sessionsCompleted || 0
    })
    onStart()
  }

  if (validGoals.length === 0) {
    return (
      <div className="scene">
        <div className="scene-logo">🏆</div>
        <h1 className="scene-title">You're already at the top!</h1>
        <p className="scene-subtitle">
          You're at <strong>{current}</strong>. For C1+ mastery, Free Chat and Role-play will serve you better than a structured track.
        </p>
        <button className="btn btn-primary btn-lg btn-full" onClick={onCancel}>Back home</button>
      </div>
    )
  }

  return (
    <div className="scene">
      <div className="scene-logo">🚀</div>
      <h1 className="scene-title">Zero → Hero</h1>
      <p className="scene-subtitle">
        Tell me your goal and how much time you can give me, and I'll walk you there step by step.
      </p>

      <div style={{ width: '100%' }}>
        <label className="form-label">Goal level (from {current})</label>
        <div className="level-grid" style={{ maxWidth: '100%' }}>
          {validGoals.map(lv => (
            <button
              key={lv}
              className={`level-btn ${goal === lv ? 'selected' : ''}`}
              onClick={() => setGoal(lv)}
            >
              <span className="level-btn-code">{lv}</span>
            </button>
          ))}
        </div>

        <label className="form-label" style={{ marginTop: 24 }}>Minutes per day</label>
        <div className="level-grid" style={{ maxWidth: '100%', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {MINUTES.map(m => (
            <button
              key={m}
              className={`level-btn ${minutes === m ? 'selected' : ''}`}
              onClick={() => setMinutes(m)}
            >
              <span className="level-btn-code">{m}</span>
              <span className="level-btn-label">min</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ width: '100%', textAlign: 'center', background: 'var(--bg-soft)', borderColor: 'var(--primary-light)' }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Estimated
        </div>
        <div style={{ fontFamily: 'Baloo 2, sans-serif', fontSize: 32, fontWeight: 800, color: 'var(--primary)', lineHeight: 1.1, margin: '6px 0' }}>
          ~{months} months
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 600 }}>
          ({weeks} weeks · suggested pace, not a promise)
        </div>
      </div>

      <div className="row-wrap" style={{ width: '100%', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" onClick={onCancel}>Back</button>
        <button className="btn btn-primary" onClick={confirm}>
          {existing ? 'Update & start →' : 'Start journey →'}
        </button>
      </div>
    </div>
  )
}
