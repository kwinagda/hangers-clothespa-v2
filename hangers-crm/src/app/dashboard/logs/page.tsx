'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { logsAPI } from '@/lib/api'

const filterOptions = [
  { key: 'ALL', label: 'All Logs', params: {} },
  { key: 'WHATSAPP_FAILED', label: 'WhatsApp Failed', params: { outcome: 'FAILED' } },
  { key: 'WHATSAPP_SENT', label: 'WhatsApp Sent', params: { outcome: 'SENT' } },
  { key: 'NOTIFICATION', label: 'Notifications', params: { eventType: 'NOTIFICATION' } },
  { key: 'ACTION_ATTEMPTED', label: 'Action Attempted', params: { eventType: 'ACTION_ATTEMPTED' } },
  { key: 'ACTION_SUCCEEDED', label: 'Action Completed', params: { eventType: 'ACTION_SUCCEEDED' } },
  { key: 'ACTION_FAILED', label: 'Action Failed', params: { eventType: 'ACTION_FAILED' } },
  { key: 'WORKFLOW', label: 'Workflow', params: { eventType: 'WORKFLOW_TRANSITION' } },
]

const stageLabel = (stage: string) => {
  if (stage === 'WHATSAPP_FAILED') return 'WhatsApp Failed'
  if (stage === 'WHATSAPP_SENT') return 'WhatsApp Sent'
  if (stage === 'WHATSAPP_SKIPPED') return 'WhatsApp Skipped'
  if (stage === 'PAYMENT_ENTRY_VOIDED') return 'Payment Entry Voided'
  if (stage === 'ORDER_EDITED') return 'Order Updated'
  if (stage === 'ORDER_STATUS_ATTEMPTED') return 'Status Update Requested'
  if (stage === 'ORDER_STATUS_SUCCEEDED') return 'Status Update Completed'
  if (stage === 'ORDER_STATUS_FAILED') return 'Status Update Failed'
  return String(stage || 'Log').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase())
}

const logTone = (stage: string, eventType?: string) => {
  if (eventType === 'ACTION_FAILED' || stage === 'ORDER_STATUS_FAILED') return { bg: '#fff1f2', border: '#fecdd3', color: '#b91c1c' }
  if (eventType === 'ACTION_ATTEMPTED') return { bg: '#fffbeb', border: '#fde68a', color: '#b45309' }
  if (eventType === 'ACTION_SUCCEEDED') return { bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d' }
  if (stage === 'WHATSAPP_FAILED') return { bg: '#fff1f2', border: '#fecdd3', color: '#b91c1c' }
  if (stage === 'WHATSAPP_SENT') return { bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d' }
  if (stage === 'WHATSAPP_SKIPPED') return { bg: '#fff7ed', border: '#fed7aa', color: '#c2410c' }
  return { bg: '#eef6fb', border: '#d6e5f0', color: '#023c62' }
}

const getActionFailureDisplay = (log: any) => {
  const metadata = log?.metadata || {}
  const code = metadata.errorDisplayCode || metadata.displayCode || metadata.errorCode || log?.reasonCode || ''
  const message = String(metadata.errorMessage || log?.notes || 'Action failed').trim()
  return { code, message }
}

const retryAttemptSummary = (metadata: any) => {
  const attempts = Array.isArray(metadata?.retryAttempts) ? metadata.retryAttempts : []
  const failed = attempts.filter((attempt: any) => attempt?.outcome === 'FAILED').length
  const sent = attempts.filter((attempt: any) => attempt?.outcome === 'SENT').length
  if (!attempts.length) return ''
  if (sent) return `${attempts.length} retry attempt${attempts.length > 1 ? 's' : ''}, resolved`
  return `${failed} failed retry attempt${failed > 1 ? 's' : ''}`
}

const groupLogsByOrder = (logs: any[]) => {
  const map = new Map<string, any>()
  logs.forEach((log) => {
    const key = log.order?.id || `unknown-${log.id}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        order: log.order,
        latestAt: log.createdAt,
        logs: [],
      })
    }
    const group = map.get(key)
    group.logs.push(log)
    if (new Date(log.createdAt) > new Date(group.latestAt)) group.latestAt = log.createdAt
  })
  return Array.from(map.values())
    .map((group) => ({ ...group, logs: group.logs.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) }))
    .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
}

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [pagination, setPagination] = useState<any>({ total: 0, page: 1, limit: 100, pages: 1 })
  const [filter, setFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const activeFilter = useMemo(() => filterOptions.find((item) => item.key === filter) || filterOptions[0], [filter])
  const groupedLogs = useMemo(() => groupLogsByOrder(logs), [logs])

  const loadLogs = async (page = 1) => {
    setLoading(true)
    try {
      const response: any = await logsAPI.orderTimeline({
        page,
        limit: 100,
        ...activeFilter.params,
        ...(search.trim() ? { search: search.trim() } : {}),
      })
      const data = response?.data || response || {}
      setLogs(data.logs || [])
      setPagination(data.pagination || { total: 0, page, limit: 100, pages: 1 })
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load logs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadLogs(1) }, [filter])

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, color: '#023c62', fontFamily: 'var(--crm-font-display)' }}>Logs</h1>
          <p style={{ margin: '6px 0 0', color: '#6b7fa3', fontSize: 13.5 }}>Order timeline, workflow, and WhatsApp notification activity in one place.</p>
        </div>
        <button onClick={() => loadLogs(pagination.page || 1)} style={{ border: '1px solid #dce8f0', background: '#fff', color: '#023c62', borderRadius: 10, padding: '10px 16px', fontWeight: 800, cursor: 'pointer' }}>
          Refresh
        </button>
      </div>

      <section style={{ background: '#fff', border: '1px solid #e4edf5', borderRadius: 16, padding: 16, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {filterOptions.map((option) => (
            <button key={option.key} onClick={() => setFilter(option.key)}
              style={{ border: '1px solid #dce8f0', background: filter === option.key ? '#023c62' : '#fff', color: filter === option.key ? '#fff' : '#023c62', borderRadius: 999, padding: '8px 13px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
              {option.label}
            </button>
          ))}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); loadLogs(1) }} style={{ display: 'flex', gap: 10 }}>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order #, customer, phone..." style={{ flex: 1, border: '1.5px solid #dce8f0', borderRadius: 12, padding: '11px 13px', fontSize: 13.5, outline: 'none' }} />
          <button type="submit" style={{ border: 'none', background: '#023c62', color: '#fff', borderRadius: 12, padding: '0 18px', fontWeight: 800, cursor: 'pointer' }}>Search</button>
        </form>
      </section>

      <section style={{ background: '#fff', border: '1px solid #e4edf5', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #edf3f8', display: 'flex', justifyContent: 'space-between', color: '#6b7fa3', fontSize: 12.5 }}>
          <span>{pagination.total || 0} log entries</span>
          <span>Page {pagination.page || 1} of {pagination.pages || 1}</span>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9dafc8' }}>Loading logs...</div>
        ) : !logs.length ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9dafc8' }}>No logs found.</div>
        ) : (
	          <div style={{ display: 'grid', gap: 14, padding: 14, background: '#f8fbfd' }}>
	            {groupedLogs.map((group) => (
                <div key={group.key} style={{ background: '#fff', border: '1px solid #e4edf5', borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #edf3f8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      {group.order?.id ? (
                        <Link href={`/dashboard/orders/${group.order.id}`} style={{ color: '#023c62', fontSize: 15, fontWeight: 900, textDecoration: 'none' }}>{group.order.orderNumber}</Link>
                      ) : (
                        <span style={{ color: '#023c62', fontSize: 15, fontWeight: 900 }}>Unknown order</span>
                      )}
                      <div style={{ marginTop: 3, color: '#6b7fa3', fontSize: 12.5 }}>
                        {group.order?.customer?.name || 'Customer unavailable'}{group.order?.customer?.phone ? ` · ${group.order.customer.phone}` : ''}
                      </div>
                    </div>
                    <div style={{ color: '#9dafc8', fontSize: 12 }}>{group.logs.length} log{group.logs.length > 1 ? 's' : ''} · Latest {format(new Date(group.latestAt), 'd MMM, h:mm a')}</div>
                  </div>
                  <div style={{ padding: '14px 16px 2px' }}>
                    {group.logs.map((log: any, index: number) => {
                      const tone = logTone(log.stage, log.eventType)
                      const retryText = retryAttemptSummary(log.metadata)
                      const actionFailureDisplay = log.eventType === 'ACTION_FAILED' ? getActionFailureDisplay(log) : null
                      const actionErrorCode = actionFailureDisplay?.code || ''
                      return (
                        <div key={log.id} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: 10, paddingBottom: 14 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ width: 12, height: 12, borderRadius: 999, background: tone.color, marginTop: 4 }} />
                            {index < group.logs.length - 1 && <div style={{ width: 2, flex: 1, background: '#e3edf6', marginTop: 4 }} />}
                          </div>
                          <div style={{ minWidth: 0, border: (log.stage === 'WHATSAPP_FAILED' || log.eventType === 'ACTION_FAILED') ? '1px solid #fecaca' : 'none', background: (log.stage === 'WHATSAPP_FAILED' || log.eventType === 'ACTION_FAILED') ? '#fff7f7' : 'transparent', borderRadius: (log.stage === 'WHATSAPP_FAILED' || log.eventType === 'ACTION_FAILED') ? 12 : 0, padding: (log.stage === 'WHATSAPP_FAILED' || log.eventType === 'ACTION_FAILED') ? '9px 11px' : 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ display: 'inline-flex', border: `1px solid ${tone.border}`, background: tone.bg, color: tone.color, borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 900 }}>
                                {stageLabel(log.stage)}
                              </span>
                              <span style={{ color: '#6b7fa3', fontSize: 11.5 }}>{format(new Date(log.createdAt), 'd MMM, h:mm a')}</span>
                              <span style={{ color: '#9dafc8', fontSize: 11.5 }}>{log.eventType || 'EVENT'}</span>
                            </div>
                            <div style={{ marginTop: 6, color: '#142033', fontSize: 13, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                              {actionFailureDisplay?.message || log.notes || stageLabel(log.stage)}
                            </div>
                            {actionErrorCode && (
                              <div style={{ marginTop: 7, display: 'inline-flex', border: '1px solid #fecaca', background: '#fff', color: '#991b1b', borderRadius: 999, padding: '4px 8px', fontSize: 11, fontWeight: 900 }}>
                                Ref: {actionErrorCode}
                              </div>
                            )}
                            {retryText && <div style={{ marginTop: 5, color: '#8a5a00', fontSize: 12 }}>{retryText}</div>}
                            {log.changedBy?.name && <div style={{ marginTop: 5, color: '#9dafc8', fontSize: 11.5 }}>By {log.changedBy.name}</div>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
	          </div>
	        )}
        <div style={{ padding: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button disabled={(pagination.page || 1) <= 1} onClick={() => loadLogs((pagination.page || 1) - 1)} style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid #dce8f0', background: '#fff', color: '#023c62', fontWeight: 800, opacity: (pagination.page || 1) <= 1 ? 0.45 : 1, cursor: (pagination.page || 1) <= 1 ? 'not-allowed' : 'pointer' }}>Previous</button>
          <button disabled={(pagination.page || 1) >= (pagination.pages || 1)} onClick={() => loadLogs((pagination.page || 1) + 1)} style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid #dce8f0', background: '#fff', color: '#023c62', fontWeight: 800, opacity: (pagination.page || 1) >= (pagination.pages || 1) ? 0.45 : 1, cursor: (pagination.page || 1) >= (pagination.pages || 1) ? 'not-allowed' : 'pointer' }}>Next</button>
        </div>
      </section>
    </div>
  )
}
