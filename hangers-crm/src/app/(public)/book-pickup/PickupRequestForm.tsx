'use client'

import { ClipboardEvent, FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import VideoSlot from '@/components/public/VideoSlot'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1'
const PICKUP_INTAKE_API = (process.env.NEXT_PUBLIC_PICKUP_INTAKE_URL || '').replace(/\/$/, '')
const PICKUP_VERIFICATION_KEY = 'hangers_pickup_verification_v1'
type Service = { key: string; name: string; description: string }
type PickupSlot = { value: string; label: string }
type FormStatus = 'idle' | 'saving' | 'success' | 'error'
type OtpStatus = 'idle' | 'sending' | 'sent' | 'verifying' | 'verified' | 'error'

export default function PickupRequestForm({ services, pickupTimeSlots }: { services: Service[]; pickupTimeSlots: PickupSlot[] }) {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [phone, setPhone] = useState('')
  const [otpDigits, setOtpDigits] = useState<string[]>(() => Array(6).fill(''))
  const [otpPhone, setOtpPhone] = useState('')
  const [verificationToken, setVerificationToken] = useState('')
  const [verificationExpiresAt, setVerificationExpiresAt] = useState('')
  const [otpStatus, setOtpStatus] = useState<OtpStatus>('idle')
  const [cooldown, setCooldown] = useState(0)
  const [formReady, setFormReady] = useState(false)
  const [status, setStatus] = useState<FormStatus>('idle')
  const [message, setMessage] = useState('')
  const otpInputs = useRef<Array<HTMLInputElement | null>>([])
  const formRef = useRef<HTMLFormElement | null>(null)
  const otp = otpDigits.join('')
  const items = useMemo(
    () => services.filter((service) => (counts[service.key] || 0) > 0).map((service) => ({ serviceKey: service.key, quantity: counts[service.key] })),
    [counts, services]
  )
  const totalPieces = items.reduce((total, item) => total + item.quantity, 0)

  const refreshFormReady = () => window.requestAnimationFrame(() => {
    setFormReady(Boolean(items.length && formRef.current?.checkValidity()))
  })

  useEffect(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(PICKUP_VERIFICATION_KEY) || 'null')
      if (saved?.phone && saved?.token && new Date(saved.expiresAt).getTime() > Date.now()) {
        setPhone(saved.phone)
        setOtpPhone(saved.phone)
        setVerificationToken(saved.token)
        setVerificationExpiresAt(saved.expiresAt)
        setOtpStatus('verified')
      } else {
        window.sessionStorage.removeItem(PICKUP_VERIFICATION_KEY)
      }
    } catch {
      window.sessionStorage.removeItem(PICKUP_VERIFICATION_KEY)
    }
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  useEffect(() => {
    refreshFormReady()
  }, [items])

  useEffect(() => {
    if (!verificationExpiresAt) return
    const remaining = new Date(verificationExpiresAt).getTime() - Date.now()
    if (remaining <= 0) {
      setVerificationToken('')
      setVerificationExpiresAt('')
      setOtpStatus('idle')
      window.sessionStorage.removeItem(PICKUP_VERIFICATION_KEY)
      return
    }
    const timer = window.setTimeout(() => {
      setVerificationToken('')
      setVerificationExpiresAt('')
      setOtpStatus('idle')
      setMessage('Mobile verification expired. Request a new code to continue.')
      window.sessionStorage.removeItem(PICKUP_VERIFICATION_KEY)
    }, remaining)
    return () => window.clearTimeout(timer)
  }, [verificationExpiresAt])

  const change = (key: string, by: number) => setCounts((current) => ({ ...current, [key]: Math.max(0, (current[key] || 0) + by) }))

  const changePhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10)
    setPhone(digits)
    if (digits !== otpPhone) {
      setOtpDigits(Array(6).fill(''))
      setVerificationToken('')
      setVerificationExpiresAt('')
      setOtpStatus('idle')
      window.sessionStorage.removeItem(PICKUP_VERIFICATION_KEY)
    }
  }

  async function sendOtp() {
    if (!items.length) {
      setOtpStatus('error')
      setMessage('Select at least one service and quantity before requesting a code.')
      return
    }
    if (!formRef.current?.checkValidity()) {
      setOtpStatus('error')
      setMessage('Complete the highlighted required fields before requesting a code.')
      formRef.current?.reportValidity()
      return
    }
    if (phone.length !== 10 || cooldown > 0) return
    setOtpStatus('sending')
    setStatus('idle')
    setVerificationToken('')
    setVerificationExpiresAt('')
    setOtpDigits(Array(6).fill(''))
    window.sessionStorage.removeItem(PICKUP_VERIFICATION_KEY)
    setMessage('')
    try {
      const response = await fetch(`${PICKUP_INTAKE_API || `${API}/public`}/pickup-requests/send-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.message || 'Verification code could not be sent.')
      setOtpPhone(phone)
      setCooldown(Number(payload?.data?.cooldownSeconds || 60))
      setOtpStatus('sent')
      setMessage(payload?.data?.devOtp ? `Verification code sent. Local test code: ${payload.data.devOtp}` : 'Verification code sent on WhatsApp.')
      window.setTimeout(() => otpInputs.current[0]?.focus(), 50)
    } catch (error) {
      setOtpStatus('error')
      setMessage(error instanceof Error ? error.message : 'Verification code could not be sent.')
    }
  }

  const replaceOtp = (digits: string) => {
    setOtpDigits(Array.from({ length: 6 }, (_, index) => digits[index] || ''))
    setVerificationToken('')
    if (otpStatus === 'verified') setOtpStatus('sent')
  }

  const changeOtpDigit = (index: number, value: string) => {
    const digits = value.replace(/\D/g, '')
    if (digits.length > 1) {
      if (digits.length === 6) {
        replaceOtp(digits)
        otpInputs.current[5]?.focus()
      }
      return
    }
    const next = [...otpDigits]
    next[index] = digits
    setOtpDigits(next)
    if (digits && index < 5) otpInputs.current[index + 1]?.focus()
  }

  const handleOtpKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !otp[index] && index > 0) {
      event.preventDefault()
      const next = [...otpDigits]
      next[index - 1] = ''
      setOtpDigits(next)
      otpInputs.current[index - 1]?.focus()
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault(); otpInputs.current[index - 1]?.focus()
    } else if (event.key === 'ArrowRight' && index < 5) {
      event.preventDefault(); otpInputs.current[index + 1]?.focus()
    }
  }

  const pasteOtp = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    const pasted = event.clipboardData.getData('text').trim()
    if (!/^\d{6}$/.test(pasted)) {
      setOtpStatus('error')
      setMessage('Paste the complete 6-digit code only.')
      return
    }
    replaceOtp(pasted)
    setOtpStatus('sent')
    setStatus('idle')
    setMessage('Code pasted. Confirm it to continue.')
    otpInputs.current[5]?.focus()
  }

  async function confirmOtp(): Promise<string | null> {
    if (PICKUP_INTAKE_API) return otp
    if (otpPhone !== phone || !/^\d{6}$/.test(otp) || otpStatus === 'verifying') return null
    setOtpStatus('verifying')
    setStatus('idle')
    setMessage('')
    try {
      const response = await fetch(`${API}/public/pickup-requests/verify-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, otp }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.message || 'The verification code could not be confirmed.')
      const token = String(payload?.data?.verificationToken || '')
      const expiresAt = String(payload?.data?.expiresAt || '')
      if (!token || !expiresAt) throw new Error('Verification receipt was not returned. Please request a new code.')
      setVerificationToken(token)
      setVerificationExpiresAt(expiresAt)
      setOtpStatus('verified')
      window.sessionStorage.setItem(PICKUP_VERIFICATION_KEY, JSON.stringify({ phone, token, expiresAt }))
      return token
    } catch (error) {
      setVerificationToken('')
      setVerificationExpiresAt('')
      setOtpStatus('error')
      window.sessionStorage.removeItem(PICKUP_VERIFICATION_KEY)
      setMessage('That code did not match. Try again.')
      otpInputs.current[0]?.focus()
      return null
    }
  }

  async function savePickupRequest(form: HTMLFormElement, token: string) {
    const data = Object.fromEntries(new FormData(form).entries())
    const serviceNames = new Map(services.map((service) => [service.key, service.name]))
    setStatus('saving')
    setOtpStatus('verified')
    setMessage('')
    try {
      const endpoint = PICKUP_INTAKE_API ? `${PICKUP_INTAKE_API}/pickup-requests` : `${API}/public/pickup-requests`
      const body = PICKUP_INTAKE_API
        ? { ...data, phone, otp: token, items: items.map((item) => ({ ...item, serviceName: serviceNames.get(item.serviceKey) || item.serviceKey })) }
        : { ...data, phone, verificationToken: token, items }
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.message || 'Unable to submit pickup request.')
      form.reset()
      setCounts({}); setPhone(''); setOtpDigits(Array(6).fill('')); setOtpPhone(''); setVerificationToken(''); setVerificationExpiresAt(''); setOtpStatus('idle'); setCooldown(0); setStatus('success')
      window.sessionStorage.removeItem(PICKUP_VERIFICATION_KEY)
      const requestNumber = payload?.data?.request?.requestNumber
      setMessage(requestNumber ? `${payload.message} Reference: ${requestNumber}.` : payload.message)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to submit pickup request.')
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    if (!items.length) { setStatus('error'); setMessage('Add at least one service and quantity for pickup.'); return }
    if (verificationToken && otpPhone === phone) {
      await savePickupRequest(form, verificationToken)
      return
    }
    if (!otpPhone || otpPhone !== phone) {
      await sendOtp()
      return
    }
    if (!/^\d{6}$/.test(otp)) {
      setOtpStatus('error')
      setMessage('Enter the complete 6-digit OTP sent on WhatsApp.')
      otpInputs.current[0]?.focus()
      return
    }
    const token = await confirmOtp()
    if (token) await savePickupRequest(form, token)
  }
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerMonth, setPickerMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [pickedDate, setPickedDate] = useState('')
  const [pickedSlot, setPickedSlot] = useState('')
  const [tried, setTried] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [shake, setShake] = useState(false)
  const [formSuccess, setFormSuccess] = useState(false)
  const dateLabel = pickedDate ? new Date(pickedDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  const slotLabel = pickedSlot ? (pickupTimeSlots.find((slot) => slot.value === pickedSlot)?.label || pickedSlot) : ''

  useEffect(() => {
    if (otpStatus !== 'error' || otp.length !== 6 || otpPhone !== phone) return
    setShake(true)
    const timer = window.setTimeout(() => { setShake(false); setOtpDigits(Array(6).fill('')) }, 1100)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpStatus])

  useEffect(() => {
    if (status === 'success') setFormSuccess(true)
  }, [status])

  const fieldRule = (name: string, value: string): string => {
    if (name === 'name') {
      const trimmed = value.trim()
      if (trimmed.length < 2 || trimmed.length > 60 || !/^[A-Za-z][A-Za-z .'-]*$/.test(trimmed)) return 'Enter your full name using letters only'
    }
    if (name === 'phone' && !/^[6-9]\d{9}$/.test(value)) return 'Enter a valid 10-digit mobile number'
    if (name === 'addressLine1' && value.trim().length < 5) return 'Enter flat, building and street (at least 5 characters)'
    if (name === 'addressLine2' && !LOCALITIES.includes(value)) return 'Select your locality from the list'
    if (name === 'pincode' && !/^400\d{3}$/.test(value)) return 'Enter a 6-digit Mumbai PIN code starting with 400'
    if (name === 'preferredDate' && !value) return 'Choose a pickup date'
    if (name === 'preferredSlot' && !value) return 'Choose a pickup time'
    return ''
  }

  const currentValues = (): Record<string, string> => {
    const form = formRef.current
    const get = (n: string) => (form?.elements.namedItem(n) as HTMLInputElement | null)?.value ?? ''
    return { name: get('name'), phone, addressLine1: get('addressLine1'), addressLine2: get('addressLine2'), pincode: get('pincode'), preferredDate: pickedDate, preferredSlot: pickedSlot }
  }

  const validateAll = () => {
    const values = currentValues()
    const next: Record<string, string> = {}
    Object.entries(values).forEach(([key, value]) => { const msg = fieldRule(key, value); if (msg) next[key] = msg })
    if (!items.length) next.items = 'Choose at least one item to collect'
    setErrors(next)
    return next
  }

  const blurCheck = (name: string) => {
    const value = currentValues()[name] ?? ''
    const msg = fieldRule(name, value)
    setErrors((current) => { const copy = { ...current }; if (msg) copy[name] = msg; else delete copy[name]; return copy })
  }

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })

  const monthDays = (() => {
    const first = pickerMonth
    const startPad = first.getDay()
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    const cells: (Date | null)[] = Array(startPad).fill(null)
    for (let d = 1; d <= days; d += 1) cells.push(new Date(first.getFullYear(), first.getMonth(), d))
    return cells
  })()
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const canGoBack = pickerMonth > new Date(todayStart.getFullYear(), todayStart.getMonth(), 1)

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    const next = validateAll()
    setTried(true)
    if (Object.keys(next).length) {
      event.preventDefault()
      const firstKey = Object.keys(next)[0]
      const target = document.querySelector<HTMLElement>(`[data-field="${firstKey}"]`) || document.getElementById('step-items')
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    submit(event)
  }

  const sectionError = (stepKey: string) => Object.keys(errors).some((key) => STEP_FIELDS[stepKey].includes(key))
  const errorChips = Object.entries(errors).map(([key, msg]) => ({ key, msg, step: STEP_OF[key] || 'details' }))

  if (formSuccess && status === 'success') {
    return <div className="booking-success" aria-live="polite">
      <style>{styles}</style>
      <VideoSlot clip="otpok" caption={false} />
      <h2>Pickup confirmed</h2>
      <p>{totalPieces} items · {dateLabel} · {slotLabel}. We will confirm the collection window on WhatsApp.</p>
      {message && <p className="form-message success">{message}</p>}
    </div>
  }

  return <form ref={formRef} className="booking" onSubmit={onFormSubmit} onInput={refreshFormReady} onChange={refreshFormReady} noValidate>
    <style>{styles}</style>
    <div className="booking-main">
      {tried && errorChips.length > 0 && <div className="error-summary" role="alert">
        <strong>Complete these to continue</strong>
        <div className="error-chips">{errorChips.map((chip) => <button type="button" key={chip.key} onClick={() => scrollTo(`step-${chip.step}`)}>{chip.msg}</button>)}</div>
      </div>}
      <section id="step-items" className={`booking-step${sectionError('items') ? ' has-error' : ''}`}>
        <StepTitle number="01" title="What are we collecting?" required />
        <p className="step-copy">Add approximate quantities so the team can prepare for collection. The final order is created only after intake.</p>
        {errors.items && <p className="field-error">{errors.items}</p>}
        <div className="service-counts">
          {services.map((service) => <div className="service-count" key={service.key}>
            <div><strong>{service.name}</strong><small>{service.description}</small></div>
            <div className="counter"><button type="button" aria-label={`Remove one ${service.name}`} onClick={() => change(service.key, -1)}><Minus size={14} /></button><b>{counts[service.key] || 0}</b><button type="button" aria-label={`Add one ${service.name}`} onClick={() => change(service.key, 1)}><Plus size={14} /></button></div>
          </div>)}
        </div>
      </section>

      <section id="step-schedule" className={`booking-step${sectionError('schedule') ? ' has-error' : ''}`}>
        <StepTitle number="02" title="When should we come?" />
        <div className="booking-fields">
          <div className="full" data-field="preferredDate">
            <span className="label-text">Preferred date <b className="required-mark">*</b></span>
            <button type="button" className="date-trigger" onClick={() => setPickerOpen(true)} aria-haspopup="dialog">{dateLabel || 'Choose a date'}</button>
            <input type="hidden" name="preferredDate" value={pickedDate} required />
            {errors.preferredDate && <p className="field-error">{errors.preferredDate}</p>}
          </div>
          <div className="full" data-field="preferredSlot">
            <span className="label-text">Preferred time <b className="required-mark">*</b></span>
            <div className="slot-toggles" role="group" aria-label="Preferred time">
              {slotButtons(pickupTimeSlots).map((slot) => <button type="button" key={slot.value} aria-pressed={pickedSlot === slot.value} className={pickedSlot === slot.value ? 'on' : ''} onClick={() => { setPickedSlot(slot.value); setErrors((c) => { const n = { ...c }; delete n.preferredSlot; return n }) }}>{slot.label}</button>)}
            </div>
            <input type="hidden" name="preferredSlot" value={pickedSlot} required />
            {errors.preferredSlot && <p className="field-error">{errors.preferredSlot}</p>}
          </div>
        </div>
      </section>

      <section id="step-details" className={`booking-step${sectionError('details') ? ' has-error' : ''}`}>
        <StepTitle number="03" title="Your pickup details" />
        <div className="booking-fields">
          <label data-field="name"><FieldLabel>Full name</FieldLabel><input name="name" required autoComplete="name" aria-invalid={Boolean(errors.name)} onBlur={() => blurCheck('name')} onInput={(event) => { event.currentTarget.value = event.currentTarget.value.replace(/[^A-Za-z .'-]/g, '').slice(0, 60) }} />{errors.name && <span className="field-error">{errors.name}</span>}</label>
          <label data-field="phone"><FieldLabel>Mobile number</FieldLabel><div className="phone-field"><span aria-hidden="true">+91</span><input value={phone} onChange={(event) => changePhone(event.target.value)} onBlur={() => blurCheck('phone')} required type="tel" inputMode="numeric" pattern="[0-9]{10}" minLength={10} maxLength={10} autoComplete="tel-national" aria-invalid={Boolean(errors.phone)} /></div>{errors.phone && <span className="field-error">{errors.phone}</span>}</label>
          <label className="full" data-field="addressLine1"><FieldLabel>Flat, building and street</FieldLabel><textarea name="addressLine1" required minLength={5} autoComplete="address-line1" aria-invalid={Boolean(errors.addressLine1)} onBlur={() => blurCheck('addressLine1')} />{errors.addressLine1 && <span className="field-error">{errors.addressLine1}</span>}</label>
          <label data-field="addressLine2"><FieldLabel>Area or locality</FieldLabel><select name="addressLine2" required defaultValue="" aria-invalid={Boolean(errors.addressLine2)} onBlur={() => blurCheck('addressLine2')}><option value="" disabled>Select your locality</option>{LOCALITIES.map((area) => <option key={area} value={area}>{area}</option>)}</select>{errors.addressLine2 && <span className="field-error">{errors.addressLine2}</span>}</label>
          <label><span>Landmark <span className="optional">Optional</span></span><input name="landmark" /></label>
          <label className="fixed-field"><FieldLabel>City</FieldLabel><span className="fixed-tag">Fixed</span><input name="city" readOnly value="Mumbai" /></label>
          <label data-field="pincode"><FieldLabel>PIN code</FieldLabel><input name="pincode" required inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="postal-code" aria-invalid={Boolean(errors.pincode)} onBlur={() => blurCheck('pincode')} onInput={(event) => { event.currentTarget.value = event.currentTarget.value.replace(/\D/g, '').slice(0, 6) }} />{errors.pincode && <span className="field-error">{errors.pincode}</span>}</label>
          <label className="full">Pickup instructions <span className="optional">Optional</span><textarea name="notes" maxLength={500} /></label>
        </div>
      </section>
    </div>

    <aside className="booking-summary">
      <h2>Your pickup request</h2>
      {items.length ? <>
        <div className="summary-count">{totalPieces}<span> pieces</span></div>
        {services.filter((service) => (counts[service.key] || 0) > 0).map((service) => <div className="summary-line" key={service.key}><span>{service.name}</span><strong>{counts[service.key]} pcs</strong></div>)}
        {dateLabel && <div className="summary-line"><span>Date</span><strong>{dateLabel}</strong></div>}
        {slotLabel && <div className="summary-line"><span>Time</span><strong>{slotLabel}</strong></div>}
      </> : <p className="summary-empty">Choose at least one item to see your request here.</p>}
      {status !== 'success' && <div className={`confirmation-flow ${verificationToken ? 'verified' : ''}`}>
        <div className="confirmation-copy"><span><strong>Confirm your pickup</strong><small>{verificationToken ? `Mobile number +91 ${phone} is verified.` : otpPhone && otpPhone === phone ? `Enter the 6-digit OTP sent to +91 ${phone} on WhatsApp.` : 'Confirm your pickup by verifying your mobile number. We’ll send a 6-digit OTP on WhatsApp.'}</small></span></div>
        {Boolean(otpPhone) && otpPhone === phone && !verificationToken && <div className="otp-entry">
          <span className="otp-label">6-digit OTP <b className="required-mark">*</b></span>
          <div className={`otp-boxes${shake ? ' shake' : ''}`} onPaste={pasteOtp}>
            {Array.from({ length: 6 }, (_, index) => <input
              key={index}
              ref={(element) => { otpInputs.current[index] = element }}
              value={otpDigits[index]}
              onChange={(event) => changeOtpDigit(index, event.target.value)}
              onKeyDown={(event) => handleOtpKeyDown(index, event)}
              onFocus={(event) => event.currentTarget.select()}
              type="text"
              inputMode="numeric"
              enterKeyHint={index === 5 ? 'done' : 'next'}
              pattern="[0-9]*"
              maxLength={1}
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              aria-label={`Verification code digit ${index + 1}`}
              className={otpStatus === 'error' && otp.length === 6 ? 'bad' : ''}
            />)}
          </div>
          <button className="resend-code" type="button" onClick={sendOtp} disabled={cooldown > 0 || otpStatus === 'sending'}>{cooldown > 0 ? `Resend OTP in ${cooldown}s` : otpStatus === 'sending' ? 'Sending OTP...' : 'Resend OTP'}</button>
        </div>}
      </div>}
      {status !== 'success' && <button className="submit" type="submit" disabled={status === 'saving' || otpStatus === 'sending' || otpStatus === 'verifying'}>{status === 'saving' ? 'Confirming pickup...' : otpStatus === 'sending' ? 'Sending OTP...' : otpStatus === 'verifying' ? 'Verifying OTP...' : verificationToken && otpPhone === phone ? 'Confirm pickup' : 'Confirm pickup with OTP'}</button>}
      {message && <p aria-live="polite" className={`form-message ${status === 'error' || otpStatus === 'error' ? 'error' : status === 'success' || otpStatus === 'verified' ? 'success' : 'info'}`}>{message}</p>}
    </aside>

    {pickerOpen && <div className="picker-scrim" onClick={() => setPickerOpen(false)}>
      <div className="picker" role="dialog" aria-modal="true" aria-label="Choose a pickup date" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Escape') setPickerOpen(false) }}>
        <div className="picker-head">
          <button type="button" aria-label="Previous month" disabled={!canGoBack} onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1))}>‹</button>
          <strong>{pickerMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</strong>
          <button type="button" aria-label="Next month" onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1))}>›</button>
        </div>
        <div className="picker-grid" role="grid">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => <span key={d} className="dow">{d}</span>)}
          {monthDays.map((day, i) => {
            if (!day) return <span key={`pad-${i}`} />
            const iso = toIso(day)
            const disabled = day < todayStart
            const isToday = iso === toIso(todayStart)
            const selected = iso === pickedDate
            return <button type="button" key={iso} disabled={disabled} aria-pressed={selected} className={`day${isToday ? ' today' : ''}${selected ? ' selected' : ''}`} onClick={() => { setPickedDate(iso); setErrors((c) => { const n = { ...c }; delete n.preferredDate; return n }); setPickerOpen(false) }}>{day.getDate()}</button>
          })}
        </div>
        <div className="picker-foot">
          <button type="button" onClick={() => { setPickedDate(''); setPickerOpen(false) }}>Clear</button>
          <button type="button" onClick={() => { const t = new Date(); setPickerMonth(new Date(t.getFullYear(), t.getMonth(), 1)); setPickedDate(toIso(t)); setPickerOpen(false) }}>Today</button>
        </div>
      </div>
    </div>}
  </form>
}

const LOCALITIES = ['Mulund', 'Bhandup', 'Thane', 'Nahur', 'Vikhroli', 'Kanjurmarg', 'Powai', 'Ghatkopar']
const STEP_FIELDS: Record<string, string[]> = { items: ['items'], schedule: ['preferredDate', 'preferredSlot'], details: ['name', 'phone', 'addressLine1', 'addressLine2', 'pincode'] }
const STEP_OF: Record<string, string> = { items: 'items', preferredDate: 'schedule', preferredSlot: 'schedule', name: 'details', phone: 'details', addressLine1: 'details', addressLine2: 'details', pincode: 'details' }

function slotButtons(slots: { value: string; label: string }[]) {
  const pick = (word: string) => slots.find((s) => s.label.toLowerCase().includes(word) || s.value.toLowerCase().includes(word))
  const named = ['Morning', 'Afternoon', 'Evening'].map((w) => pick(w.toLowerCase())).filter(Boolean) as { value: string; label: string }[]
  return named.length ? named : slots
}

function StepTitle({ number, title, required = false }: { number: string; title: string; required?: boolean }) { return <div className="booking-step-title"><span>{number}</span><h2>{title}{required && <b className="required-mark"> *</b>}</h2></div> }
function FieldLabel({ children }: { children: ReactNode }) { return <span className="label-text">{children} <b className="required-mark">*</b></span> }

const styles = `
.booking{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);gap:42px;align-items:start;font-family:'Space Grotesk',sans-serif;color:#0b2536}
.booking-main{display:grid;gap:34px}
.booking-step{padding-bottom:32px;border-bottom:1px solid #d6e2ec;border-radius:0}
.booking-step:last-child{border:0}
.booking-step.has-error{outline:2px solid #b3261e;outline-offset:10px;border-radius:12px}
.step-copy{margin:-8px 0 18px;color:#3d5668;font-size:16px;line-height:1.55}
.booking-step-title{display:flex;gap:13px;align-items:center;margin-bottom:20px}
.booking-step-title span{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:#E8F0F7;color:#023c62;font-weight:700}
.booking-step-title h2{margin:0;color:#023c62;font-size:clamp(22px,3vw,30px);letter-spacing:-.03em}
.required-mark{color:#b3261e}
.optional{color:#5b7486;font-weight:500;font-size:13px}
.service-counts{display:grid;gap:12px}
.service-count{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:16px 20px;border:1px solid #c9d9e6;border-radius:20px;background:#fff}
.service-count strong{display:block;color:#023c62;font-size:18px}
.service-count small{color:#5b7486;font-size:13px}
.counter{display:flex;align-items:center;gap:12px}
.counter button{width:44px;height:44px;border-radius:50%;border:0;background:#E8F0F7;color:#023c62;display:grid;place-items:center;cursor:pointer}
.counter b{min-width:24px;text-align:center;font-size:18px}
.booking-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.booking-fields label,.booking-fields .full{display:grid;gap:8px;color:#3d5668;font-size:14px}
.booking-fields .full{grid-column:1/-1}
.booking-fields label.full{grid-column:1/-1}
.label-text{font-weight:600;color:#023c62}
.booking-fields input,.booking-fields select,.booking-fields textarea{width:100%;min-height:52px;border:1px solid #c9d9e6;border-radius:14px;background:#F1F6FA;padding:12px 14px;font:inherit;font-size:16px;color:#0b2536;outline:none}
.booking-fields textarea{min-height:90px;resize:vertical}
.booking-fields input:focus,.booking-fields select:focus,.booking-fields textarea:focus{border-color:#023c62;box-shadow:0 0 0 4px rgba(2,60,98,.12);background:#fff}
.booking-fields input[aria-invalid=true],.booking-fields select[aria-invalid=true],.booking-fields textarea[aria-invalid=true]{border-color:#b3261e;background:#fff1f0}
.field-error{color:#b3261e;font-size:13px;margin:0}
.phone-field{display:flex;align-items:center;gap:0}
.phone-field span{min-height:52px;display:grid;place-items:center;padding:0 14px;border:1px solid #c9d9e6;border-right:0;border-radius:14px 0 0 14px;background:#E8F0F7;color:#023c62;font-weight:600}
.phone-field input{border-radius:0 14px 14px 0}
.fixed-field{position:relative}
.fixed-field .fixed-tag{position:absolute;right:12px;top:36px;padding:3px 10px;border-radius:999px;background:#E8F0F7;color:#023c62;font-size:12px;font-weight:600}
.fixed-field input{background:#f4f7fb;color:#5b7486}
.date-trigger{min-height:52px;width:100%;text-align:left;border:1px solid #c9d9e6;border-radius:14px;background:#F1F6FA;padding:0 14px;font:inherit;font-size:16px;color:#023c62;font-weight:600;cursor:pointer}
.slot-toggles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.slot-toggles button{min-height:54px;border:1px solid #c9d9e6;border-radius:14px;background:#fff;color:#023c62;font:inherit;font-weight:600;cursor:pointer}
.slot-toggles button.on{background:#023c62;border-color:#023c62;color:#fff}
.error-summary{padding:16px 18px;border-radius:18px;background:#fff1f0;border:1px solid #f1c2bd;color:#b3261e}
.error-summary strong{display:block;margin-bottom:10px}
.error-chips{display:flex;flex-wrap:wrap;gap:8px}
.error-chips button{min-height:36px;padding:0 12px;border-radius:999px;border:1px solid #b3261e;background:#fff;color:#b3261e;font:inherit;font-size:13px;cursor:pointer}
.booking-summary{position:sticky;top:110px;display:grid;gap:16px;padding:28px;border-radius:28px;background:#023c62;color:#fff;box-shadow:0 30px 80px rgba(2,60,98,.35)}
.booking-summary h2{margin:0;font-size:22px;letter-spacing:-.03em}
.summary-count{font-size:clamp(48px,6vw,72px);font-weight:700;letter-spacing:-.04em;line-height:1}
.summary-count span{font-size:18px;font-weight:500;opacity:.8}
.summary-line{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-top:1px solid rgba(255,255,255,.14);font-size:15px}
.summary-empty{margin:0;color:#d3e4f1;font-size:15px}
.confirmation-copy{display:flex;gap:10px;align-items:flex-start}
.confirmation-copy small{display:block;color:#d3e4f1;font-size:13px;margin-top:4px}
.otp-entry{display:grid;gap:10px}
.otp-label{font-weight:600;font-size:14px}
.otp-boxes{display:flex;gap:8px;justify-content:space-between}
.otp-boxes input{width:clamp(40px,12vw,52px);height:clamp(52px,14vw,60px);border-radius:14px;border:1px solid #9cc0dc;background:#fff;color:#023c62;font:inherit;font-size:22px;font-weight:700;text-align:center;outline:none}
.otp-boxes input.bad{border-color:#b3261e;background:#fff1f0}
.otp-boxes.shake{animation:hg-shake .48s}
@keyframes hg-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}
.resend-code{justify-self:start;background:none;border:0;color:#d3e4f1;font:inherit;font-size:14px;text-decoration:underline;cursor:pointer;padding:6px 0}
.resend-code:disabled{opacity:.55;cursor:default}
.submit{min-height:56px;border:0;border-radius:999px;background:#fff;color:#023c62;font:inherit;font-size:16px;font-weight:700;cursor:pointer}
.submit:disabled{opacity:.6;cursor:default}
.form-message{margin:0;font-size:14px;line-height:1.5;color:#d3e4f1}
.form-message.error{color:#ffb4ab}
.form-message.success{color:#fff}
.picker-scrim{position:fixed;inset:0;z-index:300;background:rgba(2,36,58,.45);backdrop-filter:blur(3px);display:grid;place-items:center;padding:16px;animation:hg-fade .3s}
.picker{width:min(380px,100%);border-radius:28px;background:#fff;padding:22px;box-shadow:0 30px 80px rgba(2,60,98,.35);animation:hg-rise .4s cubic-bezier(.2,.7,.2,1)}
@keyframes hg-fade{from{opacity:0}to{opacity:1}}
@keyframes hg-rise{from{opacity:0;transform:translateY(30px) scale(.96)}to{opacity:1;transform:none}}
.picker-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;color:#023c62}
.picker-head button{width:44px;height:44px;border-radius:50%;border:0;background:#E8F0F7;color:#023c62;font-size:20px;cursor:pointer}
.picker-head button:disabled{opacity:.35;cursor:default}
.picker-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center}
.picker-grid .dow{color:#5b7486;font-size:12px;font-weight:600;padding:6px 0}
.picker-grid .day{height:44px;border:1.5px solid transparent;border-radius:50%;background:none;color:#023c62;font:inherit;cursor:pointer}
.picker-grid .day:disabled{color:#b9c8d4;cursor:default}
.picker-grid .day.today{border-color:#023c62}
.picker-grid .day.selected{background:#023c62;color:#fff}
.picker-foot{display:flex;justify-content:space-between;margin-top:12px}
.picker-foot button{min-height:44px;padding:0 14px;border:0;background:none;color:#023c62;font:inherit;font-weight:600;cursor:pointer}
.booking-success{display:grid;gap:18px;max-width:560px;margin:0 auto;text-align:center;color:#0b2536}
.booking-success h2{margin:0;color:#023c62;font-size:clamp(28px,4vw,40px);letter-spacing:-.03em}
.booking-success p{margin:0;color:#3d5668;font-size:17px;line-height:1.55}
@media(max-width:900px){.booking{grid-template-columns:1fr;gap:28px}.booking-summary{position:static}}
@media(max-width:600px){.booking-fields{grid-template-columns:1fr}.slot-toggles button{min-height:52px;font-size:14px;padding:0 6px}}
@media(prefers-reduced-motion:reduce){.otp-boxes.shake,.picker-scrim,.picker{animation:none}}
`
