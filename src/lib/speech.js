// --- Speech Recognition ---

export function isSpeechRecognitionSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export async function ensureMicPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach(t => t.stop())
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.name || 'permission-denied' }
  }
}

export function createRecognizer({ lang = 'en-US', onInterim, onFinal, onError, onEnd }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) return null
  const rec = new SR()
  rec.lang = lang
  rec.continuous = true
  rec.interimResults = true
  rec.maxAlternatives = 1

  rec.onresult = (e) => {
    let interim = ''
    let final = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) final += r[0].transcript
      else interim += r[0].transcript
    }
    if (interim && onInterim) onInterim(interim)
    if (final && onFinal) onFinal(final.trim())
  }
  rec.onerror = (e) => onError && onError(e.error || 'unknown')
  rec.onend = () => onEnd && onEnd()
  return rec
}

// --- Speech Synthesis (multi-voice) ---

let voicesCache = []
let englishVoice = null
let germanVoice = null
let voicesLoaded = false

function pickVoices() {
  voicesCache = window.speechSynthesis.getVoices()
  if (voicesCache.length === 0) return
  voicesLoaded = true
  germanVoice =
    voicesCache.find(v => v.lang === 'de-DE' && /google|natural|premium|neural/i.test(v.name)) ||
    voicesCache.find(v => v.lang === 'de-DE') ||
    voicesCache.find(v => v.lang.startsWith('de'))
  englishVoice =
    voicesCache.find(v => v.lang === 'en-US' && /google|natural|premium|neural|samantha|jenny/i.test(v.name)) ||
    voicesCache.find(v => v.lang === 'en-US') ||
    voicesCache.find(v => v.lang === 'en-GB') ||
    voicesCache.find(v => v.lang.startsWith('en'))
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  pickVoices()
  window.speechSynthesis.onvoiceschanged = pickVoices
}

// Parses text like "Hello! Try <de>Ich bin</de> now." into
// [{text:"Hello! Try ", lang:"en"}, {text:"Ich bin", lang:"de"}, {text:" now.", lang:"en"}]
export function segmentByLang(text) {
  const segments = []
  const regex = /<de>([\s\S]*?)<\/de>/g
  let lastIndex = 0
  let m
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, m.index), lang: 'en' })
    }
    segments.push({ text: m[1], lang: 'de' })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), lang: 'en' })
  }
  return segments.filter(s => s.text.trim().length > 0)
}

// Strips the <de> tags for display. (The renderer will highlight German spans separately.)
export function stripTags(text) {
  return text.replace(/<\/?de>/g, '')
}

function speakOne({ text, lang }) {
  return new Promise((resolve) => {
    if (!text || !text.trim()) { resolve(); return }
    if (!voicesLoaded) pickVoices()

    const utt = new SpeechSynthesisUtterance(text)
    if (lang === 'de') {
      if (germanVoice) utt.voice = germanVoice
      utt.lang = 'de-DE'
      utt.rate = 0.85
    } else {
      if (englishVoice) utt.voice = englishVoice
      utt.lang = 'en-US'
      utt.rate = 0.98
    }
    utt.pitch = 1.0
    utt.onend = () => resolve()
    utt.onerror = () => resolve()
    window.speechSynthesis.speak(utt)
  })
}

// Single serialized queue for speak() calls.
//
// Why this exists: streamed assistant responses call speak() once per sentence
// as the model emits them. A sentence with <de>...</de> markers expands to
// multiple segments (en / de / en) and speak() awaits each one separately.
// Without serialization, a later (single-segment) speak() call would queue its
// utterance to the browser BEFORE an earlier speak() call gets to queue its
// later segments — resulting in audio that plays in the wrong order
// (e.g. "Can you try X?" being spoken before the example sentence it follows).
//
// With this queue, speak() calls are processed strictly in arrival order:
// every segment of speak#N finishes before any segment of speak#N+1 starts.
let queue = []
let processing = false
let generation = 0  // bumps on cancelSpeech() to invalidate in-flight jobs

async function processQueue() {
  if (processing) return
  processing = true
  try {
    while (queue.length > 0) {
      const job = queue.shift()
      const myGen = generation
      job.onStart && job.onStart()
      const segments = segmentByLang(job.text)
      for (const seg of segments) {
        if (myGen !== generation) break // cancelled mid-utterance
        await speakOne(seg)
      }
      job.onEnd && job.onEnd()
      job.resolve()
    }
  } finally {
    processing = false
  }
}

export function speak(text, { onStart, onEnd } = {}) {
  if (!('speechSynthesis' in window) || !text) return Promise.resolve()
  return new Promise((resolve) => {
    queue.push({ text, onStart, onEnd, resolve })
    processQueue()
  })
}

export function cancelSpeech() {
  generation++
  // Drop any pending jobs and resolve their promises so callers don't hang.
  const pending = queue
  queue = []
  for (const job of pending) {
    job.onEnd && job.onEnd()
    job.resolve()
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}
