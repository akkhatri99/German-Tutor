// Derived achievements — computed from stored progress, not stored separately.
// Each: { id, title, desc, icon, unlocked, progress: 0..1 (optional) }

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1']

export function computeAchievements({ profile, progress, sessions }) {
  const out = []

  // First steps
  out.push({
    id: 'first-session',
    title: 'First Steps',
    desc: 'Complete your first session',
    icon: '🌱',
    unlocked: progress.sessionsCompleted >= 1
  })

  // Streak tiers
  for (const n of [3, 7, 30]) {
    out.push({
      id: `streak-${n}`,
      title: `${n}-Day Streak`,
      desc: `Practice ${n} days in a row`,
      icon: n >= 30 ? '🔥' : n >= 7 ? '⚡' : '✨',
      unlocked: progress.streakDays >= n,
      progress: Math.min(progress.streakDays / n, 1)
    })
  }

  // Word collector tiers
  for (const n of [10, 50, 100, 300]) {
    out.push({
      id: `vocab-${n}`,
      title: `${n} Words`,
      desc: `Learn ${n} German words`,
      icon: n >= 300 ? '🧠' : n >= 100 ? '📚' : n >= 50 ? '📖' : '📝',
      unlocked: progress.vocabLearned.length >= n,
      progress: Math.min(progress.vocabLearned.length / n, 1)
    })
  }

  // Time invested
  for (const n of [30, 120, 600]) {
    out.push({
      id: `time-${n}`,
      title: `${n} Minutes`,
      desc: `Total time: ${n >= 60 ? Math.round(n/60) + 'h' : n + 'm'}`,
      icon: n >= 600 ? '⏰' : n >= 120 ? '⌛' : '⏱',
      unlocked: (progress.totalMinutes || 0) >= n,
      progress: Math.min((progress.totalMinutes || 0) / n, 1)
    })
  }

  // Level milestones
  const lvlIdx = LEVEL_ORDER.indexOf(profile?.level || 'A1')
  for (const [i, lvl] of LEVEL_ORDER.entries()) {
    if (i === 0) continue // Skip A1
    out.push({
      id: `level-${lvl}`,
      title: `Reached ${lvl}`,
      desc: lvl === 'A2' ? 'Elementary proficiency'
           : lvl === 'B1' ? 'Independent user'
           : lvl === 'B2' ? 'Upper-intermediate'
           : 'Advanced user',
      icon: ['🥉', '🥈', '🥇', '🏆'][i - 1] || '🎖',
      unlocked: lvlIdx >= i
    })
  }

  // Mode explorer — tried all 5 modes
  const modesTried = new Set(sessions.map(s => s.mode))
  out.push({
    id: 'explorer',
    title: 'Mode Explorer',
    desc: 'Try all five learning modes',
    icon: '🧭',
    unlocked: modesTried.size >= 5,
    progress: Math.min(modesTried.size / 5, 1)
  })

  return out
}
