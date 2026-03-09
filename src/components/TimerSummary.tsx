import { breakdownMs, getElapsedMs, getRemainingMs, pad2 } from '../lib/time'
import type { TimerItem } from '../lib/urlState'

type Props = {
  headingLevel?: 'h1' | 'h2' | 'h3'
  item: TimerItem
  nowMs: number
}

export default function TimerSummary(props: Props) {
  const Heading = props.headingLevel ?? 'h1'
  const title = props.item.label ? props.item.label : props.item.mode === 'countdown' ? 'Countdown' : 'Time Since'
  const durationMs =
    props.item.mode === 'countdown'
      ? getRemainingMs(props.item.targetMs, props.nowMs)
      : props.item.mode === 'elapsed'
        ? getElapsedMs(props.item.targetMs, props.nowMs)
        : props.item.durationMs
  const parts = breakdownMs(durationMs)

  return (
    <>
      <Heading>{title}</Heading>

      <div className="countdown">
        <div className="bigTime">
          <span className="days">{parts.days}d</span>
          <span className="hms">
            {pad2(parts.hours)}:{pad2(parts.minutes)}:{pad2(parts.seconds)}
          </span>
        </div>
        {props.item.mode !== 'paused' && (
          <div className="muted">
            {props.item.mode === 'elapsed' ? 'Since' : 'Target'}: {new Date(props.item.targetMs).toLocaleString()} (
            {new Date(props.item.targetMs).toISOString()})
          </div>
        )}
        {props.item.mode === 'paused' && <div className="muted">Paused at this elapsed value.</div>}
      </div>
    </>
  )
}
