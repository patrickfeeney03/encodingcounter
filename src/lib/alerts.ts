export type NotificationPermissionState = NotificationPermission | 'unsupported'

type AudioContextConstructor = {
  new (): AudioContext
}

function getAudioContextConstructor(): AudioContextConstructor | null {
  const audioContext = (
    globalThis as typeof globalThis & {
      AudioContext?: AudioContextConstructor
      webkitAudioContext?: AudioContextConstructor
    }
  ).AudioContext
  const webkitAudioContext = (
    globalThis as typeof globalThis & {
      AudioContext?: AudioContextConstructor
      webkitAudioContext?: AudioContextConstructor
    }
  ).webkitAudioContext
  return audioContext ?? webkitAudioContext ?? null
}

export async function playAlertTone(): Promise<boolean> {
  const AudioContextCtor = getAudioContextConstructor()
  if (!AudioContextCtor) return false

  let context: AudioContext | null = null
  try {
    context = new AudioContextCtor()
    if (context.state === 'suspended') await context.resume()

    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const start = context.currentTime
    const end = start + 0.8

    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(880, start)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.2, start + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)

    oscillator.connect(gain)
    gain.connect(context.destination)

    await new Promise<void>((resolve) => {
      oscillator.onended = () => resolve()
      oscillator.start(start)
      oscillator.stop(end)
    })

    return true
  } catch {
    return false
  } finally {
    if (context) await context.close().catch(() => undefined)
  }
}

export function canUseNotifications(): boolean {
  return typeof Notification !== 'undefined'
}

export function getNotificationPermission(): NotificationPermissionState {
  if (!canUseNotifications()) return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!canUseNotifications()) return 'unsupported'
  return Notification.requestPermission()
}

export function sendCompletionNotification(input: { title: string; body: string; tag?: string }): boolean {
  if (!canUseNotifications()) return false
  if (Notification.permission !== 'granted') return false

  try {
    new Notification(input.title, {
      body: input.body,
      tag: input.tag ?? 'countdown-complete',
      requireInteraction: true,
    })
    return true
  } catch {
    return false
  }
}
