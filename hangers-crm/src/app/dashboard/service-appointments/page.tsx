'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { CalendarClock, CreditCard, Plus, Search, Trash2, UserPlus, XCircle } from 'lucide-react'
import { customersAPI, ironAPI, metadataAPI, serviceAppointmentsAPI, servicesAPI, staffAPI, statsAPI } from '@/lib/api'
import { isStrictMoneyText, sanitizeDecimalInput, sanitizeIntegerInput } from '@/lib/numeric-input'

type Address = { id: string; label?: string; addressLine1?: string; addressLine2?: string | null; landmark?: string | null; city?: string | null; pincode?: string | null; isDefault?: boolean }
type Customer = { id: string; name?: string; phone: string; ordersDue?: number; loyaltyPoints?: number; addresses?: Address[] }
type ServiceItem = { id: string; name: string; basePrice: number; category: string; catalogName: string }
type LineDiscountType = 'flat' | 'percent'
type Line = {
  lineId: string
  serviceId: string | null
  description: string
  quantity: string
  unitPrice: string
  lineDiscountType: LineDiscountType | null
  lineDiscountValue: string
  lineDiscountAmount: number
  notes: string
  catalogRate?: number | null
}

const asArray = (value: any, keys: string[] = []) => {
  if (Array.isArray(value)) return value
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key]
  return []
}
const fmt = (value: any) => `₹${(Number(value) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const money = (value: any) => {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? Math.max(0, Number(parsed.toFixed(2))) : 0
}
const qty = (value: any) => {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(3)) : 0
}
const lineId = () => `line_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const roundCurrency = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2))
const getLineDiscountAmount = (line: Pick<Line, 'quantity' | 'unitPrice' | 'lineDiscountType' | 'lineDiscountValue'>) => {
  const gross = roundCurrency(qty(line.quantity) * money(line.unitPrice))
  if (gross <= 0 || !line.lineDiscountType) return 0
  if (line.lineDiscountType === 'percent') return roundCurrency((gross * Math.min(100, money(line.lineDiscountValue))) / 100)
  return Math.min(gross, roundCurrency(money(line.lineDiscountValue) * Math.max(1, Number.parseInt(line.quantity || '1', 10) || 1)))
}
const normalizeLine = (line: Line): Line => {
  const lineDiscountAmount = getLineDiscountAmount(line)
  return { ...line, lineDiscountAmount }
}
const lineTotal = (line: Line) => Math.max(0, money(line.quantity) * money(line.unitPrice) - getLineDiscountAmount(line))
const formatAddress = (address?: Address | null) => address
  ? [address.addressLine1, address.addressLine2, address.landmark, address.city, address.pincode].filter(Boolean).join(', ')
  : ''
const appointmentAddressText = (appointment: any) => appointment?.addressSnapshot?.formatted
  || formatAddress(appointment?.serviceAddress)
  || appointment?.address
  || ''

export default function ServiceAppointmentsPage() {
  const [appointments, setAppointments] = useState<any[]>([])
  const [services, setServices] = useState<ServiceItem[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [paymentMethods, setPaymentMethods] = useState<Array<{ value: string; label: string }>>([])
  const [languages, setLanguages] = useState<Array<{ value: string; label: string }>>([])
  const [addressLabels, setAddressLabels] = useState<Array<{ value: string; label: string }>>([])
  const [fieldStatuses, setFieldStatuses] = useState<any[]>([])
  const [workflow, setWorkflow] = useState<any>({})
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [customerStats, setCustomerStats] = useState<any>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showQuickCreate, setShowQuickCreate] = useState(false)
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerLanguage, setNewCustomerLanguage] = useState('ENGLISH')
  const [newCustomerEnrollIron, setNewCustomerEnrollIron] = useState(false)
  const [creatingCustomer, setCreatingCustomer] = useState(false)
  const searchTimeout = useRef<any>(null)

  const [scheduledAt, setScheduledAt] = useState(new Date().toISOString().slice(0, 16))
  const [assignedToId, setAssignedToId] = useState('')
  const [address, setAddress] = useState('')
  const [selectedAddressId, setSelectedAddressId] = useState('')
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [addressMode, setAddressMode] = useState<'add' | 'edit'>('add')
  const [savingAddress, setSavingAddress] = useState(false)
  const [addressForm, setAddressForm] = useState({ label: 'Home', addressLine1: '', addressLine2: '', landmark: '', city: '', pincode: '', setAsDefault: true })
  const [notes, setNotes] = useState('')
  const [cart, setCart] = useState<Line[]>([])
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [lineEditorPrice, setLineEditorPrice] = useState('')
  const [lineEditorDiscountType, setLineEditorDiscountType] = useState<LineDiscountType>('flat')
  const [lineEditorDiscountValue, setLineEditorDiscountValue] = useState('')
  const [lineEditorNotes, setLineEditorNotes] = useState('')
  const [savingLineId, setSavingLineId] = useState('')
  const [customDescription, setCustomDescription] = useState('')
  const [customQty, setCustomQty] = useState('1')
  const [customRate, setCustomRate] = useState('')
  const [paymentForm, setPaymentForm] = useState<Record<string, { amount: string; paymentMethod: string }>>({})

  const sofaServices = useMemo(() => services.filter((item) => item.category === 'SOFA CLEANING'), [services])
  const statusMeta = useMemo<Record<string, any>>(() => fieldStatuses.reduce((acc: Record<string, any>, item: any) => {
    acc[String(item.key)] = item
    return acc
  }, {}), [fieldStatuses])
  const filters = useMemo<string[]>(() => Array.isArray(workflow.filters) ? workflow.filters.map(String) : ['ALL', ...fieldStatuses.map((item) => String(item.key))], [fieldStatuses, workflow])
  const subtotal = cart.reduce((sum, line) => sum + money(line.quantity) * money(line.unitPrice), 0)
  const discount = cart.reduce((sum, line) => sum + getLineDiscountAmount(line), 0)
  const total = cart.reduce((sum, line) => sum + lineTotal(line), 0)
  const defaultPaymentMethod = paymentMethods[0]?.value || 'CASH'
  const customerAddresses = customer?.addresses || []

  const load = async () => {
    setLoading(true)
    try {
      const [a, sv, st, md] = await Promise.all([
        serviceAppointmentsAPI.list(filterStatus === 'ALL' ? undefined : { status: filterStatus }),
        servicesAPI.getCatalog(),
        staffAPI.list(),
        metadataAPI.getAll(),
      ])
      setAppointments(asArray(a.data, ['appointments', 'items']))
      setServices(Array.isArray(sv) ? sv : asArray(sv.data, ['services', 'items', 'catalog']))
      setStaff(asArray(st.data, ['staff', 'items']))
      const meta = md?.data?.metadata || md?.metadata || {}
      setFieldStatuses(Array.isArray(meta.fieldServiceStatuses) ? meta.fieldServiceStatuses : [])
      setWorkflow(meta.fieldServiceWorkflow || {})
      setPaymentMethods((meta.collectablePaymentMethods || meta.paymentMethods || []).map((item: any) => ({ value: item.value, label: item.label || item.value })))
      setLanguages((meta.languages || []).map((item: any) => ({ value: item.value, label: item.label || item.value })))
      setAddressLabels((meta.addressLabels || []).map((item: any) => ({ value: item.value, label: item.label || item.value })))
    } catch (e: any) {
      toast.error(e.message || 'Failed to load sofa cleaning')
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [filterStatus])

  useEffect(() => {
    const digits = customerSearch.replace(/\D/g, '').slice(-10)
    if (digits.length) setNewCustomerPhone(digits)
    if (customerSearch.trim() && !digits.length) setNewCustomerName(customerSearch.trim())
  }, [customerSearch])
  useEffect(() => {
    const digits = customerSearch.replace(/\D/g, '').slice(-10)
    setShowQuickCreate(!customer && !searchLoading && customerResults.length === 0 && (customerSearch.trim().length >= 3 || digits.length === 10))
  }, [customer, customerResults.length, customerSearch, searchLoading])

  const searchCustomers = useCallback(async (q: string) => {
    const digits = q.replace(/\D/g, '').slice(-10)
    if (q.trim().length < 3 && digits.length !== 10) {
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

  const handleCustomerSearch = (value: string) => {
    setCustomerSearch(value)
    clearTimeout(searchTimeout.current)
    const digits = value.replace(/\D/g, '').slice(-10)
    if (digits.length) setNewCustomerPhone(digits)
    if (!digits.length) setNewCustomerName(value.trim())
    if (value.trim().length < 3 && digits.length !== 10) {
      setSearchLoading(false)
      setCustomerResults([])
      return
    }
    setSearchLoading(true)
    searchTimeout.current = setTimeout(() => searchCustomers(value), 250)
  }

  const selectCustomer = async (next: Customer) => {
    setCustomer(next)
    setCustomerSearch('')
    setCustomerResults([])
    try {
      const [detail, stats] = await Promise.all([customersAPI.get(next.id), statsAPI.customer(next.id)])
      setCustomer(detail.data?.customer || detail.data || next)
      const loadedCustomer = detail.data?.customer || detail.data || next
      const defaultAddress = (loadedCustomer.addresses || []).find((item: Address) => item.isDefault) || (loadedCustomer.addresses || [])[0]
      setSelectedAddressId(defaultAddress?.id || '')
      setAddress(formatAddress(defaultAddress))
      setCustomerStats(stats.data)
    } catch {
      setCustomerStats(null)
    }
  }

  const createCustomerInline = async () => {
    const phone = newCustomerPhone.replace(/\D/g, '').slice(-10)
    if (phone.length !== 10) return toast.error('Enter a valid 10-digit phone number')
    setCreatingCustomer(true)
    try {
      const response = await customersAPI.create({ phone, name: newCustomerName.trim() || undefined, preferredLanguage: newCustomerLanguage })
      const created = response.data?.customer || response.data
      if (newCustomerEnrollIron) await ironAPI.createSubscription({ customerId: created.id, applicationStatus: 'ACTIVE' })
      await selectCustomer(created)
      setNewCustomerName('')
      setNewCustomerPhone('')
      setNewCustomerLanguage('ENGLISH')
      setNewCustomerEnrollIron(false)
      toast.success('Customer created')
    } catch (e: any) {
      toast.error(e.message || 'Failed to create customer')
    }
    setCreatingCustomer(false)
  }

  const saveCustomerAddress = async () => {
    if (!customer?.id) return toast.error('Select customer before adding address')
    if (!addressForm.addressLine1.trim()) return toast.error('Address is required')
    setSavingAddress(true)
    try {
      const payload = {
        label: addressForm.label,
        addressLine1: addressForm.addressLine1,
        addressLine2: addressForm.addressLine2 || undefined,
        landmark: addressForm.landmark || undefined,
        city: addressForm.city || undefined,
        pincode: addressForm.pincode || undefined,
        setAsDefault: addressForm.setAsDefault,
      }
      const response = addressMode === 'edit' && selectedAddressId
        ? await customersAPI.updateAddress(customer.id, selectedAddressId, payload)
        : await customersAPI.addAddress(customer.id, payload)
      const saved = response.data?.address || response.data
      const detail = await customersAPI.get(customer.id)
      const updatedCustomer = detail.data?.customer || detail.data || customer
      setCustomer(updatedCustomer)
      setSelectedAddressId(saved.id)
      setAddress(formatAddress(saved))
      setAddressForm({ label: 'Home', addressLine1: '', addressLine2: '', landmark: '', city: '', pincode: '', setAsDefault: true })
      setShowAddressForm(false)
      setAddressMode('add')
      toast.success(addressMode === 'edit' ? 'Address updated' : 'Address saved to customer')
    } catch (e: any) {
      toast.error(e.message || 'Failed to save customer address')
    }
    setSavingAddress(false)
  }
  const resetAddressForm = () => setAddressForm({ label: 'Home', addressLine1: '', addressLine2: '', landmark: '', city: '', pincode: '', setAsDefault: true })
  const openAddAddress = () => {
    setAddressMode('add')
    resetAddressForm()
    setShowAddressForm(true)
  }
  const openEditAddress = () => {
    if (!selectedAddressId && !address) return toast.error('Select an address first')
    const selected = customerAddresses.find((item) => item.id === selectedAddressId)
    setAddressMode('edit')
    setAddressForm({
      label: selected?.label || 'Home',
      addressLine1: selected?.addressLine1 || address || '',
      addressLine2: selected?.addressLine2 || '',
      landmark: selected?.landmark || '',
      city: selected?.city || '',
      pincode: selected?.pincode || '',
      setAsDefault: selected?.isDefault ?? true,
    })
    setShowAddressForm(true)
  }

  const addServiceLine = (service: ServiceItem) => {
    setCart((prev) => [...prev, {
      lineId: lineId(),
      serviceId: service.id,
      description: service.name,
      quantity: '1',
      unitPrice: String(service.basePrice || 0),
      lineDiscountType: null,
      lineDiscountValue: '',
      lineDiscountAmount: 0,
      notes: '',
      catalogRate: service.basePrice,
    }])
  }
  const updateLine = (id: string, patch: Partial<Line>) => setCart((prev) => prev.map((line) => line.lineId === id ? normalizeLine({ ...line, ...patch }) : line))
  const adjustLineQty = (id: string, delta: number) => setCart((prev) => prev.map((line) => {
    if (line.lineId !== id) return line
    const nextQty = Math.max(1, (Number.parseInt(line.quantity || '1', 10) || 1) + delta)
    return normalizeLine({ ...line, quantity: String(nextQty) })
  }))
  const closeLineEditor = useCallback(() => {
    setEditingLineId(null)
    setLineEditorPrice('')
    setLineEditorDiscountType('flat')
    setLineEditorDiscountValue('')
    setLineEditorNotes('')
  }, [])
  const openLineEditor = useCallback((line: Line) => {
    setEditingLineId(line.lineId)
    setLineEditorPrice(String(line.unitPrice || '0'))
    setLineEditorDiscountType(line.lineDiscountType || 'flat')
    setLineEditorDiscountValue(line.lineDiscountType ? String(line.lineDiscountValue || '') : '')
    setLineEditorNotes(line.notes || '')
  }, [])
  const saveLinePricing = useCallback(() => {
    const currentLine = cart.find((entry) => entry.lineId === editingLineId)
    if (!currentLine) return
    if (!lineEditorPrice.trim() || !isStrictMoneyText(lineEditorPrice)) return toast.error('Enter a valid service price')
    const nextDiscountType = lineEditorDiscountValue.trim() ? lineEditorDiscountType : null
    if (nextDiscountType && !isStrictMoneyText(lineEditorDiscountValue)) return toast.error('Enter a valid line discount')
    const nextPrice = money(lineEditorPrice)
    const nextDiscountValue = nextDiscountType ? String(money(lineEditorDiscountValue)) : ''
    const nextNotes = lineEditorNotes.trim()
    const priceChanged = currentLine.catalogRate !== null && currentLine.catalogRate !== undefined && Math.abs(nextPrice - Number(currentLine.catalogRate || 0)) > 0.009
    const discounted = nextDiscountType && money(nextDiscountValue) > 0
    if ((priceChanged || discounted || !currentLine.serviceId) && nextNotes.length < 3) {
      toast.error('Add a short reason or scope note for this price adjustment')
      return
    }
    setSavingLineId(currentLine.lineId)
    setCart((prev) => prev.map((entry) => entry.lineId === currentLine.lineId
      ? normalizeLine({
        ...entry,
        unitPrice: String(nextPrice),
        lineDiscountType: nextDiscountType,
        lineDiscountValue: nextDiscountValue,
        notes: nextNotes,
      })
      : entry))
    setSavingLineId('')
    closeLineEditor()
    toast.success('Line price and discount updated for this appointment only')
  }, [cart, closeLineEditor, editingLineId, lineEditorDiscountType, lineEditorDiscountValue, lineEditorNotes, lineEditorPrice])
  const addCustomLine = () => {
    if (!customDescription.trim()) return toast.error('Enter custom item name')
    if (!(qty(customQty) > 0)) return toast.error('Enter valid custom quantity')
    if (!(money(customRate) > 0)) return toast.error('Enter valid custom rate')
    setCart((prev) => [...prev, {
      lineId: lineId(),
      serviceId: null,
      description: customDescription.trim(),
      quantity: customQty,
      unitPrice: customRate,
      lineDiscountType: null,
      lineDiscountValue: '',
      lineDiscountAmount: 0,
      notes: '',
      catalogRate: null,
    }])
    setCustomDescription('')
    setCustomQty('1')
    setCustomRate('')
  }

  const createAppointment = async () => {
    if (!customer?.id) return toast.error('Select customer first')
    if (!scheduledAt) return toast.error('Schedule date and time is required')
    if (!selectedAddressId) return toast.error('Select or save a customer address before scheduling')
    if (!cart.length) return toast.error('Add at least one sofa cleaning item')
    const items = cart.map((line) => ({
      serviceId: line.serviceId || undefined,
      description: line.description,
      quantity: qty(line.quantity),
      unitPrice: money(line.unitPrice),
      lineDiscountType: line.lineDiscountType ? line.lineDiscountType.toUpperCase() : undefined,
      lineDiscountValue: line.lineDiscountType ? money(line.lineDiscountValue) : 0,
      discountAmount: getLineDiscountAmount(line),
      notes: line.notes || undefined,
    }))
    if (items.some((item) => !item.description || !(item.quantity > 0))) return toast.error('Check item quantity and description')
    setBusy('create')
    try {
      await serviceAppointmentsAPI.create({
        customerId: customer.id,
        scheduledAt: new Date(scheduledAt).toISOString(),
        assignedToId: assignedToId || undefined,
        addressId: selectedAddressId,
        notes: notes || undefined,
        items,
      })
      toast.success('Sofa cleaning scheduled')
      setCustomer(null)
      setCustomerStats(null)
      setCustomerSearch('')
      setCustomerResults([])
      setCart([])
      setAddress('')
      setSelectedAddressId('')
      resetAddressForm()
      setShowAddressForm(false)
      setAddressMode('add')
      setNotes('')
      setAssignedToId('')
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Failed to schedule sofa cleaning')
    }
    setBusy(null)
  }

  const setStatus = async (appointment: any, status: string, options: { assignedToId?: string } = {}) => {
    const reason = status === 'CANCELLED' ? window.prompt('Cancel reason')?.trim() : undefined
    if (status === 'CANCELLED' && (!reason || reason.length < 3)) return toast.error('Cancel reason is required')
    setBusy(`${appointment.id}-${status}`)
    try {
      await serviceAppointmentsAPI.setStatus(appointment.id, { status, notes: reason, assignedToId: options.assignedToId })
      await load()
      toast.success('Appointment updated')
    } catch (e: any) {
      toast.error(e.message || 'Failed to update appointment')
    }
    setBusy(null)
  }
  const generateInvoice = async (appointment: any) => {
    setBusy(`${appointment.id}-invoice`)
    try {
      await serviceAppointmentsAPI.invoice(appointment.id)
      await load()
      toast.success('Invoice generated')
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate invoice')
    }
    setBusy(null)
  }
  const pay = async (appointment: any) => {
    const current = paymentForm[appointment.id]
    const amount = money(current?.amount)
    if (!(amount > 0)) return toast.error('Enter payment amount')
    setBusy(`${appointment.id}-pay`)
    try {
      await serviceAppointmentsAPI.pay(appointment.id, { amount, paymentMethod: current?.paymentMethod || defaultPaymentMethod })
      setPaymentForm((prev) => ({ ...prev, [appointment.id]: { amount: '', paymentMethod: current?.paymentMethod || defaultPaymentMethod } }))
      await load()
      toast.success('Payment recorded')
    } catch (e: any) {
      toast.error(e.message || 'Failed to record payment')
    }
    setBusy(null)
  }
  const writeOff = async (appointment: any, balance: number) => {
    const reason = window.prompt(`Reason to write off ${fmt(balance)}`)?.trim()
    if (!reason || reason.length < 3) return toast.error('Write-off reason is required')
    setBusy(`${appointment.id}-writeoff`)
    try {
      await serviceAppointmentsAPI.pay(appointment.id, { writeOffAmount: balance, writeOffReason: reason })
      await load()
      toast.success('Balance written off')
    } catch (e: any) {
      toast.error(e.message || 'Failed to write off balance')
    }
    setBusy(null)
  }
  const voidPayment = async (appointment: any, paymentId: string) => {
    const reason = window.prompt('Reason for voiding this payment entry')?.trim()
    if (!reason || reason.length < 3) return toast.error('Correction reason is required')
    setBusy(`${paymentId}-void`)
    try {
      await serviceAppointmentsAPI.reversePayment(appointment.id, paymentId, { reason })
      await load()
      toast.success('Payment entry voided')
    } catch (e: any) {
      toast.error(e.message || 'Failed to void payment entry')
    }
    setBusy(null)
  }

  return (
    <div style={page}>
      <div style={topBand}>
        <div>
          <h1 style={title}>Sofa Cleaning</h1>
          <div style={subtitle}>Appointment, line-item pricing, invoice, and payment in one workflow.</div>
        </div>
        <button onClick={load} style={ghostBtn}>Refresh</button>
      </div>

      <div style={workGrid}>
        <section style={panel}>
          <div style={sectionHead}><CalendarClock size={18} /> Schedule</div>
          <div style={compactGrid}>
            <div style={{ position: 'relative' }}>
              <label style={label}>Customer</label>
              {customer ? (
                <div style={selectedCustomer}>
                  <div style={customerIdentity}>
                    <b style={customerNameText}>{customer.name || 'Customer'}</b>
                    <span style={customerPhoneText}>+91 {customer.phone}</span>
                  </div>
                  <button onClick={() => { setCustomer(null); setCustomerStats(null) }} style={tinyBtn}>Change</button>
                </div>
              ) : (
                <>
                  <Search size={15} style={searchIcon} />
                  <input value={customerSearch} onChange={(e) => handleCustomerSearch(e.target.value)} placeholder="Search name or phone" style={{ ...input, paddingLeft: 34 }} />
                  {searchLoading && <small style={searching}>Searching...</small>}
                  {customerResults.length > 0 && (
                    <div style={results}>
                      {customerResults.map((item) => (
                        <button key={item.id} onClick={() => selectCustomer(item)} style={resultBtn}>
                          <span style={resultIdentity}>
                            <b style={resultName}>{item.name || 'Unknown'}</b>
                            <small style={resultPhone}>+91 {item.phone}</small>
                          </span>
                          {Number(item.ordersDue || 0) > 0 && <em style={resultDue}>{fmt(item.ordersDue)} due</em>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div>
              <label style={label}>Visit Time</label>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} style={input} />
            </div>
            <div>
              <label style={label}>Assign</label>
              <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} style={input}>
                <option value="">Assign later</option>
                {staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
            </div>
          </div>

          {showQuickCreate && !customer && (
            <div style={quickCreate}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 900, color: '#023c62' }}><UserPlus size={16} /> Create customer</div>
              <div style={quickGrid}>
                <input value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} placeholder="Mobile" style={input} />
                <input value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} placeholder="Name" style={input} />
                <select value={newCustomerLanguage} onChange={(e) => setNewCustomerLanguage(e.target.value)} style={input}>
                  {(languages.length ? languages : [{ value: 'ENGLISH', label: 'English' }]).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <button onClick={createCustomerInline} disabled={creatingCustomer} style={primaryBtn}>{creatingCustomer ? 'Creating...' : 'Create'}</button>
              </div>
              <label style={checkLine}><span>Enroll in Daily Iron</span><input type="checkbox" checked={newCustomerEnrollIron} onChange={(e) => setNewCustomerEnrollIron(e.target.checked)} /></label>
            </div>
          )}

          <div style={customerStats ? statsBar : { display: 'none' }}>
            <Info label="Orders" value={customerStats?.totalOrders || 0} />
            <Info label="Outstanding" value={fmt(customerStats?.outstanding || customer?.ordersDue || 0)} />
            <Info label="Loyalty" value={customerStats?.loyaltyPoints || customer?.loyaltyPoints || 0} />
          </div>

          <div style={lineCatalog}>
            <div style={sectionHead}>Add from Pricing</div>
            <div style={serviceChips}>
              {sofaServices.map((service) => (
                <button key={service.id} onClick={() => addServiceLine(service)} style={chip}>
                  <span>{service.name}</span><b>{fmt(service.basePrice)}</b>
                </button>
              ))}
            </div>
          </div>

            <div style={cartBox}>
              <div style={cartHeader}>
              <span>Item</span><span style={centerHead}>Qty</span><span style={rightHead}>Total</span><span style={centerHead}>Actions</span>
              </div>
            {cart.map((line) => {
              const isEditing = editingLineId === line.lineId
              const gross = roundCurrency(qty(line.quantity) * money(line.unitPrice))
              const lineDiscount = getLineDiscountAmount(line)
              const priceEdited = line.catalogRate !== null && line.catalogRate !== undefined && Math.abs(Number(line.unitPrice || 0) - Number(line.catalogRate || 0)) > 0.009
              return (
                <div key={line.lineId} style={{ borderTop: '1px solid #eef4f8' }}>
                  <div style={cartRow}>
                    <div>
                      <div style={lockedLineName}>{line.description}</div>
                      <div style={lineMeta}>
                        {line.serviceId ? 'Pricing item' : 'Ad-hoc item'} •
                        {fmt(line.unitPrice)} each
                        {priceEdited ? ` • catalog ${fmt(line.catalogRate)} overridden` : ''}
                      </div>
                      {lineDiscount > 0 && (
                        <div style={discountText}>
                          Service discount: {line.lineDiscountType === 'flat' ? `${fmt(line.lineDiscountValue)} per qty` : `${line.lineDiscountValue}%`} • Total -{fmt(lineDiscount)}
                        </div>
                      )}
                      {line.notes && <div style={noteText}>{line.notes}</div>}
                    </div>
                    <div style={qtyControl}>
                      <button onClick={() => adjustLineQty(line.lineId, -1)} style={qtyBtn}>−</button>
                      <input inputMode="numeric" value={line.quantity} onChange={(e) => updateLine(line.lineId, { quantity: sanitizeIntegerInput(e.target.value) })} style={qtyInput} />
                      <button onClick={() => adjustLineQty(line.lineId, 1)} style={{ ...qtyBtn, background: '#023c62', color: '#fff' }}>+</button>
                    </div>
                    <div style={lineTotalCell}>
                      <div style={amountStack}>
                        {lineDiscount > 0 && <div style={strikeAmount}>{fmt(gross)}</div>}
                        <b style={lineAmount}>{fmt(lineTotal(line))}</b>
                      </div>
                    </div>
                    <div style={lineActionsCell}>
                      <button onClick={() => isEditing ? closeLineEditor() : openLineEditor(line)} style={adjustBtn}>{isEditing ? 'Close' : 'Adjust'}</button>
                      <button onClick={() => setCart((prev) => prev.filter((item) => item.lineId !== line.lineId))} style={iconBtn}><Trash2 size={15} /></button>
                    </div>
                  </div>
                  {isEditing && (
                    <div style={lineEditor}>
                      <div style={editorTitle}>Line Price And Discount</div>
                      <div style={editorHelp}>Changes here stay only on this appointment. Master pricing is not changed.</div>
                      <div style={editorGrid}>
                        <input inputMode="decimal" value={lineEditorPrice} onChange={(e) => setLineEditorPrice(sanitizeDecimalInput(e.target.value))} placeholder="Unit price" style={input} />
                        <span style={editorUnit}>Per item</span>
                      </div>
                      <div style={discountEditor}>
                        <button onClick={() => setLineEditorDiscountType('flat')} style={{ ...toggleBtn, ...(lineEditorDiscountType === 'flat' ? activeToggleBtn : {}) }}>₹ Per Qty</button>
                        <button onClick={() => setLineEditorDiscountType('percent')} style={{ ...toggleBtn, ...(lineEditorDiscountType === 'percent' ? activeToggleBtn : {}) }}>% Percent</button>
                        <input inputMode="decimal" value={lineEditorDiscountValue} onChange={(e) => setLineEditorDiscountValue(sanitizeDecimalInput(e.target.value))} placeholder={lineEditorDiscountType === 'flat' ? 'Discount per qty' : 'Discount percent'} style={{ ...input, minWidth: 0 }} />
                      </div>
                      {lineEditorDiscountValue.trim() && (
                        <div style={editorHelp}>
                          {lineEditorDiscountType === 'flat'
                            ? `Discount impact: ${fmt(money(lineEditorDiscountValue))} × ${line.quantity} = ${fmt(getLineDiscountAmount({ ...line, unitPrice: lineEditorPrice, lineDiscountType: 'flat', lineDiscountValue: lineEditorDiscountValue }))}`
                            : `Discount impact: ${money(lineEditorDiscountValue)}% on ${fmt(roundCurrency(money(lineEditorPrice) * qty(line.quantity)))}`
                          }
                        </div>
                      )}
                      <textarea value={lineEditorNotes} onChange={(e) => setLineEditorNotes(e.target.value)} placeholder="Reason, scope, condition notes, or line-specific description" rows={3} style={{ ...input, resize: 'vertical', fontFamily: 'var(--crm-font-ui)' }} />
                      <div style={editorFooter}>
                        <span>Line total after service discount: <b>{fmt(lineTotal({ ...line, unitPrice: lineEditorPrice, lineDiscountType: lineEditorDiscountValue.trim() ? lineEditorDiscountType : null, lineDiscountValue: lineEditorDiscountValue }))}</b></span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={closeLineEditor} style={ghostBtn}>Cancel</button>
                          <button onClick={saveLinePricing} disabled={savingLineId === line.lineId} style={primaryBtn}>{savingLineId === line.lineId ? 'Saving...' : 'Save Line'}</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            <div style={customRow}>
              <input value={customDescription} onChange={(e) => setCustomDescription(e.target.value)} placeholder="Ad-hoc item, e.g. extra chair" style={input} />
              <div style={qtyControl}>
                <button onClick={() => setCustomQty((value) => String(Math.max(1, (Number.parseInt(value || '1', 10) || 1) - 1)))} style={qtyBtn}>−</button>
                <input inputMode="numeric" value={customQty} onChange={(e) => setCustomQty(sanitizeIntegerInput(e.target.value))} placeholder="Qty" style={qtyInput} />
                <button onClick={() => setCustomQty((value) => String((Number.parseInt(value || '1', 10) || 1) + 1))} style={{ ...qtyBtn, background: '#023c62', color: '#fff' }}>+</button>
              </div>
              <input inputMode="decimal" value={customRate} onChange={(e) => setCustomRate(sanitizeDecimalInput(e.target.value))} placeholder="Rate" style={input} />
              <button onClick={addCustomLine} style={ghostBtn}><Plus size={14} /> Add ad-hoc</button>
            </div>
          </div>
        </section>

        <aside style={summaryPanel}>
          <div style={sectionHead}>Summary</div>
          <Total label="Subtotal" value={fmt(subtotal)} />
          <Total label="Discount" value={fmt(discount)} />
          <Total label="Total" value={fmt(total)} strong />
          <div style={{ marginTop: 12 }}>
            <label style={label}>Address</label>
            {customer ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {customerAddresses.length > 0 && (
                  <select value={selectedAddressId} onChange={(e) => {
                    const nextAddress = customerAddresses.find((item) => item.id === e.target.value)
                    setSelectedAddressId(e.target.value)
                    setAddress(formatAddress(nextAddress))
                    setShowAddressForm(false)
                    setAddressMode('add')
                  }} style={input}>
                    <option value="">Select saved address</option>
                    {customerAddresses.map((item) => <option key={item.id} value={item.id}>{item.label || 'Address'} · {formatAddress(item)}</option>)}
                  </select>
                )}
                <div style={selectedAddressCard}>
                  <div style={addressCardTop}>
                    <b>{customerAddresses.find((item) => item.id === selectedAddressId)?.label || 'Service Address'}</b>
                    {customerAddresses.find((item) => item.id === selectedAddressId)?.isDefault && <span style={defaultBadge}>Default</span>}
                  </div>
                  <div style={addressText}>{address || 'No address selected. Choose a saved address or add a new one.'}</div>
                </div>
                <div style={addressActions}>
                  <button onClick={openEditAddress} disabled={!address} style={ghostBtn}>Edit Selected</button>
                  <button onClick={openAddAddress} style={ghostBtn}>Add New Address</button>
                </div>
                {showAddressForm && (
                  <div style={addressBox}>
                    <div style={formTitle}>{addressMode === 'edit' ? 'Edit Selected Address' : 'Add New Address'}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '0.7fr 1fr', gap: 8 }}>
                      <select value={addressForm.label} onChange={(e) => setAddressForm({ ...addressForm, label: e.target.value })} style={input}>
                        {(addressLabels.length ? addressLabels : [{ value: addressForm.label, label: addressForm.label }]).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                      <input value={addressForm.addressLine1} onChange={(e) => setAddressForm({ ...addressForm, addressLine1: e.target.value })} placeholder="Address line 1" style={input} />
                    </div>
                    <input value={addressForm.addressLine2} onChange={(e) => setAddressForm({ ...addressForm, addressLine2: e.target.value })} placeholder="Address line 2" style={input} />
                    <input value={addressForm.landmark} onChange={(e) => setAddressForm({ ...addressForm, landmark: e.target.value })} placeholder="Landmark" style={input} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr', gap: 8 }}>
                      <input value={addressForm.city} onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })} placeholder="City" style={input} />
                      <input value={addressForm.pincode} onChange={(e) => setAddressForm({ ...addressForm, pincode: e.target.value })} placeholder="Pincode" style={input} />
                    </div>
                    <label style={checkLine}><span>Make default address</span><input type="checkbox" checked={addressForm.setAsDefault} onChange={(e) => setAddressForm({ ...addressForm, setAsDefault: e.target.checked })} /></label>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => { setShowAddressForm(false); resetAddressForm(); setAddressMode('add') }} style={ghostBtn}>Cancel</button>
                      <button onClick={saveCustomerAddress} disabled={savingAddress} style={primaryBtn}>{savingAddress ? 'Saving...' : addressMode === 'edit' ? 'Save And Close' : 'Save New Address'}</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={emptyAddress}>Select customer to use or save address.</div>
            )}
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={label}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Fabric, room, access notes" style={{ ...input, minHeight: 74, resize: 'vertical' }} />
          </div>
          <button onClick={createAppointment} disabled={busy === 'create'} style={submitBtn}>{busy === 'create' ? 'Scheduling...' : 'Schedule Sofa Cleaning'}</button>
        </aside>
      </div>

      <section style={panel}>
        <div style={appointmentTop}>
          <div style={sectionHead}>Appointments</div>
          <div style={tabs}>
            {filters.map((status) => <button key={status} onClick={() => setFilterStatus(status)} style={{ ...tab, ...(filterStatus === status ? activeTab : {}) }}>{status === 'ALL' ? 'All' : statusMeta[status]?.label || status}</button>)}
          </div>
        </div>
        {loading ? <div style={empty}>Loading...</div> : appointments.length === 0 ? <div style={empty}>No sofa appointments.</div> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {appointments.map((appointment) => <AppointmentRow
              key={appointment.id}
              appointment={appointment}
              statusMeta={statusMeta}
              workflow={workflow}
              staff={staff}
              busy={busy}
              setStatus={setStatus}
              generateInvoice={generateInvoice}
              paymentMethods={paymentMethods}
              defaultPaymentMethod={defaultPaymentMethod}
              paymentForm={paymentForm}
              setPaymentForm={setPaymentForm}
              pay={pay}
              writeOff={writeOff}
              voidPayment={voidPayment}
            />)}
          </div>
        )}
      </section>
    </div>
  )
}

function AppointmentRow({ appointment, statusMeta, workflow, staff, busy, setStatus, generateInvoice, paymentMethods, defaultPaymentMethod, paymentForm, setPaymentForm, pay, writeOff, voidPayment }: any) {
  const [assigneeId, setAssigneeId] = useState(appointment.assignedToId || appointment.assignedTo?.id || '')
  const meta = statusMeta[appointment.status] || { label: appointment.status, bg: '#f1f5f9', color: '#334155' }
  const invoice = appointment.invoice
  const serviceAddress = appointmentAddressText(appointment)
  const balance = invoice ? Number(invoice.balanceDue || 0) : Number(appointment.totalAmount || 0)
  const actions = Array.isArray(workflow?.actions?.[appointment.status]) ? workflow.actions[appointment.status] : []
  const payments = (invoice?.allocations || []).filter((a: any) => a.payment).map((a: any) => ({ ...a.payment, allocationStatus: a.status }))
  return (
    <div style={appointmentCard}>
      <div style={appointmentGrid}>
        <div><b style={apptNo}>{appointment.appointmentNumber}</b><span style={{ ...pill, color: meta.color, background: meta.bg }}>{meta.label}</span></div>
        <div>
          <b>{appointment.customer?.name || appointment.customer?.phone}</b>
          <div style={muted}>{appointment.customer?.phone} · {format(new Date(appointment.scheduledAt), 'dd MMM, h:mm a')}</div>
          {serviceAddress && <div style={appointmentAddress}>{serviceAddress}</div>}
          <div style={lineSummary}>{(appointment.lines || []).map((line: any) => `${Number(line.quantity)} x ${line.description}`).join(', ') || appointment.serviceName}</div>
        </div>
        <div><b style={amount}>{fmt(appointment.totalAmount)}</b><div style={muted}>{invoice?.invoiceNumber || 'No invoice'}</div><div style={{ ...muted, color: balance > 0 ? '#9a3412' : '#166534', fontWeight: 900 }}>Balance {fmt(balance)}</div></div>
        <div style={actionsBox}>
          {actions.map((action: any) => {
            const style = action.tone === 'danger' ? dangerBtn : action.tone === 'primary' ? primaryBtn : ghostBtn
            if (action.action === 'ASSIGNED') {
              return (
                <div key={action.action} style={assignActionBox}>
                  <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} style={compactSelect}>
                    <option value="">Choose staff</option>
                    {staff.map((member: any) => <option key={member.id} value={member.id}>{member.name}</option>)}
                  </select>
                  <button disabled={busy === `${appointment.id}-${action.action}` || !assigneeId} onClick={() => setStatus(appointment, action.action, { assignedToId: assigneeId })} style={style}>{action.label || 'Assign Staff'}</button>
                </div>
              )
            }
            return <button key={action.action} disabled={busy === `${appointment.id}-${action.action}`} onClick={() => action.action === 'INVOICE' ? generateInvoice(appointment) : setStatus(appointment, action.action)} style={style}>{action.label}</button>
          })}
        </div>
      </div>
      {invoice && balance > 0.005 && (
        <div style={payRow}>
          <input inputMode="decimal" value={paymentForm[appointment.id]?.amount || ''} onChange={(e) => setPaymentForm({ ...paymentForm, [appointment.id]: { amount: sanitizeDecimalInput(e.target.value), paymentMethod: paymentForm[appointment.id]?.paymentMethod || defaultPaymentMethod } })} placeholder={`Collect ${fmt(balance)}`} style={input} />
          <select value={paymentForm[appointment.id]?.paymentMethod || defaultPaymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, [appointment.id]: { amount: paymentForm[appointment.id]?.amount || '', paymentMethod: e.target.value } })} style={input}>
            {paymentMethods.map((method: any) => <option key={method.value} value={method.value}>{method.label}</option>)}
          </select>
          <button onClick={() => pay(appointment)} style={primaryBtn}><CreditCard size={14} /> Record Pay</button>
          <button onClick={() => writeOff(appointment, balance)} style={ghostBtn}>Write Off</button>
        </div>
      )}
      {payments.length > 0 && <div style={{ display: 'grid', gap: 5 }}>{payments.map((payment: any) => {
        const isVoided = ['VOIDED', 'REVERSED'].includes(String(payment.status || '').toUpperCase()) || String(payment.allocationStatus || '').toUpperCase() === 'REVERSED'
        return <div key={payment.id} style={paymentLine}><span>{fmt(payment.amount)} · {payment.method} · {payment.status}</span>{!isVoided && <button onClick={() => voidPayment(appointment, payment.id)} style={tinyDanger}><XCircle size={13} /> Void</button>}</div>
      })}</div>}
    </div>
  )
}

function Info({ label, value }: { label: string; value: any }) { return <div style={info}><span>{label}</span><b>{value}</b></div> }
function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) { return <div style={totalRow}><span>{label}</span><b style={strong ? { fontSize: 22, color: '#023c62' } : undefined}>{value}</b></div> }

const page = { display: 'grid', gap: 16, padding: '8px 10px 28px', fontFamily: 'var(--crm-font-ui)' }
const topBand = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', border: '1px solid #dfeaf3', borderRadius: 10, padding: '16px 18px' }
const title = { margin: 0, color: '#023c62', fontSize: 24, fontWeight: 900 }
const subtitle = { color: '#6b7fa3', fontSize: 13, marginTop: 3 }
const workGrid = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 14, alignItems: 'start' }
const panel = { background: '#fff', border: '1px solid #dfeaf3', borderRadius: 10, padding: 14 }
const summaryPanel = { ...panel, position: 'sticky' as const, top: 84 }
const sectionHead = { display: 'flex', alignItems: 'center', gap: 8, color: '#023c62', fontWeight: 900, fontSize: 15, marginBottom: 10 }
const compactGrid = { display: 'grid', gridTemplateColumns: '1.25fr 0.85fr 0.75fr', gap: 10, alignItems: 'end' }
const label = { display: 'block', color: '#6b7fa3', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 5 }
const input = { width: '100%', boxSizing: 'border-box' as const, border: '1px solid #d8e5ef', borderRadius: 8, padding: '9px 10px', fontSize: 13, color: '#142033', background: '#fff', outline: 'none' }
const searchIcon = { position: 'absolute' as const, left: 11, bottom: 11, color: '#8ba0bb' }
const searching = { position: 'absolute' as const, right: 10, bottom: 11, color: '#8ba0bb' }
const results = { position: 'absolute' as const, zIndex: 50, left: 0, right: 0, top: 66, background: '#fff', border: '1px solid #dce8f0', borderRadius: 8, overflow: 'hidden', boxShadow: '0 18px 42px rgba(2,28,60,0.16)' }
const resultBtn = { width: '100%', border: 0, background: '#fff', padding: '11px 12px', textAlign: 'left' as const, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderBottom: '1px solid #eef4f8' }
const resultIdentity = { display: 'grid', gap: 4, minWidth: 0 }
const resultName = { color: '#142033', fontSize: 13, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }
const resultPhone = { color: '#6b7fa3', fontSize: 12, fontWeight: 800, lineHeight: 1.1 }
const resultDue = { color: '#9a3412', background: '#fff7ed', borderRadius: 999, padding: '4px 7px', fontSize: 11, fontStyle: 'normal', fontWeight: 900, whiteSpace: 'nowrap' as const }
const selectedCustomer = { border: '1px solid #d8e5ef', borderRadius: 10, padding: '11px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#f8fbff', minHeight: 58 }
const customerIdentity = { display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-start', gap: 7, minWidth: 0, lineHeight: 1.2 }
const customerNameText = { color: '#142033', fontSize: 15, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: '100%' }
const customerPhoneText = { display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: '#eef7ff', color: '#49627f', fontSize: 12, fontWeight: 900, padding: '4px 8px', letterSpacing: '0.01em' }
const quickCreate = { marginTop: 10, border: '1px solid #cde7d6', background: '#f6fff9', borderRadius: 8, padding: 12 }
const addressBox = { display: 'grid', gap: 8, border: '1px solid #d8e5ef', borderRadius: 8, padding: 10, background: '#f8fbff' }
const emptyAddress = { border: '1px dashed #d8e5ef', borderRadius: 8, padding: 12, color: '#8ba0bb', fontSize: 12, textAlign: 'center' as const, background: '#fbfdff' }
const selectedAddressCard = { border: '1px solid #d8e5ef', borderRadius: 10, padding: 11, background: '#fbfdff', display: 'grid', gap: 6 }
const addressCardTop = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, color: '#023c62', fontSize: 12 }
const defaultBadge = { borderRadius: 999, background: '#dcfce7', color: '#166534', padding: '3px 7px', fontSize: 10, fontWeight: 900 }
const addressText = { color: '#142033', fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap' as const, overflowWrap: 'anywhere' as const }
const addressActions = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }
const formTitle = { color: '#023c62', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }
const quickGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr 0.8fr auto', gap: 8, marginTop: 10 }
const checkLine = { marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#166534', fontSize: 12, fontWeight: 800 }
const statsBar = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10 }
const info = { border: '1px solid #e5edf5', borderRadius: 8, padding: 9, display: 'grid', gap: 3, color: '#6b7fa3', fontSize: 11 }
const lineCatalog = { marginTop: 14, paddingTop: 12, borderTop: '1px solid #e8f0f7' }
const serviceChips = { display: 'flex', flexWrap: 'wrap' as const, gap: 8 }
const chip = { border: '1px solid #d8e5ef', background: '#f8fbff', borderRadius: 8, padding: '8px 10px', display: 'inline-flex', gap: 8, alignItems: 'center', color: '#023c62', fontSize: 12, fontWeight: 800, cursor: 'pointer' }
const cartBox = { marginTop: 14, border: '1px solid #e4edf5', borderRadius: 10, overflow: 'hidden' }
const cartHeader = { display: 'grid', gridTemplateColumns: 'minmax(240px,1fr) 146px 110px 120px', gap: 8, padding: '9px 10px', background: '#f3f7fb', color: '#6b7fa3', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' as const }
const cartRow = { display: 'grid', gridTemplateColumns: 'minmax(240px,1fr) 146px 110px 120px', gap: 8, padding: 10, alignItems: 'center' }
const rightHead = { textAlign: 'right' as const }
const centerHead = { textAlign: 'center' as const }
const cellInput = { ...input, padding: '7px 8px', fontSize: 12 }
const lockedLineName = { color: '#142033', fontSize: 13, fontWeight: 900, minHeight: 28, display: 'flex', alignItems: 'center' }
const qtyControl = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }
const qtyBtn = { width: 26, height: 26, borderRadius: 7, background: '#f1f5f9', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 800, color: '#023c62' }
const qtyInput = { width: 58, height: 26, border: '1px solid #dce8f0', borderRadius: 7, padding: '0 6px', textAlign: 'center' as const, fontSize: 13, fontWeight: 800, color: '#023c62', outline: 'none', boxSizing: 'border-box' as const }
const lineMeta = { fontSize: 11, color: '#9dafc8', marginTop: 3, fontWeight: 700 }
const discountText = { fontSize: 12, color: '#166534', fontWeight: 700, marginTop: 4 }
const noteText = { fontSize: 12, color: '#53657d', marginTop: 5, whiteSpace: 'pre-wrap' as const, lineHeight: 1.45 }
const strikeAmount = { fontSize: 12, color: '#9dafc8', textDecoration: 'line-through', marginBottom: 2 }
const lineTotalCell = { display: 'grid', gap: 6, justifyItems: 'end', alignContent: 'start' }
const amountStack = { minHeight: 28, display: 'grid', justifyItems: 'end', alignContent: 'center' }
const lineAmount = { color: '#023c62', fontSize: 14, lineHeight: 1.2 }
const lineActionsCell = { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }
const adjustBtn = { padding: '5px 10px', borderRadius: 999, border: '1px solid #dce8f0', background: '#fff', color: '#023c62', fontSize: 11, fontWeight: 800, cursor: 'pointer' }
const lineEditor = { margin: '0 10px 10px', padding: 12, borderRadius: 10, background: '#f8fbff', border: '1px solid #dce8f0', display: 'grid', gap: 9 }
const editorTitle = { fontSize: 11, color: '#023c62', fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }
const editorHelp = { fontSize: 12, color: '#6b7fa3', lineHeight: 1.45 }
const editorGrid = { display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }
const editorUnit = { fontSize: 11, color: '#6b7fa3', fontWeight: 800 }
const discountEditor = { display: 'grid', gridTemplateColumns: 'auto auto minmax(130px,1fr)', gap: 6 }
const toggleBtn = { padding: '7px 9px', borderRadius: 8, border: '1px solid #dce8f0', background: '#fff', color: '#374151', fontSize: 11, fontWeight: 800, cursor: 'pointer' }
const activeToggleBtn = { background: '#023c62', color: '#fff', borderColor: '#023c62' }
const editorFooter = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, color: '#6b7fa3', fontSize: 12, flexWrap: 'wrap' as const }
const customRow = { display: 'grid', gridTemplateColumns: 'minmax(240px,1fr) 146px 110px 120px', gap: 8, padding: 10, background: '#fbfdff', borderTop: '1px solid #eef4f8', alignItems: 'center' }
const totalRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #edf3f8', color: '#6b7fa3', fontSize: 13 }
const appointmentTop = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }
const tabs = { display: 'flex', flexWrap: 'wrap' as const, gap: 6, justifyContent: 'flex-end' }
const tab = { border: '1px solid #d8e5ef', background: '#fff', color: '#023c62', borderRadius: 999, padding: '7px 10px', fontSize: 11, fontWeight: 900, cursor: 'pointer' }
const activeTab = { background: '#023c62', color: '#fff', borderColor: '#023c62' }
const appointmentCard = { border: '1px solid #e4edf5', borderRadius: 10, padding: 11, background: '#fbfdff', display: 'grid', gap: 8 }
const appointmentGrid = { display: 'grid', gridTemplateColumns: '110px minmax(0,1fr) 130px 230px', gap: 12, alignItems: 'start' }
const apptNo = { display: 'block', color: '#023c62', marginBottom: 6 }
const pill = { display: 'inline-flex', alignItems: 'center', minHeight: 22, borderRadius: 999, padding: '0 9px', fontSize: 11, fontWeight: 900 }
const muted = { color: '#7d91ad', fontSize: 12, marginTop: 3 }
const appointmentAddress = { marginTop: 6, border: '1px solid #e4edf5', background: '#fff', borderRadius: 8, padding: '7px 8px', color: '#334155', fontSize: 12, lineHeight: 1.45, overflowWrap: 'anywhere' as const }
const lineSummary = { color: '#142033', fontSize: 12, marginTop: 5, overflowWrap: 'anywhere' as const }
const amount = { color: '#023c62', fontSize: 17 }
const actionsBox = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }
const assignActionBox = { gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'center' }
const compactSelect = { ...input, padding: '8px 9px', fontSize: 12, minWidth: 0 }
const payRow = { display: 'grid', gridTemplateColumns: '1fr 140px auto auto', gap: 8, padding: 8, borderRadius: 8, background: '#f8fafc' }
const paymentLine = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e8f0f7', borderRadius: 8, padding: '7px 9px', fontSize: 12, fontWeight: 800, color: '#142033' }
const empty = { padding: 32, textAlign: 'center' as const, color: '#8ba0bb' }
const primaryBtn = { border: 0, background: '#166534', color: '#fff', borderRadius: 8, padding: '9px 12px', fontSize: 12, fontWeight: 900, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }
const ghostBtn = { border: '1px solid #d8e5ef', background: '#fff', color: '#023c62', borderRadius: 8, padding: '9px 12px', fontSize: 12, fontWeight: 900, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }
const dangerBtn = { border: '1px solid #fecaca', background: '#fff7f7', color: '#991b1b', borderRadius: 8, padding: '9px 12px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }
const submitBtn = { ...primaryBtn, width: '100%', marginTop: 14, padding: '12px 14px', fontSize: 13 }
const tinyBtn = { ...ghostBtn, padding: '5px 8px', fontSize: 11 }
const tinyDanger = { ...dangerBtn, padding: '5px 8px', display: 'inline-flex', gap: 4, alignItems: 'center' }
const iconBtn = { border: 0, background: '#fff1f2', color: '#be123c', borderRadius: 8, width: 32, height: 32, display: 'grid', placeItems: 'center', cursor: 'pointer' }
