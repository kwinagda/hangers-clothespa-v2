type NotificationTimelineEntry = {
  id: string
  stage: string
  eventType?: string | null
  createdAt: string | Date
  metadata?: Record<string, any> | null
  [key: string]: any
}

const outcomeStages = new Set(['WHATSAPP_SENT', 'WHATSAPP_FAILED', 'WHATSAPP_SKIPPED'])

const lifecycleKey = (entry: NotificationTimelineEntry) => {
  if (entry.eventType !== 'NOTIFICATION' || !String(entry.stage || '').startsWith('WHATSAPP_')) return ''
  const metadata = entry.metadata || {}
  const eventType = metadata.outboxEventType || ''
  const paymentId = metadata.payload?.paymentId
  if (eventType === 'PAYMENT_RECEIVED' && paymentId) return `payment:${paymentId}`
  if (metadata.outboxEventId) return `outbox:${metadata.outboxEventId}`
  if (eventType === 'ORDER_UPDATED') return `order-updated:${JSON.stringify(metadata.payload || {})}`
  const status = metadata.status || metadata.payload?.status
  if (eventType === 'ORDER_STATUS' && status) return `order-status:${status}`
  return ''
}

const sameLifecycle = (left: NotificationTimelineEntry, right: NotificationTimelineEntry) => {
  const leftKey = lifecycleKey(left)
  const rightKey = lifecycleKey(right)
  if (!leftKey || leftKey !== rightKey) return false
  const leftOutboxId = left.metadata?.outboxEventId
  const rightOutboxId = right.metadata?.outboxEventId
  return !(leftOutboxId && rightOutboxId && leftOutboxId !== rightOutboxId)
}

export const collapseQueuedWhatsAppEvents = <T extends NotificationTimelineEntry>(entries: T[]): T[] => {
  const pending = entries.filter((entry) => entry.stage === 'WHATSAPP_PENDING' && lifecycleKey(entry))
  const outcomes = entries.filter((entry) => outcomeStages.has(entry.stage) && lifecycleKey(entry))

  const enriched = entries.map((entry) => {
    const queued = entry.stage !== 'WHATSAPP_PENDING'
      ? pending.find((candidate) => sameLifecycle(candidate, entry))
      : undefined
    if (entry.stage === 'WHATSAPP_PENDING' && outcomes.some((candidate) => sameLifecycle(entry, candidate))) {
      return null
    }
    if (outcomeStages.has(entry.stage) && queued) {
      return { ...entry, notificationQueuedAt: queued.createdAt } as T
    }
    return entry
  })

  return enriched.filter((entry): entry is T => entry !== null)
}
