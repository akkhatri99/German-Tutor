import { ROLEPLAY_SCENARIOS } from '../lib/content.js'

export default function RoleplayPicker({ onPick, onCancel }) {
  return (
    <div className="home">
      <div className="home-header">
        <div>
          <div className="home-greeting">🎭 Role-play</div>
          <div className="topbar-status">Pick a scene and Lina plays the other character</div>
        </div>
        <button className="btn-icon" onClick={onCancel} title="Back">×</button>
      </div>

      <div className="mode-grid">
        {ROLEPLAY_SCENARIOS.map(s => (
          <button key={s.id} className="mode-card" onClick={() => onPick(s)}>
            <div className="badge">{s.level}</div>
            <div className="mode-card-icon">{s.icon}</div>
            <div>
              <div className="mode-card-title">{s.title}</div>
              <div className="mode-card-desc">{s.setting}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
