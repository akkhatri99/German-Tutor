import { useState, useRef } from 'react'
import ChatSurface from './ChatSurface.jsx'
import {
  freeChatPrompt, summaryPrompt, zeroToHeroPrompt,
  grammarPrompt, vocabReviewPrompt, roleplayPrompt
} from '../lib/prompt.js'
import { generateJson } from '../lib/ai.js'
import { pickVocabForReview } from '../lib/content.js'
import {
  getProfile, getSettings, getLastSession, getHomework, getPlan, getProgress,
  saveSession, addVocab, addGrammar, bumpStreak, addXp, bumpPlanSession,
  setPendingHomework, completeHomework, minutesBetween, maybePromoteLevel
} from '../lib/storage.js'

const MODE_META = {
  free: { icon: '💬', title: 'Free Chat' },
  'zero-hero': { icon: '🚀', title: 'Zero → Hero' },
  grammar: { icon: '📐', title: 'Grammar' },
  vocab: { icon: '📝', title: 'Vocab Review' },
  roleplay: { icon: '🎭', title: 'Role-play' }
}

export default function Session({ context, onExit }) {
  const { mode, topic, scenario } = context
  const profile = getProfile()
  const settings = getSettings()
  const lastSession = getLastSession()
  const homework = getHomework()
  const plan = getPlan()
  const progress = getProgress()

  const [messages, setMessages] = useState([])
  const [ending, setEnding] = useState(false)
  const [endView, setEndView] = useState(null)
  const startedAt = useRef(new Date().toISOString())

  const meta = MODE_META[mode] || MODE_META.free

  // Build the right prompt for the mode
  let systemPrompt
  switch (mode) {
    case 'zero-hero':
      systemPrompt = zeroToHeroPrompt({
        profile,
        plan,
        revisionHints: lastSession?.summary?.revisionHints || [],
        homework: homework.pending
      })
      break
    case 'grammar':
      systemPrompt = grammarPrompt({ profile, topic })
      break
    case 'vocab': {
      const words = pickVocabForReview(progress.vocabLearned, 8)
      systemPrompt = vocabReviewPrompt({ profile, words })
      break
    }
    case 'roleplay':
      systemPrompt = roleplayPrompt({ profile, scenario })
      break
    case 'free':
    default:
      systemPrompt = freeChatPrompt({
        profile,
        revisionHints: lastSession?.summary?.revisionHints || [],
        homework: homework.pending
      })
      break
  }

  async function endSession() {
    if (ending) return
    setEnding(true)

    try {
      const transcript = messages
        .map(m => `${m.role === 'assistant' ? 'Lina' : 'Student'}: ${m.text.replace(/<\/?de>/g, '')}`)
        .join('\n')

      let summary = { topics: [], vocab: [], revisionHints: [], homework: null, levelSignal: profile?.level }

      if (transcript.trim() && settings.apiKey) {
        try {
          summary = await generateJson({
            provider: settings.provider || 'gemini',
            apiKey: settings.apiKey,
            model: settings.model,
            systemPrompt: summaryPrompt(),
            userText: `Mode: ${mode}\n\nTranscript:\n\n${transcript}`
          })
        } catch (e) {
          console.warn('Summary extraction failed', e)
        }
      }

      const endedAt = new Date().toISOString()
      saveSession({
        id: startedAt.current,
        mode,
        topic: topic?.id,
        scenario: scenario?.id,
        startedAt: startedAt.current,
        endedAt,
        messages,
        summary
      })

      const addedVocab = addVocab(summary.vocab || [])
      addGrammar(summary.topics || [])
      const mins = minutesBetween(startedAt.current, endedAt)
      bumpStreak({ minutes: mins })
      if (mode === 'zero-hero') bumpPlanSession()

      const xpEarned = 10 + addedVocab * 2 + (summary.topics?.length || 0) * 3
      addXp(xpEarned)
      if (summary.homework) setPendingHomework(summary.homework)
      if (homework.pending) completeHomework()

      const levelUp = maybePromoteLevel()

      setEndView({
        vocabCount: addedVocab,
        topics: summary.topics || [],
        homework: summary.homework,
        xp: xpEarned,
        levelUp
      })
    } finally {
      setEnding(false)
    }
  }

  if (endView) {
    return (
      <div className="scene">
        {endView.levelUp?.promoted && (
          <div className="level-up-overlay" onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEndView({ ...endView, levelUp: { promoted: false } })
            }
          }}>
            <div className="level-up-card">
              <div className="level-up-icon">🏆</div>
              <div className="level-up-title">Level up!</div>
              <div className="level-up-sub">
                {endView.levelUp.fromLevel} → {endView.levelUp.toLevel}
              </div>
              <div className="level-up-level">{endView.levelUp.toLevel}</div>
              <button
                className="btn btn-primary btn-lg btn-full"
                onClick={() => setEndView({ ...endView, levelUp: { promoted: false } })}
              >
                Keep going →
              </button>
            </div>
          </div>
        )}
        <div className="scene-logo">🎉</div>
        <h1 className="scene-title">Great session!</h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, width: '100%' }}>
          <div className="stat">
            <div className="stat-value xp">+{endView.xp}</div>
            <div className="stat-label">⭐ XP earned</div>
          </div>
          <div className="stat">
            <div className="stat-value">{endView.vocabCount}</div>
            <div className="stat-label">📖 New words</div>
          </div>
        </div>

        {endView.topics.length > 0 && (
          <div className="card" style={{ width: '100%' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Today's topics
            </div>
            {endView.topics.map((t, i) => (
              <div key={i} style={{ fontWeight: 600, color: 'var(--text)', padding: '4px 0' }}>• {t}</div>
            ))}
          </div>
        )}

        {endView.homework && (
          <div className="homework-banner" style={{ width: '100%' }}>
            <div className="homework-icon">✨</div>
            <div className="homework-text">
              <span className="homework-label">Homework for next time</span>
              {endView.homework}
            </div>
          </div>
        )}

        <button className="btn btn-primary btn-lg btn-full" onClick={onExit}>
          Back to home →
        </button>
      </div>
    )
  }

  // Vocab mode with no words
  if (mode === 'vocab' && progress.vocabLearned.length < 3) {
    return (
      <div className="scene">
        <div className="scene-logo">📚</div>
        <h1 className="scene-title">Not enough words yet</h1>
        <p className="scene-subtitle">
          Have a couple of Free Chat or Grammar sessions first so I can collect some words for you. Come back when you have at least 3 learned words.
        </p>
        <button className="btn btn-primary btn-lg btn-full" onClick={onExit}>Back home</button>
      </div>
    )
  }

  const subtitle = mode === 'grammar' && topic
    ? topic.title
    : mode === 'roleplay' && scenario
      ? scenario.title
      : mode === 'zero-hero'
        ? `→ ${plan?.goalLevel || 'B1'}  ·  ${plan?.dailyMinutes || 15} min/day`
        : `Level ${profile?.level || 'A1'}`

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <div className="topbar-title">{meta.icon} {meta.title}</div>
          <div className="topbar-status">{subtitle}</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button
            className="btn-icon"
            title="End session"
            onClick={endSession}
            disabled={ending || messages.length < 2}
          >
            {ending ? '…' : '✓'}
          </button>
          <button className="btn-icon" title="Exit without saving" onClick={onExit}>×</button>
        </div>
      </div>

      <ChatSurface
        systemPrompt={systemPrompt}
        messages={messages}
        setMessages={setMessages}
      />
    </div>
  )
}
