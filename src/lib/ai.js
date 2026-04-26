// Provider-agnostic dispatcher. Components should call these functions
// (not the provider modules directly) so swapping provider is a one-line change.

import * as gemini from './gemini.js'
import * as groq from './groq.js'

export const PROVIDERS = {
  groq: {
    id: 'groq',
    name: 'Groq  ·  recommended',
    short: 'Groq',
    models: groq.MODELS,
    defaultModel: groq.DEFAULT_MODEL,
    keyUrl: 'https://console.groq.com/keys',
    keyPlaceholder: 'gsk_...',
    keyPrefix: 'gsk_',
    supportsAudio: true,
    blurb: 'Free, no credit card. ~14,400 messages/day — way more than Gemini. For mixed English + German voice, add a Gemini voice key below (optional).'
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    short: 'Gemini',
    models: gemini.MODELS,
    defaultModel: gemini.DEFAULT_MODEL,
    keyUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza...',
    keyPrefix: 'AIza',
    supportsAudio: true,
    blurb: 'Google\'s free tier. Strict daily quotas — you\'ll often hit limits mid-conversation. Use only if Groq is unavailable.'
  }
}

export const DEFAULT_PROVIDER = 'groq'

// Migration helper: legacy users may have 'openrouter' or unknown ids saved.
function normalize(provider) {
  return PROVIDERS[provider] ? provider : DEFAULT_PROVIDER
}

function mod(provider) {
  const p = normalize(provider)
  if (p === 'gemini') return gemini
  return groq
}

export function getProvider(id) { return PROVIDERS[normalize(id)] }

export function validateKey({ provider, apiKey, model }) {
  return mod(provider).validateKey(apiKey, model)
}

export function streamChat({ provider, ...args }) {
  return mod(provider).streamChat(args)
}

export function generateJson({ provider, ...args }) {
  return mod(provider).generateJson(args)
}

// Bilingual audio transcription — ALWAYS routes through Gemini.
// Whisper (Groq) cannot handle code-switched English+German audio: it forces
// every word into one language and translates the rest, plus hallucinates
// continuation in the dominant language. Gemini, being a real multimodal LLM,
// follows our "preserve each word in the spoken language" instruction.
//
// Key resolution (first non-empty wins):
//   1. `voiceKey`   — dedicated Gemini key set in Settings → Voice
//   2. `apiKey`     — only if main provider is Gemini already
//
// Caller should check `hasBilingualVoice()` first.
export async function transcribeAudio({ provider, apiKey, voiceKey, audioBlob, signal }) {
  const useKey = (voiceKey && voiceKey.trim())
    || (provider === 'gemini' ? apiKey : '')
  if (!useKey) {
    throw new Error(
      'Bilingual voice needs a Gemini key. Open Settings → "Bilingual voice key" and add one (free, takes 30 seconds).'
    )
  }
  return gemini.transcribeAudio({
    apiKey: useKey,
    // Use the more generous free-tier model for voice — flash-lite handles
    // transcription just as well and lets users get further before quota.
    model: gemini.TRANSCRIBE_MODEL,
    audioBlob,
    signal
  })
}

// Returns true if the user has any working route for bilingual voice
// (either main provider is Gemini, or they've added a dedicated voice key).
export function hasBilingualVoice({ provider, voiceKey }) {
  if (voiceKey && voiceKey.trim()) return true
  return provider === 'gemini'
}

// Look up a single German word and return a structured explanation.
// Used by the click-a-word popup. Cheap call: ~50 tokens out, JSON shape.
//
// `word`            — the word the user tapped, e.g. "gegangen"
// `contextSentence` — the surrounding sentence, used to disambiguate
//                     (e.g. "sie" can be she/they/you-formal depending on context)
//
// Returns { word, lemma, pos, meaning, note } where `note` is a one-liner
// helpful for an English-speaking learner (gender for nouns, infinitive +
// past participle for irregular verbs, etc.).
export async function lookupWord({ provider, apiKey, model, word, contextSentence, signal }) {
  const systemPrompt = [
    'You explain a single German word to an English-speaking learner.',
    'Reply with ONLY a single JSON object, no prose, no markdown fence.',
    'Shape:',
    '{"word":"<the word as it appeared>","lemma":"<dictionary / base form, e.g. infinitive for verbs, nominative singular for nouns>","pos":"<one of: noun, verb, adjective, adverb, article, pronoun, preposition, conjunction, numeral, particle, interjection, other>","meaning":"<short English meaning, 1 to 6 words, no quotes>","note":"<at most 14 words. For nouns: gender + plural. For verbs: infinitive + Perfekt auxiliary (haben/sein) if relevant. For irregular forms: mention the root verb. Keep practical, not encyclopaedic.>"}',
    'If the word is actually English, return its meaning anyway.',
    'If the word is a fragment / typo, do your best with the lemma you can recover.'
  ].join('\n')

  const userText = `Word the learner tapped: "${word}"\nIn this sentence: "${contextSentence}"\nReturn JSON only.`

  return mod(provider).generateJson({ apiKey, model, systemPrompt, userText, signal })
}
