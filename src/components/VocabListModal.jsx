import { useMemo, useState, useEffect } from 'react'
import { getProgress } from '../lib/storage.js'

// Quick-glance vocab list, opened by tapping the "📖 Words" stat on Home.
// The full vocab view (with strength breakdown, search, grammar topics)
// lives in Progress.jsx — this is the lightweight "remind me what I've
// learned" surface, sorted newest-first so the most recently learned
// words appear at the top.
//
// Why a modal instead of a full screen: from Home the user is one tap
// from starting a session. We don't want to push them through a
// navigation just to peek at their list — pop it open, dismiss, keep going.
export default function VocabListModal({ onClose }) {
  const [filter, setFilter] = useState('')
  const progress = getProgress()

  const sortedVocab = useMemo(() => {
    const all = [...(progress.vocabLearned || [])].sort((a, b) =>
      new Date(b.firstSeen || 0) - new Date(a.firstSeen || 0)
    )
    const f = filter.trim().toLowerCase()
    if (!f) return all
    return all.filter(v =>
      v.de?.toLowerCase().includes(f) || v.en?.toLowerCase().includes(f)
    )
  }, [progress.vocabLearned, filter])

  // Esc closes, matches the rest of the app's modals.
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const total = (progress.vocabLearned || []).length

  // Strength → emoji legend. Same scale used by spaced repetition (1..5)
  // so the dot count tells the user "how solid is this word for me".
  function strengthDots(s) {
    const n = Math.max(1, Math.min(5, s || 1))
    return '●'.repeat(n) + '○'.repeat(5 - n)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal vocab-modal" onClick={e => e.stopPropagation()}>
        <div className="vocab-modal-head">
          <div>
            <h2>📖 Your vocabulary</h2>
            <p style={{ marginBottom: 0 }}>
              {total === 0
                ? 'No words yet — finish a chat to collect your first.'
                : `${total} word${total === 1 ? '' : 's'} learned, newest first.`}
            </p>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {total > 0 && (
          <input
            type="search"
            className="vocab-modal-search"
            placeholder="Search German or English…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            autoFocus
          />
        )}

        <div className="vocab-modal-list">
          {total === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">🌱</div>
              Words you encounter in chat will appear here.
            </div>
          )}
          {total > 0 && sortedVocab.length === 0 && (
            <div className="empty-state" style={{ padding: '20px 12px' }}>
              No matches for "{filter}".
            </div>
          )}
          {sortedVocab.map((v, i) => (
            <div key={v.de + i} className="vocab-modal-row">
              <div className="vocab-modal-de">{v.de}</div>
              {v.en && <div className="vocab-modal-en">{v.en}</div>}
              <div
                className="vocab-modal-strength"
                title={`Strength ${v.strength || 1} of 5`}
                aria-label={`Strength ${v.strength || 1} of 5`}
              >
                {strengthDots(v.strength)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
