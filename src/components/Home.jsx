import { useState } from 'react'
import { getProfile, getProgress, getHomework, getPlan } from '../lib/storage.js'
import VocabListModal from './VocabListModal.jsx'

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Still up'
  if (h < 12) return 'Guten Morgen'
  if (h < 18) return 'Guten Tag'
  return 'Guten Abend'
}

export default function Home({ onStart, onOpenSettings, onResetProfile, onOpenProgress }) {
  const profile = getProfile()
  const progress = getProgress()
  const homework = getHomework()
  const plan = getPlan()
  const [showVocab, setShowVocab] = useState(false)

  const vocabCount = progress.vocabLearned.length
  const hasPlan = !!plan?.goalLevel

  const modes = [
    {
      id: 'free',
      title: 'Free Chat',
      icon: '💬',
      desc: 'Just talk. Lina adapts to you.',
      featured: true,
      enabled: true
    },
    {
      id: 'zero-hero',
      title: hasPlan ? 'Zero → Hero' : 'Start Zero → Hero',
      icon: '🚀',
      desc: hasPlan
        ? `→ ${plan.goalLevel} · ${plan.dailyMinutes}min/day · ${plan.sessionsCompleted || 0} sessions done`
        : 'Structured path to your goal',
      badge: hasPlan ? 'Active' : null,
      enabled: true
    },
    {
      id: 'grammar',
      title: 'Grammar',
      icon: '📐',
      desc: 'Focused rule drills',
      enabled: true
    },
    {
      id: 'vocab',
      title: 'Vocab Review',
      icon: '📝',
      desc: vocabCount >= 3 ? `${vocabCount} words ready` : 'Learn some words first',
      badge: vocabCount < 3 ? 'Soon' : null,
      enabled: vocabCount >= 3
    },
    {
      id: 'roleplay',
      title: 'Role-play',
      icon: '🎭',
      desc: 'Café, doctor, job interview',
      enabled: true
    }
  ]

  return (
    <div className="home">
      <div className="home-header">
        <div>
          <div className="home-greeting">
            {greeting()}, {profile?.name || 'Friend'}! <span className="wave">👋</span>
          </div>
          <div className="topbar-status">
            Level <strong style={{ color: 'var(--primary)' }}>{profile?.level || 'A1'}</strong>
            {progress.sessionsCompleted > 0 && ` · ${progress.sessionsCompleted} sessions done`}
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn-icon" title="Progress" onClick={onOpenProgress}>📊</button>
          <button className="btn-icon" title="Settings" onClick={onOpenSettings}>⚙</button>
        </div>
      </div>

      {/* Stat row */}
      <div className="stat-row">
        <div className="stat">
          <div className="stat-value streak">{progress.streakDays}</div>
          <div className="stat-label">🔥 Day streak</div>
        </div>
        <div className="stat">
          <div className="stat-value xp">{progress.xp}</div>
          <div className="stat-label">⭐ XP</div>
        </div>
        <button
          type="button"
          className="stat stat-clickable"
          onClick={() => setShowVocab(true)}
          aria-label={`See your ${progress.vocabLearned.length} learned words`}
          title="Tap to see the words you've learned"
        >
          <div className="stat-value">{progress.vocabLearned.length}</div>
          <div className="stat-label">📖 Words</div>
        </button>
      </div>

      {/* Homework banner */}
      {homework.pending && (
        <div className="homework-banner">
          <div className="homework-icon">✨</div>
          <div className="homework-text">
            <span className="homework-label">Your homework</span>
            {homework.pending}
          </div>
        </div>
      )}

      <div className="mode-section-title">Pick a mode</div>

      <div className="mode-grid">
        {modes.map(m => (
          <button
            key={m.id}
            className={`mode-card ${m.featured ? 'featured' : ''}`}
            onClick={() => m.enabled && onStart(m.id)}
            disabled={!m.enabled}
            aria-label={`Start ${m.title}`}
          >
            {m.badge && <div className="badge">{m.badge}</div>}
            <div className="mode-card-icon">{m.icon}</div>
            <div>
              <div className="mode-card-title">{m.title}</div>
              <div className="mode-card-desc">{m.desc}</div>
            </div>
          </button>
        ))}
      </div>

      <div style={{ textAlign: 'center', marginTop: 'auto', paddingTop: 16 }}>
        <button
          onClick={onResetProfile}
          style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, textDecoration: 'underline' }}
        >
          Reset profile
        </button>
      </div>

      {showVocab && <VocabListModal onClose={() => setShowVocab(false)} />}
    </div>
  )
}
