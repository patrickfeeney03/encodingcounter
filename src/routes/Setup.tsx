import { useEffect, useMemo, useState } from 'react'
import TimerSummary from '../components/TimerSummary'
import { toBase64Url } from '../lib/base64url'
import { deriveHmacKey, hmacSha256Base64Url } from '../lib/crypto'
import {
  buildTimerItemFromDraft,
  getSetupValidationWarning,
  type TimerDraft,
} from '../lib/setupValidation'
import {
  buildCanonicalPayload,
  buildTimerHash,
  encodeCollectionPayload,
  type CountdownMode,
  DEFAULT_PBKDF2_ITERATIONS,
  URL_VERSION,
} from '../lib/urlState'

type DraftRow = {
  datetimeLocal: string
  id: string
  label: string
  mode: CountdownMode
  paused: boolean
}

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

function parseDatetimeLocal(input: string): number | null {
  if (!input) return null
  const d = new Date(input)
  const t = d.getTime()
  return Number.isFinite(t) ? t : null
}

function createDraftRow(): DraftRow {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    mode: 'countdown',
    paused: false,
    datetimeLocal: nowLocalDatetime(),
    label: '',
  }
}

function moveRow(rows: DraftRow[], fromIndex: number, toIndex: number): DraftRow[] {
  const next = [...rows]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

export default function Setup() {
  const [rows, setRows] = useState<DraftRow[]>(() => [createDraftRow()])
  const [passphrase, setPassphrase] = useState('')
  const [unsignedLink, setUnsignedLink] = useState<string | null>(null)
  const [signedLink, setSignedLink] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [])

  const derivedRows = useMemo(
    () =>
      rows.map((row) => {
        const targetMs = parseDatetimeLocal(row.datetimeLocal)
        const draft: TimerDraft = {
          mode: row.mode,
          paused: row.paused,
          targetMs,
          label: row.label || undefined,
        }
        const warning = getSetupValidationWarning({ mode: row.mode, nowMs: now, targetMs })
        const previewItem = warning ? null : buildTimerItemFromDraft(draft, now)
        return {
          ...row,
          draft,
          previewItem,
          warning,
        }
      }),
    [now, rows],
  )

  const hasValidationWarnings = derivedRows.some((row) => row.warning !== null)
  const originAndPath = `${window.location.origin}${window.location.pathname}`

  function clearGeneratedLinks(options?: { keepUnsigned?: boolean }) {
    if (!options?.keepUnsigned) setUnsignedLink(null)
    setSignedLink(null)
    setStatus(null)
  }

  function updateRow(id: string, updater: (row: DraftRow) => DraftRow) {
    clearGeneratedLinks()
    setRows((current) => current.map((row) => (row.id === id ? updater(row) : row)))
  }

  async function generateLinks() {
    setStatus(null)
    setUnsignedLink(null)
    setSignedLink(null)
    const currentNow = Date.now()

    let items
    try {
      items = rows.map((row) =>
        buildTimerItemFromDraft(
          {
            mode: row.mode,
            paused: row.paused,
            targetMs: parseDatetimeLocal(row.datetimeLocal),
            label: row.label || undefined,
          },
          currentNow,
        ),
      )
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Please fix the timer configuration.')
      return
    }

    const encodedData = encodeCollectionPayload(items)
    const unsignedHash = buildTimerHash({ v: URL_VERSION, items, encodedData })
    setUnsignedLink(`${originAndPath}${unsignedHash}`)

    if (!passphrase) {
      setStatus('Unsigned multi-timer link generated. Add a passphrase to generate a signed link.')
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
      d: encodedData,
      k,
      i,
    })

    const key = await deriveHmacKey({ passphrase, saltBytes, iterations: i })
    const s = await hmacSha256Base64Url({ key, data: payload })
    const signedHash = buildTimerHash({
      v: URL_VERSION,
      items,
      encodedData,
      signed: { k, i, s },
    })
    setSignedLink(`${originAndPath}${signedHash}`)
    setStatus('Signed multi-timer link generated. Recipients need the same passphrase to verify it.')
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
        Create one shared link with multiple countdowns, live time-since timers, or paused time-since values.
      </p>
      <p className="muted">
        Anyone with the passphrase can still generate new signed links. Signed links are only tamper-evident for people
        who know the passphrase.
      </p>
      <p className="muted">
        If you want to pause a Time Since later, open setup again later, use the same original date/time, turn on
        `Pause at generated value`, and generate a new link at that moment.
      </p>

      <div className="form">
        {derivedRows.map((row, index) => (
          <div className="timerDraftCard" key={row.id}>
            <div className="timerDraftHeader">
              <h2>Timer {index + 1}</h2>
              <div className="row">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    clearGeneratedLinks()
                    setRows((current) => moveRow(current, index, index - 1))
                  }}
                  disabled={index === 0}
                >
                  Up
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    clearGeneratedLinks()
                    setRows((current) => moveRow(current, index, index + 1))
                  }}
                  disabled={index === rows.length - 1}
                >
                  Down
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    clearGeneratedLinks()
                    setRows((current) => (current.length === 1 ? current : current.filter((item) => item.id !== row.id)))
                  }}
                  disabled={rows.length === 1}
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="timerDraftBody">
              <div className="timerDraftFields">
                <div className="modeToggle" role="radiogroup" aria-label={`Timer ${index + 1} mode`}>
                  <button
                    type="button"
                    className={row.mode === 'countdown' ? 'modeOption modeOptionActive' : 'modeOption'}
                    onClick={() =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        mode: 'countdown',
                        paused: false,
                      }))
                    }
                    aria-pressed={row.mode === 'countdown'}
                  >
                    Countdown
                  </button>
                  <button
                    type="button"
                    className={row.mode === 'elapsed' ? 'modeOption modeOptionActive' : 'modeOption'}
                    onClick={() => updateRow(row.id, (current) => ({ ...current, mode: 'elapsed' }))}
                    aria-pressed={row.mode === 'elapsed'}
                  >
                    Time Since
                  </button>
                </div>

                <label>
                  Date/time (local time)
                  <input
                    type="datetime-local"
                    value={row.datetimeLocal}
                    onChange={(e) => updateRow(row.id, (current) => ({ ...current, datetimeLocal: e.target.value }))}
                  />
                </label>

                <label>
                  Label (optional)
                  <input
                    type="text"
                    value={row.label}
                    onChange={(e) => updateRow(row.id, (current) => ({ ...current, label: e.target.value }))}
                    placeholder="e.g. Launch"
                    maxLength={140}
                  />
                </label>

                {row.mode === 'elapsed' && (
                  <label className="inlineChoice">
                    <input
                      type="checkbox"
                      checked={row.paused}
                      onChange={(e) => updateRow(row.id, (current) => ({ ...current, paused: e.target.checked }))}
                    />
                    <span>Pause at generated value</span>
                  </label>
                )}

                {row.mode === 'elapsed' && row.paused && (
                  <p className="muted">This will freeze the elapsed value at the moment you generate the link.</p>
                )}

                {row.warning && <p className="warning setupWarning">{row.warning}</p>}
              </div>

              <div className="timerDraftPreview">
                <h3>Preview</h3>
                {row.previewItem ? (
                  <TimerSummary headingLevel="h3" item={row.previewItem} nowMs={now} />
                ) : (
                  <p className="muted">Fix this timer’s date/time to preview it.</p>
                )}
              </div>
            </div>
          </div>
        ))}

        <div className="row">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              clearGeneratedLinks()
              setRows((current) => [...current, createDraftRow()])
            }}
          >
            Add another timer
          </button>
        </div>

        <div className="generationPanel">
          <label>
            Passphrase (optional, for signed links)
            <input
              type="password"
              value={passphrase}
              onChange={(e) => {
                clearGeneratedLinks({ keepUnsigned: true })
                setPassphrase(e.target.value)
              }}
              placeholder="Shared secret"
            />
          </label>

          <div className="row">
            {!hasValidationWarnings && (
              <button className="primary" onClick={() => void generateLinks()}>
                Generate links
              </button>
            )}
          </div>

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

          {status && <p className="status">{status}</p>}
        </div>
      </div>
    </section>
  )
}
