import { useEffect, useMemo, useState } from 'react'
import TimerSummary from '../components/TimerSummary'
import { toBase64Url } from '../lib/base64url'
import { deriveHmacKey, hmacSha256Base64Url } from '../lib/crypto'
import {
  COUNTDOWN_PAST_STATUS,
  ELAPSED_FUTURE_STATUS,
  INVALID_DATETIME_STATUS,
  getMinuteStartMs,
  getSetupValidationWarning,
} from '../lib/setupValidation'
import {
  buildCanonicalPayload,
  buildCountdownHash,
  type CountdownMode,
  DEFAULT_PBKDF2_ITERATIONS,
  URL_VERSION,
} from '../lib/urlState'

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function nowLocalDatetime(): string {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const yyyy = d.getFullYear()
  const mm = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const mi = pad(d.getMinutes())
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

export default function Setup() {
  const [mode, setMode] = useState<CountdownMode>('countdown')
  const [datetimeLocal, setDatetimeLocal] = useState(nowLocalDatetime)
  const [label, setLabel] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [unsignedLink, setUnsignedLink] = useState<string | null>(null)
  const [signedLink, setSignedLink] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    setUnsignedLink(null)
    setSignedLink(null)
    setStatus(null)
  }, [mode])

  const targetMs = useMemo(() => {
    if (!datetimeLocal) return null
    const d = new Date(datetimeLocal)
    const t = d.getTime()
    return Number.isFinite(t) ? t : null
  }, [datetimeLocal])
  const validationWarning = getSetupValidationWarning({ mode, nowMs: now, targetMs })

  const originAndPath = `${window.location.origin}${window.location.pathname}`
  const modeDescription = mode === 'elapsed' ? 'elapsed-time' : 'countdown'
  const isWarningStatus =
    status === INVALID_DATETIME_STATUS || status === COUNTDOWN_PAST_STATUS || status === ELAPSED_FUTURE_STATUS

  async function generateLinks() {
    setStatus(null)
    setUnsignedLink(null)
    setSignedLink(null)
    const currentNow = Date.now()
    const currentMinuteStart = getMinuteStartMs(currentNow)

    if (!targetMs) {
      setStatus(INVALID_DATETIME_STATUS)
      return
    }
    if (mode === 'countdown' && targetMs < currentMinuteStart) {
      setStatus(COUNTDOWN_PAST_STATUS)
      return
    }
    if (mode === 'elapsed' && targetMs > currentNow) {
      setStatus(ELAPSED_FUTURE_STATUS)
      return
    }

    const unsignedHash = buildCountdownHash({ v: URL_VERSION, t: targetMs, mode, l: label || undefined })
    setUnsignedLink(`${originAndPath}${unsignedHash}`)

    if (!passphrase) {
      setStatus(`Unsigned ${modeDescription} link generated. Add a passphrase to generate a signed link.`)
      return
    }

    if (!globalThis.crypto?.getRandomValues) {
      setStatus('This browser does not support crypto.getRandomValues.')
      return
    }

    const saltBytes = new Uint8Array(16)
    globalThis.crypto.getRandomValues(saltBytes)
    const k = toBase64Url(saltBytes)
    const i = DEFAULT_PBKDF2_ITERATIONS

    const payload = buildCanonicalPayload({
      v: URL_VERSION,
      t: targetMs,
      m: mode,
      l: label || undefined,
      k,
      i,
    })

    const key = await deriveHmacKey({ passphrase, saltBytes, iterations: i })
    const s = await hmacSha256Base64Url({ key, data: payload })
    const signedHash = buildCountdownHash({
      v: URL_VERSION,
      t: targetMs,
      mode,
      l: label || undefined,
      signed: { k, i, s },
    })
    setSignedLink(`${originAndPath}${signedHash}`)
    setStatus(`Signed ${modeDescription} link generated. Recipients need the same passphrase to verify it.`)
  }

  async function copyLink(link: string) {
    const ok = await copyToClipboard(link)
    setStatus(ok ? 'Copied to clipboard.' : 'Copy failed (browser blocked clipboard).')
    if (!ok) window.prompt('Copy this link:', link)
  }

  return (
    <section className="panel">
      <h1>Setup</h1>
      <p className="muted">
        Create a countdown or time-since link. Signed links are tamper-evident for anyone who knows the passphrase.
      </p>
      <p className="muted">
        Anyone with the passphrase can also generate new signed links (there is no way around this without a backend or
        publisher key pinning).
      </p>

      <div className="setupLayout">
        <div className="setupPrimary">
          <div className="form">
            <fieldset className="choiceGroup">
              <legend>Mode</legend>
              <div className="modeToggle" role="radiogroup" aria-label="Mode">
                <button
                  type="button"
                  className={mode === 'countdown' ? 'modeOption modeOptionActive' : 'modeOption'}
                  onClick={() => setMode('countdown')}
                  aria-pressed={mode === 'countdown'}
                >
                  Countdown
                </button>
                <button
                  type="button"
                  className={mode === 'elapsed' ? 'modeOption modeOptionActive' : 'modeOption'}
                  onClick={() => setMode('elapsed')}
                  aria-pressed={mode === 'elapsed'}
                >
                  Time Since
                </button>
              </div>
            </fieldset>

            <label>
              Date/time (local time)
              <input
                type="datetime-local"
                value={datetimeLocal}
                onChange={(e) => setDatetimeLocal(e.target.value)}
              />
            </label>

            <label>
              Label (optional)
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Launch"
                maxLength={140}
              />
            </label>

            <label>
              Passphrase (optional, for signed links)
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Shared secret"
              />
            </label>

            <div className="row">
              {!validationWarning && (
                <button className="primary" onClick={() => void generateLinks()}>
                  Generate links
                </button>
              )}
            </div>
            {validationWarning && <p className="warning setupWarning">{validationWarning}</p>}
          </div>
        </div>

        <div className="setupSecondary">
          {unsignedLink && (
            <div className="result">
              <h2>Unsigned link</h2>
              <div className="linkRow">
                <input readOnly value={unsignedLink} />
                <button onClick={() => void copyLink(unsignedLink)}>Copy</button>
              </div>
            </div>
          )}

          {signedLink && (
            <div className="result">
              <h2>Signed link</h2>
              <div className="linkRow">
                <input readOnly value={signedLink} />
                <button onClick={() => void copyLink(signedLink)}>Copy</button>
              </div>
            </div>
          )}

          {status && <p className={isWarningStatus ? 'warning setupWarning' : 'status'}>{status}</p>}

          <div className="result previewPanel">
            <h2>Preview</h2>
            {validationWarning && <p className="muted">Correct the date/time above to preview the generated page.</p>}
            {!validationWarning && targetMs && (
              <>
                <TimerSummary label={label || undefined} mode={mode} nowMs={now} targetMs={targetMs} />
                <p className="muted previewNote">
                  Alerts and link verification appear on the shared page below this timer.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
