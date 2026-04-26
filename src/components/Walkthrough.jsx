import { useState } from 'react'

// First-run walkthrough. Shows once, right after sign-in and before Setup,
// so a brand-new user sees the same explanation Rafid currently sends to
// friends manually:
//   - "you'll need 2 API keys"
//   - "we'll ask your German level (pick one or say 'not sure')"
//   - "you can chat by typing or speaking, mix English + German freely"
//   - "tap any German word to see what it means"
//
// We persist a 'gt_walkthrough_seen' flag to localStorage. Tied to the
// new user-ownership wipe in sync.js, this flag also gets cleared when a
// different user signs into the same browser, so each new account sees
// the walkthrough exactly once.
//
// Accessible: each step has a heading, the buttons are real <button>s,
// progress dots are aria-hidden because the "Step N of M" label conveys
// the same info to screen readers.

const STEPS = [
  {
    icon: '👋',
    title: 'Hi! Quick tour?',
    body: "I'll teach you German by chatting with you — like a friend, not a textbook. Here's how it works in 60 seconds."
  },
  {
    icon: '🔑',
    title: '2 free API keys',
    body: 'Lina runs on AI you bring yourself, so it stays free. You\'ll grab one key from Groq (fast chat) and one from Google AI Studio (voice — optional but recommended). I\'ll walk you through both.'
  },
  {
    icon: '🇩🇪',
    title: "What's your German level?",
    body: 'Right after setup I\'ll ask. If you\'re not sure, just pick "Not sure — figure it out for me" and we\'ll chat for a bit so I can tell where you are.'
  },
  {
    icon: '💬',
    title: 'Type or speak — your choice',
    body: 'You can chat by typing, or hit the mic and speak. Mixing English + German in one sentence is totally fine — try saying something like "Hallo, ich bin Rafid and I am a student." I\'ll understand.'
  },
  {
    icon: '👆',
    title: 'Tap any German word',
    body: "Don't know a word in my reply? Just tap it — you'll get the meaning, pronunciation, and an example sentence right there. No leaving the chat."
  },
  {
    icon: '💾',
    title: 'No need to save',
    body: 'Your progress saves automatically — every reply is stored as we go. Hit ✓ at the end if you want a recap with XP and new words, or just close the tab. Either way, nothing gets lost.'
  },
  {
    icon: '✨',
    title: "Let's set you up",
    body: "That's it! Next up: pick your provider, paste your keys, tell me your name. Two minutes tops."
  }
]

export default function Walkthrough({ onDone }) {
  const [i, setI] = useState(0)
  const step = STEPS[i]
  const isLast = i === STEPS.length - 1

  function next() {
    if (isLast) onDone()
    else setI(i + 1)
  }

  function skip() {
    onDone()
  }

  return (
    <div className="scene">
      <div className="scene-logo" aria-hidden="true">{step.icon}</div>
      <h1 className="scene-title">{step.title}</h1>
      <p className="scene-subtitle">{step.body}</p>

      <div className="walkthrough-dots" aria-hidden="true">
        {STEPS.map((_, idx) => (
          <span
            key={idx}
            className={`walkthrough-dot ${idx === i ? 'active' : ''} ${idx < i ? 'done' : ''}`}
          />
        ))}
      </div>
      <div className="walkthrough-step-label" aria-live="polite">
        Step {i + 1} of {STEPS.length}
      </div>

      <div className="row-wrap" style={{ width: '100%', justifyContent: 'space-between', marginTop: 14 }}>
        {i === 0 ? (
          <button className="btn btn-ghost" onClick={skip}>Skip tour</button>
        ) : (
          <button className="btn btn-ghost" onClick={() => setI(i - 1)}>Back</button>
        )}
        <button className="btn btn-primary" onClick={next}>
          {isLast ? "Let's go →" : 'Next →'}
        </button>
      </div>
    </div>
  )
}
