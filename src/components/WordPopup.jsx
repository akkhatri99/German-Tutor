import { useEffect, useRef, useState } from 'react'
import { lookupWord } from '../lib/ai.js'
import { getSettings, getCachedWord, cacheWord } from '../lib/storage.js'

const POPUP_W = 280
const POPUP_GAP = 8

/**
 * Floating word-translation popup.
 *
 * Caller passes the tapped `word`, the surrounding `contextSentence`,
 * and an `anchorRect` (the bounding rect of the clicked span — viewport
 * coordinates from getBoundingClientRect).
 *
 * The popup positions itself just below the word, flipping above when
 * there isn't enough room. It dismisses on outside click, Escape, or
 * scroll of any ancestor.
 */
export default function WordPopup({ word, contextSentence, anchorRect, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const popupRef = useRef(null)
  const abortRef = useRef(null)

  // Compute placement (above vs below) once; we recompute via re-render if anchorRect changes.
  const placeBelow =
    !anchorRect ||
    anchorRect.bottom + POPUP_GAP + 160 < window.innerHeight ||
    anchorRect.top < 200
  const top = placeBelow
    ? Math.min(window.innerHeight - 16, (anchorRect?.bottom ?? 0) + POPUP_GAP)
    : Math.max(8, (anchorRect?.top ?? 0) - POPUP_GAP)
  const rawLeft = (anchorRect?.left ?? 0) - 8
  const left = Math.max(8, Math.min(window.innerWidth - POPUP_W - 8, rawLeft))

  // Fetch (or read cache) on mount / when the tapped word changes.
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null); setData(null)

    const cached = getCachedWord(word)
    if (cached) {
      setData(cached)
      setLoading(false)
      return () => {}
    }

    const settings = getSettings()
    if (!settings.apiKey) {
      setError('Set up your API key in Settings to enable word lookup.')
      setLoading(false)
      return () => {}
    }

    abortRef.current = new AbortController()
    ;(async () => {
      try {
        const result = await lookupWord({
          provider: settings.provider,
          apiKey: settings.apiKey,
          model: settings.model,
          word,
          contextSentence,
          signal: abortRef.current.signal
        })
        if (cancelled) return
        cacheWord(word, result)
        setData(result)
      } catch (e) {
        if (cancelled || e.name === 'AbortError') return
        setError(e.message || 'Lookup failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      try { abortRef.current?.abort() } catch {}
    }
  }, [word, contextSentence])

  // Dismiss on outside click / Escape / scroll. Use capture-phase listeners so
  // we beat React's bubbling clicks; but the popup itself stops propagation
  // so taps inside it don't dismiss.
  useEffect(() => {
    function onDocClick(e) {
      if (popupRef.current && popupRef.current.contains(e.target)) return
      onClose()
    }
    function onKey(e) { if (e.key === 'Escape') onClose() }
    function onScroll() { onClose() }

    document.addEventListener('mousedown', onDocClick, true)
    document.addEventListener('touchstart', onDocClick, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDocClick, true)
      document.removeEventListener('touchstart', onDocClick, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose])

  return (
    <div
      ref={popupRef}
      className={`word-popup ${placeBelow ? 'below' : 'above'}`}
      style={{ top, left, width: POPUP_W }}
      onMouseDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={`Translation of ${word}`}
    >
      <button
        className="word-popup-close"
        onClick={onClose}
        aria-label="Close"
        type="button"
      >×</button>

      <div className="word-popup-headword">{data?.word || word}</div>

      {data?.lemma && data.lemma.toLowerCase() !== (data.word || word).toLowerCase() && (
        <div className="word-popup-lemma">→ {data.lemma}</div>
      )}

      {loading && (
        <div className="word-popup-loading">
          <span className="word-popup-spinner" />
          Looking up…
        </div>
      )}

      {error && (
        <div className="word-popup-error">{error}</div>
      )}

      {data && !loading && (
        <>
          <div className="word-popup-meaning">{data.meaning}</div>
          {data.pos && <div className="word-popup-pos">{data.pos}</div>}
          {data.note && <div className="word-popup-note">{data.note}</div>}
        </>
      )}
    </div>
  )
}
