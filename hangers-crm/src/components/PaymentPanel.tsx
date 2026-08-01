'use client'
import { useState, useEffect } from 'react'
import api, { idempotencyConfig, metadataAPI, paymentsAPI } from '@/lib/api'
import toast from 'react-hot-toast'
import { CheckCircle2, CreditCard, IndianRupee, RotateCcw, Wallet } from 'lucide-react'

interface Props {
  orderId:          string
  customerId?:      string
  totalAmount:      number
  paidAmount:       number
  paymentStatus:    string
  onPaymentRecorded: () => void
  writeOffAlreadyDone?: number
  payments?: any[]
  canRefund?: boolean
}

export default function PaymentPanel({ orderId, customerId, totalAmount, paidAmount, paymentStatus, onPaymentRecorded, writeOffAlreadyDone = 0, payments = [], canRefund = false }: Props) {
  const [amount, setAmount]           = useState('')
  const [method, setMethod]           = useState('CASH')
  const [loading, setLoading]         = useState(false)
  const [writeOff, setWriteOff]       = useState(false)
  const [writeOffReason, setWriteOffReason] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [writeOffOnlyReason, setWriteOffOnlyReason] = useState('')
  const [writeOffMax, setWriteOffMax] = useState(50)
  const [paymentStatusMeta, setPaymentStatusMeta] = useState<Record<string, { label: string; color: string; bg: string }>>({})
  const [paymentMethods, setPaymentMethods] = useState<Array<{ value: string; label: string }>>([{ value: 'CASH', label: 'Cash' }])
  const [showRefund, setShowRefund] = useState(false)
  const [refundSourceId, setRefundSourceId] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [refundMethod, setRefundMethod] = useState('CASH')
  const [refundReasonCode, setRefundReasonCode] = useState('CUSTOMER_REFUND')
  const [refundReason, setRefundReason] = useState('')
  const [showCorrection, setShowCorrection] = useState(false)
  const [correctionPaymentId, setCorrectionPaymentId] = useState('')
  const [correctionReason, setCorrectionReason] = useState('')

  const balance = Math.max(0, totalAmount - paidAmount - (writeOffAlreadyDone || 0))

  // Auto-detect write-off when amount typed
  const paid        = parseFloat(amount) || 0
  const remaining   = balance - paid
  const canWriteOff = amount !== '' && paid > 0 && remaining > 0 && remaining <= writeOffMax
  const capturedReceipts = payments.filter((payment) => payment.kind !== 'REFUND' && ['CAPTURED', 'SUCCESS', 'PAID'].includes(payment.status))
  const refundedFor = (paymentId: string) => payments
    .filter((payment) => payment.kind === 'REFUND' && payment.reversalOfId === paymentId && ['CAPTURED', 'SUCCESS', 'PAID'].includes(payment.status))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const refundableReceipts = capturedReceipts.filter((payment) => Number(payment.amount || 0) - refundedFor(payment.id) > 0.005)
  const reversibleReceipts = capturedReceipts.filter((payment) => refundedFor(payment.id) <= 0.005)
  const selectedCorrectionPayment = reversibleReceipts.find((payment) => payment.id === correctionPaymentId)

  useEffect(() => {
    // Load write-off max from settings
    ;(api as any).get('/settings/public').then((r: any) => {
      if (r?.writeoff_max_amount) setWriteOffMax(parseFloat(r.writeoff_max_amount))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    metadataAPI.getAll().then((response: any) => {
      const metadata = response?.metadata || response?.data?.metadata || {}
      const collectableMethods = metadata.collectablePaymentMethods || (metadata.paymentMethods || []).filter((item: any) => (metadata.corePaymentMethods || []).includes(item.value))
      if (collectableMethods.length) {
        setPaymentMethods(collectableMethods.map((item: any) => ({ value: item.value, label: item.label || item.value })))
        setMethod((current) => collectableMethods.some((item: any) => item.value === current) ? current : collectableMethods[0].value)
      }
      setPaymentStatusMeta((metadata.paymentStatuses || []).reduce((acc: Record<string, { label: string; color: string; bg: string }>, item: any) => {
        acc[item.value] = {
          label: item.label || item.value,
          color: item.color || '#023c62',
          bg: item.bg || '#f4f7fb',
        }
        return acc
      }, {}))
    }).catch(() => {})
  }, [])

  // Reset write-off when amount changes
  useEffect(() => {
    if (!canWriteOff) setWriteOff(false)
  }, [amount, canWriteOff])

  const handleSubmit = async () => {
    if (!amount || paid <= 0) { toast.error('Enter a valid amount'); return }
    if (paid > balance) { toast.error(`Amount cannot exceed the ₹${balance.toFixed(2)} balance`); return }
    if (writeOff && writeOffReason.trim().length < 3) { toast.error('Enter a write-off reason'); return }
    setLoading(true)
    try {
      const writeOffAmount = writeOff ? remaining : 0
      await (api as any).post(`/orders/${orderId}/payments`, {
        amount: paid,
        method,
        effectiveAt: `${paymentDate}T12:00:00.000Z`,
        ...(writeOffAmount > 0 ? { writeOffAmount } : {}),
        ...(writeOff && writeOffReason.trim() ? { writeOffReason: writeOffReason.trim() } : {}),
      }, idempotencyConfig('crm-order-payment'))
      if (writeOff && writeOffAmount > 0) {
        toast.success(`Payment recorded. ₹${writeOffAmount} written off.`)
      } else {
        toast.success('Payment recorded')
      }
      setAmount('')
      setWriteOff(false)
      setWriteOffReason('')
      onPaymentRecorded()
    } catch (e: any) {
      toast.error(e.message || 'Failed to record payment')
    } finally {
      setLoading(false)
    }
  }

  const handleWriteOffOnly = async () => {
    if (!(balance > 0)) { toast.error('No balance to write off'); return }
    if (writeOffOnlyReason.trim().length < 3) { toast.error('Enter a write-off reason'); return }
    setLoading(true)
    try {
      await (api as any).post(`/orders/${orderId}/payments`, {
        amount: 0,
        writeOffAmount: balance,
        writeOffReason: writeOffOnlyReason.trim(),
        effectiveAt: `${paymentDate}T12:00:00.000Z`,
      }, idempotencyConfig('crm-order-writeoff'))
      toast.success(`₹${balance.toFixed(2)} written off`)
      setWriteOffOnlyReason('')
      onPaymentRecorded()
    } catch (e: any) {
      toast.error(e.message || 'Failed to write off balance')
    } finally {
      setLoading(false)
    }
  }

  const handleRefund = async () => {
    const source = refundableReceipts.find((payment) => payment.id === refundSourceId)
    const value = Number(refundAmount)
    const available = source ? Number(source.amount || 0) - refundedFor(source.id) : 0
    if (!source) { toast.error('Choose the captured payment to refund'); return }
    if (!(value > 0) || value > available) { toast.error(`Refund must be between ₹0.01 and ₹${available.toFixed(2)}`); return }
    if (refundReason.trim().length < 3) { toast.error('Enter a refund reason'); return }
    setLoading(true)
    try {
      await paymentsAPI.refund(orderId, {
        sourcePaymentId: source.id,
        amount: value,
        method: refundMethod,
        reasonCode: refundReasonCode,
        reason: refundReason.trim(),
      })
      toast.success('Refund and credit note posted')
      setRefundAmount('')
      setRefundReason('')
      setShowRefund(false)
      onPaymentRecorded()
    } catch (e: any) {
      toast.error(e.message || 'Failed to post refund')
    } finally {
      setLoading(false)
    }
  }

  const handleCorrection = async () => {
    const source = reversibleReceipts.find((payment) => payment.id === correctionPaymentId)
    if (!source) { toast.error('Choose the mistaken payment entry'); return }
    if (correctionReason.trim().length < 3) { toast.error('Enter a correction reason'); return }
    setLoading(true)
    try {
      await paymentsAPI.reverse(orderId, source.id, { reason: correctionReason.trim() })
      toast.success('Mistaken payment entry voided. Order balance restored.')
      setCorrectionReason('')
      setShowCorrection(false)
      onPaymentRecorded()
    } catch (e: any) {
      toast.error(e.message || 'Failed to reverse payment entry')
    } finally {
      setLoading(false)
    }
  }

  const statusStyle = paymentStatusMeta[paymentStatus] || {
    label: paymentStatus,
    color: '#023c62',
    bg: '#f4f7fb',
  }

  return (
    <div style={{ background:'#fff', borderRadius:20, padding:24, border:'1px solid #e8f0f7', boxShadow:'0 2px 12px rgba(2,60,98,0.06)', marginBottom:16 }}>
      <div style={{ fontSize:11, color:'#6b7fa3', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:16, display:'flex', alignItems:'center', gap:6 }}>
        <IndianRupee size={14} />
        <span>Payment</span>
      </div>

      {/* Summary */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:16 }}>
        {[
          { label:'Total',   value:`₹${totalAmount.toLocaleString('en-IN')}` },
          { label:'Paid',    value:`₹${paidAmount.toLocaleString('en-IN')}` },
          { label:'Balance', value:`₹${balance.toLocaleString('en-IN')}` },
        ].map(item => (
          <div key={item.label} style={{ background:'#f4f7fb', borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
            <div style={{ fontSize:10, color:'#6b7fa3', marginBottom:4 }}>{item.label}</div>
            <div style={{ fontWeight:700, color:'#023c62', fontSize:14 }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Status badge */}
      <div style={{ marginBottom:16 }}>
        <span style={{
          background: statusStyle.bg,
          color: statusStyle.color,
          padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:700
        }}>
          {statusStyle.label}
        </span>
      </div>

      {payments.length > 0 && (
        <div style={{ borderTop:'1px solid #e8f0f7', paddingTop:16, marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#023c62', marginBottom:10 }}>Payment History</div>
          <div style={{ display:'grid', gap:8 }}>
            {payments.map((payment) => {
              const isReceipt = payment.kind !== 'REFUND'
              const isCaptured = isReceipt && ['CAPTURED', 'SUCCESS', 'PAID'].includes(payment.status)
              const isVoided = ['VOIDED', 'REVERSED'].includes(payment.status)
              const refunded = refundedFor(payment.id)
              const canVoidEntry = canRefund && isCaptured && refunded <= 0.005
              return (
                <div key={payment.id} style={{ border:'1px solid #e8f0f7', borderRadius:10, padding:'10px 12px', background:isVoided ? '#f8fafc' : '#fff' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'flex-start' }}>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:800, color:isVoided ? '#64748b' : '#142033' }}>
                        ₹{Number(payment.amount || 0).toFixed(2)} · {payment.method}
                      </div>
                      <div style={{ fontSize:11, color:'#6b7fa3', marginTop:3 }}>
                        {payment.kind || 'RECEIPT'} · {payment.status} · {new Date(payment.createdAt).toLocaleString('en-IN')}
                      </div>
                      {payment.reversalReason && <div style={{ fontSize:11, color:'#9a3412', marginTop:3 }}>Correction: {payment.reversalReason}</div>}
                      {refunded > 0 && <div style={{ fontSize:11, color:'#991b1b', marginTop:3 }}>₹{refunded.toFixed(2)} already refunded/credited</div>}
                    </div>
                    {canVoidEntry && (
                      <button onClick={() => { setCorrectionPaymentId(payment.id); setShowCorrection(true); setShowRefund(false) }}
                        style={{ flexShrink:0, padding:'6px 9px', border:'1px solid #fed7aa', background:'#fff7ed', color:'#9a3412', borderRadius:8, fontSize:11, fontWeight:800, cursor:'pointer' }}>
                        Void mistaken entry
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Record payment form */}
      {balance > 0 && (
        <div style={{ borderTop:'1px solid #e8f0f7', paddingTop:16 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'#023c62', marginBottom:10 }}>Record Payment</div>
          <div style={{ display:'flex', gap:8, marginBottom:8 }}>
            <input
              type="number"
              placeholder={`Amount`}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{ flex:1, padding:'8px 12px', border:'1.5px solid #dce8f0', borderRadius:8, fontSize:13, outline:'none' }}
            />
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              style={{ padding:'8px 12px', border:'1.5px solid #dce8f0', borderRadius:8, fontSize:13, background:'#fff', outline:'none' }}
            >
              {paymentMethods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <input type="date" value={paymentDate} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setPaymentDate(event.target.value)}
            style={{ width:'100%', boxSizing:'border-box', marginBottom:8, padding:'8px 10px', border:'1.5px solid #dce8f0', borderRadius:8, fontSize:12, outline:'none' }} />

          {/* Balance display */}
          {amount && (
            <div style={{ marginBottom: 8 }}>
              {paid > balance ? (
                <div style={{ fontSize: 12, color: '#991b1b', padding: '6px 10px', background: '#fef2f2', borderRadius: 6 }}>
                  Amount exceeds the balance by ₹{(paid - balance).toLocaleString('en-IN')}. Record only the amount due.
                </div>
              ) : paid < balance ? (
                <div style={{ fontSize: 12, color: '#991b1b', padding: '6px 10px', background: '#fef2f2', borderRadius: 6 }}>
                  ₹{remaining.toLocaleString('en-IN')} still due
                </div>
              ) : null}
            </div>
          )}

          {/* Write-off toggle */}
          {canWriteOff && (
            <div style={{ marginBottom:10 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', background: writeOff ? '#f0fdf4' : '#fefce8', borderRadius:8, border:`1px solid ${writeOff ? '#86efac' : '#fde047'}`, cursor:'pointer' }}
                onClick={() => setWriteOff(!writeOff)}>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color: writeOff ? '#166534' : '#713f12' }}>Write off ₹{remaining.toFixed(0)}</div>
                  <div style={{ fontSize:11, color: writeOff ? '#166534' : '#92400e' }}>{writeOff ? 'Approved write-off will settle the balance' : 'Tap to request an approved write-off'}</div>
                </div>
                <div style={{ width:44, height:24, borderRadius:12, background: writeOff ? '#16a34a' : '#d1d5db', position:'relative', flexShrink:0 }}>
                  <div style={{ position:'absolute', top:2, left: writeOff ? 22 : 2, width:20, height:20, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,0.2)', transition:'left 0.2s' }} />
                </div>
              </div>
              {writeOff && <input value={writeOffReason} onChange={e => setWriteOffReason(e.target.value)} placeholder="Required write-off reason" maxLength={500}
                style={{ width:'100%', boxSizing:'border-box', marginTop:8, padding:'8px 10px', border:'1.5px solid #dce8f0', borderRadius:8, fontSize:12, outline:'none' }} />}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ width:'100%', padding:'10px', background:'#023c62', color:'#fff', border:'none', borderRadius:8, fontWeight:700, fontSize:13, cursor:'pointer', opacity: loading ? 0.7 : 1, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8 }}
          >
            {loading ? 'Recording...' : writeOff ? <><Wallet size={15} /> {`Pay ₹${paid} + Write Off ₹${remaining.toFixed(0)}`}</> : <><CreditCard size={15} /> Record Payment</>}
          </button>
          <div style={{ marginTop:12, paddingTop:12, borderTop:'1px dashed #dce8f0' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#9a3412', marginBottom:6 }}>Write off remaining balance only</div>
            <input value={writeOffOnlyReason} onChange={(event) => setWriteOffOnlyReason(event.target.value)} maxLength={500} placeholder={`Reason to write off ₹${balance.toFixed(2)}`}
              style={{ width:'100%', boxSizing:'border-box', marginBottom:8, padding:'8px 10px', border:'1.5px solid #fed7aa', borderRadius:8, fontSize:12, outline:'none' }} />
            <button onClick={handleWriteOffOnly} disabled={loading}
              style={{ width:'100%', padding:'9px 10px', background:'#fff7ed', color:'#9a3412', border:'1px solid #fed7aa', borderRadius:8, fontWeight:800, fontSize:12, cursor:'pointer', opacity:loading ? 0.65 : 1 }}>
              Write Off ₹{balance.toFixed(2)}
            </button>
          </div>
        </div>
      )}

      {paymentStatus === 'PAID' && (
        <div style={{ background:'#e6f7f0', borderRadius:10, padding:12, textAlign:'center', color:'#0d7a4e', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          <CheckCircle2 size={16} />
          <span>Fully Paid</span>
        </div>
      )}

      {canRefund && refundableReceipts.length > 0 && (
        <div style={{ borderTop:'1px solid #e8f0f7', marginTop:16, paddingTop:16 }}>
          <button onClick={() => { setShowRefund((value) => !value); if (!refundSourceId) setRefundSourceId(refundableReceipts[0]?.id || '') }} style={{ width:'100%', padding:'9px 12px', border:'1px solid #fecaca', background:'#fff7f7', color:'#991b1b', borderRadius:8, fontWeight:700, fontSize:12, cursor:'pointer', display:'flex', justifyContent:'center', alignItems:'center', gap:7 }}>
            <RotateCcw size={14} /> {showRefund ? 'Close Refund Form' : 'Refund / Credit Note'}
          </button>
          {showRefund && <div style={{ marginTop:10, display:'grid', gap:8 }}>
            <select value={refundSourceId} onChange={(event) => setRefundSourceId(event.target.value)} style={{ padding:'8px 10px', border:'1.5px solid #fecaca', borderRadius:8, background:'#fff', fontSize:12 }}>
              {refundableReceipts.map((payment) => <option key={payment.id} value={payment.id}>₹{(Number(payment.amount || 0) - refundedFor(payment.id)).toFixed(2)} available · {payment.method} · {new Date(payment.createdAt).toLocaleDateString('en-IN')}</option>)}
            </select>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <input type="number" min="0.01" step="0.01" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} placeholder="Refund amount" style={{ padding:'8px 10px', border:'1.5px solid #fecaca', borderRadius:8, fontSize:12 }} />
              <select value={refundMethod} onChange={(event) => setRefundMethod(event.target.value)} style={{ padding:'8px 10px', border:'1.5px solid #fecaca', borderRadius:8, background:'#fff', fontSize:12 }}>
                {paymentMethods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <select value={refundReasonCode} onChange={(event) => setRefundReasonCode(event.target.value)} style={{ padding:'8px 10px', border:'1.5px solid #fecaca', borderRadius:8, background:'#fff', fontSize:12 }}>
              <option value="CUSTOMER_REFUND">Customer refund</option><option value="ORDER_CANCELLATION">Order cancellation</option><option value="SERVICE_FAILURE">Service failure</option><option value="DUPLICATE_CHARGE">Duplicate charge</option><option value="PRICE_CORRECTION">Price correction</option><option value="OTHER">Other</option>
            </select>
            <input value={refundReason} onChange={(event) => setRefundReason(event.target.value)} maxLength={500} placeholder="Required refund reason" style={{ padding:'8px 10px', border:'1.5px solid #fecaca', borderRadius:8, fontSize:12 }} />
            <button onClick={handleRefund} disabled={loading} style={{ padding:'9px 12px', border:'none', background:'#991b1b', color:'#fff', borderRadius:8, fontWeight:700, fontSize:12, cursor:'pointer', opacity:loading ? 0.65 : 1 }}>{loading ? 'Posting...' : 'Post Refund and Credit Note'}</button>
          </div>}
        </div>
      )}

      {canRefund && reversibleReceipts.length > 0 && (
        <div style={{ borderTop:'1px solid #e8f0f7', marginTop:16, paddingTop:16 }}>
          <button onClick={() => { setShowCorrection((value) => !value); if (!correctionPaymentId) setCorrectionPaymentId(reversibleReceipts[0]?.id || '') }} style={{ width:'100%', padding:'9px 12px', border:'1px solid #fed7aa', background:'#fff7ed', color:'#9a3412', borderRadius:8, fontWeight:700, fontSize:12, cursor:'pointer', display:'flex', justifyContent:'center', alignItems:'center', gap:7 }}>
            <RotateCcw size={14} /> {showCorrection ? 'Close Correction Form' : 'Void Mistaken Payment Entry'}
          </button>
          {showCorrection && <div style={{ marginTop:10, display:'grid', gap:8 }}>
            <div style={{ fontSize:11, color:'#9a3412', lineHeight:1.45, background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:8, padding:'8px 10px' }}>
              Use this only when payment was marked by mistake. No money is returned to the customer; the receipt is voided and the order balance is restored.
            </div>
            <select value={correctionPaymentId} onChange={(event) => setCorrectionPaymentId(event.target.value)} style={{ padding:'8px 10px', border:'1.5px solid #fed7aa', borderRadius:8, background:'#fff', fontSize:12 }}>
              {reversibleReceipts.map((payment) => <option key={payment.id} value={payment.id}>₹{Number(payment.amount || 0).toFixed(2)} · {payment.method} · {new Date(payment.createdAt).toLocaleDateString('en-IN')}</option>)}
            </select>
            {selectedCorrectionPayment && (
              <div style={{ fontSize:11, color:'#6b7fa3', background:'#f8fafc', border:'1px solid #e8f0f7', borderRadius:8, padding:'8px 10px' }}>
                Selected entry: ₹{Number(selectedCorrectionPayment.amount || 0).toFixed(2)} {selectedCorrectionPayment.method} recorded on {new Date(selectedCorrectionPayment.createdAt).toLocaleString('en-IN')}.
              </div>
            )}
            <input value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} maxLength={500} placeholder="Required correction reason, e.g. Cash selected by mistake" style={{ padding:'8px 10px', border:'1.5px solid #fed7aa', borderRadius:8, fontSize:12 }} />
            <button onClick={handleCorrection} disabled={loading} style={{ padding:'9px 12px', border:'none', background:'#9a3412', color:'#fff', borderRadius:8, fontWeight:700, fontSize:12, cursor:'pointer', opacity:loading ? 0.65 : 1 }}>{loading ? 'Voiding...' : 'Void Payment Entry'}</button>
          </div>}
        </div>
      )}
    </div>
  )
}
