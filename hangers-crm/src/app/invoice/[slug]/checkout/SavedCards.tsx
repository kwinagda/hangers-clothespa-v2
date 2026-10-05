'use client'

import { useEffect, useRef, useState } from 'react'
import { checkoutRequest } from './razorpay-sdk'
import styles from '../RazorpayCustomCheckout.module.css'

export type SavedCardSelection = {
  sdk: { method: 'card'; customer_id?: string; token?: string; save?: number }
  network?: string | null; last4?: string | null; expiresAt?: string; cvvRequired?: boolean
}
type Card = { selector: string; network: string | null; last4: string | null; selectable: boolean }
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/api/v1'
const BASE = `${API}/customer/payments/razorpay/saved-cards`

export default function SavedCards({ mode, keyId, disabled, onChange, onBusy, onSaveRequested, contextKey, approvedTestContact, presentation = 'card' }: {
  mode: 'TEST' | 'LIVE'; keyId: string; disabled: boolean
  onChange: (selection: SavedCardSelection | null) => void
  onBusy?: (busy: boolean) => void
  onSaveRequested?: (requested: boolean) => void
  contextKey?: string
  approvedTestContact?: string
  presentation?: 'list' | 'card'
}) {
  const [token, setToken] = useState('')
  const [phone, setPhone] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [cards, setCards] = useState<Card[]>([])
  const [consent, setConsent] = useState<{ text: string; version: string } | null>(null)
  const [granted, setGranted] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState('')
  const alive = useRef(true)
  const locked = useRef(false)
  const pending = useRef(0)
  const bootstrap = useRef(false)
  const [reload, setReload] = useState(0)
  const finishWork = () => {
    pending.current = Math.max(0, pending.current - 1)
    locked.current = pending.current > 0
    if (alive.current) { setBusy(locked.current); busyCallback.current?.(locked.current) }
  }
  const generation = useRef(0)
  const payer = useRef<string | null>(null)
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const otpInput = useRef<HTMLInputElement>(null)
  const change = useRef(onChange)
  change.current = onChange
  const busyCallback = useRef(onBusy)
  busyCallback.current = onBusy
  const saveCallback = useRef(onSaveRequested)
  saveCallback.current = onSaveRequested
  const setSaveRequested = (requested: boolean) => {
    if (alive.current) setGranted(requested)
    saveCallback.current?.(requested)
  }
  const resetSaveRequested = () => setSaveRequested(false)
  const clearSelection = () => {
    if (expiryTimer.current) clearTimeout(expiryTimer.current)
    expiryTimer.current = null
    setSelected(''); change.current(null)
  }
  const reset = () => {
    generation.current += 1
    if (bootstrap.current) { bootstrap.current = false; finishWork() }
    if (sessionTimer.current) clearTimeout(sessionTimer.current)
    payer.current = null
    clearSelection(); setCards([]); setConsent(null); resetSaveRequested(); setOtpSent(false)
    if (otpInput.current) otpInput.current.value = ''
  }
  useEffect(() => { alive.current = true; return () => {
    alive.current = false; generation.current += 1
    if (expiryTimer.current) clearTimeout(expiryTimer.current)
    if (sessionTimer.current) clearTimeout(sessionTimer.current)
    change.current(null); busyCallback.current?.(false)
    resetSaveRequested()
  } }, [])
  useEffect(() => { reset(); setToken(''); setPhone(mode === 'TEST' ? approvedTestContact || '' : ''); setMessage('') }, [mode, keyId, contextKey, approvedTestContact])
  type Context = { mode: string; keyId: string; payerId: string; sessionExpiresAt: string }
  const validate = (result: Context) => {
    if (result.mode !== mode || result.keyId !== keyId || !keyId.startsWith(`rzp_${mode.toLowerCase()}_`)) throw new Error('Saved-card payment settings changed. Reload checkout.')
    const expiry = Date.parse(result.sessionExpiresAt)
    if (!result.payerId || !Number.isFinite(expiry) || expiry <= Date.now() || (payer.current && payer.current !== result.payerId)) throw new Error('Saved-card session changed. Sign in again.')
    payer.current = result.payerId
    if (sessionTimer.current) clearTimeout(sessionTimer.current)
    const id = generation.current
    sessionTimer.current = setTimeout(() => {
      if (alive.current && generation.current === id) { reset(); setToken(''); setMessage('Session expired. Sign in again.') }
    }, Math.min(expiry - Date.now(), 2147483647))
  }
  const publish = (result: Context & SavedCardSelection, selector = '') => {
    validate(result)
    const expiry = Math.min(Date.parse(result.expiresAt || ''), Date.parse(result.sessionExpiresAt))
    if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new Error('Confirm your card choice again.')
    clearSelection(); setSelected(selector)
    change.current({ sdk: result.sdk, network: result.network, last4: result.last4, cvvRequired: result.sdk.token ? result.cvvRequired !== false : undefined, expiresAt: new Date(expiry).toISOString() })
    const id = generation.current
    expiryTimer.current = setTimeout(() => {
      if (alive.current && generation.current === id) { clearSelection(); resetSaveRequested(); setMessage('Card choice expired. Confirm it again.') }
    }, expiry - Date.now())
  }
  const request = <T,>(path: string, body?: object, method = 'POST') => checkoutRequest<T>(`${BASE}${path}`, {
    method: body ? method : 'GET', credentials: 'omit', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const act = async (work: (current: () => boolean) => Promise<void>) => {
    if (locked.current || disabled) return
    const id = generation.current
    const current = () => alive.current && generation.current === id
    pending.current += 1; locked.current = true; setBusy(true); busyCallback.current?.(true); setMessage('')
    try { await work(current) } catch (error: any) { if (current()) {
      clearSelection(); resetSaveRequested()
      if (error?.status === 401) { reset(); setToken('') }
      setMessage(error?.message || 'Saved cards are unavailable.')
    } }
    finally { finishWork() }
  }
  useEffect(() => {
    if (!token) return
    const id = generation.current
    let mounted = true
    if (bootstrap.current) bootstrap.current = false
    else pending.current += 1
    locked.current = true; setBusy(true); busyCallback.current?.(true)
    void request<Context & { available: boolean; consent: { text: string; version: string } }>('/config').then(async (config) => {
      if (!mounted || generation.current !== id) return
      validate(config)
      if (!config.available) throw new Error('Saved cards are unavailable in this payment mode.')
      const result = await request<Context & { cards: Card[] }>('/')
      if (mounted && generation.current === id) { validate(result); setConsent(config.consent); setCards(result.cards) }
    }).catch((error) => { if (mounted && generation.current === id) { clearSelection(); resetSaveRequested(); setMessage(error.message); if (error.status === 401) { reset(); setToken('') } } }).finally(() => {
      finishWork()
    })
    return () => { mounted = false }
  }, [token, reload])

  if (presentation === 'list' && (!token || !cards.length)) return null
  return <div className={styles.fields}>
    <h4>{presentation === 'list' ? 'Recommended' : 'Saved cards'}</h4>
    {!token ? <>
      <label>Your mobile number<input type="tel" autoComplete="tel" value={phone} readOnly={mode === 'TEST'} disabled={busy || disabled} onChange={(event) => { setPhone(event.target.value); setOtpSent(false); if (otpInput.current) otpInput.current.value = '' }} /></label>
      <button type="button" disabled={busy || disabled || !phone || (mode === 'TEST' && (!approvedTestContact || phone !== approvedTestContact))} onClick={() => void act(async (current) => {
        await checkoutRequest(`${API}/auth/send-otp`, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) })
        if (current()) { setOtpSent(true); setMessage('Enter the verification code sent to your mobile number.') }
      })}>Sign in to view saved cards</button>
      {otpSent && <>
        <label>Verification code<input ref={otpInput} type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6} disabled={busy || disabled} /></label>
        <button type="button" disabled={busy || disabled} onClick={() => void act(async (current) => {
          const otp = otpInput.current?.value || ''
          if (otpInput.current) otpInput.current.value = ''
          const result = await checkoutRequest<{ token: string }>(`${API}/auth/verify-otp`, {
            method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, otp }),
          })
          if (current() && result.token) {
            // Transfer a work lease to config/list loading without unlocking Pay.
            pending.current += 1; bootstrap.current = true
            setOtpSent(false); setToken(result.token)
          } else if (result.token) {
            await checkoutRequest(`${API}/auth/logout`, { method: 'POST', credentials: 'omit', headers: { Authorization: `Bearer ${result.token}`, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {})
          }
        })}>Verify and view cards</button>
      </>}
    </> : <>
      <button type="button" disabled={disabled || busy} onClick={() => {
        clearSelection(); resetSaveRequested(); setCards([]); setConsent(null)
        pending.current += 1; bootstrap.current = true; locked.current = true; setBusy(true); busyCallback.current?.(true)
        setReload((value) => value + 1)
      }}>Refresh saved cards</button>
      <button type="button" disabled={disabled || busy} onClick={() => void act(async (current) => {
        clearSelection(); resetSaveRequested()
        await checkoutRequest(`${API}/auth/logout`, { method: 'POST', credentials: 'omit', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' })
        if (current()) { reset(); setToken(''); setMessage('Saved-card session signed out and revoked.') }
      })}>Sign out of saved cards</button>
      {consent && !cards.length && <p>No saved cards.</p>}
      {cards.map((card) => <div key={card.selector}>
        <button type="button" disabled={disabled || busy || !card.selectable} aria-pressed={selected === card.selector} onClick={() => void act(async (current) => {
          clearSelection(); resetSaveRequested()
          const result = await request<Context & SavedCardSelection>('/select', { mode, keyId, selector: card.selector })
          if (current()) publish(result, card.selector)
        })}>{card.network || 'Card'} ending {card.last4 || 'unavailable'}</button>
        <button type="button" disabled={disabled || busy} aria-label={`Remove saved ${card.network || 'card'} ending ${card.last4 || 'unavailable'}`} onClick={() => void act(async (current) => {
          clearSelection(); resetSaveRequested()
          const deleted = await request<Context>('/', { mode, keyId, selector: card.selector }, 'DELETE')
          if (!current()) return
          validate(deleted)
          const result = await request<Context & { cards: Card[] }>('/')
          if (current()) { validate(result); setCards(result.cards) }
        })}>Remove</button>
      </div>)}
      {selected && <button type="button" disabled={disabled || busy} onClick={() => { clearSelection(); resetSaveRequested() }}>Use a new card</button>}
      {presentation === 'card' && !selected && consent && <>
        <label><input type="checkbox" checked={granted} disabled={disabled || busy} onChange={(event) => { setSaveRequested(event.target.checked); clearSelection() }} />{consent.text}</label>
        <button type="button" disabled={disabled || busy} onClick={() => void act(async (current) => {
          clearSelection()
          const receipt = await request<Context & { consentId: string }>('/consents', { mode, keyId, granted, wordingVersion: consent.version, requestId: crypto.randomUUID() })
          if (!current()) return
          validate(receipt)
          const result = await request<Context & SavedCardSelection>('/prepare', { mode, keyId, consentId: receipt.consentId })
          if (current()) { publish(result); setMessage(granted ? 'Save-card choice confirmed for this payment.' : 'This card will not be saved.') }
        })}>Confirm {granted ? 'save-card' : 'do not save'} choice</button>
      </>}
    </>}
    {message && <p role="status">{message}</p>}
  </div>
}
