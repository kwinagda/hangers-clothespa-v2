'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import api, { ordersAPI, customersAPI, servicesAPI, statsAPI, ironAPI, metadataAPI } from '@/lib/api'
import toast from 'react-hot-toast'
import { AlertTriangle, Check, Shirt, User } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Item { id: string; name: string; basePrice: number; category: string; catalogName: string }
interface CartItem { serviceId: string; name: string; unitPrice: number; quantity: number; category: string }
interface Customer { id: string; name: string; phone: string; walletBalance?: number; loyaltyPoints?: number; ordersDue?: number; ironSubStatus?: string | null; preferredLanguage?: string }
interface CustomerStats { totalOrders: number; totalSpend: number; outstanding: number; loyaltyPoints: number; lastOrderDate: string | null; lastOrderStatus: string | null }

const ORDER_DRAFT_KEY = 'crm:new-order-draft:v1'

type OrderDraft = {
  customer: Customer | null
  customerStats: CustomerStats | null
  cart: CartItem[]
  activeCategory: string
  customerSearch: string
  newCustomerName: string
  newCustomerPhone: string
  newCustomerLanguage: string
  newCustomerEnrollIron: boolean
  paymentMethod: string
  paidAmount: string
  discountType: 'flat'|'percent'
  discountValue: string
  couponCode: string
  couponDiscount: number
  couponApplied: boolean
  loyaltyPoints: string
  loyaltyDiscount: number
  loyaltyApplied: boolean
  writeOff: boolean
  writeOffAmount: number
  walletSplit: string
  notes: string
  dailyIronDate: string
}

const LEGACY_PAYMENT_METHOD_MAP: Record<string, string> = {
  Cash: 'CASH',
  'UPI / GPay': 'UPI',
  Card: 'CARD',
  Wallet: 'WALLET',
  'Pay Later': 'Pay Later',
  'Split (Cash+Wallet)': 'SPLIT',
}

export default function NewOrderPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [draftReady, setDraftReady] = useState(false)

  // Customer
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showQuickCreate, setShowQuickCreate] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [newCustomerLanguage, setNewCustomerLanguage] = useState('ENGLISH')
  const [languageOptions, setLanguageOptions] = useState<Array<{ value: string; label: string }>>([])
  const [newCustomerEnrollIron, setNewCustomerEnrollIron] = useState(false)
  const [creatingCustomer, setCreatingCustomer] = useState(false)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [customerStats, setCustomerStats] = useState<CustomerStats | null>(null)
  const searchTimeout = useRef<any>(null)

  // Catalog
  const [catalog, setCatalog] = useState<Record<string, Item[]>>({})
  const [categories, setCategories] = useState<string[]>([])
  const [activeCategory, setActiveCategory] = useState('')
  const [catalogLoading, setCatalogLoading] = useState(true)

  // Cart
  const [cart, setCart] = useState<CartItem[]>([])

  // Variant popup
  const [variantItem, setVariantItem] = useState<Item[] | null>(null)
  const [variantParent, setVariantParent] = useState('')

  // Payment
  const [showPayment, setShowPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [paymentMethods, setPaymentMethods] = useState<Array<{ value: string; label: string }>>([])
  const [paidAmount, setPaidAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [discountType, setDiscountType] = useState<'flat'|'percent'>('flat')
  const [discountValue, setDiscountValue] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [couponDiscount, setCouponDiscount] = useState(0)
  const [couponApplied, setCouponApplied] = useState(false)
  const [couponLoading, setCouponLoading] = useState(false)
  const [loyaltyPoints, setLoyaltyPoints] = useState('')
  const [loyaltyDiscount, setLoyaltyDiscount] = useState(0)
  const [loyaltyApplied, setLoyaltyApplied] = useState(false)
  const [loyaltyLoading, setLoyaltyLoading] = useState(false)
  const [writeOff, setWriteOff] = useState(false)
  const [writeOffAmount, setWriteOffAmount] = useState(0)
  const [writeOffMax, setWriteOffMax] = useState(50)
  const [walletSplit, setWalletSplit] = useState('')
  const [posSettings, setPosSettings] = useState<any>({})
  const [notes, setNotes] = useState('')
  const [dailyIronDate, setDailyIronDate] = useState(new Date().toISOString().slice(0, 10))

  const clearDraft = useCallback(() => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(ORDER_DRAFT_KEY)
  }, [])

  const hasDraftContent = useCallback((draft: OrderDraft) => (
    Boolean(
      draft.customer ||
      draft.cart.length ||
      draft.notes.trim() ||
      draft.customerSearch.trim() ||
      draft.discountValue.trim() ||
      draft.couponCode.trim() ||
      draft.loyaltyPoints.trim() ||
      draft.paidAmount.trim() ||
      draft.walletSplit.trim()
    )
  ), [])

  useEffect(() => {
    metadataAPI.getAll().then((r: any) => {
      const metadata = r?.metadata || r?.data?.metadata || {}
      setLanguageOptions(metadata.languages || [])
      const mappedMethods = (metadata.paymentMethods || []).map((item: any) => ({
        value: item.value,
        label:
          item.value === 'CASH' ? 'Cash' :
          item.value === 'UPI' ? 'UPI / GPay' :
          item.value === 'CARD' ? 'Card' :
          item.value === 'WALLET' ? 'Wallet' :
          item.value === 'Pay Later' ? 'Pay Later' :
          item.label,
      })).filter((item: any) => ['CASH','UPI','CARD','WALLET','Pay Later'].includes(item.value))
      setPaymentMethods(mappedMethods)
      setPaymentMethod((current) => {
        if (current === 'SPLIT') return current
        const normalized = LEGACY_PAYMENT_METHOD_MAP[current] || current
        return mappedMethods.some((item: any) => item.value === normalized) ? normalized : (mappedMethods[0]?.value || 'CASH')
      })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(ORDER_DRAFT_KEY)
      if (!raw) {
        setDraftReady(true)
        return
      }
      const draft = JSON.parse(raw) as Partial<OrderDraft>
      if (draft.customer !== undefined) setCustomer(draft.customer as Customer | null)
      if (draft.customerStats !== undefined) setCustomerStats(draft.customerStats as CustomerStats | null)
      if (Array.isArray(draft.cart)) setCart(draft.cart)
      if (typeof draft.activeCategory === 'string') setActiveCategory(draft.activeCategory)
      if (typeof draft.customerSearch === 'string') setCustomerSearch(draft.customerSearch)
      if (typeof draft.newCustomerName === 'string') setNewCustomerName(draft.newCustomerName)
      if (typeof draft.newCustomerPhone === 'string') setNewCustomerPhone(draft.newCustomerPhone)
      if (typeof draft.newCustomerLanguage === 'string') setNewCustomerLanguage(draft.newCustomerLanguage)
      if (typeof draft.newCustomerEnrollIron === 'boolean') setNewCustomerEnrollIron(draft.newCustomerEnrollIron)
      if (typeof draft.paymentMethod === 'string') setPaymentMethod(LEGACY_PAYMENT_METHOD_MAP[draft.paymentMethod] || draft.paymentMethod)
      if (typeof draft.paidAmount === 'string') setPaidAmount(draft.paidAmount)
      if (draft.discountType === 'flat' || draft.discountType === 'percent') setDiscountType(draft.discountType)
      if (typeof draft.discountValue === 'string') setDiscountValue(draft.discountValue)
      if (typeof draft.couponCode === 'string') setCouponCode(draft.couponCode)
      if (typeof draft.couponDiscount === 'number') setCouponDiscount(draft.couponDiscount)
      if (typeof draft.couponApplied === 'boolean') setCouponApplied(draft.couponApplied)
      if (typeof draft.loyaltyPoints === 'string') setLoyaltyPoints(draft.loyaltyPoints)
      if (typeof draft.loyaltyDiscount === 'number') setLoyaltyDiscount(draft.loyaltyDiscount)
      if (typeof draft.loyaltyApplied === 'boolean') setLoyaltyApplied(draft.loyaltyApplied)
      if (typeof draft.writeOff === 'boolean') setWriteOff(draft.writeOff)
      if (typeof draft.writeOffAmount === 'number') setWriteOffAmount(draft.writeOffAmount)
      if (typeof draft.walletSplit === 'string') setWalletSplit(draft.walletSplit)
      if (typeof draft.notes === 'string') setNotes(draft.notes)
      if (typeof draft.dailyIronDate === 'string') setDailyIronDate(draft.dailyIronDate)
    } catch {
      window.localStorage.removeItem(ORDER_DRAFT_KEY)
    } finally {
      setDraftReady(true)
    }
  }, [])

  // Auto-load customer from URL
  useEffect(() => {
    if (!draftReady) return
    const cid = searchParams.get('customerId')
    if (cid) {
      customersAPI.get(cid).then((r: any) => {
        const cust = r.data?.customer || r.data
        if (cust) selectCustomer(cust)
      }).catch(() => setShowCustomerModal(true))
    } else if (!customer) {
      setShowCustomerModal(true)
    }
  }, [draftReady, searchParams])

  useEffect(() => {
    const digits = customerSearch.replace(/\D/g, '').slice(-10)
    if (showCustomerModal && digits.length && newCustomerPhone !== digits) setNewCustomerPhone(digits)
    if (showCustomerModal && customerSearch.trim() && !digits.length && !newCustomerName) setNewCustomerName(customerSearch.trim())
  }, [customerSearch, showCustomerModal, newCustomerPhone, newCustomerName])

  useEffect(() => {
    const digits = customerSearch.replace(/\D/g, '').slice(-10)
    const shouldSearchSuggestCreate = customerSearch.trim().length >= 3
    const shouldPhoneSuggestCreate = digits.length === 10

    if (!showCustomerModal || (!shouldSearchSuggestCreate && !shouldPhoneSuggestCreate)) {
      setShowQuickCreate(false)
      return
    }
    if (searchLoading) return
    setShowQuickCreate(customerResults.length === 0)
  }, [customerResults.length, customerSearch, searchLoading, showCustomerModal])

  // Load catalog
  useEffect(() => {
    servicesAPI.getCatalog().then((items: Item[]) => {
      const map: Record<string, Item[]> = {}
      items.forEach((item: Item) => {
        if (!map[item.category]) map[item.category] = []
        if (item.basePrice > 0 || item.category === 'DAILY_IRON') map[item.category].push(item)
      })
      const cats = Object.keys(map)
      setCatalog(map)
      setCategories(cats)
      if (cats.length) setActiveCategory(cats[0])
    }).catch(() => toast.error('Failed to load catalog'))
    .finally(() => setCatalogLoading(false))
  }, [])

  // Customer search with debounce
  const searchCustomers = useCallback(async (q: string) => {
    const digits = q.replace(/\D/g, '').slice(-10)
    const shouldSearch = q.trim().length >= 3 || digits.length === 10
    if (!shouldSearch) {
      setCustomerResults([])
      setSearchLoading(false)
      return
    }
    setSearchLoading(true)
    try {
      const r = await customersAPI.list({ search: q, limit: 8 })
      setCustomerResults(r.data?.customers || [])
    } catch { setCustomerResults([]) }
    setSearchLoading(false)
  }, [])

  const handleSearchInput = (val: string) => {
    setCustomerSearch(val)
    setShowQuickCreate(false)
    clearTimeout(searchTimeout.current)
    const digits = val.replace(/\D/g, '').slice(-10)
    const shouldSearch = val.trim().length >= 3 || digits.length === 10
    if (!shouldSearch) {
      setSearchLoading(false)
      setCustomerResults([])
      return
    }
    setSearchLoading(true)
    searchTimeout.current = setTimeout(() => searchCustomers(val), 300)
  }

  const selectCustomer = async (c: Customer) => {
    try {
      const detail = await customersAPI.get(c.id)
      const customerData = detail.data?.customer || detail.data || c
      setCustomer(customerData)
      const r = await statsAPI.customer(c.id)
      setCustomerStats(r.data)
      setCustomerResults([])
      setShowCustomerModal(false)
      setShowQuickCreate(false)
    } catch {
      setCustomer(c)
      setShowCustomerModal(false)
    }
  }

  useEffect(() => {
    if (!draftReady || !customer?.id) return
    statsAPI.customer(customer.id).then((r: any) => setCustomerStats(r.data)).catch(() => {})
  }, [draftReady, customer?.id])

  const createCustomerInline = async () => {
    const normalizedPhone = newCustomerPhone.replace(/\D/g, '').slice(-10)
    if (normalizedPhone.length !== 10) { toast.error('Enter a valid 10-digit phone number'); return }

    setCreatingCustomer(true)
    try {
      const response = await customersAPI.create({
        phone: normalizedPhone,
        name: newCustomerName.trim() || undefined,
        preferredLanguage: newCustomerLanguage,
      })
      const createdCustomer = response.data?.customer || response.data
      if (newCustomerEnrollIron) {
        await ironAPI.createSubscription({ customerId: createdCustomer.id, applicationStatus: 'ACTIVE' })
      }
      toast.success('Customer created')
      setNewCustomerName('')
      setNewCustomerPhone('')
      setNewCustomerLanguage('ENGLISH')
      setNewCustomerEnrollIron(false)
      setCustomerSearch('')
      setShowQuickCreate(false)
      await selectCustomer(createdCustomer)
    } catch (e: any) {
      toast.error(e.message || 'Failed to create customer')
    }
    setCreatingCustomer(false)
  }

  // Group items by base name (e.g. "Sweater-full sleeves -plain" and "Sweater-full sleeves -heavy" → "Sweater-full sleeves")
  const groupedItems = () => {
    const items = catalog[activeCategory] || []
    const groups: Record<string, Item[]> = {}
    items.forEach(item => {
      // Try to detect variant suffix: -plain, -heavy, -silk, -normal, -designer, etc.
      const variantMatch = item.name.match(/^(.+?)\s*-\s*(plain|heavy|silk|normal|designer|delicate|fancy|woolen|leather|suede|large|medium|small|full sleeves|half sleeves|with hood)$/i)
      const baseName = variantMatch ? variantMatch[1].trim() : item.name
      if (!groups[baseName]) groups[baseName] = []
      groups[baseName].push(item)
    })
    return groups
  }

  const handleItemClick = (baseName: string, variants: Item[]) => {
    if (variants.length === 1) {
      addToCart(variants[0])
    } else {
      setVariantParent(baseName)
      setVariantItem(variants)
    }
  }

  const addToCart = (item: Item) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.serviceId === item.id)
      if (idx > -1) {
        const n = [...prev]
        n[idx] = { ...n[idx], quantity: n[idx].quantity + 1 }
        return n
      }
      return [...prev, { serviceId: item.id, name: item.name, unitPrice: item.basePrice, quantity: 1, category: item.category }]
    })
    setVariantItem(null)
  }

  const updateQty = (serviceId: string, delta: number) => {
    setCart(prev => {
      const n = prev.map(i => i.serviceId === serviceId ? { ...i, quantity: i.quantity + delta } : i)
      return n.filter(i => i.quantity > 0)
    })
  }

  const regularCart    = cart.filter(i => i.category !== 'DAILY_IRON')
  const dailyIronCart  = cart.filter(i => i.category === 'DAILY_IRON')
  const regularSubtotal = regularCart.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  const dailyIronEstimatedValue = dailyIronCart.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  const totalQty       = cart.reduce((s, i) => s + i.quantity, 0)
  const hasDailyIronItems = cart.some(i => i.category === 'DAILY_IRON')
  const hasRegularItems   = cart.some(i => i.category !== 'DAILY_IRON')
  const isPureDailyIron   = hasDailyIronItems && !hasRegularItems
  const isMixedCart       = hasDailyIronItems && hasRegularItems
  const manualDiscount = discountType === 'flat'
    ? (parseFloat(discountValue) || 0)
    : Math.round(regularSubtotal * (parseFloat(discountValue) || 0) / 100)
  const totalDiscount  = manualDiscount + couponDiscount + loyaltyDiscount
  const total          = isPureDailyIron ? dailyIronEstimatedValue : Math.max(0, regularSubtotal - totalDiscount)

  const ensureActiveIronSubscription = async () => {
    if (!customer) return null

    try {
      const response = await ironAPI.getSubscription(customer.id)
      let subscription = response?.data?.subscription || null

      if (!subscription) {
        const shouldEnroll = window.confirm('This customer is not enrolled in Daily Iron. Enroll now and continue logging?')
        if (!shouldEnroll) return null
        const created = await ironAPI.createSubscription({ customerId: customer.id, applicationStatus: 'ACTIVE' })
        subscription = created?.data?.subscription || null
      }

      if (subscription?.applicationStatus === 'PENDING_REVIEW') {
        const shouldConfirm = window.confirm('This customer has a pending Daily Iron application. Confirm it and continue logging?')
        if (!shouldConfirm) return null
        const confirmed = await ironAPI.confirmSubscription(subscription.id)
        subscription = confirmed?.data?.subscription || subscription
      }

      if (subscription?.applicationStatus === 'PAUSED' || subscription?.applicationStatus === 'CANCELLED') {
        const shouldReactivate = window.confirm(`This Daily Iron subscription is ${subscription.applicationStatus}. Reactivate it and continue logging?`)
        if (!shouldReactivate) return null
        const updated = await ironAPI.updateSubscriptionStatus(subscription.id, 'ACTIVE')
        subscription = updated?.data?.subscription || subscription
      }

      if (subscription?.applicationStatus !== 'ACTIVE') {
        toast.error('Daily Iron subscription must be active before logging items')
        return null
      }

      return subscription
    } catch (e: any) {
      toast.error(e.message || 'Could not verify Daily Iron subscription')
      return null
    }
  }

  const handleConfirmDailyIron = async () => {
    if (!customer) { toast.error('Select a customer first'); return }
    if (!dailyIronCart.length) { toast.error('Add at least one Daily Iron item'); return }
    if (hasRegularItems) { toast.error('Daily Iron items must be logged separately from regular orders'); return }

    const subscription = await ensureActiveIronSubscription()
    if (!subscription) return

    setSubmitting(true)
    try {
      await Promise.all(
        dailyIronCart.map(item =>
          ironAPI.createLog({
            customerId: customer.id,
            serviceId: item.serviceId,
            date: dailyIronDate,
            pieces: item.quantity,
            notes: notes || undefined,
          })
        )
      )
      toast.success(`${cart.length} Daily Iron log${cart.length === 1 ? '' : 's'} created`)
      clearDraft()
      setCart([])
      setNotes('')
      setShowPayment(false)
      router.push(`/dashboard/customers/${customer.id}?tab=iron`)
    } catch (e: any) {
      toast.error(e.message || 'Failed to create Daily Iron logs')
    }
    setSubmitting(false)
  }

  const applyCoupon = async () => {
    if (!couponCode) { toast.error('Enter a coupon code'); return }
    setCouponLoading(true)
    try {
      const r = await (api as any).post('/checkout/validate-coupon', { code: couponCode, orderTotal: regularSubtotal, customerId: customer?.id })
      setCouponDiscount(r.data?.discount || 0)
      setCouponApplied(true)
      toast.success(r.message || 'Coupon applied')
    } catch (e: any) { toast.error(e.message || 'Invalid coupon') }
    setCouponLoading(false)
  }

  const applyLoyalty = async () => {
    if (!loyaltyPoints) { toast.error('Enter points to redeem'); return }
    if (!customer) { toast.error('Select a customer first'); return }
    if (!hasRegularItems) { toast.error('Loyalty points apply only to regular order items'); return }
    setLoyaltyLoading(true)
    try {
      const r = await (api as any).post('/checkout/validate-loyalty', { customerId: customer.id, pointsToRedeem: parseInt(loyaltyPoints), orderTotal: regularSubtotal })
      setLoyaltyDiscount(r.data?.discount || 0)
      setLoyaltyApplied(true)
      toast.success(r.message || 'Loyalty points applied')
    } catch (e: any) { toast.error(e.message || 'Failed to apply points') }
    setLoyaltyLoading(false)
  }

  const handleConfirmOrder = async () => {
    if (!customer) { toast.error('Select a customer first'); return }
    if (!cart.length) { toast.error('Add at least one item'); return }
    if (!hasRegularItems) {
      await handleConfirmDailyIron()
      return
    }

    const paid = parseFloat(paidAmount) || (paymentMethod === 'Pay Later' ? 0 : total)
    const walletPortion = parseFloat(walletSplit) || 0
    const writeOffAmt = writeOff ? writeOffAmount : 0
    setSubmitting(true)
    try {
      const subscription = hasDailyIronItems ? await ensureActiveIronSubscription() : null
      if (hasDailyIronItems && !subscription) {
        setSubmitting(false)
        return
      }

      const orderResponse = await ordersAPI.create({
        customerId: customer.id,
        items: regularCart.map(i => ({ serviceId: i.serviceId, serviceName: i.name, garmentType: i.category, quantity: i.quantity, unitPrice: i.unitPrice })),
        totalAmount: total,
        subtotal: regularSubtotal,
        discount: totalDiscount,
        couponCode: couponApplied ? couponCode : undefined,
        couponDiscount: couponDiscount || undefined,
        loyaltyPointsRedeemed: loyaltyApplied ? parseInt(loyaltyPoints) : undefined,
        loyaltyDiscount: loyaltyDiscount || undefined,
        writeOffAmount: writeOffAmt || undefined,
        paymentMethod,
        walletAmount: walletPortion > 0 ? walletPortion : undefined,
        paidAmount: paid,
        paymentStatus: (paid + writeOffAmt) >= total ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID',
        notes,
        source: 'counter',
      })
      const createdOrder = orderResponse?.data?.order || orderResponse?.order || null

      if (hasDailyIronItems) {
        try {
          await Promise.all(
            dailyIronCart.map(item =>
              ironAPI.createLog({
                customerId: customer.id,
                serviceId: item.serviceId,
                date: dailyIronDate,
                pieces: item.quantity,
                notes: notes || undefined,
              })
            )
          )
        } catch (e: any) {
          toast.error(`Order ${createdOrder?.orderNumber || ''} created, but Daily Iron logs failed. Please retry from the customer Daily Iron tab.`.trim())
          router.push('/dashboard/orders')
          setSubmitting(false)
          return
        }
      }

      toast.success(hasDailyIronItems ? `Order ${createdOrder?.orderNumber || ''} and Daily Iron logs created`.trim() : 'Order created!')
      clearDraft()
      router.push('/dashboard/orders')
    } catch (e: any) {
      console.error('POS CREATE ERROR:', e, JSON.stringify(e))
      toast.error(e.message || 'Failed to create order')
    }
    setSubmitting(false)
  }

  const fmt = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  const searchDigits = customerSearch.replace(/\D/g, '').slice(-10)
  const canOfferQuickCreate = showCustomerModal
    && showQuickCreate
    && !searchLoading
    && (customerSearch.trim().length >= 3 || searchDigits.length === 10)
    && customerResults.length === 0

  useEffect(() => {
    if (!draftReady || typeof window === 'undefined') return
    const draft: OrderDraft = {
      customer,
      customerStats,
      cart,
      activeCategory,
      customerSearch,
      newCustomerName,
      newCustomerPhone,
      newCustomerLanguage,
      newCustomerEnrollIron,
      paymentMethod,
      paidAmount,
      discountType,
      discountValue,
      couponCode,
      couponDiscount,
      couponApplied,
      loyaltyPoints,
      loyaltyDiscount,
      loyaltyApplied,
      writeOff,
      writeOffAmount,
      walletSplit,
      notes,
      dailyIronDate,
    }
    if (hasDraftContent(draft)) {
      window.localStorage.setItem(ORDER_DRAFT_KEY, JSON.stringify(draft))
    } else {
      window.localStorage.removeItem(ORDER_DRAFT_KEY)
    }
  }, [
    draftReady, customer, customerStats, cart, activeCategory, customerSearch,
    newCustomerName, newCustomerPhone, newCustomerLanguage, newCustomerEnrollIron,
    paymentMethod, paidAmount, discountType, discountValue, couponCode, couponDiscount,
    couponApplied, loyaltyPoints, loyaltyDiscount, loyaltyApplied, writeOff,
    writeOffAmount, walletSplit, notes, dailyIronDate, hasDraftContent,
  ])

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 0px)', fontFamily: "var(--crm-font-ui)", background: '#f0f4f8' }}>

      {/* ── Customer Search Modal ──────────────────────────────────────────── */}
      {showCustomerModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,28,60,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 520, boxShadow: '0 32px 80px rgba(0,0,0,0.25)' }}>
            <div style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 800, fontSize: 22, color: '#023c62', marginBottom: 6 }}>New Order</div>
            <p style={{ fontSize: 14, color: '#6b7fa3', marginBottom: 24 }}>Search for an existing customer or create a new customer without leaving this page</p>

            <div style={{ position: 'relative' }}>
              <input
                autoFocus
                type="text"
                value={customerSearch}
                onChange={e => handleSearchInput(e.target.value)}
                placeholder="Type customer name or phone..."
                style={{ width: '100%', border: '2px solid #023c62', borderRadius: 12, padding: '12px 16px', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
              />
              {searchLoading && <div style={{ position: 'absolute', right: 12, top: 14, fontSize: 12, color: '#9dafc8' }}>Searching...</div>}
            </div>

            {/* Results */}
            {customerResults.length > 0 && (
              <div style={{ marginTop: 8, border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
                {customerResults.map((c: Customer) => (
                  <div key={c.id} onClick={() => selectCustomer(c)}
                    style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f0f7ff')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#1a2332' }}>{c.name || 'Unknown'}</div>
                      <div style={{ fontSize: 12, color: '#9dafc8' }}>{c.phone}</div>
                    </div>
                    {(c.ordersDue || 0) > 0 && (
                      <span style={{ fontSize: 11, background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
                        Due: {fmt(c.ordersDue || 0)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {customerSearch.length >= 3 && customerResults.length === 0 && !searchLoading && (
              <div style={{ marginTop: 8, padding: 12, background: '#f8fafc', borderRadius: 10, fontSize: 13, color: '#6b7fa3', textAlign: 'center' }}>
                No customer found with that search. You can create the customer below without leaving this page.
              </div>
            )}

            {canOfferQuickCreate && (
              <div style={{ marginTop: 16, border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, background: '#fafbfd' }}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#023c62' }}>Create New Customer</div>
                  <div style={{ fontSize: 12, color: '#6b7fa3', marginTop: 2 }}>No customer matched this search. Create one here and continue the order without leaving this page.</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.9fr auto', gap: 10, alignItems: 'end' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7fa3', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 5 }}>Mobile *</label>
                    <input value={newCustomerPhone} onChange={e => setNewCustomerPhone(e.target.value)} placeholder="9876543210" type="tel"
                      style={{ width: '100%', border: '1.5px solid #dce8f0', borderRadius: 10, padding: '11px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7fa3', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 5 }}>Name</label>
                    <input value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} placeholder="Customer name"
                      style={{ width: '100%', border: '1.5px solid #dce8f0', borderRadius: 10, padding: '11px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7fa3', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 5 }}>Language</label>
                    <select value={newCustomerLanguage} onChange={e => setNewCustomerLanguage(e.target.value)}
                      style={{ width: '100%', border: '1.5px solid #dce8f0', borderRadius: 10, padding: '11px 14px', fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box' as const }}>
                      {languageOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <button onClick={createCustomerInline} disabled={creatingCustomer}
                    style={{ background: '#023c62', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 14, opacity: creatingCustomer ? 0.6 : 1 }}>
                    {creatingCustomer ? 'Creating...' : 'Create'}
                  </button>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', background: '#eefbf3', border: '1px solid #bbf7d0', borderRadius: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>Enroll in Daily Iron</div>
                      <div style={{ fontSize: 12, color: '#15803d', marginTop: 2 }}>If enabled, the customer will be enrolled immediately after creation using the Daily Iron API.</div>
                    </div>
                    <button onClick={() => setNewCustomerEnrollIron(v => !v)}
                      style={{ padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: newCustomerEnrollIron ? '#166534' : '#d1fae5', color: newCustomerEnrollIron ? '#fff' : '#166534', minWidth: 88 }}>
                      {newCustomerEnrollIron ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => router.back()}
                style={{ flex: 1, padding: 12, border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, background: '#fff', cursor: 'pointer', color: '#6b7fa3' }}>
                Cancel
              </button>
              <button onClick={() => setShowCustomerModal(false)}
                style={{ flex: 2, padding: 12, background: '#023c62', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                {customer ? `Continue with ${customer.name}` : 'Continue without Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LEFT: Catalog ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{ background: '#023c62', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.back()}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
            ← Back
          </button>
          <div style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 800, fontSize: 18, color: '#fff', flex: 1 }}>New Order</div>
          {(customer || cart.length > 0 || notes.trim()) && (
            <button onClick={() => {
              clearDraft()
              setCustomer(null)
              setCustomerStats(null)
              setCart([])
              setCustomerSearch('')
              setCustomerResults([])
              setNewCustomerName('')
              setNewCustomerPhone('')
              setNewCustomerLanguage('ENGLISH')
              setNewCustomerEnrollIron(false)
              setPaymentMethod('CASH')
              setPaidAmount('')
              setDiscountType('flat')
              setDiscountValue('')
              setCouponCode('')
              setCouponDiscount(0)
              setCouponApplied(false)
              setLoyaltyPoints('')
              setLoyaltyDiscount(0)
              setLoyaltyApplied(false)
              setWriteOff(false)
              setWriteOffAmount(0)
              setWalletSplit('')
              setNotes('')
              setDailyIronDate(new Date().toISOString().slice(0, 10))
              setShowPayment(false)
              setShowCustomerModal(true)
            }}
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.16)', color: '#fff', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              Reset Draft
            </button>
          )}
          {customer && (
            <button onClick={() => setShowCustomerModal(true)}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <span style={{display:'inline-flex',alignItems:'center',gap:6}}><User size={14} />{customer.name || customer.phone}</span>
            </button>
          )}
          {!customer && (
            <button onClick={() => setShowCustomerModal(true)}
              style={{ background: '#ff6b35', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              + Select Customer
            </button>
          )}
        </div>

        {/* Category tabs */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e8f0f7', padding: '0 16px', display: 'flex', gap: 0, overflowX: 'auto' }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              style={{ padding: '12px 16px', border: 'none', borderBottom: `2px solid ${activeCategory === cat ? '#023c62' : 'transparent'}`, background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: activeCategory === cat ? '#023c62' : '#6b7fa3', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {cat}
            </button>
          ))}
        </div>

        {/* Items grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {catalogLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9dafc8' }}>Loading catalog...</div>
          ) : categories.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ marginBottom: 12, display:'flex', justifyContent:'center', color:'#991b1b' }}><AlertTriangle size={32} /></div>
              <div style={{ fontSize: 15, color: '#991b1b', fontWeight: 600, marginBottom: 8 }}>Failed to load catalog</div>
              <div style={{ fontSize: 13, color: '#9dafc8', marginBottom: 20 }}>Check your connection and try again.</div>
              <button
                onClick={() => {
                  setCatalogLoading(true)
                  servicesAPI.getCatalog().then((items: Item[]) => {
                    const map: Record<string, Item[]> = {}
                    items.forEach((item: Item) => {
                      if (!map[item.category]) map[item.category] = []
                      if (item.basePrice > 0 || item.category === 'DAILY_IRON') map[item.category].push(item)
                    })
                    const cats = Object.keys(map)
                    setCatalog(map)
                    setCategories(cats)
                    if (cats.length) setActiveCategory(cats[0])
                  }).catch(() => toast.error('Still unavailable'))
                  .finally(() => setCatalogLoading(false))
                }}
                style={{ background: '#023c62', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Retry
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {Object.entries(groupedItems()).map(([baseName, variants]) => {
                const inCart = cart.filter(i => variants.some(v => v.id === i.serviceId))
                const cartQty = inCart.reduce((s, i) => s + i.quantity, 0)
                const minPrice = Math.min(...variants.map(v => v.basePrice))
                const hasVariants = variants.length > 1

                return (
                  <div key={baseName} onClick={() => handleItemClick(baseName, variants)}
                    style={{ background: cartQty > 0 ? '#e8f4ff' : '#fff', border: `1.5px solid ${cartQty > 0 ? '#023c62' : '#e8f0f7'}`, borderRadius: 12, padding: 12, cursor: 'pointer', position: 'relative', transition: 'all 0.15s' }}
                    onMouseEnter={e => { if (!cartQty) e.currentTarget.style.borderColor = '#023c62' }}
                    onMouseLeave={e => { if (!cartQty) e.currentTarget.style.borderColor = '#e8f0f7' }}>
                    {cartQty > 0 && (
                      <div style={{ position: 'absolute', top: -8, right: -8, background: '#023c62', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                        {cartQty}
                      </div>
                    )}
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2332', marginBottom: 4, lineHeight: 1.3 }}>{baseName}</div>
                    <div style={{ fontSize: 12, color: '#023c62', fontWeight: 700 }}>
                      {hasVariants ? `from ${fmt(minPrice)}` : fmt(minPrice)}
                    </div>
                    {hasVariants && <div style={{ fontSize: 10, color: '#9dafc8', marginTop: 2 }}>{variants.length} options</div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Customer Info + Cart ────────────────────────────────────── */}
      <div style={{ width: 340, background: '#fff', borderLeft: '1px solid #e8f0f7', display: 'flex', flexDirection: 'column' }}>

        {/* Customer info panel */}
        {customer ? (
          <div style={{ padding: '16px', background: '#023c62', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{customer.name || 'Walk-in'}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{customer.phone}</div>
              </div>
              <button onClick={() => setShowCustomerModal(true)}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
                Change
              </button>
            </div>
            {customerStats && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Orders', value: customerStats.totalOrders },
                  { label: 'Dues', value: fmt(customerStats.outstanding), warn: customerStats.outstanding > 0 },
                  { label: 'Points', value: customerStats.loyaltyPoints },
                  { label: 'Wallet', value: fmt(customer.walletBalance || 0) },
                  { label: 'Spent', value: fmt(customerStats.totalSpend) },
                  { label: 'Last', value: customerStats.lastOrderDate ? new Date(customerStats.lastOrderDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 2 }}>{s.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: s.warn ? '#fbbf24' : '#fff' }}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: 16, background: '#f8fafc', borderBottom: '1px solid #e8f0f7', textAlign: 'center' }}>
            <button onClick={() => setShowCustomerModal(true)}
              style={{ padding: '10px 20px', background: '#023c62', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', width: '100%' }}>
              + Select Customer
            </button>
          </div>
        )}

        {/* Cart items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
          {cart.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9dafc8', fontSize: 13 }}>
              <div style={{ marginBottom: 8, display:'flex', justifyContent:'center' }}><Shirt size={32} /></div>
              No items added yet<br/>
              <span style={{ fontSize: 11 }}>Click items from the catalog</span>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.serviceId} style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1a2332', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: '#9dafc8' }}>{fmt(item.unitPrice)} each</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => updateQty(item.serviceId, -1)}
                    style={{ width: 26, height: 26, borderRadius: 6, background: '#f1f5f9', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#023c62' }}>−</button>
                  <span style={{ fontSize: 14, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{item.quantity}</span>
                  <button onClick={() => updateQty(item.serviceId, 1)}
                    style={{ width: 26, height: 26, borderRadius: 6, background: '#023c62', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#fff' }}>+</button>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#023c62', minWidth: 50, textAlign: 'right' }}>{fmt(item.unitPrice * item.quantity)}</div>
              </div>
            ))
          )}
        </div>

        {/* Discount / Coupon / Loyalty */}
        {hasRegularItems && (
          <div style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9', background: '#fafbfd' }}>
            {/* Manual discount */}
            <div style={{ display: 'flex', gap: 5, marginBottom: 7 }}>
              <button onClick={() => setDiscountType('flat')}
                style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid #e2e8f0', background: discountType === 'flat' ? '#023c62' : '#fff', color: discountType === 'flat' ? '#fff' : '#374151', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>₹</button>
              <button onClick={() => setDiscountType('percent')}
                style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid #e2e8f0', background: discountType === 'percent' ? '#023c62' : '#fff', color: discountType === 'percent' ? '#fff' : '#374151', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>%</button>
              <input type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)}
                placeholder="Discount"
                style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 5, padding: '4px 7px', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }} />
              {manualDiscount > 0 && <span style={{ fontSize: 11, color: '#166534', alignSelf: 'center', fontWeight: 600 }}>-{fmt(manualDiscount)}</span>}
            </div>
            {/* Coupon */}
            <div style={{ display: 'flex', gap: 5, marginBottom: 7 }}>
              <input type="text" value={couponCode}
                onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponApplied(false); setCouponDiscount(0) }}
                placeholder="Coupon code"
                style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 5, padding: '4px 7px', fontSize: 12, outline: 'none', textTransform: 'uppercase' as const, boxSizing: 'border-box' as const }} />
              <button onClick={async () => {
                if (!couponCode) return
                setCouponLoading(true)
                try {
                  const r = await (api as any).post('/checkout/validate-coupon', { code: couponCode, orderTotal: regularSubtotal, customerId: customer?.id })
                  setCouponDiscount(r.data?.discount || r.discount || 0)
                  setCouponApplied(true)
                  toast.success('Coupon applied')
                } catch (e: any) { toast.error(e.message || 'Invalid coupon') }
                setCouponLoading(false)
              }} disabled={couponLoading || !couponCode}
                style={{ padding: '4px 10px', background: couponApplied ? '#166534' : '#023c62', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: couponLoading ? 0.5 : 1 }}>
                {couponApplied ? 'Applied' : couponLoading ? '...' : 'Apply'}
              </button>
            </div>
            {/* Loyalty */}
            {customer && (customer.loyaltyPoints || 0) > 0 && (
              <div style={{ display: 'flex', gap: 5 }}>
                <input type="number" value={loyaltyPoints}
                  onChange={e => { setLoyaltyPoints(e.target.value); setLoyaltyApplied(false); setLoyaltyDiscount(0) }}
                  placeholder={`Points (have ${customer.loyaltyPoints || 0})`}
                  style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 5, padding: '4px 7px', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }} />
                <button onClick={async () => {
                  if (!loyaltyPoints || !customer) return
                  setLoyaltyLoading(true)
                  try {
                    const r = await (api as any).post('/checkout/validate-loyalty', { customerId: customer.id, pointsToRedeem: parseInt(loyaltyPoints), orderTotal: regularSubtotal })
                    setLoyaltyDiscount(r.data?.discount || r.discount || 0)
                    setLoyaltyApplied(true)
                    toast.success(r.message || 'Points applied')
                  } catch (e: any) { toast.error(e.message || 'Failed') }
                  setLoyaltyLoading(false)
                }} disabled={loyaltyLoading || !loyaltyPoints}
                  style={{ padding: '4px 10px', background: loyaltyApplied ? '#166534' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: loyaltyLoading ? 0.5 : 1 }}>
                  {loyaltyApplied ? 'Applied' : loyaltyLoading ? '...' : 'Redeem'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {cart.length > 0 && (
          <div style={{ padding: '8px 14px', borderTop: '1px solid #f1f5f9' }}>
            {isMixedCart && (
              <div style={{ marginBottom: 10, padding: '10px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, fontSize: 12, color: '#9a3412', lineHeight: 1.45 }}>
                This submit will create a regular order for dry clean items and Daily Iron logs for ironing items. Counter payment below applies only to the regular-order portion.
              </div>
            )}

            {(isPureDailyIron || isMixedCart) && (
              <div style={{ marginBottom: 10, padding: '10px 12px', background: '#eefbf3', border: '1px solid #bbf7d0', borderRadius: 10 }}>
                <div style={{ fontSize: 12, color: '#166534', fontWeight: 700, marginBottom: 6 }}>Daily Iron Flow</div>
                <div style={{ fontSize: 12, color: '#166534', marginBottom: 10 }}>
                  {isMixedCart
                    ? 'Daily Iron items in this cart will be logged for month-end billing alongside the regular order.'
                    : 'These items will create Daily Iron logs and will be billed at month-end, so no counter payment is collected here.'}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#15803d', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Log Date</div>
                  <input type="date" value={dailyIronDate} onChange={e => setDailyIronDate(e.target.value)}
                    style={{ width: '100%', border: '1px solid #86efac', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
            )}

            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder={isPureDailyIron ? 'Log notes (optional)...' : 'Order notes (optional)...'}
              style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        )}

        {/* Total + Confirm */}
        <div style={{ padding: 14, borderTop: '2px solid #e8f0f7', background: '#f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
            <span style={{ color: '#6b7fa3' }}>Items</span>
            <span style={{ color: '#6b7fa3' }}>{totalQty} pcs</span>
          </div>
          {isMixedCart && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                <span style={{ color: '#6b7fa3' }}>Regular Order Value</span>
                <span style={{ color: '#023c62', fontWeight: 600 }}>{fmt(regularSubtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                <span style={{ color: '#15803d' }}>Daily Iron Estimated Value</span>
                <span style={{ color: '#15803d', fontWeight: 600 }}>{fmt(dailyIronEstimatedValue)}</span>
              </div>
            </>
          )}
          {hasRegularItems && totalDiscount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
              <span style={{ color: '#166534' }}>Discount</span>
              <span style={{ color: '#166534', fontWeight: 600 }}>-{fmt(totalDiscount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 800, fontSize: 18, color: '#023c62' }}>{isPureDailyIron ? 'Estimated Value' : isMixedCart ? 'Payable Now' : 'Total'}</span>
            <span style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 800, fontSize: 22, color: '#023c62' }}>{fmt(total)}</span>
          </div>
          <button onClick={() => {
            if (!cart.length || !customer) return
            if (isPureDailyIron) {
              handleConfirmDailyIron()
              return
            }
            setShowPayment(true)
          }}
            disabled={!cart.length || !customer || submitting}
            style={{ width: '100%', padding: '14px', background: cart.length && customer ? '#023c62' : '#e2e8f0', color: cart.length && customer ? '#fff' : '#9dafc8', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: cart.length && customer ? 'pointer' : 'not-allowed', fontFamily: "var(--crm-font-ui)", opacity: submitting ? 0.6 : 1 }}>
            {!customer
              ? 'Select Customer First'
              : !cart.length
              ? 'Add Items'
              : isPureDailyIron
              ? (submitting ? 'Creating Daily Iron Logs...' : 'Create Daily Iron Logs')
              : isMixedCart
              ? `Confirm Order + Daily Iron Logs — ${fmt(total)}`
              : `Confirm Order — ${fmt(total)}`}
          </button>
        </div>
      </div>

      {/* ── Variant Popup ──────────────────────────────────────────────────── */}
      {variantItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90 }}
          onClick={() => setVariantItem(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{variantParent}</div>
            <p style={{ fontSize: 13, color: '#6b7fa3', marginBottom: 16 }}>Select a variant</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {variantItem.map(v => {
                const cartItem = cart.find(i => i.serviceId === v.id)
                return (
                  <div key={v.id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', border: `1.5px solid ${cartItem ? '#023c62' : '#e2e8f0'}`, borderRadius: 10, background: cartItem ? '#f0f7ff' : '#fff', cursor: 'pointer' }}
                    onClick={() => addToCart(v)}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a2332' }}>{v.name}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#023c62' }}>{fmt(v.basePrice)}</span>
                      {cartItem ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => updateQty(v.id, -1)} style={{ width: 26, height: 26, borderRadius: 6, background: '#f1f5f9', border: 'none', cursor: 'pointer', fontWeight: 700 }}>−</button>
                          <span style={{ fontWeight: 700, minWidth: 16, textAlign: 'center' }}>{cartItem.quantity}</span>
                          <button onClick={() => updateQty(v.id, 1)} style={{ width: 26, height: 26, borderRadius: 6, background: '#023c62', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#fff' }}>+</button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, background: '#023c62', color: '#fff', padding: '4px 10px', borderRadius: 20, fontWeight: 600 }}>Add</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <button onClick={() => setVariantItem(null)}
              style={{ width: '100%', marginTop: 14, padding: 10, border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#6b7fa3' }}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* ── Payment Modal ──────────────────────────────────────────────────── */}
      {showPayment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 32px 80px rgba(0,0,0,0.25)' }}>
            <div style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 800, fontSize: 22, color: '#023c62', marginBottom: 4 }}>Payment</div>
            <p style={{ fontSize: 13, color: '#6b7fa3', marginBottom: 20 }}>Customer: <strong>{customer?.name}</strong></p>

            {/* Order summary */}
            <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                <span style={{ color: '#6b7fa3' }}>Regular Order Subtotal ({regularCart.reduce((s, i) => s + i.quantity, 0)} items)</span>
                <span style={{ fontWeight: 600 }}>{fmt(regularSubtotal)}</span>
              </div>
              {isMixedCart && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#15803d' }}><span>Daily Iron Estimated Value</span><span>{fmt(dailyIronEstimatedValue)}</span></div>}
              {manualDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#166534' }}><span>Manual Discount</span><span>-{fmt(manualDiscount)}</span></div>}
              {couponDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#166534' }}><span>Coupon ({couponCode})</span><span>-{fmt(couponDiscount)}</span></div>}
              {loyaltyDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#7c3aed' }}><span>Loyalty Points</span><span>-{fmt(loyaltyDiscount)}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #e2e8f0', marginTop: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{isMixedCart ? 'Payable Now' : 'Total'}</span>
                <span style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 800, fontSize: 20, color: '#023c62' }}>{fmt(total)}</span>
              </div>
            </div>

            {/* Payment method */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#6b7fa3', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payment Method</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[...paymentMethods, ...(customer?.walletBalance && customer.walletBalance > 0 ? [{ value: 'SPLIT', label: 'Split (Cash+Wallet)' }] : [])].map((m) => (
                  <button key={m.value} onClick={() => { setPaymentMethod(m.value as any); if (m.value === 'Pay Later') setPaidAmount('0') }}
                    style={{ padding: '8px 14px', border: `2px solid ${paymentMethod === m.value ? '#023c62' : '#e2e8f0'}`, borderRadius: 8, background: paymentMethod === m.value ? '#023c62' : '#fff', color: paymentMethod === m.value ? '#fff' : '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {m.label}
                  </button>
                ))}
                {/* Split payment inputs */}
                {paymentMethod === 'SPLIT' && customer?.walletBalance && (
                  <div style={{ width: '100%', marginTop: 8, background: '#f8fafc', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 12, color: '#6b7fa3', marginBottom: 6 }}>Wallet balance: <strong>{fmt(customer.walletBalance)}</strong></div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: '#9dafc8', marginBottom: 4 }}>From Wallet</div>
                        <input type="number" value={walletSplit}
                          onChange={e => setWalletSplit(String(Math.min(parseFloat(e.target.value) || 0, customer.walletBalance || 0, total)))}
                          max={Math.min(customer.walletBalance, total)}
                          style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box' as const }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: '#9dafc8', marginBottom: 4 }}>Cash / UPI</div>
                        <div style={{ padding: '6px 8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, fontWeight: 600, color: '#023c62' }}>
                          {fmt(Math.max(0, total - (parseFloat(walletSplit) || 0)))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Paid amount */}
            {paymentMethod !== 'Pay Later' && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#6b7fa3', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Amount Paid</div>
                <input type="number" value={paidAmount}
                  onChange={e => {
                    const val = e.target.value
                    setPaidAmount(val)
                    const due = total - parseFloat(val || '0')
                    if (due > 0 && due <= writeOffMax) {
                      setWriteOffAmount(Math.round(due * 100) / 100)
                      setWriteOff(false) // reset toggle when amount changes
                    } else {
                      setWriteOffAmount(0)
                      setWriteOff(false)
                    }
                  }}
                  placeholder={String(total)}
                  style={{ width: '100%', border: '2px solid #023c62', borderRadius: 10, padding: '10px 14px', fontSize: 16, fontWeight: 700, outline: 'none', boxSizing: 'border-box' }} />
                {paidAmount && (() => {
                  const balance = total - parseFloat(paidAmount || '0')
                  return (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13 }}>
                        <span style={{ color: '#6b7fa3' }}>Balance</span>
                        <span style={{ fontWeight: 700, color: balance <= 0 ? '#166534' : '#991b1b' }}>
                          {fmt(Math.abs(balance))} {balance <= 0 ? '(change/overpayment → wallet)' : '(due)'}
                        </span>
                      </div>
                      {balance > 0 && balance <= writeOffMax && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, padding: '8px 12px', background: '#fefce8', borderRadius: 8, border: '1px solid #fef08a' }}>
                          <span style={{ fontSize: 12, color: '#713f12' }}>Write off ₹{writeOffAmount}?</span>
                          <button onClick={() => setWriteOff(!writeOff)}
                            style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: writeOff ? '#166534' : '#e2e8f0', color: writeOff ? '#fff' : '#374151' }}>
                            {writeOff ? 'Write Off Applied' : 'Keep as Due'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowPayment(false)}
                style={{ flex: 1, padding: 12, border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontSize: 14, color: '#6b7fa3' }}>
                Back
              </button>
              <button onClick={handleConfirmOrder} disabled={submitting}
                style={{ flex: 2, padding: 12, background: '#023c62', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.5 : 1, fontFamily: "var(--crm-font-ui)" }}>
                {submitting ? 'Creating...' : `Confirm & Create Order ${writeOff ? '(+WriteOff ₹'+writeOffAmount+')' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
