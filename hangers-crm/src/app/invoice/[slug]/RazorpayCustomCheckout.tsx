'use client'

import { FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Banknote, CalendarDays, Check, ChevronLeft, ChevronRight, CreditCard, Landmark, LockKeyhole, Search, Smartphone, Wallet, X } from 'lucide-react'
import { LOGO_BLUE_URL } from '@/lib/branding'
import { Button } from '@/components/ui/Button'
import styles from './RazorpayCustomCheckout.module.css'
import SavedCards, { SavedCardSelection } from './checkout/SavedCards'
import { useCheckoutBack } from './checkout/CheckoutNavigation'
import CheckoutHandoff, { Handoff } from './checkout/CheckoutHandoff'
import { CardEligibility, Configuration, Methods, checkoutRequest, enabled, issuerPlans, networkCode, money, loadCustomSdk, supportedUpiIntentApps, upiIntentUnavailable } from './checkout/razorpay-sdk'

type CheckoutOrder = {
  key: string
  amount: number
  currency: string
  razorpayOrderId: string
  checkoutAttemptId?: string
  credCoinsDisabled?: boolean
  testContact?: string
  email?: string
  callbackUrl?: string
  redirect?: boolean
}

function BankLogo({ url, label }: { url?: string; label: string }) {
  const [failedUrl, setFailedUrl] = useState<string>()
  return <span className={styles.bankLogo} aria-hidden="true">
    {url && failedUrl !== url
      ? <img src={url} alt="" onError={() => setFailedUrl(url)} />
      : <span className={styles.bankInitials}>{label.trim().split(/\s+/).filter((part) => /^[A-Za-z0-9]/.test(part)).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>}
  </span>
}

type PaymentError = {
  error?: {
    code?: string
    description?: string
    source?: string
    step?: string
    reason?: string
    metadata?: { payment_id?: string; order_id?: string }
  }
}

const paymentErrorMessage = (response: PaymentError) => typeof response?.error?.description === 'string' && response.error.description
  ? response.error.description
  : 'Payment result unavailable. Check its status before retrying.'

type CustomInstance = {
  methods?: Record<string, any>
  once: (event: string, callback: (payload?: any) => void) => void
  on: (event: string, callback: (payload: any) => void) => void
  createPayment: (data: Record<string, any>, options?: Record<string, any>) => void | Promise<void>
  focus?: () => void
  getSupportedUpiIntentApps?: () => Promise<unknown>
  checkCREDEligibility?: (contact: string) => Promise<{ success: boolean; data?: { state?: string } }>
  emit?: (event: string) => void
  fetchVirtualAccount?: (options: { order_id: string }) => Promise<{ id: string }>
}

type CardField = {
  type?: string
  isValid: () => boolean
  on: (event: string, callback: (this: CardField) => void) => CardField
}

type CardFormatter = {
  add: (type: string, element: HTMLInputElement) => CardField
  off: () => void
}

type CustomConstructor = {
  new (options: Record<string, any>): CustomInstance
  setFormatter?: (form: HTMLFormElement) => CardFormatter
  emi?: { calculator: (principal: number, months: number, rate: number) => number }
}

const optionKeys = (value: any): string[] => {
  if (!value || value === true) return []
  if (Array.isArray(value)) return value.map((entry) => typeof entry === 'string' ? entry : entry?.code || entry?.name).filter(Boolean)
  if (typeof value === 'object') return Object.keys(value).filter((key) => {
    const option = value[key]
    return option === true || option === 1 || option === '1'
      || (typeof option === 'string' && option.trim() !== '' && option !== '0' && option !== 'false')
  })
  return []
}

const enabledCardNetworks = (value: any): string[] => {
  if (!value || typeof value !== 'object') return []
  return Object.entries(value)
    .filter(([, enabled]) => enabled === true || enabled === 1 || enabled === '1')
    .map(([code]) => code)
}

// Exact named networks from Input Restriction and the Methods ready response.
// Do not map `discover` to Diners; the formatter's AmEx spellings disagree.
const FORMATTER_NETWORK_CODES: Record<string, string> = {
  visa: 'VISA', mastercard: 'MC', maestro: 'MAES', maestro16: 'MAES', rupay: 'RUPAY',
  'American Express': 'AMEX',
}
export default function RazorpayCustomCheckout({
  order,
  invoiceNumber,
  orderNumber,
  customerName,
  customerPhone,
  onSuccess,
  onError,
  onCancel,
  onCheckStatus,
  apiBase,
  invoiceId,
  configuration,
  onPrepare,
  onSubmitted,
  recoveryRequired = false,
  readOnly = false,
  showList = false,
}: {
  order: CheckoutOrder
  invoiceNumber?: string
  orderNumber?: string
  customerName?: string
  customerPhone?: string
  onSuccess: (response: any) => void
  onError: (error: PaymentError) => void
  onCancel: () => void
  onCheckStatus: () => void
  apiBase?: string
  invoiceId?: string
  configuration?: Configuration
  onPrepare?: () => Promise<CheckoutOrder>
  onSubmitted?: () => void
  recoveryRequired?: boolean
  readOnly?: boolean
  showList?: boolean
}) {
  const [methods, setMethods] = useState<Record<string, any> | null>(null)
  const [methodLoadError, setMethodLoadError] = useState('')
  const [methodLoadAttempt, setMethodLoadAttempt] = useState(0)
  const [method, setMethod] = useState('')
  const [methodPage, setMethodPage] = useState(false)
  const [banks, setBanks] = useState<string[]>([])
  const [wallets, setWallets] = useState<string[]>([])
  const [upiApps, setUpiApps] = useState<string[]>([])
  const [upiDiscovery, setUpiDiscovery] = useState<'pending' | 'ready' | 'empty' | 'failed'>('pending')
  const [authoritativeMethods, setAuthoritativeMethods] = useState<Methods | undefined>(undefined)
  const [bank, setBank] = useState('')
  const [bankQuery, setBankQuery] = useState('')
  const bankDialog = useRef<HTMLDialogElement>(null)
  const bankSearchTrigger = useRef<HTMLButtonElement>(null)
  const methodDetailsHeading = useRef<HTMLHeadingElement>(null)
  const [wallet, setWallet] = useState('')
  const [provider, setProvider] = useState('')
  const [upiApp, setUpiApp] = useState('')
  const [emiDuration, setEmiDuration] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [handoff, setHandoff] = useState<Handoff | null>(null)
  const [cardNetwork, setCardNetwork] = useState('')
  const [cardFormatterReady, setCardFormatterReady] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [eligibility, setEligibility] = useState<CardEligibility | null>(null)
  const [eligibilityBusy, setEligibilityBusy] = useState(false)
  const [mobile, setMobile] = useState<boolean | null>(null)
  const [contact, setContact] = useState(order.testContact || customerPhone || '')
  const [downtime, setDowntime] = useState<{ status: string; fetchedAt?: string; staleAfterMs?: number; incidents: Array<{ id: string; severity: string; match: { action: string } }> } | null>(null)
  const [now, setNow] = useState(Date.now())
  const fieldErrorId = useId()
  const formId = `${fieldErrorId}-payment-form`
  const [actionTarget, setActionTarget] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 900px)')
    const update = () => setActionTarget(desktop.matches ? document.getElementById('checkout-payment-actions') : null)
    update()
    desktop.addEventListener('change', update)
    return () => desktop.removeEventListener('change', update)
  }, [])
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [credEligible, setCredEligible] = useState(false)
  const [credBusy, setCredBusy] = useState(false)
  const [savedCard, setSavedCard] = useState<SavedCardSelection | null>(null)
  const [savedCardsBusy, setSavedCardsBusy] = useState(false)
  const savedCardsBusyRef = useRef(false)
  const [saveRequested, setSaveRequested] = useState(false)
  const [transferBusy, setTransferBusy] = useState(false)
  const [transfer, setTransfer] = useState<{ virtualAccountId: string; amount: string; currency: string; closeBy: number | null; expiresAt: string; binding: string; receivers: Array<{ id: string; name: string; bankName: string; ifsc: string; accountNumber: string }> } | null>(null)
  const transferBinding = JSON.stringify([order.key, invoiceId, order.checkoutAttemptId, order.razorpayOrderId, order.amount, order.currency])
  const transferBindingRef = useRef(transferBinding)
  transferBindingRef.current = transferBinding
  const visibleTransfer = transfer?.binding === transferBinding && !recoveryRequired && Date.parse(transfer.expiresAt) > now
    && (!transfer.closeBy || transfer.closeBy * 1000 > now) ? transfer : null
  const transferLocked = useRef(false)
  const preparationInFlight = useRef(false)
  const aliveRef = useRef(true)
  const credSequence = useRef(0)
  const submittedRef = useRef(false)
  const eligibilitySequence = useRef(0)
  const expiryFieldRef = useRef<CardField | null>(null)
  const cardFieldRef = useRef<CardField | null>(null)
  const instanceRef = useRef<CustomInstance | null>(null)
  const constructorRef = useRef<CustomConstructor | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)

  onSuccessRef.current = onSuccess
  onErrorRef.current = onError
  const fieldProps = (name: string) => ({
    'aria-invalid': Boolean(fieldErrors[name]),
    'aria-describedby': fieldErrors[name] ? `${fieldErrorId}-${name}` : undefined,
  })
  const fieldMessage = (name: string) => fieldErrors[name]
    ? <small id={`${fieldErrorId}-${name}`} className={styles.fieldError}>{fieldErrors[name]}</small> : null
  const leaveMethod = () => {
    setMethodPage(false)
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>(`input[name="payment-method"][value="${method}"]`)?.focus())
  }
  useEffect(() => { if (readOnly || showList) setMethodPage(false) }, [readOnly, showList])
  useEffect(() => {
    if (!methodPage) return
    const frame = requestAnimationFrame(() => methodDetailsHeading.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [methodPage, method])
  useCheckoutBack(3, () => {
    if (!bankDialog.current?.open) return false
    bankDialog.current.close()
    return true
  })
  useCheckoutBack(1, () => {
    if (!methodPage || submitting) return false
    leaveMethod()
    return true
  })
  const invalidFields = (names: string[], message: string) => {
    setFieldErrors(Object.fromEntries(names.map((name) => [name, message])))
    setError(message)
    const control = formRef.current?.elements.namedItem(names[0])
    const firstControl = control instanceof RadioNodeList ? Array.from(control).find((element) => element instanceof HTMLElement) : control
    if (names[0] === 'bank') bankSearchTrigger.current?.focus()
    else if (firstControl instanceof HTMLElement) firstControl.focus()
  }
  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false; eligibilitySequence.current += 1; credSequence.current += 1 }
  }, [])

  useEffect(() => {
    let mounted = true
    // Release component callbacks even if the provider retains its listeners.
    const callbacks: {
      success: ((response: any) => void) | null
      error: ((response: PaymentError) => void) | null
      ready: ((payload?: any) => void) | null
    } = { success: null, error: null, ready: null }
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setMobile(isMobile)
    let readyTimer: ReturnType<typeof setTimeout> | undefined
    let readyReceived = false
    setMethods(null)
    setMethodLoadError('')
    setMethod('')
    setUpiApps([])
    setUpiApp('')
    setUpiDiscovery('pending')

    const initialize = async () => {
      try {
        if (!mounted) return
        const Razorpay = await loadCustomSdk()
        if (!mounted) return
        constructorRef.current = Razorpay
        const instance = new Razorpay({ key: order.key, image: LOGO_BLUE_URL,
          ...(order.redirect && order.callbackUrl ? { redirect: true, callback_url: order.callbackUrl } : {}),
        })
        instanceRef.current = instance
        callbacks.success = (response) => {
          if (!mounted) return
          onSuccessRef.current(response)
        }
        callbacks.error = (response: PaymentError) => {
          if (!mounted) return
          setSubmitting(false)
          setError(paymentErrorMessage(response))
          onErrorRef.current(response)
        }
        instance.on('payment.success', (response) => callbacks.success?.(response))
        instance.on('payment.error', (response: PaymentError) => callbacks.error?.(response))

        const acceptMethods = (payload?: any) => {
          if (!mounted) return
          const available = payload?.methods || instance.methods || {}
          if (!available || !Object.keys(available).length) return
          readyReceived = true
          if (readyTimer) clearTimeout(readyTimer)
          setMethodLoadError('')
          setMethods(available)
          setAuthoritativeMethods(available)
        }
        callbacks.ready = (payload) => {
          const available = payload?.methods || instance.methods
          if (available && typeof available === 'object' && !Array.isArray(available)) {
            readyReceived = true
            if (Object.keys(available).length) acceptMethods({ methods: available })
            else {
              if (readyTimer) clearTimeout(readyTimer)
              setMethods({})
              setAuthoritativeMethods({})
            }
            return
          }
          acceptMethods(payload)
        }
        instance.once('ready', (payload?: any) => callbacks.ready?.(payload))
        readyTimer = setTimeout(() => {
          if (mounted && !readyReceived) {
            setMethodLoadError('Razorpay payment methods could not be confirmed. Retry loading payment methods.')
          }
        }, 5000)
        if (instance.methods && Object.keys(instance.methods).length) acceptMethods()

        if (instance.getSupportedUpiIntentApps) {
          void instance.getSupportedUpiIntentApps().then((apps) => {
            const discoveredApps = supportedUpiIntentApps(apps)
            if (mounted && discoveredApps) {
              const usableApps = isMobile ? discoveredApps : []
              const compatible = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
                ? usableApps.filter((app) => app !== 'any') : usableApps
              setUpiApps(compatible)
              setUpiApp(compatible[0] || '')
              setUpiDiscovery(compatible.length ? 'ready' : 'empty')
            } else if (mounted) {
              setUpiDiscovery('failed')
            }
          }).catch(() => { if (mounted) setUpiDiscovery('failed') })
        } else setUpiDiscovery('failed')
      } catch (loadError: any) {
        if (mounted) setMethodLoadError(loadError?.message || 'Razorpay Custom Checkout could not start.')
      }
    }

    void initialize()
    return () => {
      mounted = false
      callbacks.success = null
      callbacks.error = null
      callbacks.ready = null
      if (readyTimer) clearTimeout(readyTimer)
      instanceRef.current = null
    }
  }, [order.key, order.redirect, order.callbackUrl, methodLoadAttempt, configuration])

  useEffect(() => {
    const tick = () => setNow(Date.now())
    const timer = window.setInterval(tick, 1000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(timer); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick) }
  }, [])
  useEffect(() => { setTransfer(null) }, [transferBinding, recoveryRequired])

  useEffect(() => {
    if (order.testContact) setContact(order.testContact)
  }, [order.testContact])

  useEffect(() => {
    if (order.razorpayOrderId) {
      preparationInFlight.current = false
      setPreparing(false)
      return
    }
    if (!method || order.razorpayOrderId || !onPrepare || recoveryRequired || readOnly || preparationInFlight.current) return
    preparationInFlight.current = true
    setPreparing(true)
    void onPrepare().then(() => {
      if (aliveRef.current) setError('')
    }).catch(() => {
      // The parent owns safe recovery and shows one sanitized status message.
      if (aliveRef.current) setError('')
    })
      .finally(() => {
        preparationInFlight.current = false
        if (aliveRef.current) setPreparing(false)
      })
  }, [method, order.razorpayOrderId, onPrepare, recoveryRequired, readOnly])

  const availableMethods = useMemo(() => {
    if (!methods) return []
    const list: Array<{ id: string; label: string }> = []
    if (enabled(methods.upi)) list.push({ id: 'upi', label: 'UPI' })
    if (enabled(methods.card)) list.push({ id: 'card', label: 'Credit or debit card' })
    const availableBanks = optionKeys(methods.netbanking)
    if (availableBanks.length) list.push({ id: 'netbanking', label: 'Netbanking' })
    const availableWallets = optionKeys(methods.wallet)
    if (availableWallets.length) list.push({ id: 'wallet', label: 'Wallet' })
    if (enabled(methods.emi)) {
      list.push({ id: 'emi', label: 'Card EMI' })
    }
    if (optionKeys(methods.cardless_emi).length) list.push({ id: 'cardless_emi', label: 'Cardless EMI' })
    if (optionKeys(methods.paylater).length) list.push({ id: 'paylater', label: 'Pay later' })
    if (enabled(methods.app?.cred)) list.push({ id: 'cred', label: 'CRED Pay' })
    if (configuration?.bankTransfer && apiBase) list.push({ id: 'bank_transfer', label: 'Bank transfer' })
    return list
  }, [methods, order.amount, configuration?.bankTransfer, apiBase])

  const methodSubtitle = (id: string) => {
    if (id === 'card') return cardNetworks.length ? 'Cards enabled for this checkout' : 'Enter card details'
    if (id === 'upi') {
      if (mobile === false) return 'Scan a UPI QR code'
      if (mobile && intentUnavailable) return 'UPI app payment unavailable on this device'
      if (mobile && upiDiscovery === 'ready') return `${upiApps.length} UPI apps available`
      return 'Checking UPI app availability'
    }
    if (id === 'netbanking') return `${banks.length} ${banks.length === 1 ? 'bank' : 'banks'} available`
    if (id === 'wallet') return `${wallets.length} ${wallets.length === 1 ? 'wallet' : 'wallets'} available`
    if (id === 'emi') return 'Check card eligibility for available plans'
    if (id === 'cardless_emi') return `${optionKeys(methods?.cardless_emi).length} providers available`
    if (id === 'paylater') return `${optionKeys(methods?.paylater).length} providers available`
    if (id === 'cred') return 'Check availability for this payment'
    if (id === 'bank_transfer') return 'Get current transfer instructions'
    return ''
  }

  const methodIcon = (id: string) => {
    if (id === 'upi' || id === 'cred') return Smartphone
    if (id === 'netbanking') return Landmark
    if (id === 'wallet') return Wallet
    if (id === 'emi' || id === 'cardless_emi') return CalendarDays
    if (id === 'paylater') return CalendarDays
    if (id === 'bank_transfer') return Banknote
    return CreditCard
  }

  useEffect(() => {
    if (!availableMethods.some((item) => item.id === method)) setMethod(availableMethods[0]?.id || '')
    const nextBanks = optionKeys(methods?.netbanking)
    const nextWallets = optionKeys(methods?.wallet)
    setBanks(nextBanks)
    setWallets(nextWallets)
    setBank((current) => nextBanks.includes(current) ? current : nextBanks[0] || '')
    setWallet((current) => nextWallets.includes(current) ? current : nextWallets[0] || '')
    const providers = optionKeys(methods?.[method])
    setProvider((current) => providers.includes(current) ? current : providers[0] || '')
  }, [availableMethods, method, methods])

  const plans = useMemo(() => issuerPlans(methods, eligibility, order.amount), [methods, eligibility, order.amount])
  const emiDurations = plans.map((plan) => String(plan.duration))
  const cardNetworks = useMemo(() => enabledCardNetworks(methods?.card_networks)
    .filter((code) => !configuration?.excludedCardNetworks?.includes(code)), [methods, configuration?.excludedCardNetworks])
  const formatterNetwork = FORMATTER_NETWORK_CODES[cardNetwork] || null
  const iinNetwork = networkCode(eligibility?.network || null)
  const detectedNetwork = savedCard?.sdk.token ? networkCode(savedCard.network || null) : iinNetwork || formatterNetwork
  // Formatter and Methods use separate namespaces. Unknown is not permission to bypass exclusions.
  const cardOrEmi = method === 'card' || method === 'emi'
  const excludedNetwork = Boolean(detectedNetwork && configuration?.excludedCardNetworks?.includes(detectedNetwork))
  const networkUnavailable = cardOrEmi && (excludedNetwork || (!detectedNetwork
    || Boolean(!savedCard?.sdk.token && formatterNetwork && iinNetwork && formatterNetwork !== iinNetwork)
    || !enabled(methods?.card_networks?.[detectedNetwork])))
  const intentUnavailable = upiIntentUnavailable(methods, authoritativeMethods, configuration?.feeBearer)
  const upiUnavailable = mobile === null || (mobile && (intentUnavailable || upiDiscovery !== 'ready' || !upiApps.includes(upiApp)))
  const collectContact = method === 'cred'
  const downtimeFresh = downtime?.status === 'fresh' && Number.isFinite(Date.parse(downtime.fetchedAt || ''))
    && Number.isFinite(downtime.staleAfterMs) && Number(downtime.staleAfterMs) > 0
    && now < Date.parse(downtime.fetchedAt || '') + Number(downtime.staleAfterMs)
  const networkAssets = (configuration?.artwork || []).filter((asset) => asset.kind === 'network' && cardNetworks.includes(asset.code))
  const preferredBankCodes = ['HDFC', 'ICIC', 'SBIN', 'UTIB', 'KKBK', 'YESB']
  const popularBanks = [...preferredBankCodes.filter((code) => banks.includes(code)), ...banks.filter((code) => !preferredBankCodes.includes(code))].slice(0, 6)
  const selectedPlan = plans.find((plan) => String(plan.duration) === emiDuration)
  const installment = selectedPlan && constructorRef.current?.emi?.calculator
    ? constructorRef.current.emi.calculator(order.amount, selectedPlan.duration, selectedPlan.rate) : null

  useEffect(() => {
    if (!apiBase || !method) return
    let mounted = true
    let expiryTimer: ReturnType<typeof setTimeout> | undefined
    const params = new URLSearchParams({ method: method === 'emi' ? 'card' : method })
    if (invoiceId) params.set('invoiceId', invoiceId)
    if (method === 'netbanking' && bank) params.set('bank', bank)
    if (method === 'upi' && mobile) params.set('flow', 'intent')
    if (detectedNetwork) params.set('network', detectedNetwork)
    if (eligibility?.issuerCode) params.set('issuer', eligibility.issuerCode)
    if (eligibility?.type) params.set('card_type', eligibility.type)
    const refresh = async () => {
      try {
        const snapshot = await checkoutRequest<any>(`${apiBase}/custom/downtime?${params}`)
        if (mounted) {
          setDowntime(snapshot)
          if (expiryTimer) clearTimeout(expiryTimer)
          const expires = Date.parse(snapshot.fetchedAt || '') + Number(snapshot.staleAfterMs)
          if (snapshot.status === 'fresh' && Number.isFinite(expires) && expires > Date.now()) {
            expiryTimer = setTimeout(() => { setDowntime((current) => current ? { ...current, status: 'stale' } : current); void refresh() }, expires - Date.now() + 1)
          }
        }
      } catch { if (mounted) setDowntime({ status: 'unknown', incidents: [] }) }
    }
    setDowntime(null)
    void refresh()
    const onReturn = () => { if (document.visibilityState === 'visible') void refresh() }
    window.addEventListener('online', onReturn)
    window.addEventListener('focus', onReturn)
    document.addEventListener('visibilitychange', onReturn)
    return () => { mounted = false; if (expiryTimer) clearTimeout(expiryTimer); window.removeEventListener('online', onReturn); window.removeEventListener('focus', onReturn); document.removeEventListener('visibilitychange', onReturn) }
  }, [apiBase, invoiceId, method, bank, mobile, upiApp, detectedNetwork, eligibility?.issuerCode, eligibility?.type])

  const checkCardEligibility = async () => {
    if (!apiBase) return
    const input = formRef.current?.querySelector<HTMLInputElement>('[name="card-number"]')
    const iin = (input?.value || '').replace(/\s/g, '').slice(0, 8)
    const sequence = ++eligibilitySequence.current
    setEligibility(null)
    setEligibilityBusy(false)
    if (!/^\d{6,8}$/.test(iin)) return
    setEligibilityBusy(true)
    try {
      const result = await checkoutRequest<CardEligibility>(`${apiBase}/custom/card-eligibility${invoiceId ? `?invoiceId=${encodeURIComponent(invoiceId)}` : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ iin, invoiceId }),
      })
      if (sequence === eligibilitySequence.current) setEligibility(result)
    } catch (err: any) {
      if (sequence === eligibilitySequence.current) setError(err?.message || 'Card eligibility could not be verified.')
    } finally { if (sequence === eligibilitySequence.current) setEligibilityBusy(false) }
  }

  useEffect(() => { setCredEligible(false); setCredBusy(false); credSequence.current += 1 }, [contact, order.key, methodLoadAttempt])
  const checkCred = async () => {
    const sequence = ++credSequence.current
    setCredEligible(false)
    setCredBusy(false)
    setError('')
    if (!contact.trim().startsWith('+') || !instanceRef.current?.checkCREDEligibility) {
      invalidFields(['contact'], 'Enter your mobile number with its country code to check CRED eligibility.')
      return
    }
    setCredBusy(true)
    try {
      const result = await instanceRef.current.checkCREDEligibility(contact)
      if (sequence !== credSequence.current) return
      setCredEligible(result.success === true && result.data?.state === 'ELIGIBLE')
      if (result.success !== true || result.data?.state !== 'ELIGIBLE') setError('CRED eligibility is not confirmed for this number. Choose another method.')
    } catch (response: any) {
      if (sequence === credSequence.current) setError(paymentErrorMessage(response))
    } finally { if (sequence === credSequence.current) setCredBusy(false) }
  }

  const showTransfer = async () => {
    if (transferLocked.current || !apiBase || !order.checkoutAttemptId || !instanceRef.current?.fetchVirtualAccount) return
    transferLocked.current = true; setTransferBusy(true); setError('')
    setTransfer(null)
    const binding = transferBinding
    const body = { invoiceId, attemptId: order.checkoutAttemptId }
    try {
      let result = await checkoutRequest<any>(`${apiBase}/custom/bank-transfer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (result.sdk) {
        if (!aliveRef.current || binding !== transferBindingRef.current) return
        const account = await instanceRef.current.fetchVirtualAccount(result.sdk)
        result = await checkoutRequest<any>(`${apiBase}/custom/bank-transfer`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, virtualAccountId: account.id }),
        })
      }
      if (!result.virtualAccountId || !Array.isArray(result.receivers) || !result.receivers.length
        || result.attemptId !== order.checkoutAttemptId || result.providerOrderId !== order.razorpayOrderId
        || String(result.amount) !== String(order.amount) || result.currency !== order.currency
        || !Number.isFinite(Date.parse(result.expiresAt)) || Date.parse(result.expiresAt) <= Date.now()
        || (result.closeBy !== null && (!Number.isSafeInteger(result.closeBy) || result.closeBy * 1000 <= Date.now()))) throw new Error('Bank transfer instructions could not be verified.')
      if (aliveRef.current && binding === transferBindingRef.current) setTransfer({ ...result, binding })
    } catch (response: any) { if (aliveRef.current) setError(response?.message || paymentErrorMessage(response)) }
    finally { transferLocked.current = false; if (aliveRef.current) setTransferBusy(false) }
  }

  useEffect(() => {
    setCardNetwork('')
    setCardFormatterReady(false)
    setEligibility(null)
    setEligibilityBusy(false)
    eligibilitySequence.current += 1
    if (!methods || !methodPage || (method !== 'card' && method !== 'emi') || savedCard?.sdk.token) return
    const form = formRef.current
    const input = form?.querySelector<HTMLInputElement>('[name="card-number"]')
    const sdk = constructorRef.current
    if (!form || !input || !sdk?.setFormatter) {
      setError('Card validation could not load. Reload checkout before entering your card details.')
      return
    }
    const formatter = sdk.setFormatter(form)
    const field = formatter.add('card', input)
    cardFieldRef.current = field
    field.on('change', function () { setCardNetwork(this.type || ''); setError(''); setEligibility(null); setEligibilityBusy(false); eligibilitySequence.current += 1 })
    field.on('network', function () { setCardNetwork(this.type || '') })
    const expiryInput = form.querySelector<HTMLInputElement>('[name="card-expiry"]')
    if (expiryInput) expiryFieldRef.current = formatter.add('expiry', expiryInput)
    const cvvInput = form.querySelector<HTMLInputElement>('[name="card-cvv"]')
    if (cvvInput) formatter.add('number', cvvInput)
    setCardFormatterReady(true)
    return () => {
      formatter.off()
      cardFieldRef.current = null
      expiryFieldRef.current = null
      eligibilitySequence.current += 1
    }
  }, [methods, method, methodPage, savedCard?.sdk.token])

  useEffect(() => {
    if (!emiDurations.includes(emiDuration)) setEmiDuration(emiDurations[0] || '')
  }, [emiDurations, emiDuration])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (readOnly || (method === 'card' && saveRequested && !savedCard?.sdk.token && savedCard?.sdk.save !== 1) || savedCardsBusyRef.current || recoveryRequired || submittedRef.current || submitting || preparing || !order.razorpayOrderId || !instanceRef.current || !method) return
    if (method === 'bank_transfer') return
    if (configuration && configuration.feeBearer !== 'MERCHANT') return setError('Payment configuration needs review. Please contact Hangers before paying.')
    if (!methods || !availableMethods.some((item) => item.id === method)) return
    setError('')
    setFieldErrors({})
    const form = formRef.current
    const values = new FormData(form || undefined)
    const common: Record<string, any> = {
      amount: order.amount,
      currency: order.currency,
      order_id: order.razorpayOrderId,
      method,
      ...(order.redirect && order.callbackUrl ? { callback_url: order.callbackUrl } : {}),
      ...(collectContact && contact ? { contact } : order.testContact ? { contact: order.testContact } : {}),
      ...((order.email || values.get('email')) ? { email: order.email || String(values.get('email')).trim() } : {}),
    }
    let payment: Record<string, any> = common
    let options: Record<string, any> | undefined

    if (method === 'card' && savedCard?.sdk.token) {
      if (!savedCard.expiresAt || !Number.isFinite(Date.parse(savedCard.expiresAt)) || Date.parse(savedCard.expiresAt) <= Date.now()) {
        setSavedCard(null)
        return setError('Select your saved card again before paying.')
      }
      const cvv = String(values.get('card-cvv') || '')
      if (!detectedNetwork || networkUnavailable || (savedCard.cvvRequired !== false && !cvv)) {
        return invalidFields(['card-cvv'], 'Check this saved card is enabled and enter its security code.')
      }
      payment = { ...common, ...savedCard.sdk, ...(cvv ? { 'card[cvv]': cvv } : {}) }
    } else if (method === 'card' || method === 'emi') {
      if (method === 'card' && savedCard?.sdk.save === 1 && (!savedCard.expiresAt || Date.parse(savedCard.expiresAt) <= Date.now())) {
        setSavedCard(null)
        return setError('Confirm your save-card choice again before paying.')
      }
      const number = String(values.get('card-number') || '').replace(/\s/g, '')
      const [expiryMonth = '', expiryYear = ''] = String(values.get('card-expiry') || '').replace(/\s/g, '').split('/')
      const cvv = String(values.get('card-cvv') || '')
      const name = String(values.get('card-name') || customerName || '')
      const month = Number(expiryMonth)
      const normalizedYear = Number(expiryYear.length === 2 ? `20${expiryYear}` : expiryYear)
      const expiry = new Date(normalizedYear, month - 1, 1)
      const currentMonth = new Date()
      currentMonth.setDate(1)
      currentMonth.setHours(0, 0, 0, 0)
      if (!name.trim()) return invalidFields(['card-name'], 'Enter the name on the card.')
      if (networkUnavailable || !cardFieldRef.current?.isValid() || !expiryFieldRef.current?.isValid()
        || !/^\d{2}$/.test(expiryMonth) || month < 1 || month > 12 || !/^\d{2}$/.test(expiryYear)
        || !Number.isFinite(expiry.getTime()) || expiry < currentMonth || !cvv) {
        invalidFields(['card-number', 'card-expiry', 'card-cvv'], 'Check the card number, expiry date and security code, then try again.')
        return
      }
      payment = {
        ...common,
        ...(method === 'card' && saveRequested && savedCard?.sdk.save === 1 && !savedCard.sdk.token ? savedCard.sdk : {}),
        save: method === 'card' && saveRequested && savedCard?.sdk.save === 1 ? 1 : 0,
        ...(method === 'emi' ? { emi_duration: Number(emiDuration) } : {}),
        'card[name]': name,
        'card[number]': number,
        'card[cvv]': cvv,
        'card[expiry_month]': expiryMonth,
        'card[expiry_year]': expiryYear.slice(-2),
      }
      if (method === 'emi' && !plans.some((plan) => String(plan.duration) === emiDuration)) {
        invalidFields(['emi-duration'], 'Choose an EMI duration available for this invoice amount.')
        return
      }
    } else if (method === 'netbanking') {
      if (!bank || !banks.includes(bank)) return invalidFields(['bank'], 'Choose an available bank.')
      payment = { ...common, bank }
    } else if (method === 'wallet') {
      if (!wallet || !wallets.includes(wallet)) return invalidFields(['wallet'], 'Choose an available wallet.')
      payment = { ...common, wallet }
    } else if (method === 'upi') {
      if (upiUnavailable) return setError('UPI app payment is unavailable on this device. Choose another payment method.')
      if (mobile) options = { app: upiApp }
      else payment = { ...common, upi: { qr: true, timeout: 10 } }
    } else if (method === 'cardless_emi' || method === 'paylater') {
      const providers = optionKeys(methods?.[method])
      if (!provider || !providers.includes(provider)) return invalidFields(['provider'], 'Choose an available provider.')
      payment = { ...common, provider }
    } else if (method === 'cred') {
      if (!credEligible || !order.credCoinsDisabled) return setError('CRED eligibility and payment amount must be confirmed before paying.')
      payment = { ...common, method: 'app', provider: 'cred' }
    }

    submittedRef.current = true
    setSubmitting(true)
    const selectedLabel = method === 'netbanking' ? (typeof methods?.netbanking?.[bank] === 'string' ? methods.netbanking[bank] : bank)
      : method === 'wallet' ? configuration?.artwork.find((asset) => asset.kind === 'wallet' && asset.code === wallet)?.label || wallet
      : method === 'cardless_emi' || method === 'paylater' ? (typeof methods?.[method]?.[provider] === 'string' ? methods[method][provider] : provider)
      : method === 'upi' && mobile ? configuration?.artwork.find((asset) => asset.kind === 'upi' && asset.code === upiApp)?.label || upiApp
      : availableMethods.find((item) => item.id === method)?.label || method
    setHandoff({ method, label: selectedLabel, ...(method === 'upi' ? { upiMode: mobile ? 'intent' : 'qr' } : {}), stage: 'opening' })
    onSubmitted?.()
    try {
      const result = instanceRef.current.createPayment(payment, options)
      setHandoff((current) => current ? { ...current, stage: 'waiting' } : current)
      // Card data is not retained in component state or sent to CRM APIs.
      form?.querySelectorAll<HTMLInputElement>('[name="card-number"], [name="card-cvv"], [name="card-expiry"]').forEach((input) => { input.value = '' })
      if (result && typeof (result as Promise<void>).catch === 'function') {
        void (result as Promise<void>).catch((paymentError: PaymentError) => {
          if (!aliveRef.current) return
          setSubmitting(false)
          setError(paymentErrorMessage(paymentError))
          onErrorRef.current(paymentError)
        })
      }
    } catch (paymentError: any) {
      setSubmitting(false)
      setError(paymentErrorMessage(paymentError))
      onErrorRef.current(paymentError)
    }
  }

  const upiControls = <div className={styles.upiControls}>
    {mobile && !intentUnavailable && upiDiscovery === 'ready' ? <div className={styles.brandChoices} role="group" aria-label="UPI apps">
      {upiApps.map((app) => {
        const asset = configuration?.artwork.find((entry) => entry.kind === 'upi' && entry.code === app)
        return <button key={app} type="button" className={styles.brandChoice} aria-pressed={upiApp === app} disabled={submitting} onClick={() => setUpiApp(app)}>
          {asset && <img src={asset.url} alt="" width={32} height={32} referrerPolicy="no-referrer" />}
          <span>{asset?.label || (app === 'any' ? 'Other UPI apps' : app)}</span>
        </button>
      })}
    </div> : <span className={styles.hint} role="status">{mobile === null ? 'Checking device support...' : mobile === false ? 'Scan the QR in the Razorpay payment window using your UPI app.' : intentUnavailable ? 'UPI Intent is disabled for this checkout. Choose another payment method.' : upiDiscovery === 'pending' ? 'Checking supported UPI apps...' : upiDiscovery === 'failed' ? 'Supported UPI apps could not be confirmed.' : 'No supported UPI app option was returned. Choose another payment method.'}</span>}
    {mobile && !intentUnavailable && (upiDiscovery === 'failed' || upiDiscovery === 'empty') && <button type="button" disabled={submitting} onClick={() => setMethodLoadAttempt((value) => value + 1)}>Retry UPI discovery</button>}
  </div>

  const paymentActions = <div className={styles.actions}>
    <p className={styles.payingWith}><span>Paying with</span><b>{availableMethods.find((item) => item.id === method)?.label || 'Choose a payment method'}</b></p>
    {method !== 'bank_transfer' && <Button size="lg" type="submit" form={formId} disabled={(method === 'card' && saveRequested && !savedCard?.sdk.token && savedCard?.sdk.save !== 1) || savedCardsBusy || recoveryRequired || submitting || preparing || !order.razorpayOrderId || !methods || !method || Boolean(configuration && configuration.feeBearer !== 'MERCHANT') || networkUnavailable || ((method === 'card' || method === 'emi') && !savedCard?.sdk.token && !cardFormatterReady) || (method === 'emi' && !emiDurations.length) || (method === 'upi' && upiUnavailable)}>
      <LockKeyhole size={16} aria-hidden="true" />
      {submitting ? 'Confirming payment...' : preparing ? 'Preparing payment...' : `${method === 'upi' && mobile === false ? 'Show QR for' : 'Pay'} ${money(order.amount, order.currency)}${method === 'upi' && mobile === false ? '' : ` with ${availableMethods.find((item) => item.id === method)?.label || ''}`}`}
    </Button>}
    <button type="button" className={styles.cancel} onClick={onCancel} disabled={submitting}>Cancel</button>
    {submitting && <button type="button" className={styles.cancel} onClick={onCheckStatus}>Check payment status</button>}
    {submitting && typeof instanceRef.current?.focus === 'function' && <button type="button" className={styles.cancel} onClick={() => {
      try { instanceRef.current?.focus?.() } catch { setError('Could not return to payment. Check payment status to continue.') }
    }}>Return to payment</button>}
    {submitting && method === 'upi' && typeof instanceRef.current?.emit === 'function' && <button type="button" className={styles.cancel} onClick={() => {
      try { instanceRef.current?.emit?.('payment.cancel') } catch { setError('Cancellation could not be confirmed. Check payment status.') }
      onCheckStatus()
    }}>Cancel UPI request and check status</button>}
  </div>

  return (
    <form id={formId} ref={formRef} className={styles.checkout} onSubmit={submit} onInvalid={(event) => {
      const input = event.target as HTMLInputElement | HTMLSelectElement
      if (input.name) setFieldErrors((current) => ({ ...current, [input.name]: input.validationMessage }))
    }} onChange={(event) => {
      const input = event.target as HTMLInputElement | HTMLSelectElement
      if (input.name) setFieldErrors((current) => { const next = { ...current }; delete next[input.name]; return next })
    }}>
      <details className={styles.details}><summary>Checkout references</summary><div className={styles.references}>
        {invoiceNumber && <span>Invoice <b>{invoiceNumber}</b></span>}
        {orderNumber && <span>Order <b>{orderNumber}</b></span>}
        {order.razorpayOrderId && <span>Razorpay order <b>{order.razorpayOrderId}</b></span>}
      </div></details>
      {!methods && !methodLoadError && !error && <p role="status">Loading available payment methods…</p>}
      {methodLoadError && <div className={styles.notice} role="alert">
        <p>{methodLoadError}</p>
        <button type="button" className={styles.retry} onClick={() => { setMethodLoadError(''); setError(''); setMethodLoadAttempt((attempt) => attempt + 1) }}>Retry payment methods</button>
      </div>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {methods && !availableMethods.length && <div className={styles.notice} role="status"><p>No available payment option was returned for this checkout.</p><button type="button" onClick={() => setMethodLoadAttempt((attempt) => attempt + 1)}>Reload payment methods</button></div>}
      {configuration && configuration.feeBearer !== 'MERCHANT' && <p className={styles.notice} role="status">Online payment configuration needs review. Please contact Hangers before paying.</p>}
      {downtimeFresh && downtime?.incidents.some((incident) => incident.match.action === 'warn') && <p className={styles.notice} role="status">Razorpay reports a current disruption for this payment option. You can choose another available method.</p>}
      {!!availableMethods.length && <>
        {submitting && handoff && !showList && <CheckoutHandoff handoff={handoff} />}
        <fieldset hidden={submitting && !showList} disabled={readOnly || submitting || recoveryRequired} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className={styles.contactCard}>
          <span className={styles.avatar} aria-hidden="true">{customerName?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('') || <Smartphone size={20} />}</span>
          <div className={styles.contactInfo}><b>{customerName || 'Customer'}</b><span>{contact || customerPhone}{order.email && <> · {order.email}</>}</span></div>
          {(!order.email || collectContact) && <details className={styles.contactEdit}>
          <summary>Edit contact</summary>
          <div className={styles.contactFields}>
        {!order.email && <div className={styles.row}>
          <label>Email address (optional)<input name="email" {...fieldProps('email')} type="text" inputMode="email" autoComplete="email" disabled={submitting} /></label>
          {fieldMessage('email')}
        </div>}
        {collectContact && <div className={styles.row}>
          <label>Mobile number with country code<input name="contact" {...fieldProps('contact')} type="tel" autoComplete="tel" value={contact} onChange={(event) => { credSequence.current += 1; setCredBusy(false); setCredEligible(false); setContact(event.target.value) }} readOnly={Boolean(order.testContact)} disabled={submitting} required />{fieldMessage('contact')}</label>
        </div>}
          </div></details>}
        </div>
        {methodPage && <nav className={styles.methodBreadcrumb} aria-label="Payment method">
          <button type="button" disabled={submitting} onClick={leaveMethod}><ChevronLeft size={16} aria-hidden="true" />Payment methods</button>
          <span aria-hidden="true">/</span><span aria-current="page">{availableMethods.find((item) => item.id === method)?.label}</span>
        </nav>}
        {configuration?.savedCards && <div hidden={methodPage && method !== 'card'}>
          <SavedCards mode={order.key.startsWith('rzp_test_') ? 'TEST' : 'LIVE'} keyId={order.key} disabled={submitting || recoveryRequired}
            presentation={methodPage ? 'card' : 'list'}
            onChange={(selection) => { setSavedCard(selection); if (selection?.sdk.token) setMethod('card') }}
            approvedTestContact={order.testContact} contextKey={`${invoiceId || ''}:${order.razorpayOrderId}`}
            onSaveRequested={setSaveRequested} onBusy={(value) => { savedCardsBusyRef.current = value; setSavedCardsBusy(value) }} />
          {!methodPage && method === 'card' && savedCard?.sdk.token && <label>{savedCard.cvvRequired === false ? 'CVV (optional)' : 'CVV'}
            <input name="card-cvv" {...fieldProps('card-cvv')} type="password" inputMode="numeric" autoComplete="cc-csc" required={savedCard.cvvRequired !== false} />{fieldMessage('card-cvv')}
          </label>}
        </div>}
        <fieldset className={styles.methods} disabled={submitting} hidden={methodPage}>
          <legend>Choose a payment method</legend>
          {[availableMethods.filter((item) => item.id === 'upi'), availableMethods.filter((item) => item.id !== 'upi')].filter((group) => group.length).map((group) => <div className={styles.methodSection} key={group[0].id === 'upi' ? 'upi' : 'other'}>
          <h3>{group[0].id === 'upi' ? 'Pay by any UPI app' : 'More ways to pay'}</h3>
          <div className={styles.methodGroup}>
          {group.map((item) => (
            <label key={item.id} className={method === item.id ? `${styles.method} ${styles.methodSelected}` : styles.method}>
              <input type="radio" aria-label={item.label} name="payment-method" value={item.id} checked={method === item.id} onChange={() => { setMethod(item.id); setMethodPage(item.id !== 'upi'); setError('') }} />
              {(() => { const Icon = methodIcon(item.id); return <span className={styles.methodIcon} aria-hidden="true"><Icon size={20} strokeWidth={1.8} /></span> })()}
              <span className={styles.methodCopy}>
                <span className={styles.methodLabel}>{item.label}</span>
                <span className={styles.methodSubtitle}>{methodSubtitle(item.id)}</span>
              </span>
              {item.id === 'card' && networkAssets.length > 0 && <span className={styles.methodAssets} aria-label="Enabled card networks">
                {networkAssets.map((asset) => <img key={asset.code} src={asset.url} alt={asset.label} width={40} height={25} loading="lazy" referrerPolicy="no-referrer" />)}
              </span>}
              {item.id === 'upi' && upiDiscovery === 'ready' && upiApps.length > 0 && <span className={styles.methodAssets} aria-label="Supported UPI apps">
                {upiApps.slice(0, 4).map((app) => {
                  const asset = configuration?.artwork.find((entry) => entry.kind === 'upi' && entry.code === app)
                  return asset ? <img key={app} src={asset.url} alt={asset.label} width={26} height={26} loading="lazy" referrerPolicy="no-referrer" /> : <span key={app}>{app === 'any' ? 'Other' : app}</span>
                })}
              </span>}
              <ChevronRight className={styles.methodChevron} size={18} aria-hidden="true" />
            </label>
          ))}
          </div>{group[0].id === 'upi' && method === 'upi' && upiControls}</div>)}
        </fieldset>

        {method && methodPage && <section className={styles.methodDetails} aria-labelledby={`${fieldErrorId}-selected-method`}>
        <h4 ref={methodDetailsHeading} tabIndex={-1} className={styles.methodDetailsHeading} id={`${fieldErrorId}-selected-method`}>{availableMethods.find((item) => item.id === method)?.label || 'Selected payment'} details</h4>
        {(method === 'card' || method === 'emi') && <div className={styles.fields}>
          {method === 'card' && savedCard?.sdk.token ? <>
            <p>{savedCard.network || 'Card'} ending {savedCard.last4}</p>
            <label>{savedCard.cvvRequired === false ? 'CVV (optional)' : 'CVV'}<input name="card-cvv" {...fieldProps('card-cvv')} type="password" inputMode="numeric" autoComplete="cc-csc" disabled={submitting} required={savedCard.cvvRequired !== false} />{fieldMessage('card-cvv')}</label>
          </> : <>
          {method === 'emi' && <fieldset className={styles.optionList}>
            <legend>EMI duration</legend>
              {emiDurations.map((duration) => <label key={duration} className={styles.optionRow}>
                <input type="radio" name="emi-duration" {...fieldProps('emi-duration')} value={duration} checked={emiDuration === String(duration)} onChange={(event) => setEmiDuration(event.target.value)} required />
                <span>{duration} months</span>
              </label>)}
            {fieldMessage('emi-duration')}
            {!emiDurations.length && <small>Enter your card and check issuer eligibility to see available plans.</small>}
          </fieldset>}
          <label>Card number
            <div className={styles.cardNumber}>
              <input name="card-number" {...fieldProps('card-number')} inputMode="numeric" autoComplete="cc-number" placeholder="Card number" disabled={submitting || !cardFormatterReady} onBlur={() => void checkCardEligibility()} required />
              {networkAssets.filter((asset) => asset.code === detectedNetwork).map((asset) => <img key={asset.code} src={asset.url} alt={asset.label} width={48} height={30} />)}
            </div>
            {fieldMessage('card-number')}
            {cardNetwork && <small aria-live="polite">{cardNetwork}</small>}
            {networkUnavailable && <small role="status">{detectedNetwork ? 'This card network is not enabled for this checkout. Choose another card.' : eligibilityBusy ? 'Checking card network...' : 'Card network must be verified before payment. Check card eligibility or choose another method.'}</small>}
          </label>
          {cardNetworks.length ? <div className={styles.networks} aria-label="Card networks enabled for this account">
            <span>Enabled card networks</span>
            <div>{cardNetworks.map((code) => {
              const asset = networkAssets.find((entry) => entry.code === code)
              return asset ? <img key={code} src={asset.url} alt={asset.label} width={48} height={30} loading="lazy" referrerPolicy="no-referrer" /> : <span key={code} className={styles.network}>{code}</span>
            })}</div>
          </div> : <small>Razorpay will validate this card during payment.</small>}
          <div className={styles.row}>
            <label>Expiry<input name="card-expiry" {...fieldProps('card-expiry')} inputMode="numeric" autoComplete="cc-exp" placeholder="MM / YY" disabled={submitting} required />{fieldMessage('card-expiry')}</label>
            <label>CVV<input name="card-cvv" {...fieldProps('card-cvv')} type="password" inputMode="numeric" autoComplete="cc-csc" disabled={submitting} required />{fieldMessage('card-cvv')}</label>
          </div>
          <label>Name on card<input name="card-name" {...fieldProps('card-name')} autoComplete="cc-name" defaultValue={customerName || ''} required />{fieldMessage('card-name')}</label>
          <button type="button" disabled={submitting || eligibilityBusy} onClick={() => void checkCardEligibility()}>{eligibilityBusy ? 'Checking card...' : method === 'emi' ? 'Check EMI eligibility' : 'Check card eligibility'}</button>
          {method === 'emi' && eligibility && <small>{eligibility.issuerName || eligibility.issuerCode}: {eligibility.emiAvailable === true ? 'Select an available plan.' : 'EMI availability is not confirmed for this card.'}</small>}
          {method === 'emi' && selectedPlan && <small>{selectedPlan.duration} months at {selectedPlan.rate}% annual interest{Number.isFinite(installment) ? `; ${money(Math.round(installment as number))} per month` : ''}. Issuer fees and taxes, where applicable, are confirmed by your bank.</small>}
          <small>Card details are sent directly to Razorpay. Hangers does not receive or store your full card number or security code.</small>
          </>}
        </div>}

        {method === 'netbanking' && <div className={styles.fields}>
          <div className={styles.bankGrid} role="group" aria-label="Available banks">
            {popularBanks.map((code) => <button type="button" key={code} className={styles.brandChoice} aria-pressed={bank === code} onClick={() => setBank(code)}>
              <BankLogo label={typeof methods?.netbanking?.[code] === 'string' ? methods.netbanking[code] : code} url={configuration?.artwork.find((asset) => asset.kind === 'bank' && asset.code === code)?.url} /><span>{typeof methods?.netbanking?.[code] === 'string' ? methods.netbanking[code] : code}</span>{bank === code && <Check size={16} aria-label="Selected" />}
            </button>)}
          </div>
          <button ref={bankSearchTrigger} type="button" {...fieldProps('bank')} className={styles.bankSearch} onClick={() => {
            setBankQuery(''); bankDialog.current?.showModal()
            bankDialog.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
          }}><Search size={16} aria-hidden="true" />Search all banks</button>
          <input type="hidden" name="bank" value={bank} />
          {bank && !popularBanks.includes(bank) && <div className={styles.selectedBank} role="status">
            <BankLogo label={typeof methods?.netbanking?.[bank] === 'string' ? methods.netbanking[bank] : bank} url={configuration?.artwork.find((asset) => asset.kind === 'bank' && asset.code === bank)?.url} />
            <span>{typeof methods?.netbanking?.[bank] === 'string' ? methods.netbanking[bank] : bank}</span><Check size={18} aria-label="Selected bank" />
          </div>}
          {fieldMessage('bank')}
          <dialog ref={bankDialog} className={styles.bankDialog} aria-labelledby={`${fieldErrorId}-bank-title`} onClose={() => bankSearchTrigger.current?.focus()} onClick={(event) => {
            if (event.target !== event.currentTarget) return
            const bounds = event.currentTarget.getBoundingClientRect()
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close()
          }}>
            <div className={styles.bankDialogHeader}><h3 id={`${fieldErrorId}-bank-title`}>Choose your bank</h3><button type="button" aria-label="Close bank search" onClick={() => bankDialog.current?.close()}><X size={20} /></button></div>
            <label>Search banks<input type="search" value={bankQuery} onChange={(event) => setBankQuery(event.target.value)} autoComplete="off" autoFocus /></label>
            <div className={styles.bankResults}>
              {banks.filter((code) => `${code} ${methods?.netbanking?.[code] || ''}`.toLowerCase().includes(bankQuery.toLowerCase())).map((code) => <button type="button" key={code} onClick={() => { setBank(code); bankDialog.current?.close() }}>
                <BankLogo label={typeof methods?.netbanking?.[code] === 'string' ? methods.netbanking[code] : code} url={configuration?.artwork.find((asset) => asset.kind === 'bank' && asset.code === code)?.url} /><span>{typeof methods?.netbanking?.[code] === 'string' ? methods.netbanking[code] : code}</span>{bank === code && <Check size={18} aria-label="Selected" />}
              </button>)}
              {!banks.some((code) => `${code} ${methods?.netbanking?.[code] || ''}`.toLowerCase().includes(bankQuery.toLowerCase())) && <p role="status">No matching banks</p>}
            </div>
          </dialog>
        </div>}

        {method === 'wallet' && <fieldset className={styles.optionList}><legend>Select wallet</legend>
          {wallets.map((code) => {
            const asset = configuration?.artwork.find((entry) => entry.kind === 'wallet' && entry.code === code)
            return <label key={code} className={styles.optionRow}>
              <input type="radio" name="wallet" {...fieldProps('wallet')} value={code} checked={wallet === code} onChange={(event) => setWallet(event.target.value)} required />
              <BankLogo label={asset?.label || code} url={asset?.url} /><span>{asset?.label || (typeof methods?.wallet?.[code] === 'string' ? methods.wallet[code] : code)}</span>
            </label>
          })}
          {fieldMessage('wallet')}
        </fieldset>}

        {(method === 'cardless_emi' || method === 'paylater') && <fieldset className={styles.optionList}><legend>Select provider</legend>
          {optionKeys(methods?.[method]).map((code) => <label key={code} className={styles.optionRow}>
            <input type="radio" name="provider" {...fieldProps('provider')} value={code} checked={provider === code} onChange={(event) => setProvider(event.target.value)} required />
            <BankLogo label={typeof methods?.[method]?.[code] === 'string' ? methods[method][code] : code} /><span>{typeof methods?.[method]?.[code] === 'string' ? methods[method][code] : code}</span>
          </label>)}
          {fieldMessage('provider')}
        </fieldset>}


        {method === 'cred' && <div className={styles.fields}>
          <button type="button" disabled={submitting || credBusy} onClick={() => void checkCred()}>{credBusy ? 'Checking CRED...' : 'Check CRED eligibility'}</button>
          {credEligible && <small role="status">CRED eligibility confirmed. The invoice amount remains {money(order.amount)}.</small>}
        </div>}
        {method === 'bank_transfer' && <div className={styles.fields}>
          <button type="button" disabled={submitting || transferBusy || preparing || !order.checkoutAttemptId || configuration?.feeBearer !== 'MERCHANT'} onClick={() => void showTransfer()}>{transferBusy ? 'Fetching bank details...' : 'Show bank transfer details'}</button>
          {transfer && !visibleTransfer && <p role="status">These transfer instructions are no longer current. Check payment status before requesting details again.</p>}
          {visibleTransfer && <>
            <p>Transfer exactly {money(Number(visibleTransfer.amount), visibleTransfer.currency)} to the account below. Payment is confirmed after Razorpay reports the captured credit.</p>
            <p>Instructions valid until {new Date(visibleTransfer.expiresAt).toLocaleString()}. Do not transfer after this time.</p>
            {visibleTransfer.closeBy && <p>Account closes at {new Date(visibleTransfer.closeBy * 1000).toLocaleString()}.</p>}
            {visibleTransfer.receivers.map((receiver) => <dl key={receiver.id}>
              <dt>Account name</dt><dd>{receiver.name}</dd><dt>Bank</dt><dd>{receiver.bankName}</dd>
              <dt>Account number</dt><dd>{receiver.accountNumber}</dd><dt>IFSC</dt><dd>{receiver.ifsc}</dd>
            </dl>)}
            <button type="button" onClick={onCheckStatus}>Check bank transfer status</button>
          </>}
        </div>}
        </section>}

        </fieldset>
        {!readOnly && (actionTarget ? createPortal(paymentActions, actionTarget) : paymentActions)}
      </>}
    </form>
  )
}
