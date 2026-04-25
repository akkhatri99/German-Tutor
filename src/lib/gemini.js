const BASE = 'https://generativelanguage.googleapis.com/v1beta'

export const MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (recommended)' },
  { id: 'gemini-flash-latest', label: 'Gemini Flash (latest)' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (most generous free tier)' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (legacy)' }
]

export const DEFAULT_MODEL = 'gemini-2.5-flash'

export async function validateKey(apiKey, model = DEFAULT_MODEL) {
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
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
  }
  return true
}

// Streams Gemini response. `onChunk(text)` is called with each text delta.
export async function streamChat({ apiKey, model = DEFAULT_MODEL, systemPrompt, history, signal, onChunk }) {
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
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
  }

  return await readSseStream(res, onChunk)
}

// Non-streaming generate — used for summary extraction / level detection.
export async function generateJson({ apiKey, model = DEFAULT_MODEL, systemPrompt, userText, signal }) {
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
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
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
export async function transcribeAudio({ apiKey, model = DEFAULT_MODEL, audioBlob, signal }) {
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
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
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

