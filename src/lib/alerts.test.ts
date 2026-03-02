import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canUseNotifications,
  getNotificationPermission,
  playAlertTone,
  requestNotificationPermission,
  sendCompletionNotification,
} from './alerts'

type MockNotificationRecord = {
  title: string
  options: NotificationOptions | undefined
}

class MockNotification {
  static permission: NotificationPermission = 'default'
  static requestPermission = vi.fn(async () => MockNotification.permission)
  static records: MockNotificationRecord[] = []

  constructor(title: string, options?: NotificationOptions) {
    MockNotification.records.push({ title, options })
  }
}

const originalNotification = (
  globalThis as typeof globalThis & { Notification?: typeof Notification }
).Notification

function clearNotificationGlobal() {
  Reflect.deleteProperty(globalThis, 'Notification')
}

function setNotificationGlobal(value: typeof Notification) {
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    writable: true,
    value,
  })
}

afterEach(() => {
  MockNotification.permission = 'default'
  MockNotification.requestPermission.mockClear()
  MockNotification.records = []

  if (originalNotification) {
    setNotificationGlobal(originalNotification)
  } else {
    clearNotificationGlobal()
  }
})

describe('alerts', () => {
  it('reports unsupported notifications when Notification API is unavailable', async () => {
    clearNotificationGlobal()
    expect(canUseNotifications()).toBe(false)
    expect(getNotificationPermission()).toBe('unsupported')
    expect(await requestNotificationPermission()).toBe('unsupported')
    expect(sendCompletionNotification({ title: 'Done', body: 'Countdown finished' })).toBe(false)
  })

  it('sends notification only when permission is granted', async () => {
    setNotificationGlobal(MockNotification as unknown as typeof Notification)
    MockNotification.permission = 'granted'
    MockNotification.requestPermission.mockResolvedValueOnce('granted')

    expect(canUseNotifications()).toBe(true)
    expect(getNotificationPermission()).toBe('granted')
    expect(await requestNotificationPermission()).toBe('granted')
    expect(sendCompletionNotification({ title: 'Done', body: 'Countdown finished' })).toBe(true)
    expect(MockNotification.records).toHaveLength(1)
    expect(MockNotification.records[0]?.title).toBe('Done')
  })

  it('does not send notification when permission is denied', () => {
    setNotificationGlobal(MockNotification as unknown as typeof Notification)
    MockNotification.permission = 'denied'

    expect(sendCompletionNotification({ title: 'Done', body: 'Countdown finished' })).toBe(false)
    expect(MockNotification.records).toHaveLength(0)
  })

  it('returns false for audio when AudioContext is unavailable', async () => {
    expect(await playAlertTone()).toBe(false)
  })
})
