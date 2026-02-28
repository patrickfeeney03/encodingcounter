import { useEffect, useMemo, useState } from 'react'
import { fromBase64Url } from '../lib/base64url'
import { deriveHmacKey, verifyHmacSha256Base64Url } from '../lib/crypto'
import { breakdownMs, getRemainingMs, pad2 } from '../lib/time'
import { buildCanonicalPayload, parseCountdownFromSearchParams, URL_VERSION } from '../lib/urlState'

type Props = { searchParams: URLSearchParams }

type VerifyState = 'unsigned' | 'needs-passphrase' | 'needs-verification' | 'verifying' | 'verified' | 'invalid'

export default function Countdown(props: Props) {
  const parsed = useMemo(() => parseCountdownFromSearchParams(props.searchParams), [props.searchParams])
  const [now, setNow] = useState(() => Date.now())
  const [passphrase, setPassphrase] = useState('')
  const [verifyState, setVerifyState] = useState<VerifyState>(() => {
    if (!parsed.ok || !parsed.value.signed) return 'unsigned'
    return 'needs-passphrase'
  })
  const [verifyDetail, setVerifyDetail] = useState<string | null>(() => {
    if (!parsed.ok || !parsed.value.signed) return null
    return 'Enter the passphrase to verify this link.'
  })

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [])

  async function verify() {
    if (!parsed.ok) return
    if (!parsed.value.signed) return

    setVerifyState('verifying')
    setVerifyDetail('Verifying…')
    if (!passphrase) {
      setVerifyState('needs-passphrase')
      setVerifyDetail('Enter the passphrase to verify this link.')
      return
    }
    try {
      const { t, l, signed } = parsed.value
      const payload = buildCanonicalPayload({ v: URL_VERSION, t, l, k: signed.k, i: signed.i })
      const saltBytes = fromBase64Url(signed.k)
      const key = await deriveHmacKey({ passphrase, saltBytes, iterations: signed.i })
      const ok = await verifyHmacSha256Base64Url({ key, data: payload, signatureBase64Url: signed.s })
      setVerifyState(ok ? 'verified' : 'invalid')
      setVerifyDetail(
        ok
          ? 'Verified: URL parameters match the signature.'
          : 'Invalid: URL was modified or passphrase is wrong.',
      )
    } catch (e) {
      setVerifyState('invalid')
      setVerifyDetail(e instanceof Error ? e.message : 'Verification failed.')
    }
  }

  if (!parsed.ok) {
    return (
      <section className="panel">
        <h1>Countdown</h1>
        <p className="error">{parsed.error}</p>
        <p>
          <a href="#/">Go back to Setup</a>
        </p>
      </section>
    )
  }

  const targetMs = parsed.value.t
  const remaining = getRemainingMs(targetMs, now)
  const parts = breakdownMs(remaining)
  const targetDate = new Date(targetMs)

  return (
    <section className="panel">
      <h1>{parsed.value.l ? parsed.value.l : 'Countdown'}</h1>

      <div className="countdown">
        <div className="bigTime">
          <span className="days">{parts.days}d</span>
          <span className="hms">
            {pad2(parts.hours)}:{pad2(parts.minutes)}:{pad2(parts.seconds)}
          </span>
        </div>
        <div className="muted">
          Target: {targetDate.toLocaleString()} ({targetDate.toISOString()})
        </div>
      </div>

      <div className="verify">
        <h2>Link verification</h2>
        <p className={`pill pill-${verifyState}`}>{verifyState}</p>
        {parsed.value.signed && (
          <label>
            Passphrase
            <input
              type="password"
              value={passphrase}
              onChange={(e) => {
                const next = e.target.value
                setPassphrase(next)
                if (!next) {
                  setVerifyState('needs-passphrase')
                  setVerifyDetail('Enter the passphrase to verify this link.')
                } else {
                  setVerifyState('needs-verification')
                  setVerifyDetail('Click verify to validate this link.')
                }
              }}
              placeholder="Enter passphrase to verify"
            />
          </label>
        )}

        {parsed.value.signed && (
          <div className="row" style={{ marginTop: 10 }}>
            <button className="primary" onClick={() => void verify()} disabled={verifyState === 'verifying'}>
              Verify
            </button>
          </div>
        )}
        {verifyDetail && <p className="muted">{verifyDetail}</p>}
        <p className="muted">
          Note: anyone with the passphrase can generate new signed links. This is tamper-evident only for people
          who know the passphrase.
        </p>
      </div>

      <p>
        <a href="#/">Back to Setup</a>
      </p>
    </section>
  )
}
