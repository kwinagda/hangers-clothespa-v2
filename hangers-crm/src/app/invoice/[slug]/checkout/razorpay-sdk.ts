export type ProviderError = {
  code?: string; description?: string; source?: string; step?: string; reason?: string; field?: string
  metadata?: { order_id?: string; payment_id?: string }
}
export type PaymentError = { error?: ProviderError }
export type CheckoutOrder = {
  key: string; amount: number; currency: string; razorpayOrderId: string
  checkoutAttemptId?: string; testContact?: string; email?: string
  callbackUrl?: string; redirect?: boolean; credCoinsDisabled?: boolean
}
export type Methods = Record<string, any>
export type RefreshMethods = () => Promise<Methods>
export type Artwork = { kind: 'network' | 'upi' | 'wallet'; code: string; label: string; url: string; source: string }
export type Configuration = {
  feeBearer: 'MERCHANT' | 'CUSTOMER' | 'UNVERIFIED'; savedCards: boolean; bankTransfer: boolean; artwork: Artwork[]
  excludedCardNetworks?: string[]
}
export type CardEligibility = {
  network: string | null; type: string | null; issuerCode: string | null; issuerName: string | null
  emiAvailable: boolean | null; observedAt: string
}
export type CardField = { type?: string; isValid: () => boolean; on: (event: string, fn: (this: CardField) => void) => CardField }
export type CustomInstance = {
  methods?: Methods
  once: (event: string, callback: (data?: any) => void) => void
  on: (event: string, callback: (data: any) => void) => void
  emit?: (event: string) => void
  createPayment: (data: Record<string, any>, options?: Record<string, any>) => void | Promise<void>
  focus?: () => void
  getSupportedUpiIntentApps?: () => Promise<unknown>
  checkCREDEligibility?: (contact: string) => Promise<{ success: boolean; data?: { state?: string; offer?: { description?: string } } }>
  fetchVirtualAccount?: (options: { order_id: string }) => Promise<any>
}
export type CustomConstructor = {
  new (options: Record<string, any>): CustomInstance
  setFormatter?: (form: HTMLFormElement) => { add: (type: string, input: HTMLInputElement) => CardField; off: () => void }
  emi?: { calculator: (principal: number, months: number, rate: number) => number }
}

let sdkPromise: Promise<CustomConstructor> | null = null
export function loadCustomSdk(): Promise<CustomConstructor> {
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    let finished = false
    const fail = () => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      script.remove()
      sdkPromise = null
      reject(new Error('Payment tools could not load. Check your connection and retry.'))
    }
    const timer = setTimeout(fail, 15000)
    script.src = 'https://checkout.razorpay.com/v1/razorpay.js'
    script.async = true
    script.dataset.razorpayCustomCheckout = 'true'
    script.onerror = fail
    script.onload = () => {
      if (finished) return
      const sdk = (window as Window & { Razorpay?: CustomConstructor }).Razorpay
      if (typeof sdk !== 'function') return fail()
      finished = true
      clearTimeout(timer)
      resolve(sdk)
    }
    document.head.appendChild(script)
  })
  return sdkPromise
}

export const enabled = (value: unknown) => value === true || value === 1 || value === '1'
export const options = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).filter(([, item]) => enabled(item) || (typeof item === 'string' && item.trim().length > 1 && item !== 'false')) .map(([key]) => key)
}
export const supportedUpiIntentApps = (value: unknown): string[] | null =>
  Array.isArray(value) ? value.filter((app): app is string => typeof app === 'string') : null

export const upiIntentUnavailable = (methods: Methods | null | undefined, authoritativeMethods: Methods | null | undefined, feeBearer: Configuration['feeBearer'] | undefined) =>
  feeBearer === 'CUSTOMER'
  || [methods?.upi_intent, authoritativeMethods?.upi_intent].some((value) => value === false || value === 0 || value === '0' || value === 'false')

export const money = (paise: number, currency = 'INR') => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency, minimumFractionDigits: paise % 100 === 0 ? 0 : 2, maximumFractionDigits: 2,
}).format(paise / 100)

// IIN names and Methods API codes are documented provider namespaces, not BIN rules.
const NETWORK_CODES: Record<string, string> = {
  Visa: 'VISA', MasterCard: 'MC', RuPay: 'RUPAY', 'American Express': 'AMEX',
  'Diners Club': 'DICL', Maestro: 'MAES', JCB: 'JCB', 'Union Pay': 'UNP',
}
export const networkCode = (name: string | null) => NETWORK_CODES[name || ''] || null

export function issuerPlans(methods: Methods | null, eligibility: CardEligibility | null, amount: number) {
  if (!enabled(methods?.emi) || eligibility?.emiAvailable !== true || !eligibility.issuerCode) return []
  // Do not infer a debit-card issuer suffix or select another bank's tenure.
  const raw = methods.emi_plans?.[eligibility.issuerCode]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || !raw.plans || typeof raw.plans !== 'object' || Array.isArray(raw.plans)) return []
  const entries = Object.entries(raw.plans).map(([duration, interest]) => ({ ...raw, duration, interest }))
  return entries.flatMap((plan: any) => {
    const duration = Number(plan.duration), rate = Number(plan.interest), minimum = Number(plan.min_amount)
    if (!Number.isInteger(duration) || duration <= 0 || !Number.isFinite(rate) || rate < 0
      || !Number.isSafeInteger(minimum) || minimum < 0 || minimum > amount) return []
    // Preserve provider fields verbatim; fee units and applicability are not inferred.
    return [{ ...plan, duration, rate, minimum, providerPlan: { ...plan } as Record<string, unknown> }]
  })
}

export function safePaymentDiagnostic(value: string) {
  return value.replace(/[\r\n\t]+/g, ' ')
    .replace(/\b(?:cvv|cvc|otp|pin|password|key[_ -]?secret|api[_ -]?key|signature|authorization|access[_ -]?token|refresh[_ -]?token)\b["']?\s*[:=]?\s*["']?([A-Za-z0-9+/=_-]+)/gi, '[redacted-credential]')
    .replace(/\b(?:token|card|cust)_[A-Za-z0-9]+\b/gi, '[redacted-instrument]')
    .replace(/\brzp_(?:test|live)_[A-Za-z0-9]+\b/gi, '[redacted-credential]')
    .replace(/\b[a-f0-9]{64}\b/gi, '[redacted-credential]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?:\+?\d[\d ()-]{7,}\d)/g, '[redacted-number]')
    .replace(/\b\d{3,}\b/g, '[redacted-number]').trim().slice(0, 1000)
}

export function providerError(value: any): ProviderError | null {
  const input = value?.error || value?.details?.provider
  if (!input || typeof input !== 'object') return null
  const result: ProviderError = {}
  for (const key of ['code', 'description', 'source', 'step', 'reason', 'field'] as const) {
    if (typeof input[key] === 'string') result[key] = safePaymentDiagnostic(input[key])
  }
  const ids = input.metadata || input
  result.metadata = {
    ...(typeof ids.order_id === 'string' && /^order_[a-zA-Z0-9]+$/.test(ids.order_id) ? { order_id: ids.order_id } : {}),
    ...(typeof ids.payment_id === 'string' && /^pay_[a-zA-Z0-9]+$/.test(ids.payment_id) ? { payment_id: ids.payment_id } : {}),
  }
  return result
}

const throttledUntil = new Map<string, number>()
const throttleCount = new Map<string, number>()

export async function checkoutRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const scope = new URL(url, window.location.href).origin
  const retryAt = throttledUntil.get(scope) || 0
  if (Date.now() < retryAt) throw Object.assign(new Error('Payment requests are temporarily limited. Wait before checking again.'), { status: 429, retryAt })
  const response = await fetch(url, { ...init, cache: 'no-store', credentials: init.credentials ?? 'include', signal: init.signal || AbortSignal.timeout(15000) })
  const retryAfter = response.headers.get('Retry-After')
  let nextRetryAt: number | undefined
  if (response.status === 429 || (!response.ok && retryAfter !== null)) {
    const count = Math.min((throttleCount.get(scope) || 0) + 1, 6)
    throttleCount.set(scope, count)
    const seconds = retryAfter !== null && /^\d+(?:\.\d+)?$/.test(retryAfter.trim()) ? Number(retryAfter) : NaN
    const headerTime = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(retryAfter || '')
    nextRetryAt = Math.max(Date.now() + Math.min(60000, 1000 * 2 ** count) + Math.floor(Math.random() * 1000), Number.isFinite(headerTime) ? headerTime : 0)
    throttledUntil.set(scope, nextRetryAt)
  }
  const body = await response.json().catch((error) => {
    if (response.ok) throw error
    return null
  })
  if (!response.ok) throw Object.assign(new Error(typeof body?.message === 'string' ? safePaymentDiagnostic(body.message) : 'This request could not be completed.'), {
    code: body?.code, details: body?.details, error: body?.error, status: response.status,
    retryAfter, retryAt: nextRetryAt,
  })
  throttleCount.delete(scope)
  return body.data ?? body
}
