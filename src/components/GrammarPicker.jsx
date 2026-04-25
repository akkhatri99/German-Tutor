import { GRAMMAR_TOPICS } from '../lib/content.js'
import { getProfile } from '../lib/storage.js'

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1']

export default function GrammarPicker({ onPick, onCancel }) {
  const profile = getProfile()
  const userLevel = profile?.level || 'A1'
  const userIdx = LEVEL_ORDER.indexOf(userLevel)

  // Show topics up to one level above the user's level
  const visible = GRAMMAR_TOPICS.filter(t => LEVEL_ORDER.indexOf(t.level) <= userIdx + 1)

  return (
    <div className="home">
      <div className="home-header">
        <div>
          <div className="home-greeting">📐 Grammar</div>
          <div className="topbar-status">Pick one topic to drill today</div>
        </div>
        <button className="btn-icon" onClick={onCancel} title="Back">×</button>
      </div>

      <div className="mode-grid">
        {visible.map(t => (
          <button
            key={t.id}
            className="mode-card"
            onClick={() => onPick(t)}
          >
            <div className="badge">{t.level}</div>
            <div className="mode-card-icon">{t.icon}</div>
            <div>
              <div className="mode-card-title">{t.title}</div>
              <div className="mode-card-desc">{t.hint.slice(0, 80)}{t.hint.length > 80 ? '…' : ''}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
