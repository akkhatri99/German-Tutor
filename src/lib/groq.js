// Groq provider — OpenAI-compatible chat + Whisper transcription.
// Free tier: ~14,400 requests/day, no credit card required.
// Stable model IDs (unlike OpenRouter), and Whisper is free on the same key.

const BASE = 'https://api.groq.com/openai/v1'

export const MODELS = [
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B — recommended (best at German)' },
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B — fastest, slightly weaker German' },
  { id: 'gemma2-9b-it', label: 'Gemma 2 9B — Google open model' }
]

export const DEFAULT_MODEL = 'llama-3.3-70b-versatile'
export const WHISPER_MODEL = 'whisper-large-v3-turbo'

function chatHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }
}

export async function validateKey(apiKey, model = DEFAULT_MODEL) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: chatHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 5
    })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
  }
  return true
}

function toOpenAiMessages(systemPrompt, history) {
  const msgs = [{ role: 'system', content: systemPrompt }]
  for (const m of history) {
    msgs.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.text
    })
  }
  return msgs
}

export async function streamChat({ apiKey, model = DEFAULT_MODEL, systemPrompt, history, signal, onChunk }) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: chatHeaders(apiKey),
    body: JSON.stringify({
      model,
      stream: true,
      messages: toOpenAiMessages(systemPrompt, history),
      temperature: 0.8,
      max_tokens: 800
    }),
    signal
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
  }
  return await readOpenAiSse(res, onChunk)
}

export async function generateJson({ apiKey, model = DEFAULT_MODEL, systemPrompt, userText, signal }) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: chatHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText }
      ],
      temperature: 0.2,
      max_tokens: 600,
      response_format: { type: 'json_object' }
    }),
    signal
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
  }
  const json = await res.json()
  const text = json?.choices?.[0]?.message?.content || ''
  try {
    return JSON.parse(text)
  } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (m) return JSON.parse(m[0])
    throw new Error('Could not parse JSON response')
  }
}

// Whisper-based audio transcription. Free on Groq.
// We force language=de because (a) this is a German-learning app, and (b) without
// a hint Whisper auto-detects ONE dominant language and then *translates* the
// other-language parts instead of transcribing them. With language=de set,
// German is preserved verbatim and intra-sentence English usually passes through.
// The prompt is a short bilingual sample that primes the tokenizer for German
// (umlauts, ß) and code-switching — and crucially does NOT end mid-thought,
// otherwise Whisper hallucinates "continuation" filler at the end of the audio.
export async function transcribeAudio({ apiKey, audioBlob, signal }) {
  const fd = new FormData()
  // Groq accepts mp3/mp4/m4a/wav/webm/ogg/flac. Browser MediaRecorder usually outputs webm.
  const ext = (audioBlob.type || '').includes('ogg') ? 'ogg' : 'webm'
  fd.append('file', audioBlob, `audio.${ext}`)
  fd.append('model', WHISPER_MODEL)
  fd.append('response_format', 'json')
  fd.append('language', 'de')
  fd.append(
    'prompt',
    'Hallo, ich heiße Anna und ich lerne Deutsch. I sometimes mix English und Deutsch in one sentence. Ich wohne in Berlin und arbeite als Ingenieurin.'
  )
  fd.append('temperature', '0')

  const res = await fetch(`${BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: fd,
    signal
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
  }
  const json = await res.json()
  return (json.text || '').trim()
}

async function readOpenAiSse(res, onChunk) {
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
        const delta = json?.choices?.[0]?.delta?.content
          ?? json?.choices?.[0]?.message?.content
        if (delta) {
          full += delta
          onChunk(delta)
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }
  return full
}
