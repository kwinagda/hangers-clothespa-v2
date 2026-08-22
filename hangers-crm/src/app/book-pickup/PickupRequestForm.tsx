'use client'

import { ClipboardEvent, FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Minus, Plus, ShieldCheck } from 'lucide-react'

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
      setMessage(error instanceof Error ? error.message : 'The verification code could not be confirmed.')
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

  return <form ref={formRef} className="booking" onSubmit={submit} onInput={refreshFormReady} onChange={refreshFormReady}>
    <style>{styles}</style>
    <div className="booking-main">
      <section className="booking-step">
        <StepTitle number="01" title="What are we collecting?" required />
        <div className="service-counts">
          {services.map((service) => <div className="service-count" key={service.key}>
            <div><strong>{service.name}</strong><small>{service.description}</small></div>
            <div className="counter"><button type="button" aria-label={`Remove one ${service.name}`} onClick={() => change(service.key, -1)}><Minus size={14} /></button><b>{counts[service.key] || 0}</b><button type="button" aria-label={`Add one ${service.name}`} onClick={() => change(service.key, 1)}><Plus size={14} /></button></div>
          </div>)}
        </div>
      </section>

      <section className="booking-step">
        <StepTitle number="02" title="When should we come?" />
        <div className="booking-fields">
          <label><FieldLabel>Preferred date</FieldLabel><input name="preferredDate" required type="date" min={new Date().toISOString().slice(0, 10)} /></label>
          <label><FieldLabel>Preferred time</FieldLabel><select name="preferredSlot" required defaultValue=""><option value="" disabled>Select a pickup time</option>{pickupTimeSlots.map((slot) => <option key={slot.value} value={slot.value}>{slot.label}</option>)}</select></label>
        </div>
      </section>

      <section className="booking-step">
        <StepTitle number="03" title="Your pickup details" />
        <div className="booking-fields">
          <label><FieldLabel>Full name</FieldLabel><input name="name" required minLength={2} autoComplete="name" /></label>
          <label><FieldLabel>Mobile number</FieldLabel><div className="phone-field"><span aria-hidden="true">+91</span><input value={phone} onChange={(event) => changePhone(event.target.value)} required type="tel" inputMode="numeric" pattern="[0-9]{10}" minLength={10} maxLength={10} autoComplete="tel-national" aria-label="10-digit Indian mobile number" placeholder="10-digit mobile number" /></div></label>
          <label className="full"><FieldLabel>Flat, building and street</FieldLabel><textarea name="addressLine1" required minLength={5} autoComplete="address-line1" /></label>
          <label><FieldLabel>Area or locality</FieldLabel><input name="addressLine2" required minLength={2} autoComplete="address-line2" /></label>
          <label>Landmark <span className="optional">Optional</span><input name="landmark" /></label>
          <label><FieldLabel>City</FieldLabel><input name="city" required minLength={2} autoComplete="address-level2" defaultValue="Mumbai" /></label>
          <label><FieldLabel>PIN code</FieldLabel><input name="pincode" required inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} onInput={(event) => { event.currentTarget.value = event.currentTarget.value.replace(/\D/g, '').slice(0, 6) }} autoComplete="postal-code" /></label>
          <label className="full">Pickup instructions <span className="optional">Optional</span><textarea name="notes" maxLength={500} /></label>
        </div>
      </section>
    </div>

    <aside className="booking-summary">
      <h2>Your pickup request</h2>
      {items.length ? <>{services.filter((service) => (counts[service.key] || 0) > 0).map((service) => <div className="summary-line" key={service.key}><span>{service.name}</span><strong>{counts[service.key]} pcs</strong></div>)}<div className="summary-line total"><span>Total pieces</span><strong>{totalPieces}</strong></div></> : <div className="summary-empty">Add approximate quantities so the team can prepare for collection. The final order is created only after intake.</div>}
      {status !== 'success' && <div className={`confirmation-flow ${verificationToken ? 'verified' : ''}`}>
        <div className="confirmation-copy"><ShieldCheck size={18}/><span><strong>Confirm your pickup</strong><small>{verificationToken ? `Mobile number +91 ${phone} is verified.` : otpPhone && otpPhone === phone ? `Enter the 6-digit OTP sent to +91 ${phone} on WhatsApp.` : 'Confirm your pickup by verifying your mobile number. We’ll send a 6-digit OTP on WhatsApp.'}</small></span></div>
        {Boolean(otpPhone) && otpPhone === phone && !verificationToken && <div className="otp-entry">
          <span className="otp-label">6-digit OTP <b className="required-mark">*</b></span>
          <div className="otp-boxes" onPaste={pasteOtp}>
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
            />)}
          </div>
          <button className="resend-code" type="button" onClick={sendOtp} disabled={cooldown > 0 || otpStatus === 'sending'}>{cooldown > 0 ? `Resend OTP in ${cooldown}s` : otpStatus === 'sending' ? 'Sending OTP...' : 'Resend OTP'}</button>
        </div>}
      </div>}
      {status !== 'success' && <button className="submit" type="submit" disabled={!formReady || status === 'saving' || otpStatus === 'sending' || otpStatus === 'verifying'}>{status === 'saving' ? 'Confirming pickup...' : otpStatus === 'sending' ? 'Sending OTP...' : otpStatus === 'verifying' ? 'Verifying OTP...' : otpPhone && otpPhone === phone && !verificationToken ? 'Verify & confirm pickup' : verificationToken ? 'Confirm pickup request' : 'Confirm pickup with OTP'}</button>}
      {message && <p aria-live="polite" className={`form-message ${status === 'error' || otpStatus === 'error' ? 'error' : status === 'success' || otpStatus === 'verified' ? 'success' : 'info'}`}>{status === 'success' && <Check size={14} />} {message}</p>}
    </aside>
  </form>
}

function StepTitle({ number, title, required = false }: { number: string; title: string; required?: boolean }) { return <div className="booking-step-title"><span>{number}</span><h2>{title}{required && <b className="required-mark"> *</b>}</h2></div> }
function FieldLabel({ children }: { children: ReactNode }) { return <span>{children} <b className="required-mark">*</b></span> }

const styles = `
.booking{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);gap:42px;align-items:start}.booking-main{display:grid;gap:34px}.booking-step{padding-bottom:32px;border-bottom:1px solid #dce8f0}.booking-step:last-child{border:0}.booking-step-title{display:flex;gap:13px;align-items:center;margin-bottom:18px}.booking-step-title span{display:grid;width:30px;height:30px;place-items:center;border-radius:50%;color:#fff;background:#023c62;font-size:12px;font-weight:800}.booking-step-title h2{margin:0;color:#023c62;font-size:21px}.required-mark{color:#dc2626;font-weight:850}.optional{margin-left:5px;color:#8da0b0;font-size:10px;font-weight:550}.service-counts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.service-count{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:15px;border:1px solid #dce8f0;border-radius:8px;background:#fff}.service-count strong{display:block;color:#023c62;font-size:14px}.service-count small{display:block;margin-top:3px;color:#7d93a8;font-size:11.5px;line-height:1.4}.counter{display:flex;align-items:center;gap:8px}.counter button{display:grid;width:28px;height:28px;place-items:center;border:1px solid #c6dbe8;border-radius:6px;color:#023c62;background:#fff;cursor:pointer}.counter b{min-width:20px;text-align:center}.booking-fields{display:grid;grid-template-columns:1fr 1fr;gap:13px}.booking label{display:grid;gap:6px;color:#4b6479;font-size:13px;font-weight:650}.booking label.full{grid-column:1/-1}.booking input,.booking select,.booking textarea{width:100%;padding:11px 12px;border:1px solid #c8dce9;border-radius:7px;color:#10243a;background:#fff;font:inherit;box-sizing:border-box}.booking input:invalid:not(:placeholder-shown),.booking textarea:invalid:not(:placeholder-shown),.booking select:invalid{border-color:#e29a9a}.booking textarea{min-height:82px;resize:vertical}.phone-field{display:flex;align-items:stretch;border:1px solid #c8dce9;border-radius:7px;background:#fff;overflow:hidden;transition:border-color .16s ease,box-shadow .16s ease}.phone-field:focus-within{border-color:#0b78bb;box-shadow:0 0 0 3px rgba(11,120,187,.1)}.phone-field>span{display:flex;align-items:center;padding:0 11px;color:#36566f;background:#f1f6f9;border-right:1px solid #d8e5ed;font-size:14px;font-weight:750}.booking .phone-field input{min-width:0;border:0;border-radius:0;box-shadow:none;outline:0}.booking-summary{position:sticky;top:132px;min-width:0;padding:25px;border:1px solid #dce8f0;border-radius:12px;background:#fff;overflow:hidden}.booking-summary h2{margin:0 0 18px;color:#023c62;font-size:20px}.summary-line{display:flex;justify-content:space-between;gap:15px;padding:12px 0;border-bottom:1px solid #edf3f7;color:#4b6479;font-size:13.5px}.summary-line.total{color:#17344c;font-weight:750}.summary-empty{padding:18px 0;color:#7d93a8;font-size:13.5px;line-height:1.6}.confirmation-flow{display:grid;min-width:0;gap:13px;margin-top:18px;padding:14px;border:1px solid #d5e5ee;border-radius:8px;background:#f7fafc;transition:border-color .2s ease,background .2s ease}.confirmation-flow.verified{border-color:#a7e2c0;background:#f0fdf6}.confirmation-copy{display:flex;min-width:0;align-items:flex-start;gap:9px;color:#023c62}.confirmation-copy>svg{flex:0 0 auto;margin-top:1px}.confirmation-copy>span{display:grid;min-width:0;gap:3px}.confirmation-copy strong{font-size:13px}.confirmation-copy small{color:#71879a;font-size:11.5px;font-weight:400;line-height:1.45;overflow-wrap:anywhere}.otp-entry{display:grid;min-width:0;gap:9px}.otp-label{display:flex;align-items:center;gap:3px;color:#4b6479;font-size:11.5px;font-weight:700}.otp-boxes{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;width:100%;min-width:0}.booking .otp-boxes input{display:block;width:100%!important;max-width:100%;min-width:0;height:46px;padding:0;border:1px solid #b9cfdd;border-radius:7px;text-align:center;color:#023c62;background:#fff;font-size:20px;font-weight:800;caret-color:#0b78bb;box-sizing:border-box;transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease}.booking .otp-boxes input:focus{outline:0;border-color:#0b78bb;box-shadow:0 0 0 3px rgba(11,120,187,.13);transform:translateY(-1px)}.resend-code{justify-self:start;padding:0;border:0;color:#176a98;background:transparent;font:inherit;font-size:11.5px;font-weight:700;cursor:pointer}.resend-code:disabled{color:#8ba0ae;cursor:not-allowed}.submit{width:100%;min-height:46px;margin-top:14px;border:0;border-radius:8px;color:#fff;background:#023c62;font:inherit;font-weight:750;cursor:pointer}.submit:disabled{cursor:not-allowed;opacity:.55}.form-message{display:flex;align-items:flex-start;gap:5px;margin:14px 0 0;padding:11px;border-radius:7px;font-size:13px;line-height:1.5}.form-message svg{flex:0 0 auto;margin-top:2px}.form-message.success{color:#166534;background:#dcfce7}.form-message.error{color:#991b1b;background:#fee2e2}.form-message.info{color:#075985;background:#e0f2fe}@media(max-width:800px){.booking{grid-template-columns:1fr}.booking-summary{position:static;grid-row:2;margin-top:2px}}@media(max-width:560px){.service-counts,.booking-fields{grid-template-columns:1fr}.booking label.full{grid-column:auto}.booking-summary{padding:20px}.otp-boxes{gap:5px}.booking .otp-boxes input{height:46px;font-size:19px}}@media(prefers-reduced-motion:reduce){.confirmation-flow,.booking .otp-boxes input{transition:none}}
`
