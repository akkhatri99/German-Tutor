import { useEffect, useRef, useState } from 'react'
import { streamChat, transcribeAudio, hasBilingualVoice, PROVIDERS } from '../lib/ai.js'
import {
  createRecognizer,
  isSpeechRecognitionSupported,
  speak,
  cancelSpeech,
  ensureMicPermission,
  segmentByLang,
  stripTags
} from '../lib/speech.js'
import {
  isMediaRecorderSupported,
  startAudioRecording
} from '../lib/audio.js'
import { getSettings, saveSettings } from '../lib/storage.js'
import WordPopup from './WordPopup.jsx'

// Splits a German segment into word / non-word tokens. Words are letters
// (any Unicode letter, so umlauts and ß work) plus internal hyphens or
// apostrophes. Whitespace and punctuation come back as separate tokens
// so layout / wrapping looks identical to the un-tokenized version.
const WORD_RE = /^\p{L}[\p{L}\p{M}'-]*$/u
function tokenizeGerman(text) {
  return text
    .split(/(\s+|[^\p{L}\p{M}'-]+)/u)
    .filter(t => t.length > 0)
}

// Finds the sentence containing `target` inside `fullText` so the lookup
// has tight context. Falls back to fullText if we can't isolate a sentence.
function findContextSentence(fullText, target) {
  if (!fullText) return target
  const sentences = fullText.split(/(?<=[.!?…])\s+/)
  const hit = sentences.find(s => s.toLowerCase().includes(target.toLowerCase()))
  return (hit || fullText).trim()
}

// Renders a single assistant message, highlighting <de>...</de> spans
// and making each German word individually tappable for translation.
export function RenderedMessage({ text }) {
  const [popup, setPopup] = useState(null) // { word, contextSentence, rect }
  const segments = segmentByLang(text)
  if (segments.length === 0) return text

  const fullClean = stripTags(text)

  function openWord(e, word) {
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setPopup({
      word,
      contextSentence: findContextSentence(fullClean, word),
      rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
    })
  }

  return (
    <>
      {segments.map((s, i) => {
        if (s.lang !== 'de') return <span key={i}>{s.text}</span>
        const tokens = tokenizeGerman(s.text)
        return (
          <span key={i} className="highlight">
            {tokens.map((tok, j) => {
              if (!WORD_RE.test(tok)) return <span key={j}>{tok}</span>
              return (
                <span
                  key={j}
                  className="de-word"
                  role="button"
                  tabIndex={0}
                  title={`Tap for meaning of "${tok}"`}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => openWord(e, tok)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') openWord(e, tok)
                  }}
                >
                  {tok}
                </span>
              )
            })}
          </span>
        )
      })}
      {popup && (
        <WordPopup
          word={popup.word}
          contextSentence={popup.contextSentence}
          anchorRect={popup.rect}
          onClose={() => setPopup(null)}
        />
      )}
    </>
  )
}

// Unique ID helper — avoids the Date.now() collision between user msg
// and assistant placeholder that used to cause the user's caption to be
// overwritten by Lina's streaming reply.
let _msgIdCounter = 0
function nextMsgId() {
  _msgIdCounter += 1
  return `m-${Date.now()}-${_msgIdCounter}`
}

const MIC_MODES = ['auto', 'en-US', 'de-DE']
const MIC_MODE_LABEL = {
  'auto': '🌐 Bilingual',
  'en-US': '🇬🇧 English',
  'de-DE': '🇩🇪 Deutsch'
}
// Plain-language description shown in the mic-mode picker popover.
// Tone is "is this you?" — the user picks the mode that fits how they
// actually want to talk, not the engineering term ("auto" vs "en-US").
const MIC_MODE_INFO = {
  'auto': {
    title: 'Bilingual',
    flag: '🌐',
    blurb: 'You are new to German and speak German and English mixed. Lina will understand your German and English mixed.'
  },
  'en-US': {
    title: 'English',
    flag: '🇬🇧',
    blurb: "You don't know German at all and want to learn German by speaking English."
  },
  'de-DE': {
    title: 'Deutsch',
    flag: '🇩🇪',
    blurb: 'You know German at a certain level and you are comfortable speaking in German.'
  }
}

/**
 * ChatSurface handles the microphone, TTS, and streaming to Gemini.
 * Parent provides systemPrompt + optional onAssistantTurn callback.
 * Messages array is controlled by the parent so it can save/summarize.
 */
export default function ChatSurface({
  systemPrompt,
  messages,
  setMessages,
  disabled = false,
  onAssistantTurn, // (text, turnIndex) => void, called after each assistant turn completes
  onError
}) {
  const settings = getSettings()
  const provider = settings.provider || 'groq'
  // Bilingual voice (mixed En + De) requires Gemini access — either chat is on
  // Gemini, or a dedicated voice key is configured. Whisper can't code-switch.
  const bilingualAvailable = hasBilingualVoice({ provider, voiceKey: settings.voiceKey })
  const [interim, setInterim] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [textDraft, setTextDraft] = useState('')
  const [micMode, setMicMode] = useState(() => {
    const saved = MIC_MODES.includes(settings.micLang) ? settings.micLang : 'auto'
    // If bilingual is not available, fall back to en-US web-speech mode
    if (saved === 'auto' && !bilingualAvailable) return 'en-US'
    return saved
  })
  const [showMicPicker, setShowMicPicker] = useState(false)
  const [localError, setLocalError] = useState('')

  const chatRef = useRef(null)
  const recognizerRef = useRef(null)
  const audioRecorderRef = useRef(null)
  const abortRef = useRef(null)
  const userStoppedRef = useRef(false)
  const accumulatedRef = useRef('')
  const webSpeechSupported = isSpeechRecognitionSupported()
  const audioSupported = isMediaRecorderSupported()
  const micSupported = micMode === 'auto' ? audioSupported : webSpeechSupported

  // Auto-kickoff first assistant greeting if history is empty
  useEffect(() => {
    if (messages.length === 0 && !isThinking && !disabled) {
      sendToAI([])
    }
    // eslint-disable-next-line
  }, [])

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages, interim])

  // Cleanup on unmount: stop speech, stop mic, abort in-flight request
  useEffect(() => {
    return () => {
      cancelSpeech()
      userStoppedRef.current = true
      if (recognizerRef.current) {
        try { recognizerRef.current.abort?.() } catch {}
      }
      if (audioRecorderRef.current) {
        try { audioRecorderRef.current.cancel() } catch {}
      }
      if (abortRef.current) {
        try { abortRef.current.abort() } catch {}
      }
    }
  }, [])

  async function sendToAI(historyIncludingNew) {
    setLocalError('')
    setIsThinking(true)
    abortRef.current = new AbortController()

    const apiHistory = historyIncludingNew.length === 0
      ? [{ role: 'user', text: '[Begin the session. Follow your opening instructions.]' }]
      : historyIncludingNew

    const placeholderId = nextMsgId()
    setMessages(prev => [...prev, { id: placeholderId, role: 'assistant', text: '' }])

    try {
      let streamed = ''
      let spokenUpTo = 0

      const full = await streamChat({
        provider,
        apiKey: settings.apiKey,
        model: settings.model,
        systemPrompt,
        history: apiHistory,
        signal: abortRef.current.signal,
        onChunk: (delta) => {
          streamed += delta
          setMessages(prev => prev.map(m =>
            m.id === placeholderId ? { ...m, text: streamed } : m
          ))
          // Speak complete sentences as they arrive (skip if inside an open <de> tag)
          const pending = streamed.slice(spokenUpTo)
          const openTag = (pending.match(/<de>/g) || []).length
          const closeTag = (pending.match(/<\/de>/g) || []).length
          if (openTag !== closeTag) return // tag still open; wait
          const sentenceMatch = pending.match(/^([\s\S]*?[.!?…](?:\s|$))/)
          if (sentenceMatch) {
            spokenUpTo += sentenceMatch[1].length
            const sentence = sentenceMatch[1].trim()
            if (sentence) {
              setIsSpeaking(true)
              speak(sentence, { onEnd: () => setIsSpeaking(false) })
            }
          }
        }
      })

      const tail = full.slice(spokenUpTo).trim()
      if (tail) {
        setIsSpeaking(true)
        speak(tail, { onEnd: () => setIsSpeaking(false) })
      }

      if (onAssistantTurn) onAssistantTurn(full, historyIncludingNew.length)
    } catch (e) {
      if (e.name !== 'AbortError') {
        setLocalError(e.message || 'Something went wrong')
        if (onError) onError(e)
        setMessages(prev => prev.filter(m => m.id !== placeholderId))
      }
    } finally {
      setIsThinking(false)
    }
  }

  function handleUserMessage(text) {
    if (!text.trim()) return
    cancelSpeech()
    setIsSpeaking(false)
    const userMsg = { id: nextMsgId(), role: 'user', text: text.trim() }
    const newHistory = [...messages, userMsg]
    setMessages(newHistory)
    setInterim('')
    sendToAI(newHistory)
  }

  // ---------------- MIC: start / stop orchestrator ----------------

  async function startRecording() {
    setLocalError('')
    cancelSpeech()
    setIsSpeaking(false)

    const perm = await ensureMicPermission()
    if (!perm.ok) {
      setLocalError(perm.error === 'NotAllowedError'
        ? 'Microphone blocked. Click the 🔒 in the address bar → allow mic → reload.'
        : perm.error === 'NotFoundError'
        ? 'No microphone detected.'
        : `Mic permission error: ${perm.error}`)
      return
    }

    if (micMode === 'auto') {
      await startAudioMode()
    } else {
      userStoppedRef.current = false
      accumulatedRef.current = ''
      launchRecognizer()
    }
  }

  function stopRecording() {
    if (micMode === 'auto') {
      stopAudioMode() // fire-and-forget; transcription happens async
    } else {
      userStoppedRef.current = true
      if (recognizerRef.current) {
        try { recognizerRef.current.stop() } catch {}
      }
    }
  }

  function toggleRecording() {
    if (isTranscribing) return
    isRecording ? stopRecording() : startRecording()
  }

  function pickMicMode(mode) {
    setMicMode(mode)
    saveSettings({ micLang: mode })
    setShowMicPicker(false)
  }

  // ---------------- MIC path A: Bilingual (Gemini audio) ----------------

  async function startAudioMode() {
    if (!audioSupported) {
      setLocalError('This browser does not support audio recording.')
      return
    }
    try {
      const recorder = await startAudioRecording()
      audioRecorderRef.current = recorder
      setIsRecording(true)
      setInterim('🎙 Recording… (click ■ to send)')
    } catch (e) {
      setLocalError('Could not start recording: ' + (e.message || e.name))
      setIsRecording(false)
    }
  }

  async function stopAudioMode() {
    const recorder = audioRecorderRef.current
    if (!recorder) return
    audioRecorderRef.current = null
    setIsRecording(false)
    setInterim('')
    setIsTranscribing(true)

    try {
      const blob = await recorder.stop()
      if (!blob || blob.size < 1000) {
        setLocalError('No audio captured. Try holding the mic a bit longer.')
        return
      }
      const text = await transcribeAudio({
        provider,
        apiKey: settings.apiKey,
        voiceKey: settings.voiceKey,
        audioBlob: blob
      })
      if (text) handleUserMessage(text)
      else setLocalError("I couldn't hear anything. Try again?")
    } catch (e) {
      // Gemini free tier has a tight per-minute quota; bilingual goes
      // through Gemini, so it's the first thing to break under any real
      // use. When that happens, auto-flip the mic to English web-speech
      // (no quota, runs in the browser) and surface the helpful message
      // from the gemini.js classifier instead of the raw API wall-of-text.
      if (e.code === 'QUOTA_EXCEEDED' && webSpeechSupported) {
        pickMicMode('en-US')
        setLocalError(
          (e.message || 'Voice quota hit.') +
          ' I switched the mic to 🇬🇧 English so you can keep going.'
        )
      } else {
        setLocalError(e.message || 'Transcription failed. Try again?')
      }
    } finally {
      setIsTranscribing(false)
    }
  }

  // ---------------- MIC path B: Web Speech (en-US / de-DE) ----------------

  function launchRecognizer() {
    const rec = createRecognizer({
      lang: micMode,
      onInterim: (t) => setInterim((accumulatedRef.current + ' ' + t).trim()),
      onFinal: (t) => {
        accumulatedRef.current = (accumulatedRef.current + ' ' + t).trim()
        setInterim(accumulatedRef.current)
      },
      onError: (err) => {
        if (err === 'no-speech') return
        const msgs = {
          'not-allowed': 'Microphone blocked. Allow mic access and try again.',
          'service-not-allowed': 'Speech service blocked.',
          'audio-capture': 'No microphone found.',
          'network': 'Network error. Web Speech needs internet.',
          'aborted': ''
        }
        const m = msgs[err] ?? `Mic error: ${err}`
        if (m) setLocalError(m)
        userStoppedRef.current = true
        setIsRecording(false)
        setInterim('')
      },
      onEnd: () => {
        if (userStoppedRef.current) {
          setIsRecording(false)
          const final = accumulatedRef.current.trim()
          setInterim('')
          accumulatedRef.current = ''
          if (final) handleUserMessage(final)
        } else {
          launchRecognizer()
        }
      }
    })
    if (!rec) return
    recognizerRef.current = rec
    setIsRecording(true)
    try { rec.start() } catch {}
  }

  // Spacebar push-to-talk
  useEffect(() => {
    let pressed = false
    function down(e) {
      if (e.code !== 'Space' || e.repeat) return
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      e.preventDefault(); pressed = true
      if (!isRecording && !isThinking && !isTranscribing && !disabled) startRecording()
    }
    function up(e) {
      if (e.code !== 'Space' || !pressed) return
      pressed = false
      if (isRecording) stopRecording()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
    // eslint-disable-next-line
  }, [isRecording, isThinking, isTranscribing, disabled, micMode])

  const status = isThinking
    ? 'Lina is thinking…'
    : isTranscribing
      ? 'Transcribing your speech…'
      : isSpeaking
        ? 'Lina is speaking…'
        : isRecording
          ? `Listening (${MIC_MODE_LABEL[micMode]})…`
          : 'Ready'

  return (
    <>
      <div className="topbar-status">{status}</div>

      <div className="chat" ref={chatRef}>
        {messages.map(m => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="speaker">{m.role === 'assistant' ? 'Lina' : 'You'}</div>
            {m.text
              ? (m.role === 'assistant' ? <RenderedMessage text={m.text} /> : m.text)
              : (isThinking && m.role === 'assistant' ? '…' : '')}
          </div>
        ))}
        {interim && (
          <div className="msg user interim">
            <div className="speaker">You (speaking)</div>
            {interim}
          </div>
        )}
        {localError && <div className="error-bubble">{localError}</div>}
      </div>

      <div className="footer-bar">
        {micSupported && (
          <>
            <div className="row" style={{ gap: 14 }}>
              <button
                className={`mic-btn ${isRecording ? 'recording' : ''}`}
                onClick={toggleRecording}
                disabled={isThinking || isTranscribing || disabled}
                aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              >
                {isTranscribing ? '…' : isRecording ? '■' : '🎙'}
              </button>
              <div className="mic-lang-wrap">
                <button
                  className="mic-lang-toggle"
                  onClick={() => setShowMicPicker(s => !s)}
                  disabled={isRecording || isTranscribing}
                  aria-haspopup="dialog"
                  aria-expanded={showMicPicker}
                  aria-label="Switch mic language mode"
                  title="Click to choose how you want to speak"
                >
                  {MIC_MODE_LABEL[micMode]} <span className="mic-lang-caret">▾</span>
                </button>
                {showMicPicker && (
                  <>
                    <div
                      className="mic-lang-backdrop"
                      onClick={() => setShowMicPicker(false)}
                      aria-hidden="true"
                    />
                    <div className="mic-lang-popover" role="dialog" aria-label="Choose how you want to speak">
                      <div className="mic-lang-popover-title">How do you want to speak?</div>
                      {MIC_MODES.map(m => {
                        const info = MIC_MODE_INFO[m]
                        const unavailable = m === 'auto' && !bilingualAvailable
                        const selected = m === micMode
                        return (
                          <button
                            key={m}
                            type="button"
                            className={`mic-lang-option ${selected ? 'selected' : ''}`}
                            onClick={() => !unavailable && pickMicMode(m)}
                            disabled={unavailable}
                          >
                            <span className="mic-lang-option-flag">{info.flag}</span>
                            <span className="mic-lang-option-body">
                              <span className="mic-lang-option-title">
                                {info.title}
                                {selected && <span className="mic-lang-option-check"> ✓</span>}
                              </span>
                              <span className="mic-lang-option-blurb">
                                {unavailable
                                  ? 'Add a Gemini voice key in Settings to enable mixed English + German.'
                                  : info.blurb}
                              </span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="hint">
              {isRecording
                ? (micMode === 'auto' ? 'Click ■ when done. I\'ll transcribe your mixed English + German.' : 'Speak, then click ■ to send')
                : micMode === 'auto'
                  ? 'Bilingual mode: speak English, German, or mix freely. Click mic to start.'
                  : !bilingualAvailable
                    ? 'Tap mic or hold spacebar. Want to mix English + German freely? Add a Gemini voice key in Settings.'
                    : 'Tap mic or hold spacebar. Switch mode to practice mixed speech.'}
            </div>
          </>
        )}
        <div className="text-input-row">
          <input
            placeholder={micSupported ? 'Or type your reply…' : 'Type your reply (voice unavailable)'}
            value={textDraft}
            onChange={e => setTextDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && textDraft.trim()) {
                handleUserMessage(textDraft)
                setTextDraft('')
              }
            }}
            disabled={isThinking || isTranscribing || disabled}
          />
          <button
            className="btn btn-primary"
            onClick={() => { handleUserMessage(textDraft); setTextDraft('') }}
            disabled={isThinking || isTranscribing || !textDraft.trim() || disabled}
          >Send</button>
        </div>
      </div>
    </>
  )
}
