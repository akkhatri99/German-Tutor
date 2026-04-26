const BASE = 'https://generativelanguage.googleapis.com/v1beta'

// Recognises Gemini's free-tier quota error and turns it into a stable,
// user-friendly error the UI can branch on. The raw API message is a wall
// of text with a docs URL — useless for an end user mid-conversation. We
// also try to extract the suggested retry delay so we can tell the user
// roughly how long to wait.
//
// Returns null if the error is NOT a quota error, so callers can fall
// through to the generic message path.
function classifyGeminiError(status, payload) {
  const msg = payload?.error?.message || ''
  const code = payload?.error?.code
  const statusName = payload?.error?.status // e.g. 'RESOURCE_EXHAUSTED'

  const isQuota =
    status === 429 ||
    code === 429 ||
    statusName === 'RESOURCE_EXHAUSTED' ||
    /quota|exceeded|rate limit/i.test(msg)

  if (!isQuota) return null

  // Try to find the recommended retry delay (seconds) the API suggests.
  let retrySec = null
  const retryDetail = (payload?.error?.details || []).find(
    d => d?.['@type']?.includes('RetryInfo')
  )
  if (retryDetail?.retryDelay) {
    const m = String(retryDetail.retryDelay).match(/(\d+(?:\.\d+)?)s/)
    if (m) retrySec = Math.ceil(parseFloat(m[1]))
  }
  if (retrySec == null) {
    const m = msg.match(/retry in ([\d.]+)\s*s/i)
    if (m) retrySec = Math.ceil(parseFloat(m[1]))
  }

  // Google's `retryDelay` is just a hint and the per-day metric resets
  // way later than the API suggests, so don't quote a number — it tends
  // to be wrong and frustrates users who wait the full time and still hit
  // the wall. Recommend the actual fixes instead.
  const err = new Error(
    `Gemini's free quota is exhausted. Two ways to keep going right now:\n` +
    `• Switch the mic to 🇬🇧 English or 🇩🇪 Deutsch — those use your ` +
    `browser's built-in speech (no quota, instant).\n` +
    `• If chat replies are also failing, open Settings and switch your ` +
    `provider to Groq — same free tier, much higher limits (~14k msgs/day).`
  )
  err.code = 'QUOTA_EXCEEDED'
  err.retrySec = retrySec
  return err
}

// Centralised error thrower. Picks the friendly quota error if applicable,
// otherwise surfaces the raw API message (or HTTP status as a fallback).
function throwGeminiError(status, payload) {
  const friendly = classifyGeminiError(status, payload)
  if (friendly) {
    // Open the cooldown gate so subsequent calls fail fast without burning
    // another roundtrip. Google's `retryDelay` is a hint, not a guarantee
    // (the per-day metric resets way later than they suggest), so we floor
    // the wait at 60s and ceiling it at 5min to keep the UX responsive
    // without spamming the API.
    const waitMs = Math.min(
      Math.max((friendly.retrySec || 60) * 1000, 60_000),
      300_000
    )
    cooldownUntil = Date.now() + waitMs
    throw friendly
  }
  throw new Error(payload?.error?.message || `HTTP ${status}`)
}

// Module-level "Gemini is angry, leave it alone" gate. Set on quota errors,
// checked at the start of every call so we don't pile-on the same failure.
// Survives nothing — fine, the page itself is the session.
let cooldownUntil = 0

function checkCooldown() {
  if (cooldownUntil <= Date.now()) return
  const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000)
  const err = new Error(
    `Gemini's free voice quota is still cooling down (~${remaining}s left). ` +
    `Switch the mic to 🇬🇧 English / 🇩🇪 Deutsch to keep going — or, if your ` +
    `chat provider is also Gemini, switch chat to Groq in Settings (much ` +
    `bigger free quota).`
  )
  err.code = 'QUOTA_EXCEEDED'
  err.retrySec = remaining
  throw err
}

export const MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (recommended)' },
  { id: 'gemini-flash-latest', label: 'Gemini Flash (latest)' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (most generous free tier)' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (legacy)' }
]

export const DEFAULT_MODEL = 'gemini-2.5-flash'
// Transcription doesn't need the smart model — it's literal speech-to-text,
// and `flash-lite` has a much more generous free tier (≈4× more RPM, ≈4×
// more RPD) so users hit the quota wall far less often during practice.
// Quality difference for transcription is negligible.
export const TRANSCRIBE_MODEL = 'gemini-2.5-flash-lite'

export async function validateKey(apiKey, model = DEFAULT_MODEL) {
  // Validation is a deliberate user action — don't gate it on the cooldown,
  // they may be re-checking the key after a long wait.
  const res = await fetch(`${BASE}/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      generationConfig: { maxOutputTokens: 5 }
    })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throwGeminiError(res.status, err)
  }
  return true
}

// Streams Gemini response. `onChunk(text)` is called with each text delta.
export async function streamChat({ apiKey, model = DEFAULT_MODEL, systemPrompt, history, signal, onChunk }) {
  checkCooldown()
  const url = `${BASE}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }]
    })),
    generationConfig: { temperature: 0.8, maxOutputTokens: 800 }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throwGeminiError(res.status, err)
  }

  return await readSseStream(res, onChunk)
}

// Non-streaming generate — used for summary extraction / level detection.
export async function generateJson({ apiKey, model = DEFAULT_MODEL, systemPrompt, userText, signal }) {
  checkCooldown()
  const url = `${BASE}/models/${model}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 600, responseMimeType: 'application/json' }
    }),
    signal
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throwGeminiError(res.status, err)
  }
  const json = await res.json()
  const text = json?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || ''
  try {
    return JSON.parse(text)
  } catch {
    // Attempt to extract JSON from text
    const m = text.match(/\{[\s\S]*\}/)
    if (m) return JSON.parse(m[0])
    throw new Error('Could not parse JSON response')
  }
}

// Audio transcription — sends recorded audio to Gemini and asks for a
// verbatim transcription. Handles mixed English + German natively.
// Accepts a Blob (same shape as Groq's transcribeAudio) for a uniform caller API.
// Defaults to TRANSCRIBE_MODEL (flash-lite) for the more generous free tier;
// transcription doesn't benefit from the smarter chat model.
export async function transcribeAudio({ apiKey, model = TRANSCRIBE_MODEL, audioBlob, signal }) {
  checkCooldown()
  const url = `${BASE}/models/${model}:generateContent?key=${apiKey}`
  const mimeType = audioBlob?.type || 'audio/webm'
  const audioBase64 = await blobToBase64Internal(audioBlob)
  const systemText = `You are a speech-to-text engine. Transcribe the user's spoken audio VERBATIM. The user is a German learner and may mix English and German freely within one utterance — preserve each word in the exact language it was spoken. Keep German spelling correct (ß, umlauts). Do not translate. Do not paraphrase. Do not add punctuation beyond what clearly belongs. If the audio is silent or unintelligible, return an empty string. Return ONLY the transcription, no quotes, no prefixes, no explanation.`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: audioBase64 } },
          { text: 'Transcribe this audio.' }
        ]
      }],
      generationConfig: { temperature: 0.0, maxOutputTokens: 400 }
    }),
    signal
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throwGeminiError(res.status, err)
  }
  const json = await res.json()
  const text = json?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || ''
  return text.trim()
}

// Read a Blob and return its base64 (without the data: prefix).
function blobToBase64Internal(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const result = r.result || ''
      const idx = String(result).indexOf(',')
      resolve(idx >= 0 ? String(result).slice(idx + 1) : String(result))
    }
    r.onerror = () => reject(r.error || new Error('FileReader failed'))
    r.readAsDataURL(blob)
  })
}

async function readSseStream(res, onChunk) {
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload)
        const parts = json?.candidates?.[0]?.content?.parts || []
        for (const p of parts) {
          if (p.text) {
            full += p.text
            onChunk(p.text)
          }
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }
  return full
}

