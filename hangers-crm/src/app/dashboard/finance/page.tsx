'use client'
import { useEffect, useState, useCallback } from 'react'
import { format, subDays } from 'date-fns'
import toast from 'react-hot-toast'
import { AlertTriangle, BarChart3, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, CreditCard, FileSpreadsheet, Landmark, Loader2, MessageCircle, RefreshCw, Smartphone, Tag, Upload, WalletCards, Webhook } from 'lucide-react'
import api, { authAPI, idempotencyConfig, metadataAPI } from '@/lib/api'
import { PageHeader } from '@/components/ui'
import { PaginationControls } from '@/components/ui/PaginationControls'

const METHOD_ICON = {CASH:Landmark,UPI:Smartphone,CARD:CreditCard,RAZORPAY:WalletCards,ONLINE:WalletCards,COD:Landmark,WALLET:WalletCards,OTHER:Tag,ALL:BarChart3}
const METHOD_COLOR: Record<string,string> = {CASH:'#22c55e',UPI:'#3b82f6',CARD:'#8b5cf6',RAZORPAY:'#f97316',ONLINE:'#0ea5e9',COD:'#14b8a6',WALLET:'#6366f1',OTHER:'#6b7fa3'}
const asArray = (value: any, keys: string[] = []) => {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}
const moneyFromPaise = (value: any) => {
  const raw = String(value ?? '0')
  if (!/^-?\d+$/.test(raw)) return '0.00'
  const sign = raw.startsWith('-') ? '-' : ''
  const digits = raw.replace(/^-/, '').replace(/^0+(?=\d)/, '').padStart(3, '0')
  const whole = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}${whole}.${digits.slice(-2)}`
}
const addPaise = (left: string, right: string) => {
  const a = left.replace(/^0+(?=\d)/, '').split('').reverse()
  const b = right.replace(/^0+(?=\d)/, '').split('').reverse()
  const result: string[] = []
  let carry = 0
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const sum = Number(a[index] || 0) + Number(b[index] || 0) + carry
    result.push(String(sum % 10))
    carry = Math.floor(sum / 10)
  }
  if (carry) result.push(String(carry))
  return result.reverse().join('') || '0'
}
const paymentSourceNumber = (payment: any) => {
  const invoice = payment.allocations?.[0]?.invoice
  return payment.order?.orderNumber
    || invoice?.ironBill?.billNumber
    || invoice?.serviceAppointment?.appointmentNumber
    || invoice?.invoiceNumber
    || '—'
}
const paymentCustomerName = (payment: any) =>
  payment.order?.customer?.name
  || payment.customer?.name
  || (payment.order?.customer?.phone ? `+91 ${payment.order.customer.phone}` : '')
  || (payment.customer?.phone ? `+91 ${payment.customer.phone}` : '—')

const paymentReference = (payment: any) => payment.method === 'RAZORPAY'
  ? payment.razorpayPaymentId || payment.reference || payment.razorpayOrderId || '—'
  : payment.reference || '—'
const providerMethodLabel = (payment: any) => {
  if (payment.method !== 'RAZORPAY' || !payment.providerMethod) return null
  const method = String(payment.providerMethod).replace(/_/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase())
  const detail = typeof payment.providerMethodDetail === 'string'
    ? payment.providerMethodDetail.split(':').map((part: string) => part.replace(/\b\w/g, (letter: string) => letter.toUpperCase())).join(' · ')
    : ''
  return detail ? `${method} · ${detail}` : method
}

export default function FinancePage() {
  const [tab, setTab] = useState<'daily'|'receivables'|'webhooks'>('daily')
  const [date, setDate] = useState(format(new Date(),'yyyy-MM-dd'))
  const [summary, setSummary] = useState<any>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [receivables, setReceivables] = useState<any[]>([])
  const [receivableGroups, setReceivableGroups] = useState<any[]>([])
  const [receivableTotal, setReceivableTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filterMethod, setFilterMethod] = useState('ALL')
  const [methodOptions, setMethodOptions] = useState<Array<{ value: string; label: string }>>([])
  const [methodLabels, setMethodLabels] = useState<Record<string, string>>({ ALL: 'ALL' })
  const [paymentStatusMeta, setPaymentStatusMeta] = useState<Record<string, { label: string; color: string; bg: string }>>({})
  const [dailyPage, setDailyPage] = useState(1)
  const [receivablesPage, setReceivablesPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedReceivables, setSelectedReceivables] = useState<Record<string, string[]>>({})
  const [arReminder, setArReminder] = useState<{ open: boolean; group: any | null; confirm: boolean }>({ open: false, group: null, confirm: false })
  const [arPreview, setArPreview] = useState<any>(null)
  const [arPreviewLoading, setArPreviewLoading] = useState(false)
  const [arSending, setArSending] = useState(false)
  const [invoiceLinkBusy, setInvoiceLinkBusy] = useState<string | null>(null)
  const [canReconcile, setCanReconcile] = useState(false)
  const [webhookEvents, setWebhookEvents] = useState<any[]>([])
  const [webhookDisputes, setWebhookDisputes] = useState<any[]>([])
  const [checkoutAttempts, setCheckoutAttempts] = useState<any[]>([])
  const [checkoutMethodOutcomes, setCheckoutMethodOutcomes] = useState<any[]>([])
  const [checkoutExperimentReport, setCheckoutExperimentReport] = useState<any>(null)
  const [checkoutAnalyticsFrom, setCheckoutAnalyticsFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'))
  const [checkoutAnalyticsTo, setCheckoutAnalyticsTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [reconciliationRuns, setReconciliationRuns] = useState<any[]>([])
  const [settlementReconLines, setSettlementReconLines] = useState<any[]>([])
  const [settlementReconDate, setSettlementReconDate] = useState(format(new Date(),'yyyy-MM-dd'))
  const [settlementReconBusy, setSettlementReconBusy] = useState(false)
  const [settlementSummaries, setSettlementSummaries] = useState<any[]>([])
  const [settlementSummaryFrom, setSettlementSummaryFrom] = useState(() => { const date = new Date(); date.setDate(date.getDate() - 14); return format(date, 'yyyy-MM-dd') })
  const [settlementSummaryTo, setSettlementSummaryTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [settlementSummaryBusy, setSettlementSummaryBusy] = useState(false)
  const [settlementReportMode, setSettlementReportMode] = useState<'LIVE' | 'TEST'>('LIVE')
  const [settlementSummaryReport, setSettlementSummaryReport] = useState<any>(null)
  const [settlementSummaryReportBusy, setSettlementSummaryReportBusy] = useState(false)
  const [bankStatementImports, setBankStatementImports] = useState<any[]>([])
  const [bankStatementCsv, setBankStatementCsv] = useState<{ name: string; text: string } | null>(null)
  const [bankStatementLabel, setBankStatementLabel] = useState('')
  const [bankStatementPreview, setBankStatementPreview] = useState<any>(null)
  const [bankStatementBusy, setBankStatementBusy] = useState(false)
  const [bankMatchImportId, setBankMatchImportId] = useState<string | null>(null)
  const [bankMatchRows, setBankMatchRows] = useState<any[]>([])
  const [bankMatchBusy, setBankMatchBusy] = useState(false)
  const [bankMatchReasons, setBankMatchReasons] = useState<Record<string, string>>({})
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [webhookBusyId, setWebhookBusyId] = useState<string | null>(null)
  const [providerReconciliationBusy, setProviderReconciliationBusy] = useState(false)
  const [replayDialog, setReplayDialog] = useState<{ event: any; reason: string } | null>(null)

  const loadDaily = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get(`/payments/daily?date=${date}`)
      setSummary(r.data?.summary || {})
      setPayments(asArray(r.data, ['payments', 'items']))
    } catch { toast.error('Failed to load finance data') }
    finally { setLoading(false) }
  }, [date])

  const loadReceivables = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/payments/receivables')
      setReceivables(asArray(r.data, ['orders', 'receivables', 'items']))
      setReceivableGroups(asArray(r.data, ['customerGroups', 'groups']))
      setReceivableTotal(r.data?.total || 0)
    } catch { toast.error('Failed to load receivables') }
    finally { setLoading(false) }
  }, [])

  const loadWebhookEvents = useCallback(async () => {
    setWebhookLoading(true)
    try {
      const [eventsResponse, disputesResponse, attemptsResponse, methodOutcomesResponse, runsResponse, settlementLinesResponse, settlementSummariesResponse, bankImportsResponse, experimentResponse] = await Promise.all([
        api.get('/reconciliation/razorpay-webhooks?status=REVIEW,RETRY,FAILED,RETRYABLE&limit=50'),
        api.get('/reconciliation/razorpay-disputes?limit=50'),
        api.get('/reconciliation/razorpay-checkout-attempts?limit=50'),
        api.get(`/reconciliation/razorpay-checkout-method-outcomes?from=${checkoutAnalyticsFrom}&to=${checkoutAnalyticsTo}`),
        api.get('/reconciliation/'),
        api.get('/reconciliation/razorpay-settlements?limit=50'),
        api.get('/reconciliation/razorpay-settlement-summaries?limit=50'),
        api.get('/reconciliation/bank-statements?limit=20'),
        api.get(`/reconciliation/razorpay-checkout-experiment?from=${checkoutAnalyticsFrom}&to=${checkoutAnalyticsTo}`).catch(() => null),
      ])
      setWebhookEvents(asArray(eventsResponse.data, ['events']))
      setWebhookDisputes(asArray(disputesResponse.data, ['disputes']))
      setCheckoutAttempts(asArray(attemptsResponse.data, ['attempts']))
      setCheckoutMethodOutcomes(asArray(methodOutcomesResponse.data, ['groups']))
      setCheckoutExperimentReport(experimentResponse?.data || null)
      setSettlementReconLines(asArray(settlementLinesResponse.data, ['lines']))
      setSettlementSummaries(asArray(settlementSummariesResponse.data, ['settlements']))
      setBankStatementImports(asArray(bankImportsResponse.data, ['imports']))
      setReconciliationRuns(asArray(runsResponse.data, ['runs']).filter((run: any) => /RAZORPAY_(PAYMENTS|SETTLEMENTS|SETTLEMENT_SUMMARIES)_/.test(String(run.runType || ''))))
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load Razorpay payment events')
    } finally { setWebhookLoading(false) }
  }, [checkoutAnalyticsFrom, checkoutAnalyticsTo])

  useEffect(() => {
    if (tab === 'daily') loadDaily()
    else if (tab === 'receivables') loadReceivables()
    else loadWebhookEvents()
  }, [tab, loadDaily, loadReceivables, loadWebhookEvents])
  useEffect(() => {
    if (tab !== 'webhooks' || !canReconcile) return
    const timer = window.setInterval(() => {
      api.get('/reconciliation/').then((r: any) => {
        setReconciliationRuns(asArray(r.data, ['runs']).filter((run: any) => /RAZORPAY_(PAYMENTS|SETTLEMENTS|SETTLEMENT_SUMMARIES)_/.test(String(run.runType || ''))))
      }).catch(() => {})
      api.get('/reconciliation/razorpay-settlements?limit=50').then((r: any) => setSettlementReconLines(asArray(r.data, ['lines']))).catch(() => {})
      api.get('/reconciliation/razorpay-settlement-summaries?limit=50').then((r: any) => setSettlementSummaries(asArray(r.data, ['settlements']))).catch(() => {})
      api.get('/reconciliation/bank-statements?limit=20').then((r: any) => setBankStatementImports(asArray(r.data, ['imports']))).catch(() => {})
    }, 5000)
    return () => window.clearInterval(timer)
  }, [tab, canReconcile])
  useEffect(() => {
    authAPI.me().then((r: any) => {
      const staff = r?.staff || r?.data?.staff
      const permissions = staff?.effectivePermissions || []
      setCanReconcile(staff?.role === 'SUPER_ADMIN' || permissions.includes('*') || permissions.includes('finance.reconcile'))
    }).catch(() => setCanReconcile(false))
  }, [])
  useEffect(() => {
    metadataAPI.getAll().then((r:any) => {
      const metadata = r?.metadata || r?.data?.metadata || {}
      const filteredMethods = (metadata.paymentMethods || []).filter((item:any) => item.value && item.value !== 'SPLIT' && item.value !== 'Pay Later')
      setMethodOptions(filteredMethods)
      setMethodLabels({
        ALL: 'ALL',
        ...Object.fromEntries(filteredMethods.map((item: any) => [item.value, item.label || item.value])),
      })
      setPaymentStatusMeta(Object.fromEntries((metadata.paymentStatuses || []).map((item: any) => [item.value, { label: item.label || item.value, color: item.color || '#023c62', bg: item.bg || '#f4f7fb' }])))
    }).catch(() => {
      toast.error('Failed to load finance metadata')
    })
  }, [])

  const filtered = filterMethod === 'ALL' ? payments : payments.filter(p => p.method === filterMethod)
  const pagedPayments = filtered.slice((dailyPage - 1) * pageSize, dailyPage * pageSize)
  const pagedReceivableGroups = receivableGroups.slice((receivablesPage - 1) * pageSize, receivablesPage * pageSize)
  const checkoutMethodRows = Object.values(checkoutMethodOutcomes.reduce((groups: Record<string, any>, outcome: any) => {
    const key = `${outcome.mode}:${outcome.providerMethod || 'UNREPORTED'}`
    const row = groups[key] || (groups[key] = { mode: outcome.mode, method: outcome.providerMethod || 'Method unreported', captured: 0, failed: 0, unresolved: 0, capturedPaise: '0', failedPaise: '0', unresolvedPaise: '0' })
    const count = Number(outcome.count) || 0
    const amount = String(outcome.amountPaise || '0')
    if (outcome.status === 'CAPTURED') { row.captured += count; row.capturedPaise = addPaise(row.capturedPaise, amount) }
    else if (outcome.status === 'FAILED' || outcome.status === 'CREATE_FAILED') { row.failed += count; row.failedPaise = addPaise(row.failedPaise, amount) }
    else { row.unresolved += count; row.unresolvedPaise = addPaise(row.unresolvedPaise, amount) }
    return groups
  }, {})).sort((a: any, b: any) => a.mode.localeCompare(b.mode) || a.method.localeCompare(b.method))

  const S = (v: number) => `₹${(v||0).toLocaleString('en-IN')}`
  const groupKey = (group: any) => group?.customer?.id || group?.customer?.phone || group?.customer?.name || 'unknown'
  const selectedForGroup = (group: any) => {
    const key = groupKey(group)
    const selected = selectedReceivables[key]
    const ids = (group?.receivables || []).map((item: any) => item.invoiceId).filter(Boolean)
    return selected && selected.length ? selected : ids
  }
  const selectedTotalForGroup = (group: any) => {
    const selected = new Set(selectedForGroup(group))
    return (group?.receivables || []).reduce((sum: number, item: any) => selected.has(item.invoiceId) ? sum + Number(item.balance || item.balanceDue || 0) : sum, 0)
  }
  const toggleGroupSelection = (group: any, invoiceId: string) => {
    const key = groupKey(group)
    const allIds: string[] = (group?.receivables || []).map((item: any) => item.invoiceId).filter(Boolean)
    const current = selectedReceivables[key] && selectedReceivables[key].length ? selectedReceivables[key] : allIds
    const next = current.includes(invoiceId) ? current.filter((id: string) => id !== invoiceId) : [...current, invoiceId]
    setSelectedReceivables((prev) => ({ ...prev, [key]: next }))
  }
  const setGroupSelection = (group: any, checked: boolean) => {
    const key = groupKey(group)
    const allIds = (group?.receivables || []).map((item: any) => item.invoiceId).filter(Boolean)
    setSelectedReceivables((prev) => ({ ...prev, [key]: checked ? allIds : [] }))
  }
  const openInvoice = async (invoiceId: string, mode: 'open' | 'copy') => {
    if (!invoiceId) return
    setInvoiceLinkBusy(invoiceId)
    try {
      const response = await api.post(`/payments/invoice/${invoiceId}/share`)
      const path = response.data?.path || response.data?.data?.path
      if (!path) throw new Error('Invoice link unavailable')
      const url = `${window.location.origin}${path}`
      if (mode === 'copy') {
        await navigator.clipboard.writeText(url)
        toast.success('Invoice payment link copied')
      } else window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e: any) { toast.error(e?.message || 'Failed to open invoice') }
    finally { setInvoiceLinkBusy(null) }
  }
  const openArReminder = async (group: any) => {
    const invoiceIds = selectedForGroup(group)
    if (!invoiceIds.length) {
      toast.error('Select at least one bill/order')
      return
    }
    setArReminder({ open: true, group, confirm: false })
    setArPreview(null)
    setArPreviewLoading(true)
    try {
      const r = await api.post('/payments/receivables/reminders/preview', { customerId: group.customer?.id, invoiceIds })
      setArPreview(r.data || r)
    } catch (e: any) {
      setArPreview({ error: e?.message || 'Failed to load reminder preview' })
    } finally {
      setArPreviewLoading(false)
    }
  }
  const sendArReminder = async () => {
    if (!arReminder.group || !arReminder.confirm) return
    const invoiceIds = selectedForGroup(arReminder.group)
    setArSending(true)
    try {
      await api.post('/payments/receivables/reminders/send', { customerId: arReminder.group.customer?.id, invoiceIds }, idempotencyConfig('ar-reminder-send'))
      toast.success('Outstanding reminder sent')
      setArReminder({ open: false, group: null, confirm: false })
    } catch (e: any) {
      toast.error(e?.message || 'Failed to send reminder')
    } finally {
      setArSending(false)
    }
  }
  const replayWebhook = async () => {
    if (!replayDialog || replayDialog.reason.trim().length < 8) return
    setWebhookBusyId(replayDialog.event.id)
    try {
      await api.post(`/reconciliation/razorpay-webhooks/${encodeURIComponent(replayDialog.event.id)}/replay`, { reason: replayDialog.reason }, idempotencyConfig('razorpay-webhook-replay', replayDialog.event.id))
      toast.success('Event queued for safe worker replay')
      setReplayDialog(null)
      await loadWebhookEvents()
    } catch (e: any) {
      toast.error(e?.message || 'Could not queue webhook replay')
    } finally { setWebhookBusyId(null) }
  }
  const queueProviderReconciliation = async () => {
    setProviderReconciliationBusy(true)
    try {
      const response = await api.post('/reconciliation/razorpay-payments/run', {}, idempotencyConfig('finance.razorpay-payment-reconcile'))
      const run = response.data?.run || response.data?.data?.run
      if (run) setReconciliationRuns((current) => [run, ...current.filter((item) => item.id !== run.id)])
      toast.success('Provider-to-CRM reconciliation queued')
    } catch (e: any) {
      toast.error(e?.message || 'Could not queue provider reconciliation')
    } finally { setProviderReconciliationBusy(false) }
  }
  const queueSettlementReconciliation = async () => {
    const [year, month, day] = settlementReconDate.split('-').map(Number)
    if (!year || !month || !day) { toast.error('Select a valid settlement-received date'); return }
    setSettlementReconBusy(true)
    try {
      const response = await api.post('/reconciliation/razorpay-settlements/run', { year, month, day }, idempotencyConfig('finance.razorpay-settlement-reconcile'))
      const run = response.data?.run || response.data?.data?.run
      if (run) setReconciliationRuns((current) => [run, ...current.filter((item) => item.id !== run.id)])
      toast.success('Settlement report sync queued')
    } catch (e: any) {
      toast.error(e?.message || 'Could not queue settlement report sync')
    } finally { setSettlementReconBusy(false) }
  }
  const queueSettlementSummaryReconciliation = async () => {
    const from = Math.floor(new Date(`${settlementSummaryFrom}T00:00:00+05:30`).getTime() / 1000)
    const to = Math.floor(new Date(`${settlementSummaryTo}T23:59:59+05:30`).getTime() / 1000)
    if (!settlementSummaryFrom || !settlementSummaryTo || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from >= to) {
      toast.error('Choose a valid settlement date range')
      return
    }
    setSettlementSummaryBusy(true)
    try {
      const response = await api.post('/reconciliation/razorpay-settlement-summaries/run', { from, to }, idempotencyConfig('finance.razorpay-settlement-summary-reconcile'))
      const run = response.data?.run || response.data?.data?.run
      if (run) setReconciliationRuns((current) => [run, ...current.filter((item) => item.id !== run.id)])
      toast.success('Settlement status sync queued')
    } catch (e: any) {
      toast.error(e?.message || 'Could not queue settlement status sync')
    } finally { setSettlementSummaryBusy(false) }
  }
  const loadSettlementSummaryReport = async () => {
    if (!settlementSummaryFrom || !settlementSummaryTo || settlementSummaryFrom > settlementSummaryTo) {
      toast.error('Choose a valid settlement report date range')
      return
    }
    setSettlementSummaryReportBusy(true)
    try {
      const query = new URLSearchParams({ from: settlementSummaryFrom, to: settlementSummaryTo, mode: settlementReportMode })
      const response = await api.get(`/reconciliation/razorpay-settlement-summary-report?${query.toString()}`)
      setSettlementSummaryReport(response.data?.report || response.data?.data?.report || null)
    } catch (e: any) {
      toast.error(e?.message || 'Could not load settlement summary report')
    } finally { setSettlementSummaryReportBusy(false) }
  }
  const selectBankStatement = async (event: any) => {
    const file = event.target.files?.[0]
    setBankStatementPreview(null)
    if (!file) { setBankStatementCsv(null); return }
    if (!file.name.toLowerCase().endsWith('.csv') || file.size > 450_000) {
      toast.error('Choose a CSV file smaller than 450 KB')
      event.target.value = ''
      setBankStatementCsv(null)
      return
    }
    try {
      setBankStatementCsv({ name: file.name, text: await file.text() })
    } catch {
      toast.error('The selected CSV could not be read')
      setBankStatementCsv(null)
    }
  }
  const previewBankStatement = async () => {
    if (!bankStatementCsv) { toast.error('Select a CSV statement first'); return }
    setBankStatementBusy(true)
    try {
      const response = await api.post('/reconciliation/bank-statements/preview', { csvText: bankStatementCsv.text })
      setBankStatementPreview(response.data?.preview || response.data?.data?.preview || null)
      toast.success('Statement preview is ready')
    } catch (e: any) {
      setBankStatementPreview(null)
      toast.error(e?.message || 'Could not preview this statement')
    } finally { setBankStatementBusy(false) }
  }
  const importBankStatement = async () => {
    if (!bankStatementCsv || !bankStatementPreview || !bankStatementLabel.trim()) return
    setBankStatementBusy(true)
    try {
      const response = await api.post('/reconciliation/bank-statements/import', {
        csvText: bankStatementCsv.text,
        fileName: bankStatementCsv.name,
        accountLabel: bankStatementLabel.trim(),
      })
      const imported = response.data?.import || response.data?.data?.import
      setBankStatementImports((current) => [imported, ...current.filter((item) => item.id !== imported?.id)])
      setBankStatementCsv(null)
      setBankStatementPreview(null)
      toast.success(`${imported?.acceptedRows || 0} statement rows imported`)
    } catch (e: any) {
      toast.error(e?.message || 'Could not import this statement')
    } finally { setBankStatementBusy(false) }
  }
  const toggleBankMatchReview = async (importId: string) => {
    if (bankMatchImportId === importId) { setBankMatchImportId(null); return }
    setBankMatchImportId(importId)
    setBankMatchBusy(true)
    try {
      const response = await api.get(`/reconciliation/bank-statements/${encodeURIComponent(importId)}/match-candidates`)
      const matching = response.data?.matching || response.data?.data?.matching
      setBankMatchRows(matching?.rows || [])
    } catch (e: any) {
      setBankMatchRows([])
      toast.error(e?.message || 'Could not load settlement match candidates')
    } finally { setBankMatchBusy(false) }
  }
  const confirmBankMatch = async (row: any, candidate: any) => {
    const reason = bankMatchReasons[row.id] || ''
    if (!candidate.exact && reason.trim().length < 12) { toast.error('Manager review requires a reason of at least 12 characters'); return }
    setBankMatchBusy(true)
    try {
      await api.post(`/reconciliation/bank-statements/rows/${encodeURIComponent(row.id)}/matches`, { settlementSummaryId: candidate.id, reason }, idempotencyConfig('finance.bank-settlement-match', `${row.id}:${candidate.id}`))
      toast.success(candidate.exact ? 'Exact bank settlement match recorded' : 'Manager-reviewed settlement match recorded')
      if (bankMatchImportId) {
        const response = await api.get(`/reconciliation/bank-statements/${encodeURIComponent(bankMatchImportId)}/match-candidates`)
        setBankMatchRows((response.data?.matching || response.data?.data?.matching)?.rows || [])
      }
    } catch (e: any) { toast.error(e?.message || 'Could not record settlement match') }
    finally { setBankMatchBusy(false) }
  }
  const reverseBankMatch = async (row: any) => {
    const match = row.activeMatch
    const reason = bankMatchReasons[`reverse:${match?.id}`] || ''
    if (!match || reason.trim().length < 12) { toast.error('Enter a reversal reason of at least 12 characters'); return }
    setBankMatchBusy(true)
    try {
      await api.post(`/reconciliation/bank-statements/matches/${encodeURIComponent(match.id)}/reverse`, { reason }, idempotencyConfig('finance.bank-settlement-match-reverse', match.id))
      toast.success('Match reversed; audit history retained')
      if (bankMatchImportId) {
        const response = await api.get(`/reconciliation/bank-statements/${encodeURIComponent(bankMatchImportId)}/match-candidates`)
        setBankMatchRows((response.data?.matching || response.data?.data?.matching)?.rows || [])
      }
    } catch (e: any) { toast.error(e?.message || 'Could not reverse settlement match') }
    finally { setBankMatchBusy(false) }
  }
  const methodTotals = summary?.byMethod || {}
  const summaryMethods = methodOptions.filter((method) => Number(methodTotals[method.value] || 0) > 0)
  const summaryCards = [
    { value: 'TOTAL', label: 'Total Collected', amount: summary?.total || 0, color: '#023c62', big: true },
    ...summaryMethods.map((method) => ({
      value: method.value,
      label: method.label,
      amount: methodTotals[method.value] || 0,
      color: METHOD_COLOR[method.value] || '#6b7fa3',
      big: false,
    })),
  ]

  return (
    <div className="finance-page" style={{padding:'30px 36px 60px',maxWidth:1360,margin:'0 auto',fontFamily:"var(--crm-font-ui)"}}>
      <PageHeader title="Finance" subtitle="Collections, outstanding balances and payment activity" />

      {/* Tabs */}
      <div className="finance-tabs" style={{display:'flex',gap:8,marginBottom:24}}>
        {[{k:'daily',l:'Daily Register',Icon:CalendarDays},{k:'receivables',l:'Accounts Receivable',Icon:AlertTriangle}, ...(canReconcile ? [{k:'webhooks',l:'Payment Events',Icon:Webhook}] : [])].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k as any)}
            style={{padding:'10px 20px',borderRadius:10,border:`1.5px solid ${tab===t.k?'#023c62':'#dce8f0'}`,background:tab===t.k?'#023c62':'#fff',color:tab===t.k?'#fff':'#6b7fa3',fontWeight:600,cursor:'pointer',fontSize:14,display:'inline-flex',alignItems:'center',gap:8}}>
            <t.Icon size={16} />
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'daily' && (
        <>
          {/* Date picker + summary cards */}
          <div className="finance-date-tools" style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)}
              style={{border:'1.5px solid #dce8f0',borderRadius:10,padding:'9px 14px',fontSize:14,color:'#023c62',fontWeight:600,outline:'none'}}/>
            <button onClick={loadDaily} style={{background:'#023c62',color:'#fff',border:'none',borderRadius:10,padding:'10px 16px',fontWeight:600,cursor:'pointer',fontSize:14}}>Refresh</button>
          </div>

          {summary && (
            <div className="finance-summary-cards" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:14,marginBottom:24}}>
              {summaryCards.map(card=>(
                <div key={card.value} style={{background:card.big?'linear-gradient(135deg,#023c62,#035a8f)':'#fff',borderRadius:16,padding:20,border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)'}}>
                  <div style={{fontSize:11,fontWeight:600,color:card.big?'rgba(184,208,232,0.7)':'#6b7fa3',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>{card.label}</div>
                  <div style={{fontFamily:"var(--crm-font-ui)",fontWeight:800,fontSize:22,color:card.big?'#fff':card.color}}>{S(card.amount)}</div>
                  {!card.big&&<div style={{fontSize:11,color:'#9dafc8',marginTop:4}}>{payments.filter(p=>p.method===card.value).length} txns</div>}
                </div>
              ))}
            </div>
          )}

          {/* Filter + transactions */}
          <div className="finance-register" style={{background:'#fff',borderRadius:14,border:'1px solid #e3edf6',overflow:'hidden'}}>
            <div className="finance-register-head" style={{padding:'16px 20px',borderBottom:'1px solid #e8f0f7',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <span style={{fontFamily:"var(--crm-font-ui)",fontWeight:700,fontSize:15,color:'#023c62',flex:1}}>Transactions ({filtered.length})</span>
              {[{ value: 'ALL', label: 'ALL' }, ...methodOptions].map(m=>(
                <button key={m.value} onClick={()=>setFilterMethod(m.value)}
                  style={{padding:'5px 12px',borderRadius:8,border:`1.5px solid ${filterMethod===m.value?METHOD_COLOR[m.value]||'#023c62':'#dce8f0'}`,background:filterMethod===m.value?'#f7f9fc':'#fff',color:filterMethod===m.value?METHOD_COLOR[m.value]||'#023c62':'#6b7fa3',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                  {(() => {
                    const Icon = METHOD_ICON[m.value as keyof typeof METHOD_ICON] || Tag
                    return <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Icon size={14} /> {methodLabels[m.value] || m.label}</span>
                  })()}
                </button>
              ))}
            </div>
            <table className="finance-table" style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr style={{background:'#f7f9fc'}}>
                {['Time','Order','Customer','Method','Ref','Amount','By'].map(h=>(
                  <th key={h} style={{padding:'11px 18px',textAlign:'left',fontSize:10.5,fontWeight:700,color:'#6b7fa3',textTransform:'uppercase',letterSpacing:'0.07em',borderBottom:'1px solid #e8f0f7',background:'#f7f9fc'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {loading?<tr><td colSpan={7} style={{padding:48,textAlign:'center',color:'#9dafc8'}}>Loading...</td></tr>
                :!filtered.length?<tr><td colSpan={7} style={{padding:48,textAlign:'center',color:'#9dafc8'}}>No transactions for this date.</td></tr>
                :pagedPayments.map((p:any)=>(
                  <tr key={p.id} style={{borderBottom:'1px solid #eef4f8'}}>
                    <td style={{padding:'13px 18px',fontSize:13.5,color:'#6b7fa3'}}>{format(new Date(p.createdAt),'h:mm a')}</td>
                    <td style={{padding:'13px 18px',fontFamily:"var(--crm-font-mono)",fontSize:13.5,color:'#023c62'}}>{paymentSourceNumber(p)}</td>
                    <td style={{padding:'13px 18px',fontSize:13.5}}>{paymentCustomerName(p)}</td>
                    <td style={{padding:'11px 16px'}}>
                      <div style={{display:'grid',justifyItems:'start',gap:4}}><span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:'#f0f4f8',color:METHOD_COLOR[p.method]||'#6b7fa3'}}>
                        {(() => {
                          const Icon = METHOD_ICON[(p.method || 'OTHER') as keyof typeof METHOD_ICON] || Tag
                          return <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Icon size={12} /> {methodLabels[p.method] || p.method}</span>
                        })()}
                      </span>{providerMethodLabel(p) && <small style={{paddingLeft:3,fontSize:10.5,fontWeight:600,color:'#52647e'}}>{providerMethodLabel(p)}</small>}</div>
                    </td>
                    <td style={{padding:'11px 16px',fontSize:12,color:'#9dafc8',fontFamily:"var(--crm-font-mono)"}}>{paymentReference(p)}</td>
                    <td style={{padding:'11px 16px',fontWeight:700,color:'#022c50',fontSize:15}}>{S(p.amount)}</td>
                    <td style={{padding:'13px 18px',fontSize:13.5,color:'#6b7fa3'}}>{p.collectedByStaff?.name||'—'}</td>
                  </tr>
                ))}
              </tbody>
              {filtered.length>0&&(
                <tfoot><tr style={{background:'#f7f9fc'}}>
                  <td colSpan={5} style={{padding:'12px 18px',fontWeight:700,color:'#023c62',fontFamily:"var(--crm-font-ui)"}}>Total</td>
                  <td style={{padding:'12px 18px',fontWeight:800,color:'#023c62',fontSize:16,fontFamily:"var(--crm-font-ui)"}}>{S(filtered.reduce((s:number,p:any)=>s+p.amount,0))}</td>
                  <td/>
                </tr></tfoot>
              )}
            </table>
            <div className="finance-mobile-transactions">
              {loading ? Array.from({length:5},(_,index)=><div className="finance-mobile-skeleton" key={index}><i/><span/><b/></div>) : !filtered.length ? <div className="finance-mobile-empty">No transactions for this date.</div> : pagedPayments.map((p:any)=>{const Icon=METHOD_ICON[(p.method||'OTHER') as keyof typeof METHOD_ICON]||Tag;return <article key={p.id}><div><strong>{paymentCustomerName(p)}</strong><small>{paymentSourceNumber(p)} · {format(new Date(p.createdAt),'h:mm a')}</small></div><span><b>{S(p.amount)}</b><small><Icon size={11}/>{methodLabels[p.method]||p.method}</small>{providerMethodLabel(p)&&<small>{providerMethodLabel(p)}</small>}</span>{paymentReference(p) !== '—'&&<p>{p.method === 'RAZORPAY' ? 'Razorpay payment: ' : 'Reference: '}{paymentReference(p)}</p>}{p.method === 'RAZORPAY' && p.razorpayOrderId && <p>Razorpay order: {p.razorpayOrderId}</p>}<em>Collected by {p.collectedByStaff?.name||'—'}</em></article>})}
            </div>
          </div>
          <PaginationControls
            page={dailyPage}
            pageSize={pageSize}
            totalItems={filtered.length}
            itemLabel="transactions"
            onPageChange={setDailyPage}
            onPageSizeChange={(size) => { setPageSize(size); setDailyPage(1) }}
            pageSizeOptions={[10, 20, 30, 50, 100]}
          />
        </>
      )}

      {tab === 'receivables' && (
        <>
          <div className="ar-total-card" style={{background:'linear-gradient(135deg,#7f1d1d,#991b1b)',borderRadius:16,padding:24,color:'#fff',marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:12,color:'rgba(255,200,200,0.7)',fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:8}}>Total Outstanding Balance</div>
              <div style={{fontFamily:"var(--crm-font-ui)",fontWeight:800,fontSize:36}}>{S(receivableTotal)}</div>
              <div style={{fontSize:13,color:'rgba(255,200,200,0.7)',marginTop:4}}>Across {receivables.length} open invoices for {receivableGroups.length} customers</div>
            </div>
            <AlertTriangle size={44} style={{opacity:0.35}} />
          </div>

          <div style={{display:'grid',gap:12}}>
            {loading ? <div style={{padding:48,textAlign:'center',color:'#9dafc8',background:'#fff',borderRadius:14,border:'1px solid #e3edf6'}}>Loading...</div>
            : !receivableGroups.length ? <div style={{padding:48,textAlign:'center',color:'#22c55e',background:'#fff',borderRadius:14,border:'1px solid #e3edf6'}}>No outstanding balances.</div>
            : pagedReceivableGroups.map((group: any) => {
              const key = groupKey(group)
              const selectedIds = selectedForGroup(group)
              const allIds = (group.receivables || []).map((item: any) => item.invoiceId)
              const allSelected = selectedIds.length === allIds.length && allIds.every((id: string) => selectedIds.includes(id))
              return (
                <div className="ar-customer-card" key={key} style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14,overflow:'hidden',boxShadow:'0 1px 8px rgba(2,60,98,0.04)'}}>
                  <div className="ar-customer-head" style={{padding:'14px 16px',display:'grid',gridTemplateColumns:'minmax(0,1fr) 120px 120px 170px',gap:12,alignItems:'center',background:'#fbfdff',borderBottom:'1px solid #e8f0f7'}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontWeight:900,color:'#023c62',fontSize:16,overflowWrap:'anywhere'}}>{group.customer?.name || 'Unknown customer'}</div>
                      <div style={{fontSize:12,color:'#6b7fa3',marginTop:3}}>+91 {group.customer?.phone || '—'} · {group.invoiceCount} open bills/orders</div>
                    </div>
                    <div><div style={arMetricLabel}>Total</div><div style={arMetricValue}>{S(group.totalAmount)}</div></div>
                    <div><div style={arMetricLabel}>Balance</div><div style={{...arMetricValue,color:'#dc2626'}}>{S(group.balance)}</div></div>
                    <button onClick={() => openArReminder(group)} disabled={!selectedIds.length || group.customer?.notifWhatsApp === false} style={{...arWhatsAppButton, opacity: !selectedIds.length || group.customer?.notifWhatsApp === false ? 0.55 : 1}}>
                      <MessageCircle size={15} /> Send Reminder
                    </button>
                  </div>
                  <div style={{padding:'10px 16px 14px'}}>
                    <label style={{display:'inline-flex',alignItems:'center',gap:8,fontSize:12,color:'#52647e',fontWeight:800,marginBottom:8}}>
                      <input type="checkbox" checked={allSelected} onChange={(e) => setGroupSelection(group, e.target.checked)} />
                      Select all for this customer · Selected {selectedIds.length} · {S(selectedTotalForGroup(group))}
                    </label>
                    <div style={{display:'grid',gap:7}}>
                      {(group.receivables || []).map((o: any) => {
                        const checked = selectedIds.includes(o.invoiceId)
                        return (
                          <div className="ar-invoice-row" key={o.invoiceId} style={{display:'grid',gridTemplateColumns:'28px minmax(0,1.2fr) minmax(0,1fr) 96px 96px 120px',gap:10,alignItems:'center',padding:'9px 10px',border:'1px solid #eef4f8',borderRadius:10,background:checked?'#f7fbff':'#fff'}}>
                            <input type="checkbox" checked={checked} onChange={() => toggleGroupSelection(group, o.invoiceId)} />
                            <div style={{minWidth:0}}>
                              <div style={{fontFamily:"var(--crm-font-mono)",fontWeight:800,color:'#023c62',fontSize:13}}>{o.invoiceNumber || o.orderNumber}</div>
                              <div style={{fontSize:11,color:'#7b8ca8',marginTop:2}}>{o.orderNumber || o.sourceNumber}</div>
                              <div style={{display:'flex',gap:6,marginTop:6,flexWrap:'wrap'}}>
                                <button type="button" disabled={invoiceLinkBusy===o.invoiceId} onClick={() => openInvoice(o.invoiceId, 'open')} style={{border:'1px solid #c9ddea',background:'#fff',color:'#023c62',borderRadius:7,padding:'4px 7px',fontSize:10.5,fontWeight:700,cursor:'pointer'}}>Open invoice</button>
                                <button type="button" disabled={invoiceLinkBusy===o.invoiceId} onClick={() => openInvoice(o.invoiceId, 'copy')} style={{border:'1px solid #c9ddea',background:'#f7fbff',color:'#356b8e',borderRadius:7,padding:'4px 7px',fontSize:10.5,fontWeight:700,cursor:'pointer'}}>Copy link</button>
                              </div>
                            </div>
                            <div style={{fontSize:12,color:'#52647e',fontWeight:700}}>
                              {o.sourceType === 'FIELD_SERVICE' ? 'Sofa Cleaning' : o.sourceType === 'DAILY_IRON' ? 'Daily Iron' : 'Order'}
                            </div>
                            <div style={{fontSize:12,color:'#52647e'}}>{S(o.totalAmount)}</div>
                            <div style={{fontSize:12,color:'#16a34a'}}>{S(o.paidAmount)}</div>
                            <div style={{fontSize:13,fontWeight:900,color:'#dc2626'}}>{S(o.balance || o.balanceDue)}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <PaginationControls
            page={receivablesPage}
            pageSize={pageSize}
            totalItems={receivableGroups.length}
            itemLabel="customers"
            onPageChange={setReceivablesPage}
            onPageSizeChange={(size) => { setPageSize(size); setReceivablesPage(1) }}
            pageSizeOptions={[10, 20, 30, 50, 100]}
          />
        </>
      )}
      {tab === 'webhooks' && canReconcile && (
        <div style={{display:'grid',gap:16}}>
        {checkoutExperimentReport && <section style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14,overflow:'hidden'}}>
          <div style={{padding:'16px 20px',borderBottom:'1px solid #e8f0f7'}}>
            <div style={{fontSize:15,fontWeight:800,color:'#023c62'}}>Invoice checkout presentation experiment · TEST</div>
            <div style={{fontSize:12,color:'#6b7fa3',marginTop:3}}>Anonymous, aggregate funnel only. No individual visitor IDs are exposed. Test-mode results cannot establish live conversion or payment safety.</div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))'}}>
            {(['A','B'] as const).map((variant) => {
              const row = checkoutExperimentReport.variants?.[variant] || {}
              const rate = (count: number, base: number) => base ? `${(count * 100 / base).toFixed(1)}%` : '—'
              return <article key={variant} style={{padding:'14px 18px',borderBottom:'1px solid #eef4f8',borderRight:'1px solid #eef4f8',display:'grid',gap:9,minWidth:0}}>
                <strong style={{fontSize:13,color:'#023c62'}}>Variant {variant}</strong>
                <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8}}>
                  <div style={{padding:9,background:'#f7f9fc',borderRadius:8}}><small>Exposed visitors</small><strong style={{display:'block'}}>{row.exposedVisitors || 0}</strong></div>
                  <div style={{padding:9,background:'#f7f9fc',borderRadius:8}}><small>CTA click rate</small><strong style={{display:'block'}}>{rate(row.ctaVisitors || 0,row.exposedVisitors || 0)}</strong></div>
                  <div style={{padding:9,background:'#f7f9fc',borderRadius:8}}><small>Checkout open requests</small><strong style={{display:'block'}}>{row.checkoutRequestVisitors || 0}</strong></div>
                  <div style={{padding:9,background:'#f7f9fc',borderRadius:8}}><small>Captured visitors</small><strong style={{display:'block'}}>{row.serverVerifiedCaptureVisitors || 0} · {rate(row.serverVerifiedCaptureVisitors || 0,row.exposedVisitors || 0)}</strong></div>
                  <div style={{padding:9,background:'#f7f9fc',borderRadius:8}}><small>Captured attempts · value</small><strong style={{display:'block'}}>{row.serverVerifiedCaptureAttempts || 0} · ₹{moneyFromPaise(row.capturedPaise || '0')}</strong></div>
                  <div style={{padding:9,background:'#f7f9fc',borderRadius:8}}><small>Checkout dismissals</small><strong style={{display:'block'}}>{rate(row.dismissedVisitors || 0,row.checkoutRequestVisitors || 0)}</strong></div>
                  <div style={{padding:9,background:'#f7f9fc',borderRadius:8}}><small>Payment-failure callbacks</small><strong style={{display:'block'}}>{row.paymentFailureVisitors || 0}</strong></div>
                  <div style={{padding:9,background:'#f7f9fc',borderRadius:8}}><small>Client error rate</small><strong style={{display:'block'}}>{rate(row.errorVisitors || 0,row.checkoutRequestVisitors || 0)}</strong></div>
                </div>
                <small style={{color:'#71839d'}}>Primary: unique captured visitors / exposed visitors. Minimum before review: {checkoutExperimentReport.decision?.minimumExposedVisitorsPerVariant || 200} exposed visitors per variant. Winner declared: no.</small>
              </article>
            })}
          </div>
        </section>}
        <section style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14,overflow:'hidden'}}>
          <div style={{padding:'16px 20px',display:'flex',alignItems:'end',gap:12,borderBottom:'1px solid #e8f0f7',flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:220}}>
              <div style={{fontSize:15,fontWeight:800,color:'#023c62'}}>Checkout outcomes by provider method</div>
              <div style={{fontSize:12,color:'#6b7fa3',marginTop:3}}>Counts and values represent attempts in each state, not unique customers. Captured is server-verified and recorded in the CRM ledger; failures include terminal create/payment failures; unresolved includes created, authorized, pending, or review-required attempts.</div>
            </div>
            <label style={{display:'grid',gap:4,fontSize:10,fontWeight:800,color:'#52647e'}}>From
              <input type="date" value={checkoutAnalyticsFrom} max={checkoutAnalyticsTo} onChange={(event) => setCheckoutAnalyticsFrom(event.target.value)} style={{height:36,padding:'0 9px',border:'1px solid #c9ddea',borderRadius:7,color:'#19324a',fontSize:12}} />
            </label>
            <label style={{display:'grid',gap:4,fontSize:10,fontWeight:800,color:'#52647e'}}>To
              <input type="date" value={checkoutAnalyticsTo} min={checkoutAnalyticsFrom} max={format(new Date(),'yyyy-MM-dd')} onChange={(event) => setCheckoutAnalyticsTo(event.target.value)} style={{height:36,padding:'0 9px',border:'1px solid #c9ddea',borderRadius:7,color:'#19324a',fontSize:12}} />
            </label>
          </div>
          {webhookLoading ? <div style={{padding:20,textAlign:'center',fontSize:12,color:'#6b7fa3'}}>Loading method outcomes…</div>
          : !checkoutMethodRows.length ? <div style={{padding:20,fontSize:12,color:'#6b7fa3'}}>No checkout attempts in this date window.</div>
          : <div style={{display:'grid'}}>{checkoutMethodRows.map((row: any) => <article key={`${row.mode}:${row.method}`} style={{padding:'13px 18px',borderBottom:'1px solid #eef4f8',display:'grid',gap:9,minWidth:0}}>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}><strong style={{fontSize:13,color:'#023c62'}}>{row.method.replace(/_/g,' ')}</strong><span style={{fontSize:10,fontWeight:800,color:row.mode==='LIVE'?'#9a3412':'#52647e'}}>{row.mode}</span></div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8}}>
              {[['Verified captures',row.captured,row.capturedPaise],['Failures',row.failed,row.failedPaise],['Unresolved',row.unresolved,row.unresolvedPaise]].map(([label,count,amount]: any) => <div key={label} style={{padding:'9px 10px',background:'#f7f9fc',borderRadius:9,minWidth:0}}>
                <div style={{fontSize:10,color:'#71839d'}}>{label}</div><strong style={{display:'block',fontSize:13,color:'#19324a',marginTop:3}}>{count} · ₹{moneyFromPaise(amount)}</strong>
              </div>)}
            </div>
          </article>)}</div>}
        </section>
        <section style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14,overflow:'hidden'}}>
          <div style={{padding:'16px 20px',borderBottom:'1px solid #e8f0f7'}}>
            <div style={{fontSize:15,fontWeight:800,color:'#023c62'}}>Razorpay checkout attempts</div>
            <div style={{fontSize:12,color:'#6b7fa3',marginTop:3}}>Provider method and normalized error taxonomy for local invoice checkout attempts. This view never marks invoices paid; only verified capture settles the CRM ledger.</div>
          </div>
          {webhookLoading ? <div style={{padding:24,textAlign:'center',color:'#6b7fa3'}}><Loader2 className="crm-spin" size={16}/> Loading checkout attempts…</div>
          : !checkoutAttempts.length ? <div style={{padding:24,color:'#6b7fa3',fontSize:12}}>No Razorpay checkout attempts found.</div>
          : <div style={{display:'grid'}}>{checkoutAttempts.map((attempt) => {
            const detail = [attempt.providerMethod, attempt.providerMethodDetail].filter(Boolean).join(' · ')
            const diagnostics = [
              attempt.providerErrorCode && `Code ${attempt.providerErrorCode}`,
              attempt.providerErrorSource && `Source ${attempt.providerErrorSource}`,
              attempt.providerErrorStep && `Step ${attempt.providerErrorStep}`,
              attempt.providerErrorReason && `Reason ${attempt.providerErrorReason}`,
              !attempt.providerErrorCode && attempt.failureCode && `CRM ${attempt.failureCode}`,
            ].filter(Boolean)
            return <article key={attempt.id} style={{padding:'13px 18px',borderBottom:'1px solid #eef4f8',display:'grid',gap:7,minWidth:0}}>
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <strong style={{fontFamily:'var(--crm-font-mono)',fontSize:12,color:'#023c62',overflowWrap:'anywhere'}}>{attempt.invoiceNumber}</strong>
                <span style={{padding:'2px 8px',borderRadius:20,background:attempt.status==='CAPTURED'?'#ecfdf5':attempt.status==='FAILED'?'#fef2f2':'#eff6ff',color:attempt.status==='CAPTURED'?'#047857':attempt.status==='FAILED'?'#b91c1c':'#1d4ed8',fontSize:10,fontWeight:900}}>{attempt.status}</span>
                <span style={{fontSize:10,fontWeight:800,color:attempt.mode==='LIVE'?'#9a3412':'#52647e'}}>{attempt.mode}</span>
                <strong style={{marginLeft:'auto',fontSize:12,color:'#023c62'}}>{attempt.currency} {moneyFromPaise(attempt.amountPaise)}</strong>
              </div>
              <div style={{display:'flex',gap:12,flexWrap:'wrap',fontSize:11,color:'#52647e'}}>
                {detail && <span>Method <strong>{detail}</strong></span>}
                {diagnostics.length > 0 && <span style={{color:attempt.status==='FAILED'?'#b91c1c':'#9a3412',overflowWrap:'anywhere'}}>{diagnostics.join(' · ')}</span>}
                {!detail && diagnostics.length === 0 && <span>{attempt.status==='CAPTURED'?'Verified capture recorded':'No provider error details recorded'}</span>}
              </div>
              <div style={{fontFamily:'var(--crm-font-mono)',fontSize:10,color:'#71839d',overflowWrap:'anywhere'}}>
                {attempt.razorpayOrderId ? `Order ${attempt.razorpayOrderId}` : 'No provider order ID'}{attempt.razorpayPaymentId ? ` · Payment ${attempt.razorpayPaymentId}` : ''}{attempt.requestId ? ` · Request ${attempt.requestId}` : ''}
                {' · Updated '}{attempt.updatedAt ? format(new Date(attempt.updatedAt),'dd MMM yyyy, h:mm a') : '—'}
              </div>
            </article>
          })}</div>}
        </section>
        <section style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14,overflow:'hidden'}}>
          <div style={{padding:'16px 20px',display:'flex',alignItems:'center',gap:12,borderBottom:'1px solid #e8f0f7',flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:220}}>
              <div style={{fontSize:15,fontWeight:800,color:'#023c62'}}>Settlement batches</div>
              <div style={{fontSize:12,color:'#6b7fa3',marginTop:3}}>Razorpay-reported batch status and UTR. “Processed” is provider status, not independent bank-statement confirmation.</div>
            </div>
            <label style={{display:'grid',gap:4,fontSize:10,fontWeight:800,color:'#52647e'}}>From
              <input type="date" value={settlementSummaryFrom} max={settlementSummaryTo} onChange={(event) => setSettlementSummaryFrom(event.target.value)} style={{height:36,padding:'0 9px',border:'1px solid #c9ddea',borderRadius:7,color:'#19324a',fontSize:12}} />
            </label>
            <label style={{display:'grid',gap:4,fontSize:10,fontWeight:800,color:'#52647e'}}>To
              <input type="date" value={settlementSummaryTo} min={settlementSummaryFrom} max={format(new Date(),'yyyy-MM-dd')} onChange={(event) => setSettlementSummaryTo(event.target.value)} style={{height:36,padding:'0 9px',border:'1px solid #c9ddea',borderRadius:7,color:'#19324a',fontSize:12}} />
            </label>
            <button type="button" onClick={queueSettlementSummaryReconciliation} disabled={settlementSummaryBusy} style={{display:'inline-flex',alignItems:'center',gap:7,padding:'9px 13px',border:0,borderRadius:9,background:settlementSummaryBusy?'#91a8b8':'#023c62',color:'#fff',fontSize:12,fontWeight:800,cursor:settlementSummaryBusy?'wait':'pointer'}}>
              {settlementSummaryBusy ? <Loader2 className="crm-spin" size={14}/> : <RefreshCw size={14}/>} {settlementSummaryBusy ? 'Queueing…' : 'Sync settlement status'}
            </button>
          </div>
          {!settlementSummaries.length ? <div style={{padding:18,color:'#6b7fa3',fontSize:12}}>No settlement batches synced yet.</div>
          : <div style={{display:'grid'}}>{settlementSummaries.map((item: any) => {
            const statusColor = item.status === 'processed' ? '#047857' : item.status === 'failed' ? '#b91c1c' : '#b45309'
            return <article key={`${item.mode}:${item.providerSettlementId}`} style={{padding:'12px 18px',borderBottom:'1px solid #eef4f8',display:'grid',gap:7}}>
              <div style={{display:'flex',gap:9,alignItems:'center',flexWrap:'wrap'}}>
                <strong style={{fontFamily:'var(--crm-font-mono)',fontSize:11,color:'#023c62'}}>{item.providerSettlementId}</strong>
                <span style={{fontSize:10,fontWeight:900,color:statusColor}}>{item.status.toUpperCase()}</span>
                <span style={{fontSize:10,color:'#71839d'}}>{item.mode} mode</span>
                <span style={{fontSize:11,color:'#71839d'}}>{format(new Date(item.providerCreatedAt),'dd MMM yyyy, h:mm a')}</span>
              </div>
              <div style={{display:'flex',gap:14,flexWrap:'wrap',fontSize:11,color:'#334155'}}>
                <span>Settlement amount <strong>₹{moneyFromPaise(item.amountPaise)}</strong></span>
                <span>Fees <strong>₹{moneyFromPaise(item.feesPaise)}</strong></span>
                <span>Tax <strong>₹{moneyFromPaise(item.taxPaise)}</strong></span>
                <span>UTR <strong style={{overflowWrap:'anywhere'}}>{item.settlementUtr || 'Not assigned'}</strong></span>
              </div>
            </article>
          })}</div>}
        </section>
        <section style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14,overflow:'hidden'}}>
          <div style={{padding:'16px 20px',display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid #e8f0f7',flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:220}}>
              <div style={{fontSize:15,fontWeight:800,color:'#023c62'}}>Settlement and bank summary</div>
              <div style={{fontSize:12,color:'#6b7fa3',marginTop:3}}>Read-only comparison: settlement batches use provider-created dates, report lines use settlement-received dates, and unmatched credits use bank transaction dates. Nothing here posts to the customer ledger.</div>
            </div>
            <label style={{display:'grid',gap:4,fontSize:10,fontWeight:800,color:'#52647e'}}>Mode
              <select value={settlementReportMode} onChange={(event) => setSettlementReportMode(event.target.value as 'LIVE' | 'TEST')} style={{height:36,padding:'0 9px',border:'1px solid #c9ddea',borderRadius:7,color:'#19324a',fontSize:12,background:'#fff'}}>
                <option value="LIVE">Live</option><option value="TEST">Test</option>
              </select>
            </label>
            <button type="button" onClick={loadSettlementSummaryReport} disabled={settlementSummaryReportBusy} style={{display:'inline-flex',alignItems:'center',gap:7,padding:'9px 13px',border:0,borderRadius:9,background:settlementSummaryReportBusy?'#91a8b8':'#023c62',color:'#fff',fontSize:12,fontWeight:800,cursor:settlementSummaryReportBusy?'wait':'pointer'}}>
              {settlementSummaryReportBusy ? <Loader2 className="crm-spin" size={14}/> : <BarChart3 size={14}/>} {settlementSummaryReportBusy ? 'Loading…' : 'Build summary'}
            </button>
          </div>
          {!settlementSummaryReport ? <div style={{padding:18,color:'#6b7fa3',fontSize:12}}>Choose the date range above and build the report.</div> : <div style={{padding:16,display:'grid',gap:14}}>
            {(() => {
              const totals = settlementSummaryReport.totals || {}
              const metrics = [
                ['Provider gross', totals.providerGrossPaise], ['Refunds', totals.refundsPaise], ['Fees', totals.feesPaise], ['Tax', totals.taxPaise],
                ['Report net', totals.reportNetPaise], ['Processed settlement', totals.processedSettlementAmountPaise], ['Matched bank credit', totals.bankCreditedPaise], ['Unmatched bank credits', totals.unmatchedBankCreditPaise], ['Processed with no bank match', totals.unmatchedProcessedSettlementPaise],
              ]
              return <>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:8}}>
                  {metrics.map(([label, value]) => <div key={label} style={{background:'#f5f9fc',border:'1px solid #e4edf4',borderRadius:9,padding:'10px 12px',minWidth:0}}>
                    <div style={{fontSize:10,color:'#71839d',fontWeight:800}}>{label}</div><strong style={{display:'block',fontSize:15,color:'#023c62',marginTop:4,overflowWrap:'anywhere'}}>₹{moneyFromPaise(value)}</strong>
                  </div>)}
                </div>
                <div style={{display:'flex',gap:12,flexWrap:'wrap',fontSize:11,color:'#52647e'}}>
                  <span>{totals.settlementBatchCount || 0} batches</span><span>{totals.pendingSettlementAmountPaise ? `Pending ₹${moneyFromPaise(totals.pendingSettlementAmountPaise)}` : 'No pending batches'}</span>
                  <span>{totals.failedSettlementAmountPaise ? `Failed ₹${moneyFromPaise(totals.failedSettlementAmountPaise)}` : 'No failed batches'}</span>
                  <span>Processed report vs settlement: <strong>₹{moneyFromPaise(totals.reportToSettlementVariancePaise)}</strong></span>
                  <span>Matched bank vs matched settlements: <strong>₹{moneyFromPaise(totals.bankVariancePaise)}</strong></span>
                  <span>{totals.unmatchedProcessedSettlementCount || 0} processed batches without a bank match · ₹{moneyFromPaise(totals.unmatchedProcessedSettlementPaise)} not yet matched</span>
                  <span>{totals.unmatchedBankCreditCount || 0} unmatched bank credits</span>
                  <span>{totals.settledLineCount || 0} settled report lines · {totals.pendingNotOnHoldLineCount || 0} pending (not held) · {totals.onHoldLineCount || 0} on hold</span>
                  <span>Pending or held report lines are not bank-confirmed credits. Delay alerts require the merchant's configured settlement cycle.</span>
                  <span>{totals.unsupportedCurrencyLineCount || 0} non-INR lines excluded from INR totals</span>
                  <span>{totals.summaryRecordsWithoutReportLines || 0} batches without report detail</span>
                </div>
                {!!settlementSummaryReport.settlements?.length && <div style={{display:'grid',gap:8}}>
                  {settlementSummaryReport.settlements.map((batch: any) => <details key={batch.providerSettlementId} style={{border:'1px solid #e4edf4',borderRadius:9,padding:'10px 12px',minWidth:0}}>
                    <summary style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',cursor:'pointer',fontSize:11,color:'#334155'}}>
                      <strong style={{fontFamily:'var(--crm-font-mono)',color:'#023c62',overflowWrap:'anywhere'}}>{batch.providerSettlementId}</strong>
                      <span>{batch.settlementSummaryStatus || 'Missing summary'}</span><span>Settlement ₹{moneyFromPaise(batch.settlementAmountPaise)}</span>
                      <span>Report net ₹{moneyFromPaise(batch.reportNetPaise)}</span><span>Bank ₹{moneyFromPaise(batch.bankCreditedPaise)}</span>
                      {batch.unsupportedCurrencies?.length > 0 && <span style={{color:'#b45309'}}>Excluded: {batch.unsupportedCurrencies.join(', ')}</span>}
                    </summary>
                    <div style={{display:'grid',gap:8,marginTop:10}}>
                      <div style={{display:'flex',gap:12,flexWrap:'wrap',fontSize:10,color:'#52647e'}}><span>Gross ₹{moneyFromPaise(batch.providerGrossPaise)}</span><span>Refunds ₹{moneyFromPaise(batch.refundsPaise)}</span><span>Fees ₹{moneyFromPaise(batch.feesPaise)}</span><span>Tax ₹{moneyFromPaise(batch.taxPaise)}</span><span>Transfers net ₹{moneyFromPaise(batch.transferNetPaise)}</span><span>Adjustments net ₹{moneyFromPaise(batch.adjustmentNetPaise)}</span><span>Report vs settlement ₹{moneyFromPaise(batch.reportToSettlementVariancePaise)}</span><span>Bank vs settlement ₹{moneyFromPaise(batch.bankToSettlementVariancePaise)}</span></div>
                      {batch.lines?.map((line: any) => <div key={line.id} style={{display:'grid',gap:4,padding:'7px 0',borderTop:'1px solid #eef4f8',fontSize:10,color:'#52647e',minWidth:0}}>
                        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}><strong>{line.entityType}</strong><span>{line.currency} {moneyFromPaise(line.amountPaise)}</span><span>Credit {moneyFromPaise(line.creditPaise)}</span><span>Debit {moneyFromPaise(line.debitPaise)}</span><span>Fee {moneyFromPaise(line.feePaise)}</span><span>Tax {moneyFromPaise(line.taxPaise)}</span><span>{line.settled ? 'Settled' : 'Not settled'}{line.onHold ? ' · On hold' : ''}</span><span style={{fontFamily:'var(--crm-font-mono)',overflowWrap:'anywhere'}}>{line.providerEntityId}</span></div>
                        {line.entityType === 'payment' && !line.crmPayments?.length && <div style={{paddingLeft:8,color:'#b45309'}}>No same-mode CRM payment reference matched.</div>}
                        {line.crmPayments?.map((payment: any) => <div key={payment.id} style={{display:'flex',gap:8,flexWrap:'wrap',paddingLeft:8,color:'#047857'}}><span>CRM payment {payment.id}</span><span>{payment.method}</span><span>₹{payment.amount}</span>{payment.orderId && <a href={`/dashboard/orders/${encodeURIComponent(payment.orderId)}`} style={{color:'#0369a1',fontWeight:700,textDecoration:'underline'}}>Open {payment.orderNumber ? `order ${payment.orderNumber}` : 'CRM order'}</a>}{payment.invoices?.map((invoice: any) => <span key={invoice.id}>Invoice {invoice.invoiceNumber}</span>)}</div>)}
                      </div>)}
                      {batch.bankMatches?.map((bankMatch: any) => <div key={bankMatch.id} style={{fontSize:10,color:'#047857',overflowWrap:'anywhere'}}>Matched bank credit ₹{moneyFromPaise(bankMatch.statementAmountPaise)} · {bankMatch.accountLabel} · {bankMatch.statementDate ? format(new Date(bankMatch.statementDate),'dd MMM yyyy') : 'date unavailable'} · {bankMatch.statementReference || 'no reference'} · variance ₹{moneyFromPaise(bankMatch.variancePaise)}</div>)}
                    </div>
                  </details>)}
                </div>}
                {settlementSummaryReport.unassignedReport && <div style={{padding:10,borderRadius:8,background:'#fff8eb',fontSize:11,color:'#92400e'}}>Unassigned report lines: {settlementSummaryReport.unassignedReport.lineCount}. These lines have no provider settlement ID and are excluded from batch matching.</div>}
                {!!settlementSummaryReport.unmatchedBankRows?.length && <div style={{display:'grid',gap:6}}><strong style={{fontSize:12,color:'#023c62'}}>Unmatched bank credits</strong>{settlementSummaryReport.unmatchedBankRows.map((row: any) => <div key={row.id} style={{display:'flex',gap:10,flexWrap:'wrap',fontSize:10,color:'#52647e',borderTop:'1px solid #eef4f8',paddingTop:6}}><span>{row.accountLabel}</span><span>Import row {row.rowNumber}</span><span>{row.transactionDate ? format(new Date(row.transactionDate),'dd MMM yyyy') : 'date unavailable'}</span><strong>₹{moneyFromPaise(row.amountPaise)}</strong><span style={{fontFamily:'var(--crm-font-mono)',overflowWrap:'anywhere'}}>{row.reference || 'No reference'}</span></div>)}</div>}
              </>
            })()}
          </div>}
        </section>
        <section style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14,overflow:'hidden'}}>
          <div style={{padding:'16px 20px',display:'flex',alignItems:'center',gap:12,borderBottom:'1px solid #e8f0f7',flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:220}}>
              <div style={{fontSize:15,fontWeight:800,color:'#023c62'}}>Provider-to-CRM payment sync</div>
              <div style={{fontSize:12,color:'#6b7fa3',marginTop:3}}>Scans Razorpay payments, recovers verified captures for known CRM checkout orders, and records mismatches for Finance review. It does not reconcile settlements or bank credits.</div>
            </div>
            <button type="button" onClick={queueProviderReconciliation} disabled={providerReconciliationBusy} style={{display:'inline-flex',alignItems:'center',gap:7,padding:'9px 13px',border:0,borderRadius:9,background:providerReconciliationBusy?'#91a8b8':'#023c62',color:'#fff',fontSize:12,fontWeight:800,cursor:providerReconciliationBusy?'wait':'pointer'}}>
              {providerReconciliationBusy ? <Loader2 className="crm-spin" size={14}/> : <RefreshCw size={14}/>} {providerReconciliationBusy ? 'Queueing…' : 'Run provider sync'}
            </button>
          </div>
          {!reconciliationRuns.length ? <div style={{padding:18,color:'#6b7fa3',fontSize:12}}>No provider payment sync runs yet.</div>
          : <div style={{display:'grid'}}>{reconciliationRuns.slice(0,5).map((run: any) => {
            const summary = run.summary || {}
            const statusColor = run.status === 'PASSED' ? '#047857' : run.status === 'QUEUED' || run.status === 'RUNNING' ? '#1d4ed8' : '#b91c1c'
            return <article key={run.id} style={{padding:'12px 18px',borderBottom:'1px solid #eef4f8',display:'grid',gap:6}}>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <strong style={{fontSize:12,color:'#023c62'}}>{run.mode || (run.runType.endsWith('_TEST') ? 'TEST' : 'LIVE')} mode</strong>
                <span style={{fontSize:10,fontWeight:900,color:statusColor}}>{run.status}</span>
                <span style={{fontSize:11,color:'#71839d'}}>{run.startedAt ? format(new Date(run.startedAt),'dd MMM yyyy, h:mm a') : 'Queued'}</span>
              </div>
              {String(run.runType || '').startsWith('RAZORPAY_PAYMENTS_') && summary.scanned != null && <div style={{fontSize:11,color:'#52647e'}}>{summary.scanned} scanned · {summary.recoveredCaptures || 0} recovered · {summary.alreadySettled || 0} already settled · {summary.reviewRequired || 0} review · {summary.captureWebhookNotProcessed || 0} capture webhook missing/not processed</div>}
              {String(run.runType || '').startsWith('RAZORPAY_SETTLEMENTS_') && <div style={{fontSize:11,color:'#52647e'}}>Settlement received {summary.request?.year || summary.year}-{String(summary.request?.month || summary.month || '').padStart(2,'0')}-{String(summary.request?.day || summary.day || '').padStart(2,'0')} · {summary.rows ?? '—'} report lines · {summary.inserted ?? 0} new · {summary.updated ?? 0} refreshed</div>}
              {String(run.runType || '').startsWith('RAZORPAY_SETTLEMENT_SUMMARIES_') && <div style={{fontSize:11,color:'#52647e'}}>{summary.rows ?? '—'} settlement batches · {summary.byStatus?.processed ?? 0} processed · {summary.byStatus?.created ?? 0} created · {summary.byStatus?.failed ?? 0} failed</div>}
              {summary.errorCode && <div style={{fontSize:11,color:'#b91c1c'}}>Run error: {summary.errorCode}</div>}
            </article>
          })}</div>}
        </section>
        <section style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14,overflow:'hidden'}}>
          <div style={{padding:'16px 20px',display:'flex',alignItems:'center',gap:12,borderBottom:'1px solid #e8f0f7',flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:220}}>
              <div style={{fontSize:15,fontWeight:800,color:'#023c62'}}>Razorpay settlement report</div>
              <div style={{fontSize:12,color:'#6b7fa3',marginTop:3}}>Imports provider payment, refund, transfer and adjustment cash lines. Settlement records do not change customer invoice balances or receipts.</div>
            </div>
            <label style={{display:'grid',gap:4,fontSize:10,fontWeight:800,color:'#52647e'}}>Settlement received date
              <input type="date" value={settlementReconDate} onChange={(event) => setSettlementReconDate(event.target.value)} style={{height:36,padding:'0 9px',border:'1px solid #c9ddea',borderRadius:7,color:'#19324a',fontSize:12}} />
            </label>
            <button type="button" onClick={queueSettlementReconciliation} disabled={settlementReconBusy} style={{display:'inline-flex',alignItems:'center',gap:7,padding:'9px 13px',border:0,borderRadius:9,background:settlementReconBusy?'#91a8b8':'#023c62',color:'#fff',fontSize:12,fontWeight:800,cursor:settlementReconBusy?'wait':'pointer'}}>
              {settlementReconBusy ? <Loader2 className="crm-spin" size={14}/> : <RefreshCw size={14}/>} {settlementReconBusy ? 'Queueing…' : 'Sync settlement date'}
            </button>
          </div>
          {!settlementReconLines.length ? <div style={{padding:18,color:'#6b7fa3',fontSize:12}}>No settlement report lines imported yet.</div>
          : <div style={{display:'grid'}}>{settlementReconLines.map((line: any) => {
            const matchColors: Record<string, string> = { MATCHED: '#047857', NOT_APPLICABLE: '#52647e' }
            const matchLabel = String(line.matchStatus || 'UNVERIFIED').replaceAll('_', ' ')
            return <article key={`${line.mode}:${line.entityType}:${line.providerEntityId}`} style={{padding:'12px 18px',borderBottom:'1px solid #eef4f8',display:'grid',gap:7}}>
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <strong style={{fontSize:12,color:'#023c62',textTransform:'capitalize'}}>{line.entityType}</strong>
                <span style={{fontFamily:'var(--crm-font-mono)',fontSize:11,color:'#52647e',overflowWrap:'anywhere'}}>{line.providerEntityId}</span>
                <span style={{fontSize:10,fontWeight:900,color:line.settled?'#047857':'#b45309'}}>{line.settled?'SETTLED':'PENDING'}</span>
                {line.onHold && <span style={{fontSize:10,fontWeight:900,color:'#b45309'}}>ON HOLD</span>}
                <span style={{fontSize:10,color:'#71839d'}}>{line.mode} mode</span>
                <span title="Read-only provider-to-CRM comparison; does not post or alter ledger entries" style={{padding:'3px 8px',borderRadius:20,background:line.matchStatus === 'MATCHED' ? '#ecfdf5' : line.matchStatus === 'NOT_APPLICABLE' ? '#f1f5f9' : '#fff7ed',color:matchColors[line.matchStatus] || '#b45309',fontSize:10,fontWeight:900}}>{matchLabel}</span>
              </div>
              <div style={{display:'flex',gap:14,flexWrap:'wrap',fontSize:11,color:'#52647e'}}>
                <span>Settlement <strong>{line.providerSettlementId || '—'}</strong></span>
                <span>UTR <strong>{line.settlementUtr || '—'}</strong></span>
                {line.method && <span>Method <strong>{line.method}</strong></span>}
                {line.providerSettledAt && <span>Received <strong>{format(new Date(line.providerSettledAt),'dd MMM yyyy, h:mm a')}</strong></span>}
              </div>
              <div style={{display:'flex',gap:14,flexWrap:'wrap',fontSize:11,color:'#334155'}}>
                <span>Amount <strong>{line.currency} {moneyFromPaise(line.amountPaise)}</strong></span>
                <span>Credit <strong>{line.currency} {moneyFromPaise(line.creditPaise)}</strong></span>
                <span>Debit <strong>{line.currency} {moneyFromPaise(line.debitPaise)}</strong></span>
                <span>Fee <strong>{line.currency} {moneyFromPaise(line.feePaise)}</strong></span>
                <span>Tax <strong>{line.currency} {moneyFromPaise(line.taxPaise)}</strong></span>
              </div>
              {(line.localPaymentId || line.localRefundAttemptId) && <div style={{fontSize:10,color:'#52647e',overflowWrap:'anywhere'}}>
                {line.localPaymentId && <>{line.entityType === 'refund' ? 'CRM refund payment ' : 'CRM payment '}<strong style={{fontFamily:'var(--crm-font-mono)'}}>{line.localPaymentId}</strong></>}
                {line.localRefundAttemptId && <> · CRM refund attempt <strong style={{fontFamily:'var(--crm-font-mono)'}}>{line.localRefundAttemptId}</strong></>}
              </div>}
              {line.matchDetail && <div style={{fontSize:10,color:line.matchStatus === 'MATCHED' ? '#047857' : '#9a3412'}}>{line.matchDetail}</div>}
            </article>
          })}</div>}
        </section>
        <section style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14,overflow:'hidden'}}>
          <div style={{padding:'16px 20px',borderBottom:'1px solid #e8f0f7'}}>
            <div style={{fontSize:15,fontWeight:800,color:'#023c62'}}>Bank statement import</div>
            <div style={{fontSize:12,color:'#6b7fa3',marginTop:3}}>Import a CSV to prepare bank-to-settlement matching. This does not mark invoices paid or confirm a bank match.</div>
          </div>
          <div style={{padding:18,display:'grid',gap:12}}>
            <div style={{fontSize:11,color:'#52647e',lineHeight:1.6}}>
              Required headers: <code>transaction_date,reference,debit,credit,currency</code>. Optional: <code>description,balance</code>. Dates: YYYY-MM-DD or DD/MM/YYYY; amounts: INR with up to 2 decimals. Exactly one of debit/credit must be greater than zero. Unsupported columns are rejected. Do not include account numbers in the account label.
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,220px),1fr))',gap:10,alignItems:'end'}}>
              <label style={{display:'grid',gap:5,fontSize:11,fontWeight:800,color:'#52647e'}}>Bank account label
                <input value={bankStatementLabel} maxLength={80} onChange={(event) => setBankStatementLabel(event.target.value)} placeholder="e.g. Hangers operating account" style={{height:38,padding:'0 10px',border:'1px solid #c9ddea',borderRadius:8,fontSize:12,color:'#19324a'}} />
              </label>
              <label style={{display:'grid',gap:5,fontSize:11,fontWeight:800,color:'#52647e'}}>Statement CSV (max 450 KB)
                <input type="file" accept=".csv,text/csv" onChange={selectBankStatement} style={{height:38,padding:'6px 8px',border:'1px solid #c9ddea',borderRadius:8,fontSize:11,color:'#19324a',background:'#fff'}} />
              </label>
              <button type="button" onClick={previewBankStatement} disabled={!bankStatementCsv || bankStatementBusy} style={{height:38,display:'inline-flex',alignItems:'center',justifyContent:'center',gap:7,padding:'0 13px',border:'1px solid #c9ddea',borderRadius:8,background:'#f7fbff',color:'#023c62',fontSize:12,fontWeight:800,cursor:!bankStatementCsv || bankStatementBusy?'not-allowed':'pointer'}}>
                {bankStatementBusy ? <Loader2 className="crm-spin" size={14}/> : <FileSpreadsheet size={14}/>} Preview CSV
              </button>
            </div>
            {bankStatementCsv && <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',fontSize:11,color:'#52647e'}}><Upload size={13}/>{bankStatementCsv.name}<span>{(new Blob([bankStatementCsv.text]).size / 1024).toFixed(1)} KB</span><button type="button" onClick={() => { setBankStatementCsv(null); setBankStatementPreview(null) }} style={{border:0,background:'transparent',color:'#b91c1c',fontWeight:800,cursor:'pointer'}}>Remove file</button></div>}
            {bankStatementPreview && <div style={{border:'1px solid #dce9f2',borderRadius:10,padding:14,display:'grid',gap:10,background:'#f8fbfd'}}>
              <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'center',fontSize:12,color:'#334155'}}>
                <strong>Preview: {bankStatementPreview.totalRows} rows</strong>
                <span style={{color:'#047857'}}>{bankStatementPreview.acceptedRows} valid</span>
                <span style={{color:bankStatementPreview.rejectedRows?'#b91c1c':'#64748b'}}>{bankStatementPreview.rejectedRows} rejected</span>
              </div>
              {bankStatementPreview.preview?.length > 0 && <div style={{display:'grid',gap:5}}>{bankStatementPreview.preview.slice(0,5).map((row: any) => <div key={row.rowNumber} style={{display:'flex',gap:10,flexWrap:'wrap',fontSize:11,color:'#52647e'}}><span>Row {row.rowNumber}</span><span>{format(new Date(row.transactionDate),'dd MMM yyyy')}</span><span>{row.direction}</span><strong>₹{moneyFromPaise(row.amountPaise)}</strong><span style={{fontFamily:'var(--crm-font-mono)',overflowWrap:'anywhere'}}>{row.reference}</span></div>)}</div>}
              {bankStatementPreview.errors?.length > 0 && <div style={{maxHeight:130,overflowY:'auto',fontSize:10,color:'#b91c1c'}}>Rejected rows: {bankStatementPreview.errors.map((item: any) => `#${item.rowNumber} ${item.errorCode}`).join(' · ')}</div>}
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <button type="button" onClick={importBankStatement} disabled={bankStatementBusy || !bankStatementLabel.trim()} style={{height:38,display:'inline-flex',alignItems:'center',justifyContent:'center',gap:7,padding:'0 13px',border:0,borderRadius:8,background:bankStatementBusy || !bankStatementLabel.trim()?'#91a8b8':'#023c62',color:'#fff',fontSize:12,fontWeight:800,cursor:bankStatementBusy || !bankStatementLabel.trim()?'not-allowed':'pointer'}}>
                  {bankStatementBusy ? <Loader2 className="crm-spin" size={14}/> : <CheckCircle2 size={14}/>} Confirm import
                </button>
                <span style={{fontSize:10,color:'#6b7fa3'}}>Accepted rows will be stored; rejected rows retain only their row number and validation codes. The original CSV is not saved.</span>
              </div>
            </div>}
          </div>
          <div style={{borderTop:'1px solid #e8f0f7'}}>
            {!bankStatementImports.length ? <div style={{padding:16,fontSize:12,color:'#6b7fa3'}}>No bank statements imported.</div> : bankStatementImports.map((item: any) => <article key={item.id} style={{borderBottom:'1px solid #eef4f8'}}>
              <div style={{padding:'11px 18px',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',fontSize:11,color:'#52647e'}}>
                <strong style={{color:'#023c62'}}>{item.accountLabel}</strong><span>{item.fileName}</span>
                <span style={{fontWeight:900,color:item.status==='IMPORTED'?'#047857':item.status==='PARTIAL'?'#b45309':'#b91c1c'}}>{item.status}</span>
                <span>{item.acceptedRows} valid · {item.rejectedRows} rejected</span>
                <span style={{marginLeft:'auto'}}>{format(new Date(item.importedAt),'dd MMM yyyy, h:mm a')}</span>
                <button type="button" onClick={() => toggleBankMatchReview(item.id)} disabled={bankMatchBusy && bankMatchImportId === item.id} style={{height:34,padding:'0 10px',display:'inline-flex',alignItems:'center',gap:6,border:'1px solid #c9ddea',borderRadius:8,background:'#f7fbff',color:'#023c62',fontSize:11,fontWeight:800,cursor:'pointer'}}>
                  {bankMatchImportId === item.id ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} {bankMatchImportId === item.id ? 'Hide matching' : 'Review bank matches'}
                </button>
              </div>
              {bankMatchImportId === item.id && <div style={{padding:'4px 18px 16px',display:'grid',gap:10,background:'#f8fbfd'}}>
                <div style={{fontSize:10,color:'#64748b'}}>Only LIVE processed settlements with a consistent settled INR report are considered. A match does not post a customer payment or change an invoice.</div>
                {bankMatchBusy && !bankMatchRows.length ? <div style={{padding:12,textAlign:'center',color:'#6b7fa3'}}><Loader2 className="crm-spin" size={16}/> Loading bank rows…</div>
                : !bankMatchRows.length ? <div style={{padding:12,fontSize:11,color:'#6b7fa3'}}>No eligible INR credit rows in this statement.</div>
                : bankMatchRows.map((row: any) => <div key={row.id} style={{padding:12,display:'grid',gap:9,border:'1px solid #dce9f2',borderRadius:9,background:'#fff',minWidth:0}}>
                  <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',fontSize:11,color:'#334155'}}>
                    <strong>Row {row.rowNumber}</strong><span>{row.transactionDate ? format(new Date(row.transactionDate),'dd MMM yyyy') : 'Date unavailable'}</span>
                    <strong>Credit ₹{moneyFromPaise(row.amountPaise)}</strong><span>Ref: <span style={{fontFamily:'var(--crm-font-mono)',overflowWrap:'anywhere'}}>{row.reference || '—'}</span></span>
                  </div>
                  {row.activeMatch ? <div style={{display:'grid',gap:8,padding:10,borderRadius:8,background:'#ecfdf5',fontSize:11,color:'#166534'}}>
                    <strong>{row.activeMatch.matchType === 'EXACT_UTR_AMOUNT_REPORT' ? 'Exact match' : 'Manager-reviewed match'} · {row.activeMatch.settlementId}</strong>
                    <span>Provider UTR {row.activeMatch.settlementUtr || '—'} · variance ₹{moneyFromPaise(row.activeMatch.variancePaise)}</span>
                    {row.activeMatch.reason && <span>Reason: {row.activeMatch.reason}</span>}
                    <input aria-label="Match reversal reason" value={bankMatchReasons[`reverse:${row.activeMatch.id}`] || ''} onChange={(event) => setBankMatchReasons((current) => ({...current,[`reverse:${row.activeMatch.id}`]:event.target.value}))} maxLength={500} placeholder="Manager reversal reason (minimum 12 characters)" style={{height:36,padding:'0 9px',border:'1px solid #b7ddc8',borderRadius:7,fontSize:11,color:'#19324a'}} />
                    <button type="button" onClick={() => reverseBankMatch(row)} disabled={bankMatchBusy || (bankMatchReasons[`reverse:${row.activeMatch.id}`] || '').trim().length < 12} style={{justifySelf:'start',height:34,padding:'0 11px',border:'1px solid #b91c1c',borderRadius:7,background:'#fff',color:'#b91c1c',fontSize:11,fontWeight:800,cursor:'pointer'}}>Reverse match</button>
                  </div> : !row.candidates.length ? <div style={{fontSize:11,color:'#6b7fa3'}}>No matching LIVE settlement candidates found by UTR or amount.</div>
                  : <>
                    {row.candidates.map((candidate: any) => <div key={candidate.id} style={{display:'grid',gap:6,padding:10,border:'1px solid #e2eaf0',borderRadius:8,background:'#fff',fontSize:11,color:'#52647e'}}>
                      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}><strong style={{color:'#023c62'}}>{candidate.providerSettlementId}</strong><span>{candidate.exact ? 'EXACT EVIDENCE' : 'REVIEW REQUIRED'}</span><span>{candidate.providerCreatedAt ? format(new Date(candidate.providerCreatedAt),'dd MMM yyyy') : ''}</span></div>
                      <div>UTR {candidate.settlementUtr || '—'} · settlement ₹{moneyFromPaise(candidate.amountPaise)} · report net ₹{moneyFromPaise(candidate.reportNetPaise)} · variance ₹{moneyFromPaise(candidate.variancePaise)}</div>
                      <div style={{color:candidate.eligible?'#52647e':'#b91c1c'}}>{candidate.reason}</div>
                      {!candidate.exact && <input aria-label={`Manager match reason for row ${row.rowNumber}`} value={bankMatchReasons[row.id] || ''} onChange={(event) => setBankMatchReasons((current) => ({...current,[row.id]:event.target.value}))} maxLength={500} placeholder="Manager review reason (minimum 12 characters)" style={{height:36,padding:'0 9px',border:'1px solid #c9ddea',borderRadius:7,fontSize:11,color:'#19324a'}} />}
                      <button type="button" onClick={() => confirmBankMatch(row, candidate)} disabled={!candidate.eligible || bankMatchBusy || (!candidate.exact && (bankMatchReasons[row.id] || '').trim().length < 12)} style={{justifySelf:'start',height:34,padding:'0 11px',border:0,borderRadius:7,background:!candidate.eligible || bankMatchBusy?'#91a8b8':'#023c62',color:'#fff',fontSize:11,fontWeight:800,cursor:!candidate.eligible || bankMatchBusy?'not-allowed':'pointer'}}>{!candidate.eligible ? 'Evidence blocked' : candidate.exact ? 'Confirm exact match' : 'Confirm reviewed match'}</button>
                    </div>)}
                    <div style={{fontSize:10,color:'#9a3412'}}>Non-exact matches require MANAGER or SUPER_ADMIN permission and a reason of at least 12 characters.</div>
                  </>}
                </div>)}
              </div>}
            </article>)}
          </div>
        </section>
        <section style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14,overflow:'hidden'}}>
          <div style={{padding:'16px 20px',borderBottom:'1px solid #e8f0f7'}}>
            <div style={{fontSize:15,fontWeight:800,color:'#023c62'}}>Razorpay disputes</div>
            <div style={{fontSize:12,color:'#6b7fa3',marginTop:3}}>Provider-fetched dispute status and deducted amount. These are tracked separately from captured receipts; no payment ledger entry is changed automatically.</div>
          </div>
          {webhookLoading ? <div style={{padding:24,textAlign:'center',color:'#6b7fa3'}}>Loading disputes…</div>
          : !webhookDisputes.length ? <div style={{padding:24,color:'#6b7fa3',fontSize:12}}>No dispute cases have been synchronized.</div>
          : <div style={{display:'grid'}}>{webhookDisputes.map((dispute) => (
            <article key={dispute.id} style={{padding:'14px 18px',borderBottom:'1px solid #eef4f8',display:'grid',gap:8}}>
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <strong style={{fontSize:13,color:'#023c62'}}>{dispute.providerDisputeId}</strong>
                <span style={{padding:'2px 8px',borderRadius:20,background:dispute.status === 'LOST' ? '#fef2f2' : '#eff6ff',color:dispute.status === 'LOST' ? '#b91c1c' : '#1d4ed8',fontSize:10,fontWeight:900}}>{dispute.status.replaceAll('_',' ')}</span>
                <span style={{fontSize:10,fontWeight:800,color:dispute.linkStatus === 'LINKED' ? '#047857' : '#b45309'}}>{dispute.linkStatus === 'LINKED' ? 'CRM PAYMENT MATCHED' : 'UNLINKED · REVIEW'}</span>
                <span style={{fontSize:10,color:'#71839d'}}>{dispute.mode} mode</span>
                {dispute.lastEventType === 'payment.dispute.action_required' && <span style={{padding:'2px 8px',borderRadius:20,background:'#fff7ed',color:'#9a3412',fontSize:10,fontWeight:900}}>ACTION REQUIRED</span>}
              </div>
              <div style={{fontFamily:'var(--crm-font-mono)',fontSize:11,color:'#52647e',overflowWrap:'anywhere'}}>Razorpay payment {dispute.providerPaymentId}{dispute.localPaymentId ? ` · CRM payment ${dispute.localPaymentId}` : ''}{dispute.phase ? ` · Phase ${dispute.phase}` : ''}{dispute.lastEventType ? ` · Event ${dispute.lastEventType}` : ''}</div>
              <div style={{display:'flex',gap:18,flexWrap:'wrap',fontSize:12,color:'#334155'}}>
                <span>Disputed <strong>{dispute.currency} {(Number(dispute.amountPaise) / 100).toFixed(2)}</strong></span>
                <span>Provider deduction <strong>{dispute.currency} {(Number(dispute.amountDeductedPaise) / 100).toFixed(2)}</strong></span>
                {dispute.respondBy && <span>Respond by <strong>{format(new Date(dispute.respondBy),'dd MMM yyyy, h:mm a')}</strong></span>}
                {dispute.reasonCode && <span>Reason code <strong>{dispute.reasonCode}</strong></span>}
              </div>
            </article>
          ))}</div>}
        </section>
        <section style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14,overflow:'hidden'}}>
          <div style={{padding:'16px 20px',display:'flex',alignItems:'center',gap:12,borderBottom:'1px solid #e8f0f7',flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:220}}>
              <div style={{fontSize:15,fontWeight:800,color:'#023c62'}}>Razorpay event recovery</div>
              <div style={{fontSize:12,color:'#6b7fa3',marginTop:3}}>Review failed provider events and queue an audited replay. CRM balances change only if provider verification succeeds.</div>
            </div>
            <button type="button" onClick={loadWebhookEvents} disabled={webhookLoading} style={{display:'inline-flex',alignItems:'center',gap:7,padding:'8px 12px',border:'1px solid #cfe0eb',borderRadius:9,background:'#fff',color:'#023c62',fontSize:12,fontWeight:800,cursor:'pointer'}}><RefreshCw size={14}/>{webhookLoading ? 'Refreshing' : 'Refresh'}</button>
          </div>
          {webhookLoading ? <div style={{padding:36,textAlign:'center',color:'#6b7fa3'}}><Loader2 className="crm-spin" size={18}/> Loading provider events…</div>
          : !webhookEvents.length ? <div style={{padding:36,textAlign:'center',color:'#6b7fa3'}}>No failed or review events are waiting.</div>
          : <div style={{display:'grid',gap:0}}>{webhookEvents.map((event) => (
            <article key={event.id} style={{padding:'14px 18px',borderBottom:'1px solid #eef4f8',display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12,alignItems:'center'}}>
              <div style={{minWidth:0}}>
                <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  <strong style={{fontSize:13,color:'#023c62'}}>{event.event}</strong>
                  <span style={{padding:'2px 8px',borderRadius:20,background:event.status === 'REVIEW' ? '#fff7ed' : '#eff6ff',color:event.status === 'REVIEW' ? '#9a3412' : '#1d4ed8',fontSize:10,fontWeight:900}}>{event.status}</span>
                  <span style={{fontSize:11,color:'#71839d'}}>Attempt {event.attempts}</span>
                </div>
                <div style={{fontFamily:'var(--crm-font-mono)',fontSize:11,color:'#52647e',marginTop:5,overflowWrap:'anywhere'}}>Event {event.eventId}{event.paymentId ? ` · Payment ${event.paymentId}` : ''}{event.orderId ? ` · Order ${event.orderId}` : ''}{event.refundId ? ` · Refund ${event.refundId}` : ''}{event.disputeId ? ` · Dispute ${event.disputeId}` : ''}</div>
                <div style={{fontSize:11,color:'#9a3412',marginTop:4}}>Last error: {event.error || 'Not available'} · Updated {event.updatedAt ? format(new Date(event.updatedAt),'dd MMM yyyy, h:mm a') : '—'}</div>
              </div>
              <button type="button" onClick={() => setReplayDialog({ event, reason: '' })} disabled={webhookBusyId === event.id} style={{display:'inline-flex',alignItems:'center',gap:7,padding:'8px 11px',border:0,borderRadius:9,background:'#023c62',color:'#fff',fontSize:11,fontWeight:800,cursor:'pointer',whiteSpace:'nowrap'}}><RefreshCw size={13}/> Queue replay</button>
            </article>
          ))}</div>}
        </section>
        </div>
      )}
      {replayDialog && (
        <div style={modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !webhookBusyId) setReplayDialog(null) }}>
          <div style={arModal} role="dialog" aria-modal="true" aria-labelledby="webhook-replay-title">
            <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start'}}>
              <div><div id="webhook-replay-title" style={{fontSize:17,fontWeight:900,color:'#023c62'}}>Queue webhook replay</div><div style={{fontSize:12,color:'#6b7fa3',marginTop:4}}>{replayDialog.event.event} · {replayDialog.event.eventId}</div></div>
              <button type="button" onClick={() => setReplayDialog(null)} disabled={Boolean(webhookBusyId)} style={modalClose} aria-label="Close">×</button>
            </div>
            <p style={{fontSize:12,color:'#52647e',lineHeight:1.5,margin:'14px 0'}}>This only requeues the durable event. The worker will verify it again; replay does not mark a payment paid or alter the ledger by itself.</p>
            <label style={{display:'block',fontSize:12,fontWeight:800,color:'#334155'}} htmlFor="webhook-replay-reason">Recovery reason <span style={{color:'#dc2626'}}>*</span></label>
            <textarea id="webhook-replay-reason" value={replayDialog.reason} onChange={(event) => setReplayDialog((current) => current ? { ...current, reason: event.target.value } : current)} maxLength={240} rows={3} placeholder="Explain what changed or what was verified before replay" style={{width:'100%',boxSizing:'border-box',marginTop:6,padding:10,border:'1px solid #cfe0eb',borderRadius:9,font: '13px var(--crm-font-ui)',resize:'vertical'}} />
            <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginTop:12,flexWrap:'wrap'}}>
              <span style={{fontSize:11,color:'#71839d'}}>Minimum 8 characters · saved in the audit trail</span>
              <div style={{display:'flex',gap:8}}><button type="button" onClick={() => setReplayDialog(null)} disabled={Boolean(webhookBusyId)} style={modalSecondary}>Cancel</button><button type="button" onClick={replayWebhook} disabled={Boolean(webhookBusyId) || replayDialog.reason.trim().length < 8} style={{...modalPrimary,opacity:webhookBusyId || replayDialog.reason.trim().length < 8 ? 0.55 : 1}}>{webhookBusyId ? 'Queueing…' : 'Confirm replay'}</button></div>
            </div>
          </div>
        </div>
      )}
      {arReminder.open && (
        <div className="ar-modal-backdrop" style={modalBackdrop}>
          <div className="ar-reminder-modal" style={arModal}>
            <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',marginBottom:14}}>
              <div>
                <div style={{fontSize:18,fontWeight:900,color:'#023c62'}}>Send Outstanding Reminder</div>
                <div style={{fontSize:12,color:'#6b7fa3',marginTop:4}}>{arReminder.group?.customer?.name} · {selectedForGroup(arReminder.group).length} selected · {S(selectedTotalForGroup(arReminder.group))}</div>
              </div>
              <button onClick={() => setArReminder({ open:false, group:null, confirm:false })} style={modalClose}>×</button>
            </div>
            {arPreviewLoading ? <div className="ar-preview-loading"><Loader2 className="crm-spin" size={18}/> Loading preview...</div>
            : arPreview?.error ? <div style={{padding:12,borderRadius:10,background:'#fef2f2',color:'#991b1b',fontWeight:700}}>{arPreview.error}</div>
            : (
              <>
                {arPreview?.qrImage && <img src={arPreview.qrImage} alt="Payment QR" style={{width:112,height:112,objectFit:'contain',border:'1px solid #e3edf6',borderRadius:12,background:'#fff',padding:8,marginBottom:10}} />}
                <pre style={previewBox}>{arPreview?.body || ''}</pre>
                <label style={{display:'flex',gap:9,alignItems:'flex-start',fontSize:13,color:'#334155',fontWeight:700,marginTop:12}}>
                  <input type="checkbox" checked={arReminder.confirm} onChange={(e) => setArReminder((current) => ({ ...current, confirm: e.target.checked }))} />
                  I confirm this WhatsApp reminder should be sent for the selected bills/orders.
                </label>
                <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:16}}>
                  <button onClick={() => setArReminder({ open:false, group:null, confirm:false })} disabled={arSending} style={modalSecondary}>Cancel</button>
                  <button onClick={sendArReminder} disabled={arSending || !arReminder.confirm} style={{...modalPrimary, opacity: arSending || !arReminder.confirm ? 0.55 : 1}}>{arSending ? 'Sending...' : 'Send WhatsApp'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const arMetricLabel = { fontSize: 10, color: '#7b8ca8', textTransform: 'uppercase' as const, letterSpacing: '0.07em', fontWeight: 800, marginBottom: 3 }
const arMetricValue = { fontSize: 15, color: '#023c62', fontWeight: 900 }
const arWhatsAppButton = { border: '1px solid #bfe6d2', background: '#e8f7ef', color: '#0d7a4e', borderRadius: 10, padding: '9px 12px', fontSize: 12, fontWeight: 900, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }
const modalBackdrop = { position: 'fixed' as const, inset: 0, background: 'rgba(2,22,38,0.42)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }
const arModal = { width: 'min(560px, 96vw)', maxHeight: '88vh', overflow: 'auto', background: '#fff', borderRadius: 16, border: '1px solid #dce8f0', boxShadow: '0 24px 70px rgba(2,22,38,0.28)', padding: 18 }
const modalClose = { border: '1px solid #dce8f0', background: '#fff', borderRadius: 9, width: 32, height: 32, cursor: 'pointer', fontSize: 20, color: '#52647e', lineHeight: 1 }
const previewBox = { margin: 0, whiteSpace: 'pre-wrap' as const, background: '#f7f9fc', border: '1px solid #e3edf6', borderRadius: 12, padding: 13, color: '#334155', fontFamily: 'var(--crm-font-ui)', fontSize: 13, lineHeight: 1.5 }
const modalSecondary = { border: '1px solid #dce8f0', background: '#fff', color: '#52647e', borderRadius: 10, padding: '10px 14px', fontWeight: 800, cursor: 'pointer' }
const modalPrimary = { border: 'none', background: '#023c62', color: '#fff', borderRadius: 10, padding: '10px 15px', fontWeight: 900, cursor: 'pointer' }
