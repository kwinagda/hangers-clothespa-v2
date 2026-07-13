'use client'
import { Suspense, useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import api, { ordersAPI, quotationsAPI, customersAPI, servicesAPI, statsAPI, ironAPI, metadataAPI } from '@/lib/api'
import toast from 'react-hot-toast'
import { AlertTriangle, Check, GripVertical, Shirt, Trash2, User } from 'lucide-react'
const asArray = (value: any, keys: string[] = []) => {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}

type LineDiscountType = 'flat' | 'percent'

const roundCurrency = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2))
const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const toMoney = (value: any, fallback = 0) => {
  const parsed = Number.parseFloat(String(value ?? ''))
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, roundCurrency(parsed))
}

const normalizeLineDiscountType = (value: any): LineDiscountType | null => {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === 'flat' || normalized === 'percent' ? normalized : null
}

const getLineDiscountAmount = (item: {
  unitPrice: number
  quantity: number
  lineDiscountType: LineDiscountType | null
  lineDiscountValue: number
}) => {
  const lineTotal = roundCurrency(item.unitPrice * item.quantity)
  if (lineTotal <= 0 || !item.lineDiscountType) return 0
  if (item.lineDiscountType === 'percent') {
    return roundCurrency((lineTotal * Math.min(100, item.lineDiscountValue || 0)) / 100)
  }
  return Math.min(lineTotal, roundCurrency(toMoney(item.lineDiscountValue) * Math.max(1, item.quantity || 1)))
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Item { id: string; name: string; basePrice: number; category: string; catalogName: string }
interface CartItem {
  lineId: string
  serviceId: string
  name: string
  baseUnitPrice: number
  unitPrice: number
  quantity: number
  category: string
  lineDiscountType: LineDiscountType | null
  lineDiscountValue: number
  lineDiscountAmount: number
  notes: string | null
}
interface Customer { id: string; name: string; phone: string; walletBalance?: number; loyaltyPoints?: number; ordersDue?: number; ironSubStatus?: string | null; preferredLanguage?: string }
interface CustomerStats { totalOrders: number; totalSpend: number; outstanding: number; loyaltyPoints: number; lastOrderDate: string | null; lastOrderStatus: string | null }

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
  commercialReason: string
  walletSplit: string
  notes: string
  dailyIronDate: string
  validUntil?: string
}

const createCartLineId = () => `line_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

const normalizeCartItem = (item: any): CartItem => {
  const quantity = Math.max(1, Number.parseInt(String(item?.quantity ?? 1), 10) || 1)
  const unitPrice = toMoney(item?.unitPrice ?? item?.price ?? item?.basePrice)
  const baseUnitPrice = toMoney(item?.baseUnitPrice ?? item?.originalUnitPrice ?? item?.basePrice ?? unitPrice, unitPrice)
  const lineDiscountType = normalizeLineDiscountType(item?.lineDiscountType)
  const lineDiscountValue = lineDiscountType ? toMoney(item?.lineDiscountValue ?? 0) : 0
  const lineDiscountAmount = lineDiscountType
    ? getLineDiscountAmount({ unitPrice, quantity, lineDiscountType, lineDiscountValue })
    : 0

  return {
    lineId: String(item?.lineId || createCartLineId()),
    serviceId: String(item?.serviceId || item?.id || ''),
    name: String(item?.name || item?.serviceName || '').trim(),
    baseUnitPrice,
    unitPrice,
    quantity,
    category: String(item?.category || item?.garmentType || '').trim(),
    lineDiscountType,
    lineDiscountValue,
    lineDiscountAmount,
    notes: item?.notes ? String(item.notes).trim() : null,
  }
}

const getCartLineGross = (item: CartItem) => roundCurrency(item.unitPrice * item.quantity)
const getCartLineNet = (item: CartItem) => roundCurrency(Math.max(0, getCartLineGross(item) - (item.lineDiscountAmount || 0)))
const hasPriceOverride = (item: CartItem) => Math.abs((item.unitPrice || 0) - (item.baseUnitPrice || 0)) > 0.009

const LEGACY_PAYMENT_METHOD_MAP: Record<string, string> = {
  Cash: 'CASH',
  'UPI / GPay': 'UPI',
  Card: 'CARD',
  'Pay Later': 'Pay Later',
}

const CATEGORY_ORDER = [
  'DAILY_IRON',
  'NORMAL IRONING',
  'DRY CLEAN — MEN',
  'DRY CLEAN — WOMEN',
  'DRY CLEAN — KIDS',
  'DRY CLEAN — HOUSE HOLD',
  'DRY CLEAN — ACCESSORIES',
  'STEAM IRONING',
  'ROLL PRESS',
  'SOFA CLEANING',
  'SHOE CLEANING',
]

const normalizeCategoryKey = (value: string) => String(value || '')
  .replace(/\s*-\s*/g, ' — ')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase()

const getCategoryRank = (category: string) => {
  const normalized = normalizeCategoryKey(category)
  const index = CATEGORY_ORDER.findIndex(item => normalizeCategoryKey(item) === normalized)
  return index >= 0 ? index : CATEGORY_ORDER.length
}

const sortCategories = (items: string[]) => [...items].sort((a, b) => {
  const rankDiff = getCategoryRank(a) - getCategoryRank(b)
  return rankDiff || a.localeCompare(b)
})

function NewOrderPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode') === 'quotation' ? 'quotation' : 'order'
  const isQuotationMode = mode === 'quotation'
  const quotationId = searchParams.get('quotationId')
  const draftStorageKey = isQuotationMode ? 'crm:new-quotation-draft:v1' : 'crm:new-order-draft:v1'
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
  const [dailyIronPrompt, setDailyIronPrompt] = useState<{ title: string; message: string; confirmLabel: string } | null>(null)
  const dailyIronPromptResolver = useRef<((value: boolean) => void) | null>(null)

  // Catalog
  const [catalog, setCatalog] = useState<Record<string, Item[]>>({})
  const [categories, setCategories] = useState<string[]>([])
  const [activeCategory, setActiveCategory] = useState('')
  const [itemSearch, setItemSearch] = useState('')
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogFlashKey, setCatalogFlashKey] = useState('')
  const catalogFlashTimeoutRef = useRef<any>(null)
  const categoryButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  // Cart
  const [cart, setCart] = useState<CartItem[]>([])
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [lineEditorPrice, setLineEditorPrice] = useState('')
  const [lineEditorDiscountType, setLineEditorDiscountType] = useState<LineDiscountType>('flat')
  const [lineEditorDiscountValue, setLineEditorDiscountValue] = useState('')
  const [lineEditorNotes, setLineEditorNotes] = useState('')
  const [savingLineId, setSavingLineId] = useState('')
  const [draggedLineId, setDraggedLineId] = useState<string | null>(null)
  const [dragOverLineId, setDragOverLineId] = useState<string | null>(null)
  const [showCustomItem, setShowCustomItem] = useState(false)
  const [customItemName, setCustomItemName] = useState('')
  const [customItemCategory, setCustomItemCategory] = useState('')
  const [customItemCatalog, setCustomItemCatalog] = useState('')
  const [customItemRate, setCustomItemRate] = useState('')
  const [customItemQty, setCustomItemQty] = useState('1')

  // Variant popup
  const [variantItem, setVariantItem] = useState<Item[] | null>(null)
  const [variantParent, setVariantParent] = useState('')
  const splitContainerRef = useRef<HTMLDivElement | null>(null)
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const [splitContainerWidth, setSplitContainerWidth] = useState(0)
  const [rightPanelWidthOverride, setRightPanelWidthOverride] = useState<number | null>(null)
  const [isResizingRightPanel, setIsResizingRightPanel] = useState(false)

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
  const [commercialReason, setCommercialReason] = useState('')
  const [writeOffMax, setWriteOffMax] = useState(50)
  const [walletSplit, setWalletSplit] = useState('')
  const [posSettings, setPosSettings] = useState<any>({})
  const [notes, setNotes] = useState('')
  const [dailyIronDate, setDailyIronDate] = useState(new Date().toISOString().slice(0, 10))
  const [validUntil, setValidUntil] = useState(() => {
    const next = new Date()
    next.setDate(next.getDate() + 7)
    return next.toISOString().slice(0, 10)
  })
  const [quotationStatus, setQuotationStatus] = useState('DRAFT')
  const [quotationStatuses, setQuotationStatuses] = useState<Array<{ value: string; label: string }>>([])

  const clearDraft = useCallback(() => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(draftStorageKey)
  }, [draftStorageKey])

  const triggerCatalogFlash = useCallback((key: string) => {
    setCatalogFlashKey(key)
    if (catalogFlashTimeoutRef.current) window.clearTimeout(catalogFlashTimeoutRef.current)
    catalogFlashTimeoutRef.current = window.setTimeout(() => setCatalogFlashKey(''), 180)
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
      setQuotationStatuses(metadata.quotationStatuses || [])
      const collectableMethods = (metadata.collectablePaymentMethods || []).length
        ? metadata.collectablePaymentMethods
        : (metadata.paymentMethods || []).filter((item: any) => (metadata.corePaymentMethods || []).includes(item.value))
      const mappedMethods = [
        ...collectableMethods.map((item: any) => ({
        value: item.value,
        label:
          item.value === 'CASH' ? 'Cash' :
          item.value === 'UPI' ? 'UPI / GPay' :
          item.value === 'CARD' ? 'Card' :
          item.label,
        })),
        { value: 'Pay Later', label: 'Pay Later' },
      ]
      setPaymentMethods(mappedMethods)
      setPaymentMethod((current) => {
        const normalized = LEGACY_PAYMENT_METHOD_MAP[current] || current
        return mappedMethods.some((item: any) => item.value === normalized) ? normalized : (mappedMethods[0]?.value || 'CASH')
      })
    }).catch(() => {
      setLanguageOptions([])
      setPaymentMethods([{ value: 'CASH', label: 'Cash' }])
      toast.error('Failed to load order metadata')
    })
  }, [])

  useEffect(() => () => {
    if (catalogFlashTimeoutRef.current) window.clearTimeout(catalogFlashTimeoutRef.current)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(draftStorageKey)
      if (!raw) {
        setDraftReady(true)
        return
      }
      const draft = JSON.parse(raw) as Partial<OrderDraft>
      if (draft.customer !== undefined) setCustomer(draft.customer as Customer | null)
      if (draft.customerStats !== undefined) setCustomerStats(draft.customerStats as CustomerStats | null)
      if (Array.isArray(draft.cart)) setCart(draft.cart.map(normalizeCartItem))
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
      if (typeof draft.commercialReason === 'string') setCommercialReason(draft.commercialReason)
      if (typeof draft.walletSplit === 'string') setWalletSplit(draft.walletSplit)
      if (typeof draft.notes === 'string') setNotes(draft.notes)
      if (typeof draft.dailyIronDate === 'string') setDailyIronDate(draft.dailyIronDate)
      if (typeof draft.validUntil === 'string') setValidUntil(draft.validUntil)
    } catch {
      window.localStorage.removeItem(draftStorageKey)
    } finally {
      setDraftReady(true)
    }
  }, [draftStorageKey])

  // Auto-load customer from URL or quotation edit state
  useEffect(() => {
    if (!draftReady) return
    if (isQuotationMode && quotationId) {
      quotationsAPI.get(quotationId).then((r: any) => {
        const quotation = r?.data?.quotation || r?.quotation || null
        if (!quotation) return
        setCustomer(quotation.customer || null)
        setShowCustomerModal(false)
        setNotes(quotation.notes || '')
        setDiscountType('flat')
        setDiscountValue(String(quotation.discount || ''))
        setValidUntil(quotation.validUntil ? String(quotation.validUntil).slice(0, 10) : validUntil)
        setQuotationStatus(quotation.quotationStatus || 'DRAFT')
        setCart((quotation.items || []).map((item: any) => normalizeCartItem({
          lineId: item.id || createCartLineId(),
          serviceId: item.serviceId || item.id,
          name: item.serviceName,
          unitPrice: item.unitPrice,
          baseUnitPrice: item.baseUnitPrice ?? item.unitPrice,
          quantity: item.quantity,
          category: item.garmentType || '',
          lineDiscountType: item.lineDiscountType,
          lineDiscountValue: item.lineDiscountValue,
          lineDiscountAmount: item.lineDiscountAmount,
          notes: item.notes,
        })))
      }).catch(() => {
        toast.error('Failed to load quotation')
      })
      return
    }
    const cid = searchParams.get('customerId')
    if (cid) {
      customersAPI.get(cid).then((r: any) => {
        const cust = r.data?.customer || r.data
        if (cust) selectCustomer(cust)
      }).catch(() => {
        toast.error('Failed to load selected customer')
        setShowCustomerModal(true)
      })
    }
  }, [draftReady, searchParams, isQuotationMode, quotationId, validUntil])

  useEffect(() => {
    const digits = customerSearch.replace(/\D/g, '').slice(-10)
    if (showCustomerModal && digits.length && newCustomerPhone !== digits) setNewCustomerPhone(digits)
    if (showCustomerModal && customerSearch.trim() && !digits.length) setNewCustomerName(customerSearch.trim())
  }, [customerSearch, showCustomerModal, newCustomerPhone])

  useEffect(() => {
    const digits = customerSearch.replace(/\D/g, '').slice(-10)
    const shouldSearchSuggestCreate = customerSearch.trim().length >= 3
    const shouldPhoneSuggestCreate = digits.length === 10

    if ((customer || (!showCustomerModal && customerResults.length > 0)) || (!shouldSearchSuggestCreate && !shouldPhoneSuggestCreate)) {
      setShowQuickCreate(false)
      return
    }
    if (searchLoading) return
    setShowQuickCreate(customerResults.length === 0)
  }, [customer, customerResults.length, customerSearch, searchLoading, showCustomerModal])

  // Load catalog
  useEffect(() => {
    servicesAPI.getCatalog().then((items: Item[]) => {
      const map: Record<string, Item[]> = {}
      items.forEach((item: Item) => {
        if (isQuotationMode && item.category === 'DAILY_IRON') return
        if (!map[item.category]) map[item.category] = []
        if (item.basePrice > 0 || item.category === 'DAILY_IRON') map[item.category].push(item)
      })
      const cats = sortCategories(Object.keys(map))
      setCatalog(map)
      setCategories(cats)
      if (cats.length) setActiveCategory(cats[0])
    }).catch(() => toast.error('Failed to load catalog'))
    .finally(() => setCatalogLoading(false))
  }, [isQuotationMode])

  useEffect(() => {
    if (!customItemCatalog && activeCategory) setCustomItemCatalog(activeCategory)
  }, [activeCategory, customItemCatalog])

  useEffect(() => {
    if (!activeCategory) return
    categoryButtonRefs.current[activeCategory]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }, [activeCategory])

  useEffect(() => {
    const query = itemSearch.trim().toLowerCase()
    if (!query) return
    const allMatches = Object.values(catalog).flat().filter(item => [
      item.name,
      item.category,
      item.catalogName,
    ].some(value => String(value || '').toLowerCase().includes(query)))
    const matchedItem = allMatches.find(item => item.category !== 'DAILY_IRON') || allMatches[0]
    if (matchedItem?.category && matchedItem.category !== activeCategory) {
      setActiveCategory(matchedItem.category)
    }
  }, [activeCategory, catalog, itemSearch])

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
      setCustomerResults(asArray(r.data, ['customers', 'items']))
    } catch {
      setCustomerResults([])
      toast.error('Customer search failed')
    }
    setSearchLoading(false)
  }, [])

  const handleSearchInput = (val: string) => {
    setCustomerSearch(val)
    setShowQuickCreate(false)
    clearTimeout(searchTimeout.current)
    const digits = val.replace(/\D/g, '').slice(-10)
    if (digits.length) setNewCustomerPhone(digits)
    if (!digits.length) setNewCustomerName(val.trim())
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
      setCustomerStats(null)
      toast.error('Loaded customer with partial data')
      setShowCustomerModal(false)
    }
  }

  useEffect(() => {
    if (!draftReady || !customer?.id) return
    statsAPI.customer(customer.id).then((r: any) => setCustomerStats(r.data)).catch(() => setCustomerStats(null))
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

  const resetAppliedIncentives = useCallback(() => {
    setCouponApplied(false)
    setCouponDiscount(0)
    setLoyaltyApplied(false)
    setLoyaltyDiscount(0)
  }, [])

  const closeLineEditor = useCallback(() => {
    setEditingLineId(null)
    setLineEditorPrice('')
    setLineEditorDiscountType('flat')
    setLineEditorDiscountValue('')
    setLineEditorNotes('')
  }, [])

  const openLineEditor = useCallback((item: CartItem) => {
    if (item.category === 'DAILY_IRON') {
      toast.error('Daily Iron items use the monthly billing flow and do not support line discounts here')
      return
    }
    setEditingLineId(item.lineId)
    setLineEditorPrice(String(item.unitPrice))
    setLineEditorDiscountType(item.lineDiscountType || 'flat')
    setLineEditorDiscountValue(item.lineDiscountType ? String(item.lineDiscountValue || '') : '')
    setLineEditorNotes(item.notes || '')
  }, [])

  const saveLinePricing = useCallback(async () => {
    const currentItem = cart.find((entry) => entry.lineId === editingLineId)
    if (!currentItem) return
    if (!lineEditorPrice.trim()) {
      toast.error('Enter a valid service price')
      return
    }

    const nextPrice = toMoney(lineEditorPrice, currentItem.unitPrice)
    const nextDiscountType = lineEditorDiscountValue.trim() ? lineEditorDiscountType : null
    const nextDiscountValue = nextDiscountType ? toMoney(lineEditorDiscountValue) : 0
    const nextNotes = lineEditorNotes.trim()

    setSavingLineId(currentItem.lineId)
    try {
      setCart((prev) => prev.map((entry) => (
        entry.lineId === currentItem.lineId
          ? normalizeCartItem({
              ...entry,
              unitPrice: nextPrice,
              baseUnitPrice: entry.baseUnitPrice || currentItem.unitPrice,
              lineDiscountType: nextDiscountType,
              lineDiscountValue: nextDiscountValue,
              notes: nextNotes || null,
            })
          : entry
      )))
      resetAppliedIncentives()
      closeLineEditor()
      toast.success('Line price and discount updated for this order or quotation only')
    } catch (e: any) {
      toast.error(e.message || 'Failed to update line pricing')
    }
    setSavingLineId('')
  }, [
    cart,
    closeLineEditor,
    editingLineId,
    lineEditorDiscountType,
    lineEditorDiscountValue,
    lineEditorNotes,
    lineEditorPrice,
    resetAppliedIncentives,
  ])

  useEffect(() => {
    if (!editingLineId) return
    if (!cart.some((item) => item.lineId === editingLineId)) {
      closeLineEditor()
    }
  }, [cart, closeLineEditor, editingLineId])

  const getRightPanelBounds = useCallback((containerWidth: number) => {
    const fallbackWidth = 1200
    const safeWidth = containerWidth || fallbackWidth
    const minWidth = safeWidth < 1100 ? 380 : 420
    const maxWidth = clampValue(Math.round(safeWidth * 0.48), 520, 780)
    return {
      minWidth,
      maxWidth: Math.max(minWidth, maxWidth),
    }
  }, [])

  useEffect(() => {
    const node = splitContainerRef.current
    if (!node) return

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width || node.getBoundingClientRect().width || 0
      setSplitContainerWidth(Math.round(nextWidth))
    })

    observer.observe(node)
    setSplitContainerWidth(Math.round(node.getBoundingClientRect().width || 0))

    return () => observer.disconnect()
  }, [])

  const { minWidth: rightPanelMinWidth, maxWidth: rightPanelMaxWidth } = getRightPanelBounds(splitContainerWidth)
  const autoRightPanelWidth = splitContainerWidth
    ? clampValue(
        Math.round(splitContainerWidth * (splitContainerWidth > 1500 ? 0.31 : 0.35)),
        rightPanelMinWidth,
        splitContainerWidth > 1500 ? 620 : 560
      )
    : 440
  const effectiveRightPanelWidth = clampValue(
    rightPanelWidthOverride ?? autoRightPanelWidth,
    rightPanelMinWidth,
    rightPanelMaxWidth
  )

  useEffect(() => {
    if (rightPanelWidthOverride === null) return
    const clamped = clampValue(rightPanelWidthOverride, rightPanelMinWidth, rightPanelMaxWidth)
    if (Math.abs(clamped - rightPanelWidthOverride) > 0.5) {
      setRightPanelWidthOverride(clamped)
    }
  }, [rightPanelMaxWidth, rightPanelMinWidth, rightPanelWidthOverride])

  const startRightPanelResize = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    resizeStateRef.current = {
      startX: event.clientX,
      startWidth: effectiveRightPanelWidth,
    }
    setIsResizingRightPanel(true)
  }, [effectiveRightPanelWidth])

  useEffect(() => {
    if (!isResizingRightPanel) return

    const handleMouseMove = (event: MouseEvent) => {
      if (!resizeStateRef.current) return
      const delta = resizeStateRef.current.startX - event.clientX
      const nextWidth = clampValue(
        resizeStateRef.current.startWidth + delta,
        rightPanelMinWidth,
        rightPanelMaxWidth
      )
      setRightPanelWidthOverride(nextWidth)
    }

    const handleMouseUp = () => {
      resizeStateRef.current = null
      setIsResizingRightPanel(false)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingRightPanel, rightPanelMaxWidth, rightPanelMinWidth])

  // Group items by base name (e.g. "Sweater-full sleeves -plain" and "Sweater-full sleeves -heavy" → "Sweater-full sleeves")
  const groupedItems = () => {
    const query = itemSearch.trim().toLowerCase()
    let sourceItems = catalog[activeCategory] || []
    const items = query
      ? sourceItems.filter(item => [
          item.name,
          item.category,
          item.catalogName,
        ].some(value => String(value || '').toLowerCase().includes(query)))
      : sourceItems
    if (query && items.length === 0) {
      const allMatches = Object.values(catalog).flat().filter(item => [
        item.name,
        item.category,
        item.catalogName,
      ].some(value => String(value || '').toLowerCase().includes(query)))
      const fallbackCategory = allMatches.find(item => item.category !== 'DAILY_IRON')?.category || allMatches[0]?.category
      sourceItems = fallbackCategory ? (catalog[fallbackCategory] || []) : []
    }
    const visibleItems = query
      ? sourceItems.filter(item => [
          item.name,
          item.category,
          item.catalogName,
        ].some(value => String(value || '').toLowerCase().includes(query)))
      : sourceItems
    const groups: Record<string, Item[]> = {}
    visibleItems.forEach(item => {
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
      triggerCatalogFlash(baseName)
      addToCart(variants[0])
    } else {
      setVariantParent(baseName)
      setVariantItem(variants)
    }
  }

  const addToCart = (item: Item) => {
    setCart(prev => [
      ...prev,
      normalizeCartItem({
        lineId: createCartLineId(),
        serviceId: item.id,
        name: item.name,
        unitPrice: item.basePrice,
        baseUnitPrice: item.basePrice,
        quantity: 1,
        category: item.category,
      }),
    ])
    resetAppliedIncentives()
    setVariantItem(null)
  }

  const addCustomItemToCart = () => {
    const name = customItemName.trim()
    const unitPrice = toMoney(customItemRate)
    const quantity = Math.max(1, Number.parseInt(customItemQty, 10) || 1)
    const catalogName = activeCategory || customItemCatalog || categories[0] || 'CUSTOM'
    const categoryLabel = customItemCategory.trim()

    if (!name) { toast.error('Enter custom item name'); return }
    if (unitPrice <= 0) { toast.error('Enter custom item rate'); return }

    setCart(prev => [
      ...prev,
      normalizeCartItem({
        lineId: createCartLineId(),
        serviceId: '',
        name,
        unitPrice,
        baseUnitPrice: unitPrice,
        quantity,
        category: catalogName,
        notes: categoryLabel ? `Custom item category: ${categoryLabel}` : 'Custom order item',
      }),
    ])
    resetAppliedIncentives()
    setCustomItemName('')
    setCustomItemCategory('')
    setCustomItemRate('')
    setCustomItemQty('1')
  }

  const updateQty = (lineId: string, delta: number) => {
    const currentItem = cart.find((item) => item.lineId === lineId)
    setCart(prev => {
      const n = prev.map(i => i.lineId === lineId ? normalizeCartItem({ ...i, quantity: i.quantity + delta }) : i)
      return n.filter(i => i.quantity > 0)
    })
    resetAppliedIncentives()
    if (currentItem && currentItem.quantity + delta <= 0 && editingLineId === lineId) {
      closeLineEditor()
    }
  }

  const removeLine = useCallback((lineId: string) => {
    setCart((prev) => prev.filter((item) => item.lineId !== lineId))
    resetAppliedIncentives()
    if (editingLineId === lineId) closeLineEditor()
  }, [closeLineEditor, editingLineId, resetAppliedIncentives])

  const moveCartLine = useCallback((fromLineId: string, toLineId: string) => {
    if (!fromLineId || !toLineId || fromLineId === toLineId) return
    setCart((prev) => {
      const fromIndex = prev.findIndex((item) => item.lineId === fromLineId)
      const toIndex = prev.findIndex((item) => item.lineId === toLineId)
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }, [])

  const regularCart    = cart.filter(i => i.category !== 'DAILY_IRON')
  const dailyIronCart  = cart.filter(i => i.category === 'DAILY_IRON')
  const regularBaseSubtotal = regularCart.reduce((s, i) => s + getCartLineGross(i), 0)
  const regularServiceDiscount = regularCart.reduce((s, i) => s + (i.lineDiscountAmount || 0), 0)
  const regularSubtotal = regularCart.reduce((s, i) => s + getCartLineNet(i), 0)
  const dailyIronEstimatedValue = dailyIronCart.reduce((s, i) => s + getCartLineGross(i), 0)
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

  const askDailyIronEnable = (prompt: { title: string; message: string; confirmLabel: string }) =>
    new Promise<boolean>((resolve) => {
      dailyIronPromptResolver.current = resolve
      setDailyIronPrompt(prompt)
    })

  const closeDailyIronPrompt = (accepted: boolean) => {
    dailyIronPromptResolver.current?.(accepted)
    dailyIronPromptResolver.current = null
    setDailyIronPrompt(null)
  }

  const ensureActiveIronSubscription = async () => {
    if (!customer) return null

    try {
      const response = await ironAPI.getSubscription(customer.id).catch((e: any) => {
        if (String(e?.message || '').toLowerCase().includes('subscription not found')) return { data: { subscription: null } }
        throw e
      })
      let subscription = response?.data?.subscription || null

      if (!subscription) {
        const shouldEnroll = await askDailyIronEnable({
          title: 'Enable Daily Iron?',
          message: `${customer.name || customer.phone} is not enrolled in Daily Iron. Enable it now and continue creating this Daily Iron log.`,
          confirmLabel: 'Enable & Continue',
        })
        if (!shouldEnroll) return null
        const created = await ironAPI.createSubscription({ customerId: customer.id, applicationStatus: 'ACTIVE' })
        subscription = created?.data?.subscription || null
      }

      if (subscription?.applicationStatus === 'PENDING_REVIEW') {
        const shouldConfirm = await askDailyIronEnable({
          title: 'Confirm Daily Iron?',
          message: `${customer.name || customer.phone} has a pending Daily Iron application. Confirm it and continue creating this log.`,
          confirmLabel: 'Confirm & Continue',
        })
        if (!shouldConfirm) return null
        const confirmed = await ironAPI.confirmSubscription(subscription.id)
        subscription = confirmed?.data?.subscription || subscription
      }

      if (subscription?.applicationStatus === 'PAUSED' || subscription?.applicationStatus === 'CANCELLED') {
        const shouldReactivate = await askDailyIronEnable({
          title: 'Reactivate Daily Iron?',
          message: `This Daily Iron subscription is ${subscription.applicationStatus}. Reactivate it and continue creating this log.`,
          confirmLabel: 'Reactivate & Continue',
        })
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
      await ironAPI.createLogsBatch({
        customerId: customer.id,
        date: dailyIronDate,
        notes: notes || undefined,
        items: dailyIronCart.map(item => ({
          serviceId: item.serviceId,
          pieces: item.quantity,
          notes: item.notes || undefined,
        })),
      })
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
    if (manualDiscount > 0 || regularServiceDiscount > 0 || loyaltyApplied) { toast.error('Coupons cannot be stacked with manual or loyalty discounts'); return }
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
    if (manualDiscount > 0 || regularServiceDiscount > 0 || couponApplied) { toast.error('Loyalty redemption cannot be stacked with manual or coupon discounts'); return }
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
    if (hasRegularItems && hasDailyIronItems) {
      toast.error('Daily Iron must be logged separately from regular orders')
      return
    }
    if (!hasRegularItems) {
      await handleConfirmDailyIron()
      return
    }

    const walletPortion = parseFloat(walletSplit) || 0
    const paid = parseFloat(paidAmount) || (paymentMethod === 'Pay Later' ? 0 : Math.max(0, total - walletPortion))
    const writeOffAmt = writeOff ? writeOffAmount : 0
    const hasCommercialAdjustment = manualDiscount > 0 || regularServiceDiscount > 0 || writeOffAmt > 0 || regularCart.some(item => !item.serviceId || hasPriceOverride(item))
    if (hasCommercialAdjustment && commercialReason.trim().length < 3) {
      toast.error('Enter a reason for the price, discount, custom-item, or write-off adjustment')
      return
    }
    if (paid + walletPortion + writeOffAmt > total + 0.001) {
      toast.error(`Settlement cannot exceed the ${fmt(total)} order total`)
      return
    }
    setSubmitting(true)
    try {
      const subscription = hasDailyIronItems ? await ensureActiveIronSubscription() : null
      if (hasDailyIronItems && !subscription) {
        setSubmitting(false)
        return
      }

      const orderResponse = await ordersAPI.create({
        customerId: customer.id,
        items: regularCart.map(i => ({
          serviceId: i.serviceId || undefined,
          serviceName: i.name,
          garmentType: i.category,
          quantity: i.quantity,
          baseUnitPrice: i.baseUnitPrice,
          unitPrice: i.unitPrice,
          lineDiscountType: i.lineDiscountType ? i.lineDiscountType.toUpperCase() : undefined,
          lineDiscountValue: i.lineDiscountValue || 0,
          notes: i.notes || undefined,
        })),
        discount: manualDiscount || undefined,
        couponCode: couponApplied ? couponCode : undefined,
        loyaltyPointsRedeemed: loyaltyApplied ? parseInt(loyaltyPoints) : undefined,
        writeOffAmount: writeOffAmt || undefined,
        writeOffReason: writeOffAmt > 0 ? commercialReason.trim() : undefined,
        commercialReason: hasCommercialAdjustment ? commercialReason.trim() : undefined,
        paymentMethod,
        walletAmount: walletPortion > 0 ? walletPortion : undefined,
        paidAmount: paid,
        notes,
        source: 'COUNTER',
      })
      const createdOrder = orderResponse?.data?.order || orderResponse?.order || null

      if (hasDailyIronItems) {
        try {
          await ironAPI.createLogsBatch({
            customerId: customer.id,
            date: dailyIronDate,
            notes: notes || undefined,
            items: dailyIronCart.map(item => ({
              serviceId: item.serviceId,
              pieces: item.quantity,
              notes: item.notes || undefined,
            })),
          })
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

  const handleSaveQuotation = async () => {
    if (!customer) { toast.error('Select a customer first'); return }
    if (!cart.length) { toast.error('Add at least one item'); return }
    if (hasDailyIronItems) { toast.error('Daily Iron items are not supported in quotations'); return }
    const hasQuotationAdjustment = manualDiscount > 0 || regularServiceDiscount > 0 || regularCart.some(item => !item.serviceId || hasPriceOverride(item))
    if (hasQuotationAdjustment && commercialReason.trim().length < 3) { toast.error('Enter a reason for quotation price or discount adjustments'); return }

    setSubmitting(true)
    try {
      const payload = {
        customerId: customer.id,
        items: cart.map(i => ({
          serviceId: i.serviceId || undefined,
          serviceName: i.name,
          garmentType: i.category,
          quantity: i.quantity,
          baseUnitPrice: i.baseUnitPrice,
          unitPrice: i.unitPrice,
          lineDiscountType: i.lineDiscountType ? i.lineDiscountType.toUpperCase() : undefined,
          lineDiscountValue: i.lineDiscountValue || 0,
          lineDiscountAmount: i.lineDiscountAmount || 0,
          notes: i.notes || undefined,
        })),
        subtotal: regularSubtotal,
        discount: manualDiscount,
        commercialReason: hasQuotationAdjustment ? commercialReason.trim() : undefined,
        notes,
        validUntil,
        quotationStatus,
        source: 'CRM',
      }

      const response = quotationId
        ? await quotationsAPI.update(quotationId, payload)
        : await quotationsAPI.create(payload)

      const quotation = response?.data?.quotation || response?.quotation || null
      toast.success(quotationId ? 'Quotation updated' : `Quotation ${quotation?.orderNumber || ''} created`.trim())
      clearDraft()
      router.push('/dashboard/quotations')
    } catch (e: any) {
      toast.error(e.message || 'Failed to save quotation')
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
  const canOfferInlineQuickCreate = !customer
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
      commercialReason,
      walletSplit,
      notes,
      dailyIronDate,
      validUntil,
    }
    if (hasDraftContent(draft)) {
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft))
    } else {
      window.localStorage.removeItem(draftStorageKey)
    }
  }, [
    draftReady, customer, customerStats, cart, activeCategory, customerSearch,
    newCustomerName, newCustomerPhone, newCustomerLanguage, newCustomerEnrollIron,
    paymentMethod, paidAmount, discountType, discountValue, couponCode, couponDiscount,
    couponApplied, loyaltyPoints, loyaltyDiscount, loyaltyApplied, writeOff,
    writeOffAmount, commercialReason, walletSplit, notes, dailyIronDate, validUntil, hasDraftContent, draftStorageKey,
  ])

  return (
    <div
      ref={splitContainerRef}
      style={{
        display: 'flex',
        width: '100%',
        height: '100vh',
        minHeight: '100vh',
        overflow: 'hidden',
        fontFamily: "var(--crm-font-ui)",
        background: '#f0f4f8',
      }}
    >

      {/* ── Customer Search Modal ──────────────────────────────────────────── */}
      {dailyIronPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,28,60,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120, backdropFilter: 'blur(4px)', padding: 18 }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 26, width: '100%', maxWidth: 460, boxShadow: '0 28px 70px rgba(0,0,0,0.24)', border: '1px solid #dbe8f2' }}>
            <div style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 900, fontSize: 21, color: '#023c62', marginBottom: 8 }}>{dailyIronPrompt.title}</div>
            <p style={{ fontSize: 14, color: '#52657f', lineHeight: 1.6, margin: '0 0 22px' }}>{dailyIronPrompt.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => closeDailyIronPrompt(false)}
                style={{ padding: '10px 16px', border: '1px solid #dbe8f2', background: '#fff', color: '#52657f', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => closeDailyIronPrompt(true)}
                style={{ padding: '10px 16px', border: 'none', background: '#023c62', color: '#fff', borderRadius: 10, fontWeight: 900, cursor: 'pointer' }}
              >
                {dailyIronPrompt.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCustomerModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,28,60,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 520, boxShadow: '0 32px 80px rgba(0,0,0,0.25)' }}>
            <div style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 800, fontSize: 22, color: '#023c62', marginBottom: 6 }}>{isQuotationMode ? 'New Quotation' : 'New Order'}</div>
            <p style={{ fontSize: 14, color: '#6b7fa3', marginBottom: 24 }}>{isQuotationMode ? 'Search for an existing customer or create a new customer before drafting the quotation' : 'Search for an existing customer or create a new customer without leaving this page'}</p>

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
                disabled={isQuotationMode && !customer}
                style={{ flex: 2, padding: 12, background: '#023c62', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: isQuotationMode && !customer ? 'not-allowed' : 'pointer', opacity: isQuotationMode && !customer ? 0.6 : 1 }}>
                {customer ? `Continue with ${customer.name}` : isQuotationMode ? 'Customer Required for Quotation' : 'Continue without Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LEFT: Catalog ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{ background: '#023c62', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.back()}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
            ← Back
          </button>
          <div style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 800, fontSize: 18, color: '#fff', flex: 1 }}>{isQuotationMode ? (quotationId ? 'Edit Quotation' : 'New Quotation') : 'New Order'}</div>
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
              const next = new Date()
              next.setDate(next.getDate() + 7)
              setValidUntil(next.toISOString().slice(0, 10))
              setQuotationStatus('DRAFT')
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

        {/* Item search */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e8f0f7', padding: '9px 14px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <input
            type="text"
            value={itemSearch}
            onChange={e => setItemSearch(e.target.value)}
            placeholder="Search item across all categories..."
            style={{ width: '100%', border: '1px solid #dce8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#fff' }}
          />
          {itemSearch.trim() ? (
            <button onClick={() => setItemSearch('')}
              style={{ border: '1px solid #dce8f0', background: '#fff', color: '#6b7fa3', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
              Clear
            </button>
          ) : (
            <div style={{ fontSize: 11, color: '#6b7fa3', whiteSpace: 'nowrap' }}>Search all services</div>
          )}
        </div>

        {/* Category tabs */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e8f0f7', padding: '0 14px', display: 'flex', gap: 0, overflowX: 'auto', flexShrink: 0 }}>
          {categories.map(cat => (
            <button key={cat} ref={(node) => { categoryButtonRefs.current[cat] = node }} onClick={() => setActiveCategory(cat)}
              style={{ padding: '10px 13px', border: 'none', borderBottom: `2px solid ${activeCategory === cat ? '#023c62' : 'transparent'}`, background: 'transparent', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: activeCategory === cat ? '#023c62' : '#6b7fa3', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {cat}
            </button>
          ))}
        </div>

        {/* Items grid */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}>
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
                      if (isQuotationMode && item.category === 'DAILY_IRON') return
                      if (!map[item.category]) map[item.category] = []
                      if (item.basePrice > 0 || item.category === 'DAILY_IRON') map[item.category].push(item)
                    })
                    const cats = sortCategories(Object.keys(map))
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
            Object.keys(groupedItems()).length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#6b7fa3', background: '#fff', border: '1px dashed #dce8f0', borderRadius: 10 }}>
                No item found for "{itemSearch.trim()}".
              </div>
            ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 8, alignContent: 'start' }}>
              {Object.entries(groupedItems()).map(([baseName, variants]) => {
                const inCart = cart.filter(i => variants.some(v => v.id === i.serviceId))
                const cartQty = inCart.reduce((s, i) => s + i.quantity, 0)
                const minPrice = Math.min(...variants.map(v => v.basePrice))
                const hasVariants = variants.length > 1
                const isFlashing = catalogFlashKey === baseName

                return (
                  <div key={baseName} onClick={() => handleItemClick(baseName, variants)}
                    style={{
                      background: isFlashing ? '#e8f4ff' : '#fff',
                      border: `1.5px solid ${isFlashing ? '#023c62' : '#e8f0f7'}`,
                      borderRadius: 8,
                      padding: '10px 9px',
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'transform 0.15s ease, background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
                      transform: isFlashing ? 'scale(0.985)' : 'scale(1)',
                      boxShadow: isFlashing ? '0 10px 24px rgba(2,60,98,0.12)' : 'none',
                    }}
                    onMouseEnter={e => { if (!isFlashing) e.currentTarget.style.borderColor = '#023c62' }}
                    onMouseLeave={e => { if (!isFlashing) e.currentTarget.style.borderColor = '#e8f0f7' }}>
                    {cartQty > 0 && (
                      <div style={{ position: 'absolute', top: -8, right: -8, background: '#023c62', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                        {cartQty}
                      </div>
                    )}
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#1a2332', marginBottom: 4, lineHeight: 1.25, minHeight: 30, overflow: 'hidden' }}>{baseName}</div>
                    <div style={{ fontSize: 12, color: '#023c62', fontWeight: 800 }}>
                      {hasVariants ? `from ${fmt(minPrice)}` : fmt(minPrice)}
                    </div>
                    {hasVariants && <div style={{ fontSize: 10, color: '#9dafc8', marginTop: 3 }}>{variants.length} options</div>}
                  </div>
                )
              })}
            </div>
            )
          )}
          {!catalogLoading && categories.length > 0 && (
            <div style={{ position: 'sticky', bottom: 0, marginTop: 12, paddingTop: 10, background: 'linear-gradient(180deg, rgba(240,244,248,0), #f0f4f8 20%)' }}>
              <div style={{ background: '#fff', border: '1px solid #dce8f0', borderRadius: 10, boxShadow: '0 -8px 22px rgba(2,60,98,0.06)', overflow: 'hidden' }}>
                <button onClick={() => setShowCustomItem(v => !v)}
                  style={{ width: '100%', padding: '9px 11px', border: 'none', background: showCustomItem ? '#eef7ff' : '#fff', color: '#023c62', fontSize: 12, fontWeight: 900, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>+ Add custom item in {activeCategory || 'this category'}</span>
                  <span style={{ color: '#6b7fa3', fontSize: 11 }}>{showCustomItem ? 'Close' : 'Open'}</span>
                </button>
                {showCustomItem && (
                  <div style={{ borderTop: '1px solid #e8f0f7', padding: 10, display: 'grid', gridTemplateColumns: '1.2fr 0.9fr 90px 70px auto', gap: 8, alignItems: 'center' }}>
                    <input value={customItemName} onChange={e => setCustomItemName(e.target.value)} placeholder="Custom item name"
                      style={{ border: '1px solid #dce8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', minWidth: 0 }} />
                    <input value={customItemCategory} onChange={e => setCustomItemCategory(e.target.value)} placeholder="Sub category / garment"
                      style={{ border: '1px solid #dce8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', minWidth: 0 }} />
                    <input type="number" min="0" value={customItemRate} onChange={e => setCustomItemRate(e.target.value)} placeholder="Rate"
                      style={{ border: '1px solid #dce8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', minWidth: 0 }} />
                    <input type="number" min="1" value={customItemQty} onChange={e => setCustomItemQty(e.target.value)} placeholder="Qty"
                      style={{ border: '1px solid #dce8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', minWidth: 0 }} />
                    <button onClick={addCustomItemToCart}
                      style={{ background: '#023c62', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Add
                    </button>
                    <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11, color: '#6b7fa3' }}>
                      <span>Catalog: {customItemCatalog || activeCategory || 'Current category'}</span>
                      <span>Order-only line, not added to master pricing.</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize order summary panel"
        onMouseDown={startRightPanelResize}
        onDoubleClick={() => setRightPanelWidthOverride(null)}
        style={{
          width: 12,
          cursor: 'col-resize',
          background: isResizingRightPanel ? 'rgba(2,60,98,0.08)' : 'transparent',
          position: 'relative',
          flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute',
          left: 5,
          top: 0,
          bottom: 0,
          width: 2,
          borderRadius: 999,
          background: isResizingRightPanel ? '#023c62' : '#dce8f0',
        }} />
      </div>

      {/* ── RIGHT: Customer Info + Cart ────────────────────────────────────── */}
      <div style={{ width: effectiveRightPanelWidth, minWidth: rightPanelMinWidth, maxWidth: rightPanelMaxWidth, minHeight: 0, background: '#fff', borderLeft: '1px solid #e8f0f7', boxShadow: '-16px 0 32px rgba(2,60,98,0.06)', display: 'flex', flexDirection: 'column', transition: isResizingRightPanel ? 'none' : 'width 0.18s var(--crm-ease)' }}>

        {/* Customer info panel */}
        {customer ? (
          <div style={{ padding: '12px 14px 10px', background: '#023c62', color: '#fff', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 7 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{customer.name || 'Walk-in'}</div>
                <div style={{ fontSize: 12, opacity: 0.72 }}>{customer.phone}</div>
              </div>
              <button onClick={() => setShowCustomerModal(true)}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '5px 9px', borderRadius: 8, cursor: 'pointer', fontSize: 11 }}>
                Change
              </button>
            </div>
            {customerStats && (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
                {[
                  { label: 'Dues', value: fmt(customerStats.outstanding), warn: customerStats.outstanding > 0 },
                  { label: 'Wallet', value: fmt(customer.walletBalance || 0) },
                  { label: 'Orders', value: customerStats.totalOrders },
                  { label: 'Points', value: customerStats.loyaltyPoints },
                  { label: 'Last', value: customerStats.lastOrderDate ? new Date(customerStats.lastOrderDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 999, padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <div style={{ fontSize: 10, opacity: 0.72 }}>{s.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: s.warn ? '#fbbf24' : '#fff' }}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: 10, background: '#f8fafc', borderBottom: '1px solid #e8f0f7', flexShrink: 0, position: 'relative' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
              <input
                type="text"
                value={customerSearch}
                onChange={e => handleSearchInput(e.target.value)}
                placeholder="Customer name / phone"
                style={{ width: '100%', border: '1.5px solid #dce8f0', borderRadius: 8, padding: '9px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
              <button onClick={() => setShowCustomerModal(true)}
                style={{ padding: '9px 11px', background: '#023c62', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Add New
              </button>
            </div>
            {searchLoading && <div style={{ marginTop: 6, fontSize: 11, color: '#6b7fa3' }}>Searching...</div>}
            {customerResults.length > 0 && (
              <div style={{ marginTop: 6, border: '1px solid #dce8f0', borderRadius: 8, overflow: 'hidden', background: '#fff', maxHeight: 155, overflowY: 'auto' }}>
                {customerResults.map((c: Customer) => (
                  <button key={c.id} onClick={() => selectCustomer(c)}
                    style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 10px', border: 'none', borderBottom: '1px solid #f1f5f9', background: '#fff', cursor: 'pointer' }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#1a2332', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name || 'Unknown'}</span>
                      <span style={{ display: 'block', fontSize: 11, color: '#6b7fa3' }}>{c.phone}</span>
                    </span>
                    {(c.ordersDue || 0) > 0 && <span style={{ fontSize: 11, color: '#991b1b', fontWeight: 800 }}>{fmt(c.ordersDue || 0)}</span>}
                  </button>
                ))}
              </div>
            )}
            {canOfferInlineQuickCreate && (
              <div style={{ marginTop: 8, padding: 9, border: '1px solid #dce8f0', borderRadius: 8, background: '#fff' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#023c62', marginBottom: 7 }}>Create customer</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                  <input value={newCustomerPhone} onChange={e => setNewCustomerPhone(e.target.value)} placeholder="Mobile"
                    style={{ border: '1px solid #dce8f0', borderRadius: 7, padding: '7px 8px', fontSize: 12, outline: 'none', minWidth: 0 }} />
                  <input value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} placeholder="Name"
                    style={{ border: '1px solid #dce8f0', borderRadius: 7, padding: '7px 8px', fontSize: 12, outline: 'none', minWidth: 0 }} />
                </div>
                <button onClick={createCustomerInline} disabled={creatingCustomer}
                  style={{ width: '100%', background: '#023c62', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: creatingCustomer ? 0.65 : 1 }}>
                  {creatingCustomer ? 'Creating...' : 'Create & Select'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Cart items */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 0 16px' }}>
          {cart.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9dafc8', fontSize: 13 }}>
              <div style={{ marginBottom: 8, display:'flex', justifyContent:'center' }}><Shirt size={32} /></div>
              No items added yet<br/>
              <span style={{ fontSize: 11 }}>Click items from the catalog</span>
            </div>
          ) : (
            <>
              {cart.map(item => {
                const isEditing = editingLineId === item.lineId
                const lineGross = getCartLineGross(item)
                const lineNet = getCartLineNet(item)
                const priceEdited = hasPriceOverride(item)
                const lineDiscountActive = item.lineDiscountAmount > 0
                const isDragged = draggedLineId === item.lineId
                const isDragTarget = dragOverLineId === item.lineId && draggedLineId !== item.lineId

                return (
                  <div
                    key={item.lineId}
                    onDragOver={(event) => {
                      if (!draggedLineId) return
                      event.preventDefault()
                      if (dragOverLineId !== item.lineId) setDragOverLineId(item.lineId)
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      if (!draggedLineId) return
                      moveCartLine(draggedLineId, item.lineId)
                      setDraggedLineId(null)
                      setDragOverLineId(null)
                    }}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: isDragTarget ? '#eef7ff' : '#fff',
                      opacity: isDragged ? 0.6 : 1,
                      boxShadow: isDragTarget ? 'inset 0 2px 0 #023c62' : 'none',
                    }}
                  >
                    <div style={{ padding: '9px 12px', display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr) auto', gap: 9, alignItems: 'start' }}>
                      <div
                        draggable
                        onDragStart={() => {
                          setDraggedLineId(item.lineId)
                          setDragOverLineId(item.lineId)
                        }}
                        onDragEnd={() => {
                          setDraggedLineId(null)
                          setDragOverLineId(null)
                        }}
                        title="Drag to reorder"
                        style={{ width: 20, display: 'flex', justifyContent: 'center', paddingTop: 2, cursor: 'grab', color: '#8aa0ba', flexShrink: 0 }}
                      >
                        <GripVertical size={16} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#1a2332', lineHeight: 1.25 }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: '#9dafc8', marginTop: 2 }}>
                          {fmt(item.unitPrice)} each
                          {priceEdited ? ` • master edited from ${fmt(item.baseUnitPrice)}` : ''}
                        </div>
                        {lineDiscountActive && (
                          <div style={{ fontSize: 12, color: '#166534', fontWeight: 600, marginTop: 4 }}>
                            Service discount: {item.lineDiscountType === 'flat' ? `${fmt(item.lineDiscountValue)} per qty` : `${item.lineDiscountValue}%`} • Total -{fmt(item.lineDiscountAmount)}
                          </div>
                        )}
                        {item.notes && (
                          <div style={{ fontSize: 12, color: '#53657d', marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                            {item.notes}
                          </div>
                        )}
                        {item.category === 'DAILY_IRON' && (
                          <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600, marginTop: 4 }}>
                            Monthly-billed Daily Iron item
                          </div>
                        )}
                      </div>
                      <div style={{ minWidth: 82, textAlign: 'right' }}>
                        {lineDiscountActive && (
                          <div style={{ fontSize: 12, color: '#9dafc8', textDecoration: 'line-through' }}>{fmt(lineGross)}</div>
                        )}
                        <div style={{ fontSize: 14, fontWeight: 900, color: '#023c62' }}>{fmt(lineNet)}</div>
                        {item.category !== 'DAILY_IRON' && (
                          <button
                            onClick={() => isEditing ? closeLineEditor() : openLineEditor(item)}
                            style={{ marginTop: '7px', padding: '4px 10px', borderRadius: 999, border: '1px solid #dce8f0', background: '#fff', color: '#023c62', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                          >
                            {isEditing ? 'Close' : 'Adjust'}
                          </button>
                        )}
                      </div>
                      <div style={{ gridColumn: '2 / 4', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button onClick={() => updateQty(item.lineId, -1)}
                            style={{ width: 26, height: 26, borderRadius: 7, background: '#f1f5f9', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 800, color: '#023c62' }}>−</button>
                          <span style={{ fontSize: 14, fontWeight: 800, minWidth: 20, textAlign: 'center' }}>{item.quantity}</span>
                          <button onClick={() => updateQty(item.lineId, 1)}
                            style={{ width: 26, height: 26, borderRadius: 7, background: '#023c62', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 800, color: '#fff' }}>+</button>
                        </div>
                        <button
                          onClick={() => removeLine(item.lineId)}
                          aria-label={`Remove ${item.name}`}
                          title="Remove line"
                          style={{ width: 26, height: 26, borderRadius: 7, background: '#fff5f5', border: '1px solid #fecaca', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#b91c1c' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {isEditing && (
                      <div style={{ margin: '0 14px 12px', padding: 12, borderRadius: 12, background: '#f8fbff', border: '1px solid #dce8f0' }}>
                        <div style={{ fontSize: 11, color: '#6b7fa3', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                          Line Price And Discount
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7fa3', marginBottom: 10 }}>
                          Line price changes here are ad hoc for this order or quotation only. Service-level discounts also stay only on this line and do not modify the master rate card.
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 10 }}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={lineEditorPrice}
                            onChange={(e) => setLineEditorPrice(e.target.value)}
                            placeholder="Unit price"
                            style={{ width: '100%', border: '1px solid #dce8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }}
                          />
                          <div style={{ alignSelf: 'center', fontSize: 11, color: '#6b7fa3', fontWeight: 600 }}>Per item</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                          <button
                            onClick={() => setLineEditorDiscountType('flat')}
                            style={{ padding: '5px 9px', borderRadius: 8, border: '1px solid #dce8f0', background: lineEditorDiscountType === 'flat' ? '#023c62' : '#fff', color: lineEditorDiscountType === 'flat' ? '#fff' : '#374151', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                          >
                            ₹ Per Qty
                          </button>
                          <button
                            onClick={() => setLineEditorDiscountType('percent')}
                            style={{ padding: '5px 9px', borderRadius: 8, border: '1px solid #dce8f0', background: lineEditorDiscountType === 'percent' ? '#023c62' : '#fff', color: lineEditorDiscountType === 'percent' ? '#fff' : '#374151', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                          >
                            % Percent
                          </button>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={lineEditorDiscountValue}
                            onChange={(e) => setLineEditorDiscountValue(e.target.value)}
                            placeholder={lineEditorDiscountType === 'flat' ? 'Discount per qty' : 'Discount percent'}
                            style={{ flex: 1, border: '1px solid #dce8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }}
                          />
                        </div>
                        {lineEditorDiscountValue.trim() && (
                          <div style={{ fontSize: 11, color: '#6b7fa3', marginBottom: 8 }}>
                            {lineEditorDiscountType === 'flat'
                              ? `Discount impact: ${fmt(toMoney(lineEditorDiscountValue))} × ${item.quantity} = ${fmt(getLineDiscountAmount({
                                  unitPrice: toMoney(lineEditorPrice, item.unitPrice),
                                  quantity: item.quantity,
                                  lineDiscountType: 'flat',
                                  lineDiscountValue: toMoney(lineEditorDiscountValue),
                                }))}`
                              : `Discount impact: ${toMoney(lineEditorDiscountValue)}% on ${fmt(roundCurrency(toMoney(lineEditorPrice, item.unitPrice) * item.quantity))}`}
                          </div>
                        )}
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 11, color: '#6b7fa3', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 5 }}>
                            Service Description
                          </div>
                          <textarea
                            value={lineEditorNotes}
                            onChange={(e) => setLineEditorNotes(e.target.value)}
                            placeholder="Add service breakup, scope, condition notes, or any line-specific description"
                            rows={3}
                            style={{ width: '100%', border: '1px solid #dce8f0', borderRadius: 8, padding: '9px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, resize: 'vertical', fontFamily: 'var(--crm-font-ui)' }}
                          />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                          <div style={{ fontSize: 12, color: '#6b7fa3' }}>
                            Line total after service discount: <strong style={{ color: '#023c62' }}>{fmt(getCartLineNet(normalizeCartItem({
                              ...item,
                              unitPrice: toMoney(lineEditorPrice, item.unitPrice),
                              lineDiscountType: lineEditorDiscountValue.trim() ? lineEditorDiscountType : null,
                              lineDiscountValue: lineEditorDiscountValue.trim() ? toMoney(lineEditorDiscountValue) : 0,
                            })))}</strong>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={closeLineEditor}
                              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #dce8f0', background: '#fff', color: '#6b7fa3', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={saveLinePricing}
                              disabled={savingLineId === item.lineId}
                              style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#023c62', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: savingLineId === item.lineId ? 0.65 : 1 }}
                            >
                              {savingLineId === item.lineId ? 'Saving...' : 'Save Line'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {hasRegularItems && (
                <div style={{ margin: '12px 14px 0', padding: '12px 14px', borderRadius: 14, border: '1px solid #e3edf6', background: '#fafbfd' }}>
                  <div style={{ fontSize: 11, color: '#6b7fa3', marginBottom: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                    Billing Controls
                  </div>
                  <div style={{ display: 'flex', gap: 5, marginBottom: 7 }}>
                    <button onClick={() => setDiscountType('flat')}
                      style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid #e2e8f0', background: discountType === 'flat' ? '#023c62' : '#fff', color: discountType === 'flat' ? '#fff' : '#374151', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>₹</button>
                    <button onClick={() => setDiscountType('percent')}
                      style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid #e2e8f0', background: discountType === 'percent' ? '#023c62' : '#fff', color: discountType === 'percent' ? '#fff' : '#374151', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>%</button>
                    <input type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)}
                      placeholder="Bill discount"
                      style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
                    {manualDiscount > 0 && <span style={{ fontSize: 11, color: '#166534', alignSelf: 'center', fontWeight: 600 }}>-{fmt(manualDiscount)}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 5, marginBottom: customer && (customer.loyaltyPoints || 0) > 0 ? 7 : 0 }}>
                    <input type="text" value={couponCode}
                      onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponApplied(false); setCouponDiscount(0) }}
                      placeholder="Coupon code"
                      style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 14, outline: 'none', textTransform: 'uppercase' as const, boxSizing: 'border-box' as const }} />
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

              <div style={{ margin: '12px 14px 0', padding: '12px 14px', borderRadius: 14, border: '1px solid #e3edf6', background: '#fff' }}>
                {isMixedCart && (
                  <div style={{ marginBottom: 10, padding: '10px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, fontSize: 12, color: '#9a3412', lineHeight: 1.45 }}>
                    This submit will create a regular order for dry clean items and Daily Iron logs for ironing items. Counter payment below applies only to the regular-order portion.
                  </div>
                )}

                {!isQuotationMode && (isPureDailyIron || isMixedCart) && (
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

                {isQuotationMode && (
                  <div style={{ marginBottom: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#6b7fa3', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Valid Until</div>
                      <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)}
                        style={{ width: '100%', border: '1px solid #dce8f0', borderRadius: 12, padding: '10px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#6b7fa3', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Quotation Status</div>
                      <select value={quotationStatus} onChange={e => setQuotationStatus(e.target.value)}
                        style={{ width: '100%', border: '1px solid #dce8f0', borderRadius: 12, padding: '10px 12px', fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' }}>
                        {(quotationStatuses.length ? quotationStatuses : [{ value: 'DRAFT', label: 'Draft' }]).map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {hasRegularItems && (manualDiscount > 0 || regularServiceDiscount > 0 || regularCart.some(item => !item.serviceId || hasPriceOverride(item))) && (
                  <textarea value={commercialReason} onChange={e => setCommercialReason(e.target.value)} maxLength={500} rows={2}
                    placeholder="Required reason for custom item, price override, or discount"
                    style={{ width: '100%', border: '1px solid #f59e0b', background: '#fffbeb', borderRadius: 12, padding: '10px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical', marginBottom: 8, fontFamily: 'var(--crm-font-ui)' }} />
                )}

                <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder={isQuotationMode ? 'Quotation notes (optional)...' : isPureDailyIron ? 'Log notes (optional)...' : 'Order notes (optional)...'}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </>
          )}
        </div>

        {/* Total + Confirm */}
        <div style={{ padding: '10px 14px 12px', borderTop: '2px solid #e8f0f7', background: '#f8fafc', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
            <span style={{ color: '#6b7fa3' }}>Items</span>
            <span style={{ color: '#6b7fa3' }}>{totalQty} pcs</span>
          </div>
          {isMixedCart && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                <span style={{ color: '#6b7fa3' }}>Regular Service Value</span>
                <span style={{ color: '#023c62', fontWeight: 600 }}>{fmt(regularBaseSubtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                <span style={{ color: '#15803d' }}>Daily Iron Estimated Value</span>
                <span style={{ color: '#15803d', fontWeight: 600 }}>{fmt(dailyIronEstimatedValue)}</span>
              </div>
            </>
          )}
          {hasRegularItems && regularServiceDiscount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
              <span style={{ color: '#166534' }}>Service-Level Discount</span>
              <span style={{ color: '#166534', fontWeight: 600 }}>-{fmt(regularServiceDiscount)}</span>
            </div>
          )}
          {hasRegularItems && totalDiscount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
              <span style={{ color: '#166534' }}>Bill-Level Discount</span>
              <span style={{ color: '#166534', fontWeight: 600 }}>-{fmt(totalDiscount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 800, fontSize: 18, color: '#023c62' }}>{isPureDailyIron ? 'Estimated Value' : isMixedCart ? 'Payable Now' : 'Total'}</span>
            <span style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 800, fontSize: 22, color: '#023c62' }}>{fmt(total)}</span>
          </div>
          <button onClick={() => {
            if (!cart.length || !customer) return
            if (isQuotationMode) {
              handleSaveQuotation()
              return
            }
            if (isPureDailyIron) {
              handleConfirmDailyIron()
              return
            }
            setShowPayment(true)
          }}
            disabled={!cart.length || !customer || submitting}
            style={{ width: '100%', padding: '14px 16px', background: cart.length && customer ? '#023c62' : '#e2e8f0', color: cart.length && customer ? '#fff' : '#9dafc8', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: cart.length && customer ? 'pointer' : 'not-allowed', fontFamily: "var(--crm-font-ui)", opacity: submitting ? 0.6 : 1 }}>
            {!customer
              ? 'Select Customer First'
              : !cart.length
              ? 'Add Items'
              : isQuotationMode
              ? (submitting ? 'Saving Quotation...' : `Save Quotation — ${fmt(total)}`)
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
                const serviceLines = cart.filter(i => i.serviceId === v.id)
                const totalServiceQty = serviceLines.reduce((sum, entry) => sum + entry.quantity, 0)
                return (
                  <div key={v.id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', border: `1.5px solid ${totalServiceQty ? '#023c62' : '#e2e8f0'}`, borderRadius: 10, background: totalServiceQty ? '#f0f7ff' : '#fff', cursor: 'pointer' }}
                    onClick={() => {
                      triggerCatalogFlash(variantParent)
                      addToCart(v)
                    }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a2332' }}>{v.name}</div>
                      {totalServiceQty > 0 && (
                        <div style={{ fontSize: 11, color: '#6b7fa3', marginTop: 2 }}>
                          {totalServiceQty} total qty already in cart
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#023c62' }}>{fmt(v.basePrice)}</span>
                      <span style={{ fontSize: 11, background: '#023c62', color: '#fff', padding: '4px 10px', borderRadius: 20, fontWeight: 600 }}>
                        {totalServiceQty > 0 ? 'Add Another' : 'Add'}
                      </span>
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
      {!isQuotationMode && showPayment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 32px 80px rgba(0,0,0,0.25)' }}>
            <div style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 800, fontSize: 22, color: '#023c62', marginBottom: 4 }}>Payment</div>
            <p style={{ fontSize: 13, color: '#6b7fa3', marginBottom: 20 }}>Customer: <strong>{customer?.name}</strong></p>

            {/* Order summary */}
            <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                <span style={{ color: '#6b7fa3' }}>Regular Service Value ({regularCart.reduce((s, i) => s + i.quantity, 0)} items)</span>
                <span style={{ fontWeight: 600 }}>{fmt(regularBaseSubtotal)}</span>
              </div>
              {regularServiceDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#166534' }}><span>Service-Level Discount</span><span>-{fmt(regularServiceDiscount)}</span></div>}
              {isMixedCart && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#15803d' }}><span>Daily Iron Estimated Value</span><span>{fmt(dailyIronEstimatedValue)}</span></div>}
              {manualDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#166534' }}><span>Bill Discount</span><span>-{fmt(manualDiscount)}</span></div>}
              {couponDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#166534' }}><span>Coupon ({couponCode})</span><span>-{fmt(couponDiscount)}</span></div>}
              {loyaltyDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#7c3aed' }}><span>Loyalty Points</span><span>-{fmt(loyaltyDiscount)}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: '#6b7fa3' }}><span>Adjusted Subtotal</span><span>{fmt(regularSubtotal)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #e2e8f0', marginTop: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{isMixedCart ? 'Payable Now' : 'Total'}</span>
                <span style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 800, fontSize: 20, color: '#023c62' }}>{fmt(total)}</span>
              </div>
            </div>

            {/* Payment method */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#6b7fa3', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payment Method</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {paymentMethods.map((m) => (
                  <button key={m.value} onClick={() => { setPaymentMethod(m.value as any); if (m.value === 'Pay Later') setPaidAmount('0') }}
                    style={{ padding: '8px 14px', border: `2px solid ${paymentMethod === m.value ? '#023c62' : '#e2e8f0'}`, borderRadius: 8, background: paymentMethod === m.value ? '#023c62' : '#fff', color: paymentMethod === m.value ? '#fff' : '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {m.label}
                  </button>
                ))}
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
                      {writeOff && (
                        <textarea value={commercialReason} onChange={e => setCommercialReason(e.target.value)} maxLength={500} rows={2}
                          placeholder="Required write-off reason"
                          style={{ width: '100%', marginTop: 8, border: '1px solid #f59e0b', background: '#fffbeb', borderRadius: 8, padding: '8px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--crm-font-ui)' }} />
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

function NewOrderPageFallback() {
  return (
    <div style={{ padding: '30px 36px 60px', maxWidth: 1360, margin: '0 auto', fontFamily: "var(--crm-font-ui)" }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, border: '1px solid #e3edf6', color: '#6b7fa3' }}>
        Loading order form...
      </div>
    </div>
  )
}

export default function NewOrderPage() {
  return (
    <Suspense fallback={<NewOrderPageFallback />}>
      <NewOrderPageContent />
    </Suspense>
  )
}
