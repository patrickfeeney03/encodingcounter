import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getNotificationPermission,
  playAlertTone,
  requestNotificationPermission,
  sendCompletionNotification,
  type NotificationPermissionState,
} from '../lib/alerts'
import TimerSummary from '../components/TimerSummary'
import { fromBase64Url } from '../lib/base64url'
import { deriveHmacKey, verifyHmacSha256Base64Url } from '../lib/crypto'
import { getRemainingMs } from '../lib/time'
import { buildCanonicalPayload, parseCountdownFromSearchParams, URL_VERSION } from '../lib/urlState'

type Props = { searchParams: URLSearchParams }

type VerifyState = 'unsigned' | 'needs-passphrase' | 'needs-verification' | 'verifying' | 'verified' | 'invalid'

const CLOSE_WARNING_WINDOW_MS = 10 * 60 * 1000
const CLOSE_WARNING_TEXT = 'A countdown alert is near. Closing this tab can prevent alerts.'

export default function Countdown(props: Props) {
  const parsed = useMemo(() => parseCountdownFromSearchParams(props.searchParams), [props.searchParams])
  const [now, setNow] = useState(() => Date.now())
  const [passphrase, setPassphrase] = useState('')
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>(() =>
    getNotificationPermission(),
  )
  const [alertDetail, setAlertDetail] = useState<string | null>(null)
  const hasTriggeredAlertRef = useRef(false)
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

  useEffect(() => {
    const syncPermission = () => setNotificationPermission(getNotificationPermission())
    syncPermission()
    document.addEventListener('visibilitychange', syncPermission)
    return () => document.removeEventListener('visibilitychange', syncPermission)
  }, [])

  const isElapsed = parsed.ok && parsed.value.mode === 'elapsed'
  const targetMs = parsed.ok ? parsed.value.t : 0
  const remaining = parsed.ok && !isElapsed ? getRemainingMs(targetMs, now) : 0
  const shouldWarnOnClose = parsed.ok && !isElapsed && remaining > 0 && remaining <= CLOSE_WARNING_WINDOW_MS
  const elapsedLinkStartsInFuture = parsed.ok && isElapsed && targetMs > now

  useEffect(() => {
    if (!shouldWarnOnClose) return

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = CLOSE_WARNING_TEXT
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [shouldWarnOnClose])

  useEffect(() => {
    if (isElapsed) return
    if (!parsed.ok) return
    if (remaining > 0) return
    if (hasTriggeredAlertRef.current) return
    hasTriggeredAlertRef.current = true

    const label = parsed.value.l ? parsed.value.l : 'Countdown'
    const notificationSent = sendCompletionNotification({
      title: `${label} reached zero`,
      body: 'The countdown has completed.',
    })
    const detailParts: string[] = []
    if (notificationSent) {
      detailParts.push('Browser notification sent.')
    } else if (notificationPermission === 'unsupported') {
      detailParts.push('Browser notifications are unsupported.')
    } else if (notificationPermission === 'denied') {
      detailParts.push('Browser notifications are blocked.')
    } else {
      detailParts.push('Browser notifications are not enabled.')
    }

    let cancelled = false
    void (async () => {
      const audioPlayed = await playAlertTone()
      if (cancelled) return
      detailParts.push(audioPlayed ? 'Audio alert played.' : 'Audio alert blocked or unavailable.')
      setAlertDetail(detailParts.join(' '))
    })()

    return () => {
      cancelled = true
    }
  }, [isElapsed, parsed, remaining, notificationPermission])

  async function enableNotifications() {
    const permission = await requestNotificationPermission()
    setNotificationPermission(permission)
    if (permission === 'granted') {
      setAlertDetail('Notifications enabled. You will receive a browser notification at zero while this tab is open.')
      return
    }
    if (permission === 'denied') {
      setAlertDetail('Notification permission denied. Re-enable notifications from browser site settings.')
      return
    }
    if (permission === 'default') {
      setAlertDetail('Notification permission was dismissed.')
      return
    }
    setAlertDetail('Notifications are unsupported in this browser.')
  }

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
      const { mode, signed, t, l, v } = parsed.value
      const payload = buildCanonicalPayload({
        v,
        t,
        m: v === URL_VERSION ? mode : undefined,
        l,
        k: signed.k,
        i: signed.i,
      })
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

  if (!parsed.ok || elapsedLinkStartsInFuture) {
    return (
      <section className="panel">
        <h1>Timer</h1>
        <p className="error">
          {parsed.ok ? 'Elapsed links must point to a past date/time.' : parsed.error}
        </p>
        <p>
          <a href="#/">Go back to Setup</a>
        </p>
      </section>
    )
  }

  return (
    <section className="panel">
      <TimerSummary label={parsed.value.l} mode={parsed.value.mode} nowMs={now} targetMs={targetMs} />

      {!isElapsed && (
        <div className="alerts">
          <h2>Alerts</h2>
          <p className="muted">Audio plays at zero while this tab stays open.</p>
          <p className="muted">Notification permission: {notificationPermission}</p>
          {notificationPermission === 'default' && remaining > 0 && (
            <div className="row" style={{ marginTop: 10 }}>
              <button className="primary" onClick={() => void enableNotifications()}>
                Enable browser notifications
              </button>
            </div>
          )}
          {shouldWarnOnClose && (
            <p className="warning">
              Alert window is active (final 10 minutes). Closing this tab can prevent alerts.
            </p>
          )}
          {remaining <= 0 && <p className="status">Countdown complete.</p>}
          {alertDetail && <p className="muted">{alertDetail}</p>}
          <p className="muted">
            Limitation: without a backend or push service, alerts cannot continue after this tab is closed.
          </p>
        </div>
      )}

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
