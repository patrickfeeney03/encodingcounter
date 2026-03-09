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
import { deriveHmacKey, hmacSha256Base64Url, verifyHmacSha256Base64Url } from '../lib/crypto'
import { getRemainingMs } from '../lib/time'
import { freezeElapsedItemAt } from '../lib/timerActions'
import {
  buildCanonicalPayload,
  buildTimerHash,
  encodeCollectionPayload,
  parseCountdownFromSearchParams,
  SINGLE_URL_VERSION,
  URL_VERSION,
} from '../lib/urlState'

type Props = { searchParams: URLSearchParams }

type VerifyState = 'unsigned' | 'needs-passphrase' | 'needs-verification' | 'verifying' | 'verified' | 'invalid'
type FreezeResult = {
  itemIndex: number
  signedLink: string | null
  status: string
  unsignedLink: string
}

const CLOSE_WARNING_WINDOW_MS = 10 * 60 * 1000
const CLOSE_WARNING_TEXT = 'A countdown alert is near. Closing this tab can prevent alerts.'

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export default function Countdown(props: Props) {
  const parsed = useMemo(() => parseCountdownFromSearchParams(props.searchParams), [props.searchParams])
  const [now, setNow] = useState(() => Date.now())
  const [passphrase, setPassphrase] = useState('')
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>(() =>
    getNotificationPermission(),
  )
  const [alertDetail, setAlertDetail] = useState<string | null>(null)
  const [freezeResult, setFreezeResult] = useState<FreezeResult | null>(null)
  const triggeredAlertsRef = useRef<Set<string>>(new Set())
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
    setFreezeResult(null)
  }, [props.searchParams])

  useEffect(() => {
    const syncPermission = () => setNotificationPermission(getNotificationPermission())
    syncPermission()
    document.addEventListener('visibilitychange', syncPermission)
    return () => document.removeEventListener('visibilitychange', syncPermission)
  }, [])

  const countdownEntries = useMemo(
    () =>
      parsed.ok
        ? parsed.value.items.flatMap((item, index) =>
            item.mode === 'countdown'
              ? [
                  {
                    item,
                    index,
                    key: `${index}:${item.targetMs}:${item.label ?? ''}`,
                    remaining: getRemainingMs(item.targetMs, now),
                  },
                ]
              : [],
          )
        : [],
    [now, parsed],
  )

  const shouldWarnOnClose = countdownEntries.some(
    (entry) => entry.remaining > 0 && entry.remaining <= CLOSE_WARNING_WINDOW_MS,
  )
  const invalidElapsedItem = parsed.ok
    ? parsed.value.items.find((item) => item.mode === 'elapsed' && item.targetMs > now)
    : null
  const hasCountdowns = countdownEntries.length > 0
  const hasPendingCountdowns = countdownEntries.some((entry) => entry.remaining > 0)

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
    if (!parsed.ok) return
    if (countdownEntries.length === 0) return

    const dueEntries = countdownEntries.filter(
      (entry) => entry.remaining <= 0 && !triggeredAlertsRef.current.has(entry.key),
    )
    if (dueEntries.length === 0) return

    for (const entry of dueEntries) triggeredAlertsRef.current.add(entry.key)

    let cancelled = false
    void (async () => {
      let notificationsSent = 0
      let audioPlayedCount = 0

      for (const entry of dueEntries) {
        const label = entry.item.label ? entry.item.label : `Countdown ${entry.index + 1}`
        const notificationSent = sendCompletionNotification({
          title: `${label} reached zero`,
          body: 'The countdown has completed.',
          tag: `countdown-complete-${entry.key}`,
        })
        if (notificationSent) notificationsSent += 1
        const audioPlayed = await playAlertTone()
        if (audioPlayed) audioPlayedCount += 1
        if (cancelled) return
      }

      const detailParts: string[] = []
      if (notificationsSent > 0) {
        detailParts.push(`${notificationsSent} browser notification${notificationsSent === 1 ? '' : 's'} sent.`)
      } else if (notificationPermission === 'unsupported') {
        detailParts.push('Browser notifications are unsupported.')
      } else if (notificationPermission === 'denied') {
        detailParts.push('Browser notifications are blocked.')
      } else {
        detailParts.push('Browser notifications are not enabled.')
      }

      if (audioPlayedCount > 0) {
        detailParts.push(`${audioPlayedCount} audio alert${audioPlayedCount === 1 ? '' : 's'} played.`)
      } else {
        detailParts.push('Audio alert blocked or unavailable.')
      }

      setAlertDetail(detailParts.join(' '))
    })()

    return () => {
      cancelled = true
    }
  }, [countdownEntries, notificationPermission, parsed])

  async function enableNotifications() {
    const permission = await requestNotificationPermission()
    setNotificationPermission(permission)
    if (permission === 'granted') {
      setAlertDetail('Notifications enabled. Countdown items can trigger browser notifications at zero while this tab is open.')
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
      let payload: string
      if (parsed.value.v === URL_VERSION) {
        payload = buildCanonicalPayload({
          v: URL_VERSION,
          d: parsed.value.encodedData ?? encodeCollectionPayload(parsed.value.items),
          k: parsed.value.signed.k,
          i: parsed.value.signed.i,
        })
      } else {
        const item = parsed.value.items[0]
        if (!item || item.mode === 'paused') throw new Error('Legacy links must contain a single live timer.')
        payload = buildCanonicalPayload({
          v: parsed.value.v === SINGLE_URL_VERSION ? SINGLE_URL_VERSION : parsed.value.v,
          t: item.targetMs,
          m: parsed.value.v >= SINGLE_URL_VERSION ? item.mode : undefined,
          l: item.label,
          k: parsed.value.signed.k,
          i: parsed.value.signed.i,
        })
      }

      const saltBytes = fromBase64Url(parsed.value.signed.k)
      const key = await deriveHmacKey({ passphrase, saltBytes, iterations: parsed.value.signed.i })
      const ok = await verifyHmacSha256Base64Url({
        key,
        data: payload,
        signatureBase64Url: parsed.value.signed.s,
      })
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

  async function freezeTimer(index: number) {
    if (!parsed.ok) return

    try {
      const nextItems = freezeElapsedItemAt(parsed.value.items, index, Date.now())
      const encodedData = encodeCollectionPayload(nextItems)
      const originAndPath = `${window.location.origin}${window.location.pathname}`
      const unsignedLink = `${originAndPath}${buildTimerHash({
        v: URL_VERSION,
        items: nextItems,
        encodedData,
      })}`

      let signedLink: string | null = null
      let status = 'Frozen link generated.'

      if (parsed.value.signed) {
        if (verifyState === 'verified' && passphrase) {
          const payload = buildCanonicalPayload({
            v: URL_VERSION,
            d: encodedData,
            k: parsed.value.signed.k,
            i: parsed.value.signed.i,
          })
          const saltBytes = fromBase64Url(parsed.value.signed.k)
          const key = await deriveHmacKey({ passphrase, saltBytes, iterations: parsed.value.signed.i })
          const s = await hmacSha256Base64Url({ key, data: payload })
          signedLink = `${originAndPath}${buildTimerHash({
            v: URL_VERSION,
            items: nextItems,
            encodedData,
            signed: { k: parsed.value.signed.k, i: parsed.value.signed.i, s },
          })}`
          status = 'Frozen unsigned and signed links generated.'
        } else {
          status = 'Frozen unsigned link generated. Verify this page first to also generate a signed frozen link.'
        }
      }

      setFreezeResult({ itemIndex: index, signedLink, status, unsignedLink })
    } catch (e) {
      setFreezeResult({
        itemIndex: index,
        signedLink: null,
        status: e instanceof Error ? e.message : 'Failed to freeze this timer.',
        unsignedLink: '',
      })
    }
  }

  async function copyFrozenLink(link: string) {
    const ok = await copyToClipboard(link)
    if (!ok) window.prompt('Copy this link:', link)
  }

  if (!parsed.ok || invalidElapsedItem) {
    return (
      <section className="panel">
        <h1>Timer</h1>
        <p className="error">
          {parsed.ok ? 'Live Time Since items must point to a past date/time.' : parsed.error}
        </p>
        <p>
          <a href="#/">Go back to Setup</a>
        </p>
      </section>
    )
  }

  const isMulti = parsed.value.items.length > 1

  function renderFreezeControls(index: number, canFreeze: boolean) {
    if (!canFreeze) return null
    const result = freezeResult?.itemIndex === index ? freezeResult : null
    const signedLink = result?.signedLink ?? null

    return (
      <div className="freezePanel">
        <div className="row">
          <button className="secondary" onClick={() => void freezeTimer(index)}>
            Freeze This Timer
          </button>
        </div>
        {result && <p className="muted">{result.status}</p>}
        {result?.unsignedLink && (
          <div className="linkRow">
            <input readOnly value={result.unsignedLink} />
            <button onClick={() => void copyFrozenLink(result.unsignedLink)}>Copy</button>
          </div>
        )}
        {signedLink && (
          <div className="linkRow">
            <input readOnly value={signedLink} />
            <button onClick={() => void copyFrozenLink(signedLink)}>Copy</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="panel">
      {isMulti ? <h1>Timers</h1> : <TimerSummary item={parsed.value.items[0]} nowMs={now} />}

      {!isMulti && renderFreezeControls(0, parsed.value.items[0].mode === 'elapsed')}

      {isMulti && (
        <div className="timerGrid">
          {parsed.value.items.map((item, index) => (
            <div className="timerCard" key={`${item.mode}-${item.label ?? index}-${index}`}>
              <TimerSummary headingLevel="h2" item={item} nowMs={now} />
              {renderFreezeControls(index, item.mode === 'elapsed')}
            </div>
          ))}
        </div>
      )}

      {hasCountdowns && (
        <div className="alerts">
          <h2>Alerts</h2>
          <p className="muted">Audio plays when any countdown item reaches zero while this tab stays open.</p>
          <p className="muted">Notification permission: {notificationPermission}</p>
          {notificationPermission === 'default' && hasPendingCountdowns && (
            <div className="row" style={{ marginTop: 10 }}>
              <button className="primary" onClick={() => void enableNotifications()}>
                Enable browser notifications
              </button>
            </div>
          )}
          {shouldWarnOnClose && (
            <p className="warning">
              Alert window is active (final 10 minutes for at least one countdown). Closing this tab can prevent alerts.
            </p>
          )}
          {!hasPendingCountdowns && <p className="status">All countdowns are complete.</p>}
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
          Note: anyone with the passphrase can generate new signed links. This is tamper-evident only for people who know the passphrase.
        </p>
      </div>

      <p>
        <a href="#/">Back to Setup</a>
      </p>
    </section>
  )
}
