import { RenderedMessage } from './ChatSurface.jsx'
import { GRAMMAR_TOPICS, ROLEPLAY_SCENARIOS } from '../lib/content.js'
import { minutesBetween } from '../lib/storage.js'

const MODE_ICON = { free: '💬', 'zero-hero': '🚀', grammar: '📐', vocab: '📝', roleplay: '🎭' }
const MODE_LABEL = { free: 'Free Chat', 'zero-hero': 'Zero → Hero', grammar: 'Grammar', vocab: 'Vocab Review', roleplay: 'Role-play' }

function sessionTitle(s) {
  if (s.mode === 'grammar' && s.topic) {
    const t = GRAMMAR_TOPICS.find(x => x.id === s.topic)
    if (t) return t.title
  }
  if (s.mode === 'roleplay' && s.scenario) {
    const sc = ROLEPLAY_SCENARIOS.find(x => x.id === s.scenario)
    if (sc) return sc.title
  }
  return MODE_LABEL[s.mode] || 'Session'
}

function formatWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    + ', '
    + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function SessionDetail({ session, onBack }) {
  const { messages = [], summary, startedAt, endedAt, mode } = session
  const duration = (startedAt && endedAt) ? minutesBetween(startedAt, endedAt) : null

  return (
    <div className="progress-page">
      <div className="page-header">
        <button className="btn-icon" onClick={onBack} title="Back">←</button>
        <div className="page-title">
          {MODE_ICON[mode] || '💬'} {sessionTitle(session)}
        </div>
      </div>

      <div className="section-card">
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-soft)' }}>
          {formatWhen(startedAt)}
          {duration != null && ` · ${duration} min`}
        </div>
      </div>

      {summary?.topics?.length > 0 && (
        <div className="section-card">
          <div className="section-title">📐 Topics covered</div>
          <div className="chip-row">
            {summary.topics.map((t, i) => (
              <div className="chip" key={i}>{t}</div>
            ))}
          </div>
        </div>
      )}

      {summary?.vocab?.length > 0 && (
        <div className="section-card">
          <div className="section-title">
            📖 New words
            <div className="section-meta">{summary.vocab.length}</div>
          </div>
          <div className="vocab-list">
            {summary.vocab.map((v, i) => (
              <div className="vocab-item" key={i}>
                <div className="vocab-de">{v.de}</div>
                <div className="vocab-en">{v.en}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary?.homework && (
        <div className="homework-banner">
          <div className="homework-icon">✨</div>
          <div className="homework-text">
            <span className="homework-label">Homework from this session</span>
            {summary.homework}
          </div>
        </div>
      )}

      <div className="section-card">
        <div className="section-title">💬 Transcript</div>
        {messages.length === 0 ? (
          <div className="empty-state">No transcript was saved for this session.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => (
              <div
                key={i}
                className={`transcript-msg ${m.role === 'assistant' ? 'assistant' : 'user'}`}
              >
                <div className="transcript-role">
                  {m.role === 'assistant' ? '🤖 Lina' : '🧑 You'}
                </div>
                <div className="transcript-text">
                  {m.role === 'assistant'
                    ? <RenderedMessage text={m.text} />
                    : m.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
