// Static content catalogs for Grammar + Role-play modes.

export const GRAMMAR_TOPICS = [
  {
    id: 'word-order',
    title: 'Word order (verb second)',
    icon: '📏',
    level: 'A1',
    hint: 'The conjugated verb always sits in the second position in a German statement, no matter what starts the sentence.'
  },
  {
    id: 'present-tense',
    title: 'Present tense verbs',
    icon: '⏱',
    level: 'A1',
    hint: 'Regular verb conjugations: ich -e, du -st, er/sie/es -t, wir -en, ihr -t, sie -en.'
  },
  {
    id: 'articles',
    title: 'Articles (der, die, das)',
    icon: '🔤',
    level: 'A1',
    hint: 'Every German noun has a grammatical gender — masculine (der), feminine (die), neuter (das).'
  },
  {
    id: 'questions',
    title: 'Asking questions',
    icon: '❓',
    level: 'A1',
    hint: 'Yes/no questions: verb first. W-questions: W-word first, then verb.'
  },
  {
    id: 'numbers-time',
    title: 'Numbers & time',
    icon: '🔢',
    level: 'A1',
    hint: 'Numbers 1–20, then tens, telling the time, days of the week.'
  },
  {
    id: 'akkusativ',
    title: 'Akkusativ (accusative case)',
    icon: '🎯',
    level: 'A2',
    hint: 'Direct objects change articles: der → den, ein → einen (masculine). Feminine/neuter stay the same.'
  },
  {
    id: 'dativ',
    title: 'Dativ (dative case)',
    icon: '🎁',
    level: 'A2',
    hint: 'Indirect objects: der → dem, die → der, das → dem, die (plural) → den + noun-n.'
  },
  {
    id: 'modal-verbs',
    title: 'Modal verbs (können, müssen…)',
    icon: '🔑',
    level: 'A2',
    hint: 'können, müssen, dürfen, sollen, wollen, möchten — conjugated modal + infinitive at the end.'
  },
  {
    id: 'perfekt',
    title: 'Past tense (Perfekt)',
    icon: '⏮',
    level: 'A2',
    hint: 'haben/sein (conjugated) + past participle at the end. Most verbs use haben.'
  },
  {
    id: 'separable',
    title: 'Separable verbs',
    icon: '✂',
    level: 'A2',
    hint: 'Verbs like aufstehen, anrufen split: the prefix goes to the end of the clause.'
  },
  {
    id: 'adjective-endings',
    title: 'Adjective endings',
    icon: '🧩',
    level: 'B1',
    hint: 'Adjective endings change based on the article and case. Memorize der/ein-word tables.'
  },
  {
    id: 'subordinate',
    title: 'Subordinate clauses (weil, dass…)',
    icon: '🪢',
    level: 'B1',
    hint: 'After weil/dass/wenn/obwohl, the conjugated verb moves to the end of the clause.'
  },
  {
    id: 'konjunktiv-2',
    title: 'Konjunktiv II (hypotheticals)',
    icon: '💭',
    level: 'B1',
    hint: 'würde + infinitive for hypotheticals, or hätte/wäre + participle for past hypotheticals.'
  }
]

export const ROLEPLAY_SCENARIOS = [
  {
    id: 'cafe',
    title: 'Ordering at a café',
    icon: '☕',
    level: 'A1',
    setting: 'You are in a cosy Berlin café. The student wants to order a drink and a pastry.',
    role: 'a friendly café server',
    phrases: [
      { de: 'Was möchten Sie?', en: 'What would you like?' },
      { de: 'Ich hätte gern…', en: 'I would like…' },
      { de: 'einen Kaffee', en: 'a coffee' },
      { de: 'mit Milch / ohne Zucker', en: 'with milk / without sugar' },
      { de: 'Wie viel kostet das?', en: 'How much is that?' },
      { de: 'Die Rechnung, bitte.', en: 'The bill, please.' }
    ]
  },
  {
    id: 'directions',
    title: 'Asking for directions',
    icon: '🗺',
    level: 'A1',
    setting: 'The student is lost in Munich and needs to find the train station.',
    role: 'a kind passerby on the street',
    phrases: [
      { de: 'Entschuldigung, wo ist…', en: 'Excuse me, where is…' },
      { de: 'der Bahnhof', en: 'the train station' },
      { de: 'Gehen Sie geradeaus.', en: 'Go straight ahead.' },
      { de: 'Biegen Sie links/rechts ab.', en: 'Turn left/right.' },
      { de: 'Es ist weit / in der Nähe.', en: 'It is far / nearby.' }
    ]
  },
  {
    id: 'shopping',
    title: 'Shopping for clothes',
    icon: '🛍',
    level: 'A2',
    setting: 'A clothing store. The student wants to try on and buy a jacket.',
    role: 'a helpful shop assistant',
    phrases: [
      { de: 'Kann ich Ihnen helfen?', en: 'Can I help you?' },
      { de: 'Ich suche eine Jacke.', en: "I'm looking for a jacket." },
      { de: 'Welche Größe?', en: 'What size?' },
      { de: 'Kann ich das anprobieren?', en: 'Can I try it on?' },
      { de: 'Es passt gut / nicht.', en: 'It fits well / doesn’t fit.' },
      { de: 'Ich nehme es.', en: "I'll take it." }
    ]
  },
  {
    id: 'doctor',
    title: 'Doctor\'s visit',
    icon: '🩺',
    level: 'A2',
    setting: 'A doctor\'s office. The student has a cold and needs help.',
    role: 'a warm but professional doctor',
    phrases: [
      { de: 'Was fehlt Ihnen?', en: 'What\'s wrong?' },
      { de: 'Ich habe Kopfschmerzen.', en: 'I have a headache.' },
      { de: 'Seit wann?', en: 'Since when?' },
      { de: 'seit zwei Tagen', en: 'for two days' },
      { de: 'Ich verschreibe Ihnen…', en: 'I\'ll prescribe you…' }
    ]
  },
  {
    id: 'hotel',
    title: 'Checking into a hotel',
    icon: '🏨',
    level: 'A2',
    setting: 'The student arrives at a small hotel with a reservation.',
    role: 'a polite hotel receptionist',
    phrases: [
      { de: 'Ich habe eine Reservierung.', en: 'I have a reservation.' },
      { de: 'auf den Namen…', en: 'under the name…' },
      { de: 'Zimmernummer', en: 'room number' },
      { de: 'Um wie viel Uhr ist das Frühstück?', en: 'What time is breakfast?' },
      { de: 'Haben Sie WLAN?', en: 'Do you have Wi-Fi?' }
    ]
  },
  {
    id: 'smalltalk',
    title: 'Small talk & weather',
    icon: '☁',
    level: 'A1',
    setting: 'The student meets a neighbour in the hallway. Light friendly chat.',
    role: 'a cheerful neighbour',
    phrases: [
      { de: 'Wie geht\'s?', en: 'How\'s it going?' },
      { de: 'Danke, gut. Und dir?', en: 'Thanks, good. And you?' },
      { de: 'Das Wetter ist schön.', en: 'The weather is nice.' },
      { de: 'Heute ist es kalt.', en: 'It is cold today.' },
      { de: 'Schönes Wochenende!', en: 'Have a nice weekend!' }
    ]
  },
  {
    id: 'interview',
    title: 'Job interview',
    icon: '💼',
    level: 'B1',
    setting: 'An office interview for a junior role. The student is nervous but qualified.',
    role: 'a friendly but thorough hiring manager',
    phrases: [
      { de: 'Erzählen Sie mir etwas über sich.', en: 'Tell me about yourself.' },
      { de: 'Warum interessieren Sie sich für diese Stelle?', en: 'Why are you interested in this role?' },
      { de: 'Was sind Ihre Stärken?', en: 'What are your strengths?' },
      { de: 'Haben Sie Fragen?', en: 'Do you have any questions?' }
    ]
  },
  {
    id: 'train',
    title: 'At the train station',
    icon: '🚆',
    level: 'A2',
    setting: 'A busy train station ticket counter. The student needs to buy a ticket.',
    role: 'a patient ticket agent',
    phrases: [
      { de: 'Ich möchte ein Ticket nach Hamburg.', en: 'I\'d like a ticket to Hamburg.' },
      { de: 'Einfach oder Hin und zurück?', en: 'One-way or return?' },
      { de: 'Wann fährt der nächste Zug?', en: 'When does the next train leave?' },
      { de: 'Von welchem Gleis?', en: 'From which platform?' }
    ]
  }
]

// Weighted random pick of vocab words for review.
// Prefers low-strength, older words. Returns up to `count` items.
export function pickVocabForReview(vocabLearned, count = 8) {
  if (!vocabLearned?.length) return []
  // Weight: lower strength = higher weight
  const weighted = vocabLearned.map(v => ({
    word: v,
    weight: 1 / ((v.strength || 1) + 0.5)
  }))
  const total = weighted.reduce((s, w) => s + w.weight, 0)

  const picked = []
  const pool = [...weighted]
  while (picked.length < count && pool.length > 0) {
    let r = Math.random() * pool.reduce((s, w) => s + w.weight, 0)
    let idx = 0
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight
      if (r <= 0) { idx = i; break }
    }
    picked.push(pool[idx].word)
    pool.splice(idx, 1)
  }
  return picked
}
