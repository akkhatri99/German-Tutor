import { useState, useMemo } from 'react'
import {
  getProfile, getProgress, getPlan, getSessions, getWeeklyActivity,
  exportAll, importAll
} from '../lib/storage.js'
import { computeAchievements } from '../lib/achievements.js'
import { GRAMMAR_TOPICS, ROLEPLAY_SCENARIOS } from '../lib/content.js'

const MODE_ICON = { free: '💬', 'zero-hero': '🚀', grammar: '📐', vocab: '📝', roleplay: '🎭' }
const MODE_LABEL = { free: 'Free Chat', 'zero-hero': 'Zero → Hero', grammar: 'Grammar', vocab: 'Vocab Review', roleplay: 'Role-play' }

function formatDate(iso) {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const yesterday = new Date(Date.now() - 86_400_000)
  const isYesterday = d.toDateString() === yesterday.toDateString()
  if (sameDay) return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  if (isYesterday) return `Yesterday, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function sessionTitle(s) {
  if (s.mode === 'grammar' && s.topic) {
    const t = GRAMMAR_TOPICS.find(x => x.id === s.topic)
    return t ? t.title : 'Grammar'
  }
  if (s.mode === 'roleplay' && s.scenario) {
    const sc = ROLEPLAY_SCENARIOS.find(x => x.id === s.scenario)
    return sc ? sc.title : 'Role-play'
  }
  return MODE_LABEL[s.mode] || 'Session'
}

export default function Progress({ onBack, onOpenSession }) {
  const profile = getProfile()
  const progress = getProgress()
  const plan = getPlan()
  const sessions = getSessions()
  const week = getWeeklyActivity()
  const [vocabFilter, setVocabFilter] = useState('')

  const achievements = useMemo(
    () => computeAchievements({ profile, progress, sessions }),
    [profile, progress, sessions]
  )
  const unlockedCount = achievements.filter(a => a.unlocked).length

  const maxDay = Math.max(1, ...week.map(d => d.minutes))
  const today = new Date().toISOString().slice(0, 10)

  const filteredVocab = useMemo(() => {
    const f = vocabFilter.trim().toLowerCase()
    const all = [...progress.vocabLearned].sort((a, b) =>
      new Date(b.firstSeen || 0) - new Date(a.firstSeen || 0)
    )
    if (!f) return all
    return all.filter(v =>
      v.de?.toLowerCase().includes(f) || v.en?.toLowerCase().includes(f)
    )
  }, [progress.vocabLearned, vocabFilter])

  const recentSessions = [...sessions].reverse().slice(0, 8)

  function handleExport() {
    const data = exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `german-tutor-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        importAll(JSON.parse(reader.result))
        alert('Backup restored. Refreshing…')
        window.location.reload()
      } catch (err) {
        alert('Failed to import: ' + err.message)
      }
    }
    reader.readAsText(file)
  }

  const totalHours = ((progress.totalMinutes || 0) / 60).toFixed(1)

  return (
    <div className="progress-page">
      <div className="page-header">
        <button className="btn-icon" onClick={onBack} title="Back">←</button>
        <div className="page-title">Progress</div>
      </div>

      {/* Level + plan summary */}
      <div className="section-card">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Current level
            </div>
            <div style={{ fontFamily: 'Baloo 2, sans-serif', fontWeight: 800, fontSize: 40, color: 'var(--primary)', lineHeight: 1 }}>
              {profile?.level || 'A1'}
            </div>
          </div>
          {plan?.goalLevel && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Goal
              </div>
              <div style={{ fontFamily: 'Baloo 2, sans-serif', fontWeight: 800, fontSize: 40, color: 'var(--accent)', lineHeight: 1 }}>
                {plan.goalLevel}
              </div>
            </div>
          )}
        </div>
        {plan?.goalLevel && (
          <div style={{ fontSize: 13, color: 'var(--text-soft)', fontWeight: 600 }}>
            {plan.sessionsCompleted || 0} sessions on the path · {plan.dailyMinutes}min/day target
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="stat-row">
        <div className="stat">
          <div className="stat-value streak">{progress.streakDays}</div>
          <div className="stat-label">🔥 Day streak</div>
        </div>
        <div className="stat">
          <div className="stat-value xp">{progress.xp}</div>
          <div className="stat-label">⭐ XP</div>
        </div>
        <div className="stat">
          <div className="stat-value">{totalHours}h</div>
          <div className="stat-label">⏱ Time</div>
        </div>
      </div>

      {/* Week chart */}
      <div className="section-card">
        <div className="section-title">
          📅 This week
          <div className="section-meta">{week.reduce((s, d) => s + d.count, 0)} sessions</div>
        </div>
        <div className="week-chart">
          {week.map(d => {
            const pct = maxDay > 0 ? (d.minutes / maxDay) * 100 : 0
            const isToday = d.date === today
            const label = new Date(d.date).toLocaleDateString([], { weekday: 'short' }).slice(0, 2)
            return (
              <div className="day-cell" key={d.date}>
                <div className="day-value">{d.minutes || '·'}</div>
                <div className={`day-bar ${isToday ? 'today' : ''} ${d.count === 0 ? 'empty' : ''}`}>
                  {d.count > 0 && (
                    <div className="day-bar-fill" style={{ height: `${Math.max(pct, 15)}%` }} />
                  )}
                </div>
                <div className="day-label">{label}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Achievements */}
      <div className="section-card">
        <div className="section-title">
          🏅 Achievements
          <div className="section-meta">{unlockedCount} / {achievements.length}</div>
        </div>
        <div className="achievement-grid">
          {achievements.map(a => (
            <div key={a.id} className={`achievement ${a.unlocked ? 'unlocked' : ''}`} title={a.desc}>
              <div className="achievement-icon">{a.icon}</div>
              <div className="achievement-title">{a.title}</div>
              <div className="achievement-desc">{a.desc}</div>
              {!a.unlocked && a.progress != null && a.progress > 0 && (
                <div className="progress-bar" style={{ marginTop: 8 }}>
                  <div className="progress-bar-fill" style={{ width: `${a.progress * 100}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Vocab */}
      <div className="section-card">
        <div className="section-title">
          📖 Vocabulary
          <div className="section-meta">{progress.vocabLearned.length} words</div>
        </div>
        {progress.vocabLearned.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🌱</div>
            Your vocabulary will grow as you chat. Finish a session to collect your first words.
          </div>
        ) : (
          <>
            <input
              className="vocab-search"
              placeholder="Search words…"
              value={vocabFilter}
              onChange={e => setVocabFilter(e.target.value)}
            />
            <div className="vocab-list">
              {filteredVocab.map(v => (
                <div className="vocab-item" key={v.de}>
                  <div className="vocab-de">{v.de}</div>
                  <div className="vocab-en">{v.en}</div>
                  <div className="vocab-strength" aria-label={`Strength ${v.strength || 1} of 5`}>
                    {[1,2,3,4,5].map(n => (
                      <div key={n} className={`strength-dot ${(v.strength || 1) >= n ? 'active' : ''}`} />
                    ))}
                  </div>
                </div>
              ))}
              {filteredVocab.length === 0 && (
                <div className="empty-state">No words match that search.</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Grammar */}
      <div className="section-card">
        <div className="section-title">
          📐 Grammar covered
          <div className="section-meta">{progress.grammarCovered.length} topics</div>
        </div>
        {progress.grammarCovered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📐</div>
            Grammar topics will show up here as Lina teaches you.
          </div>
        ) : (
          <div className="chip-row">
            {progress.grammarCovered.map(g => (
              <div className="chip" key={g.topic}>{g.topic}</div>
            ))}
          </div>
        )}
      </div>

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <div className="section-card">
          <div className="section-title">
            🕰 Recent sessions
            <div className="section-meta">{sessions.length} total</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentSessions.map(s => (
              <div
                key={s.id}
                className="session-item"
                onClick={() => onOpenSession(s)}
              >
                <div className="session-icon">{MODE_ICON[s.mode] || '💬'}</div>
                <div className="session-meta">
                  <div className="session-title">{sessionTitle(s)}</div>
                  <div className="session-date">{formatDate(s.endedAt || s.startedAt)}</div>
                </div>
                <div className="session-arrow">›</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backup */}
      <div className="section-card">
        <div className="section-title">💾 Backup</div>
        <p style={{ color: 'var(--text-soft)', fontSize: 14, fontWeight: 500, marginBottom: 12 }}>
          Download a JSON file with your full progress, or restore from a backup.
        </p>
        <div className="row-wrap">
          <button className="btn btn-ghost" onClick={handleExport}>⬇ Export</button>
          <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
            ⬆ Import
            <input
              type="file"
              accept="application/json"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>
    </div>
  )
}
