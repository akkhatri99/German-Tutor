import { useState, useRef, useEffect, useMemo } from 'react'
import { COUNTRIES, flagOf } from '../lib/countries.js'

// Searchable country combobox. Replaces the native <select> because 110+
// options is too many to scroll on mobile — the search box cuts that to a
// 2-character lookup ("ge" → Germany, Georgia, etc).
//
// Keyboard:
//   - Type to filter
//   - ↑ / ↓ to highlight, Enter to choose
//   - Escape closes; Tab leaves the picker
//
// Accessibility: the trigger announces itself as a combobox with
// aria-expanded, the listbox is owned via aria-controls, and the active
// option exposes aria-selected.
export default function CountryPicker({ value, onChange, autoFocus = false }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const selected = COUNTRIES.find(c => c.code === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COUNTRIES
    // Prefer prefix matches first, then substring — feels closer to a
    // typical "country picker" mental model where "ge" leads with Germany
    // and Georgia, not Algeria.
    const pre = []
    const sub = []
    for (const c of COUNTRIES) {
      const n = c.name.toLowerCase()
      if (n.startsWith(q)) pre.push(c)
      else if (n.includes(q)) sub.push(c)
    }
    return [...pre, ...sub]
  }, [query])

  // Reset highlight when filter changes so the first visible option is active.
  useEffect(() => { setHighlighted(0) }, [query, open])

  // Scroll the highlighted row into view as the user navigates with arrows.
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector(`[data-idx="${highlighted}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [highlighted, open])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    function onEsc(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  function pick(code) {
    onChange(code)
    setOpen(false)
    setQuery('')
  }

  // Total rows in the dropdown = filtered countries + 1 synthetic "clear"
  // entry at the top when there's no active search.
  const hasClear = !query.trim()
  const totalRows = filtered.length + (hasClear ? 1 : 0)

  function handleKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setHighlighted(h => Math.min(totalRows - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setHighlighted(h => Math.max(0, h - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      if (hasClear && highlighted === 0) { pick(''); return }
      const idxIntoList = hasClear ? highlighted - 1 : highlighted
      const c = filtered[idxIntoList]
      if (c) pick(c.code)
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  // Build the visible rows. When there's no query we prepend a synthetic
  // "Prefer not to say" entry so users can clear their selection without
  // hunting for a checkbox.
  const rows = []
  if (!query.trim()) {
    rows.push({ kind: 'clear', code: '', name: 'Prefer not to say' })
  }
  for (const c of filtered) rows.push({ kind: 'country', ...c })

  return (
    <div className="cp" ref={wrapRef}>
      <button
        type="button"
        className="cp-trigger"
        onClick={() => {
          setOpen(o => !o)
          setTimeout(() => inputRef.current?.focus(), 0)
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Country"
      >
        <span className="cp-trigger-flag">
          {selected ? flagOf(selected.code) : '🌍'}
        </span>
        <span className={`cp-trigger-text ${selected ? '' : 'cp-placeholder'}`}>
          {selected ? selected.name : 'Pick your country (optional)'}
        </span>
        <span className="cp-chevron" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="cp-panel" role="dialog" aria-label="Country search">
          <input
            ref={inputRef}
            type="text"
            className="cp-search"
            placeholder="Type to search…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            autoFocus={autoFocus}
            aria-label="Search countries"
            aria-controls="cp-list"
          />

          <ul
            id="cp-list"
            ref={listRef}
            role="listbox"
            className="cp-list"
          >
            {rows.length === 0 && (
              <li className="cp-empty">No matches.</li>
            )}
            {rows.map((row, i) => {
              const active = i === highlighted
              const isClear = row.kind === 'clear'
              return (
                <li
                  key={isClear ? '__clear' : row.code}
                  data-idx={i}
                  role="option"
                  aria-selected={active}
                  className={`cp-row ${active ? 'cp-row-active' : ''} ${isClear ? 'cp-row-clear' : ''}`}
                  onMouseEnter={() => setHighlighted(i)}
                  onMouseDown={(e) => { e.preventDefault(); pick(isClear ? '' : row.code) }}
                >
                  <span className="cp-row-flag">{isClear ? '—' : flagOf(row.code)}</span>
                  <span className="cp-row-name">{row.name}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
