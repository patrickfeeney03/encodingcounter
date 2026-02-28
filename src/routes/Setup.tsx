import { useMemo, useState } from 'react'
import { toBase64Url } from '../lib/base64url'
import { deriveHmacKey, hmacSha256Base64Url } from '../lib/crypto'
import {
  buildCanonicalPayload,
  buildCountdownHash,
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

function nowPlusOneHourLocalDatetime(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  const pad = (n: number) => n.toString().padStart(2, '0')
  const yyyy = d.getFullYear()
  const mm = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const mi = pad(d.getMinutes())
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

export default function Setup() {
  const [datetimeLocal, setDatetimeLocal] = useState(nowPlusOneHourLocalDatetime)
  const [label, setLabel] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [unsignedLink, setUnsignedLink] = useState<string | null>(null)
  const [signedLink, setSignedLink] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const targetMs = useMemo(() => {
    if (!datetimeLocal) return null
    const d = new Date(datetimeLocal)
    const t = d.getTime()
    return Number.isFinite(t) ? t : null
  }, [datetimeLocal])

  const originAndPath = `${window.location.origin}${window.location.pathname}`

  async function generateLinks() {
    setStatus(null)
    setSignedLink(null)

    if (!targetMs) {
      setStatus('Please choose a valid date/time.')
      return
    }

    const unsignedHash = buildCountdownHash({ v: URL_VERSION, t: targetMs, l: label || undefined })
    setUnsignedLink(`${originAndPath}${unsignedHash}`)

    if (!passphrase) {
      setStatus('Unsigned link generated. Add a passphrase to generate a signed link.')
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
      l: label || undefined,
      k,
      i,
    })

    const key = await deriveHmacKey({ passphrase, saltBytes, iterations: i })
    const s = await hmacSha256Base64Url({ key, data: payload })
    const signedHash = buildCountdownHash({
      v: URL_VERSION,
      t: targetMs,
      l: label || undefined,
      signed: { k, i, s },
    })
    setSignedLink(`${originAndPath}${signedHash}`)
    setStatus('Signed link generated. Recipients need the same passphrase to verify it.')
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
        Create a countdown link. Signed links are tamper-evident for anyone who knows the passphrase.
      </p>

      <div className="form">
        <label>
          Target (local time)
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
          <button className="primary" onClick={() => void generateLinks()}>
            Generate links
          </button>
          <a className="secondary" href="#/c">
            Open countdown (empty)
          </a>
        </div>
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
    </section>
  )
}

