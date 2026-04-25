// MediaRecorder wrapper for capturing user speech as audio blobs.
// Used by the "bilingual" mic mode, which sends audio directly to Gemini
// for proper mixed-language (English + German) transcription.

export function isMediaRecorderSupported() {
  return typeof MediaRecorder !== 'undefined'
    && typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
}

function pickMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ]
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported?.(c)) return c
  }
  return '' // let the browser choose
}

/**
 * Starts an audio recording. Returns an object with:
 *  - stop(): Promise<Blob>  — stops and resolves to the recorded audio
 *  - cancel(): void         — discards the recording and releases mic
 *  - mimeType: string       — effective mime type
 */
export async function startAudioRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mimeType = pickMimeType()
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks = []
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }

  let stopped = false
  function releaseStream() {
    stream.getTracks().forEach(t => t.stop())
  }

  rec.start(250) // gather chunks every 250ms to flush promptly on stop

  return {
    get mimeType() { return rec.mimeType || mimeType || 'audio/webm' },
    stop: () => new Promise((resolve) => {
      if (stopped) return resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }))
      stopped = true
      rec.onstop = () => {
        releaseStream()
        resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }))
      }
      try { rec.stop() } catch { releaseStream(); resolve(new Blob(chunks)) }
    }),
    cancel: () => {
      if (stopped) return
      stopped = true
      try { rec.stop() } catch {}
      releaseStream()
    }
  }
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error || new Error('blob read failed'))
    reader.readAsDataURL(blob)
  })
}
