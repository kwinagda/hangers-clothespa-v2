'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { customersAPI, statsAPI, ordersAPI, walletAPI } from '@/lib/api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  VIP:       { bg: '#fef9c3', color: '#854d0e' },
  CORPORATE: { bg: '#dbeafe', color: '#1e40af' },
  REGULAR:   { bg: '#f3f4f6', color: '#374151' },
  NEW:       { bg: '#dcfce7', color: '#166534' },
  INACTIVE:  { bg: '#fee2e2', color: '#991b1b' },
}
const fmt = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const s = { fontFamily: "'DM Sans',sans-serif" }

type Tab = 'overview' | 'wallet' | 'addresses' | 'orders'

export default function CustomerProfilePage() {
  const { id } = useParams()
  const router  = useRouter()

  const [customer, setCustomer]     = useState<any>(null)
  const [stats, setStats]           = useState<any>(null)
  const [orders, setOrders]         = useState<any[]>([])
  const [wallet, setWallet]         = useState<any>(null)
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState<Tab>('overview')

  // Edit state
  const [editing, setEditing]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [editForm, setEditForm]     = useState<any>({})

  // Wallet modal
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [walletAction, setWalletAction]       = useState<'credit' | 'deduct'>('credit')
  const [walletAmount, setWalletAmount]       = useState('')
  const [walletReason, setWalletReason]       = useState('')
  const [walletLoading, setWalletLoading]     = useState(false)

  // Address modal
  const [showAddressModal, setShowAddressModal] = useState(false)
  const [addresses, setAddresses]               = useState<any[]>([])
  const [addrForm, setAddrForm] = useState({ label: 'Home', address: '', line1: '', landmark: '', city: 'Mumbai', pincode: '', lat: '', lng: '' })
  const [addrLoading, setAddrLoading]           = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [c, st, o, w] = await Promise.all([
        customersAPI.get(id as string),
        statsAPI.customer(id as string),
        ordersAPI.list({ customerId: id, limit: 10 }),
        walletAPI.get(id as string),
      ])
      const cust = c.data?.customer || c.data
      setCustomer(cust)
      setEditForm({
        name:           cust?.name || '',
        dob:            cust?.dob ? cust.dob.split('T')[0] : '',
        mapLocation:    cust?.mapLocation || '',
        tag:            cust?.tag || 'REGULAR',
        notes:          cust?.notes || '',
        notifWhatsApp:  cust?.notifWhatsApp !== false,
      })
      setStats(st.data)
      setOrders(o.data?.orders || [])
      setWallet(w.data)
      setAddresses(cust?.savedAddresses || cust?.addresses || [])
    } catch { toast.error('Failed to load customer') }
    setLoading(false)
  }, [id])

  useEffect(() => { loadAll() }, [loadAll])

  const saveEdit = async () => {
    setSaving(true)
    try {
      await customersAPI.update(id as string, editForm)
      toast.success('Customer updated')
      setEditing(false)
      loadAll()
    } catch { toast.error('Failed to save') }
    setSaving(false)
  }

  const handleWalletAction = async () => {
    if (!walletAmount || parseFloat(walletAmount) <= 0) { toast.error('Enter a valid amount'); return }
    if (!walletReason) { toast.error('Enter a reason'); return }
    setWalletLoading(true)
    try {
      if (walletAction === 'credit') {
        await walletAPI.credit(id as string, { amount: parseFloat(walletAmount), reason: walletReason })
        toast.success(`₹${walletAmount} credited to wallet`)
      } else {
        await walletAPI.deduct(id as string, { amount: parseFloat(walletAmount), reason: walletReason })
        toast.success(`₹${walletAmount} deducted from wallet`)
      }
      setShowWalletModal(false)
      setWalletAmount('')
      setWalletReason('')
      loadAll()
    } catch (e: any) { toast.error(e.message || 'Failed') }
    setWalletLoading(false)
  }

  const saveAddress = async () => {
    if (!addrForm.address && !addrForm.line1) { toast.error('Enter an address'); return }
    setAddrLoading(true)
    try {
      const fullAddress = [addrForm.line1, addrForm.landmark, addrForm.city, addrForm.pincode].filter(Boolean).join(', ')
      await customersAPI.update(id as string, {
        savedAddresses: {
          create: {
            label:    addrForm.label,
            address:  addrForm.address || fullAddress,
            line1:    addrForm.line1,
            landmark: addrForm.landmark,
            city:     addrForm.city,
            pincode:  addrForm.pincode,
            lat:      addrForm.lat ? parseFloat(addrForm.lat) : null,
            lng:      addrForm.lng ? parseFloat(addrForm.lng) : null,
          }
        }
      })
      toast.success('Address saved')
      setShowAddressModal(false)
      setAddrForm({ label: 'Home', address: '', line1: '', landmark: '', city: 'Mumbai', pincode: '', lat: '', lng: '' })
      loadAll()
    } catch { toast.error('Failed to save address') }
    setAddrLoading(false)
  }

  if (loading) return <div style={{ padding: 40, color: '#6b7fa3', ...s }}>Loading...</div>
  if (!customer) return <div style={{ padding: 40, color: '#e53e3e', ...s }}>Customer not found</div>

  const tabBtn = (t: Tab, l: string, count?: number) => (
    <button onClick={() => setTab(t)} style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#023c62' : '#6b7fa3', boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
      {l}{count !== undefined ? ` (${count})` : ''}
    </button>
  )

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100, margin: '0 auto', ...s }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <button onClick={() => router.back()} style={{ fontSize: 13, color: '#6b7fa3', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 8, padding: 0 }}>← Back</button>
          <h1 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 26, color: '#023c62', margin: '0 0 4px' }}>
            {customer.name || 'Unknown Customer'}
          </h1>
          <p style={{ fontSize: 14, color: '#6b7fa3', margin: 0 }}>+91 {customer.phone}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: TAG_COLORS[customer.tag || 'REGULAR']?.bg, color: TAG_COLORS[customer.tag || 'REGULAR']?.color }}>
            {customer.tag || 'REGULAR'}
          </span>
          {!editing ? (
            <button onClick={() => setEditing(true)} style={{ padding: '8px 16px', border: '1px solid #023c62', borderRadius: 8, fontSize: 13, background: '#fff', color: '#023c62', cursor: 'pointer', fontWeight: 600 }}>
              Edit Profile
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditing(false)} style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', color: '#6b7fa3', cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveEdit} disabled={saving} style={{ padding: '8px 16px', background: '#023c62', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Orders', value: stats?.totalOrders || 0 },
          { label: 'Total Spend', value: fmt(stats?.totalSpend || 0) },
          { label: 'Outstanding', value: fmt(stats?.outstanding || 0), warn: (stats?.outstanding || 0) > 0 },
          { label: 'Wallet', value: fmt(wallet?.balance || 0), highlight: true },
          { label: 'Loyalty Pts', value: customer.loyaltyPoints || 0 },
        ].map(st => (
          <div key={st.label} style={{ background: st.highlight ? '#023c62' : '#fff', borderRadius: 12, border: '1px solid #e8f0f7', padding: '16px 14px' }}>
            <div style={{ fontSize: 11, color: st.highlight ? 'rgba(255,255,255,0.6)' : '#9dafc8', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{st.label}</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: st.highlight ? '#fff' : st.warn ? '#e53e3e' : '#023c62' }}>{st.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f1f5f9', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {tabBtn('overview', 'Overview')}
        {tabBtn('wallet', 'Wallet', wallet?.transactions?.length)}
        {tabBtn('addresses', 'Addresses', addresses.length)}
        {tabBtn('orders', 'Orders', stats?.totalOrders)}
      </div>

      {/* ── OVERVIEW TAB ─────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Details card */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8f0f7', padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#6b7fa3', marginBottom: 16, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Customer Details</div>
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                {[
                  { label: 'Name', key: 'name', type: 'text' },
                  { label: 'Date of Birth', key: 'dob', type: 'date' },
                  { label: 'Google Maps Location', key: 'mapLocation', type: 'text', placeholder: 'Paste Google Maps link or coordinates' },
                ].map((f: any) => (
                  <div key={f.key}>
                    <label style={{ fontSize: 12, color: '#6b7fa3', display: 'block', marginBottom: 4 }}>{f.label}</label>
                    <input type={f.type} value={editForm[f.key] || ''} onChange={e => setEditForm({ ...editForm, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, boxSizing: 'border-box' as const }} />
                  </div>
                ))}
                <div>
                  <label style={{ fontSize: 12, color: '#6b7fa3', display: 'block', marginBottom: 4 }}>Tag</label>
                  <select value={editForm.tag} onChange={e => setEditForm({ ...editForm, tag: e.target.value })}
                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                    {['REGULAR','VIP','CORPORATE','NEW','INACTIVE'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#6b7fa3', display: 'block', marginBottom: 4 }}>Notes</label>
                  <textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, height: 70, resize: 'none' as const, boxSizing: 'border-box' as const }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13 }}>WhatsApp Notifications</span>
                  <button onClick={() => setEditForm({ ...editForm, notifWhatsApp: !editForm.notifWhatsApp })}
                    style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: editForm.notifWhatsApp ? '#dcfce7' : '#fee2e2', color: editForm.notifWhatsApp ? '#166534' : '#991b1b' }}>
                    {editForm.notifWhatsApp ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {[
                  ['Phone', `+91 ${customer.phone}`],
                  ['Date of Birth', customer.dob ? format(new Date(customer.dob), 'dd MMM yyyy') : '—'],
                  ['Member Since', format(new Date(customer.createdAt), 'dd MMM yyyy')],
                  ['Tag', customer.tag || 'REGULAR'],
                  ['WhatsApp Notif', customer.notifWhatsApp !== false ? '✓ Enabled' : '✗ Disabled'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                    <span style={{ color: '#9dafc8' }}>{k}</span>
                    <span style={{ fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
                {customer.mapLocation && (
                  <div style={{ marginTop: 10 }}>
                    <a href={customer.mapLocation} target="_blank" rel="noreferrer"
                      style={{ fontSize: 12, color: '#023c62', display: 'flex', alignItems: 'center', gap: 4 }}>
                      📍 View on Google Maps →
                    </a>
                  </div>
                )}
                {customer.notes && (
                  <div style={{ marginTop: 12, background: '#fefce8', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#713f12' }}>
                    📝 {customer.notes}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Quick actions */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8f0f7', padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#6b7fa3', marginBottom: 16, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Quick Actions</div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                <Link href={`/dashboard/orders/new?customerId=${id}`}
                  style={{ padding: '10px 16px', background: '#023c62', color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none', textAlign: 'center' as const }}>
                  + New Order
                </Link>
                <button onClick={() => { setWalletAction('credit'); setShowWalletModal(true) }}
                  style={{ padding: '10px 16px', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  + Add Wallet Credit
                </button>
                <button onClick={() => { setWalletAction('deduct'); setShowWalletModal(true) }}
                  style={{ padding: '10px 16px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  − Deduct Wallet
                </button>
                <button onClick={() => setTab('addresses')}
                  style={{ padding: '10px 16px', background: '#f8fafc', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  📍 Manage Addresses
                </button>
              </div>
            </div>
            {stats?.lastOrderDate && (
              <div style={{ background: '#eff6ff', borderRadius: 12, padding: 16, fontSize: 13, color: '#1d4ed8' }}>
                Last order: <strong>{format(new Date(stats.lastOrderDate), 'dd MMM yyyy')}</strong>
                {stats.lastOrderStatus && <> — <strong>{stats.lastOrderStatus}</strong></>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── WALLET TAB ───────────────────────────────────────────── */}
      {tab === 'wallet' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div style={{ background: '#023c62', borderRadius: 12, padding: 20, color: '#fff' }}>
              <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Wallet Balance</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 28 }}>{fmt(wallet?.balance || 0)}</div>
            </div>
            <button onClick={() => { setWalletAction('credit'); setShowWalletModal(true) }}
              style={{ background: '#f0fdf4', borderRadius: 12, padding: 20, border: '1px solid #bbf7d0', cursor: 'pointer', textAlign: 'left' as const }}>
              <div style={{ fontSize: 11, color: '#166534', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Add Credit</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 20, color: '#166534' }}>+ Credit</div>
            </button>
            <button onClick={() => { setWalletAction('deduct'); setShowWalletModal(true) }}
              style={{ background: '#fef2f2', borderRadius: 12, padding: 20, border: '1px solid #fca5a5', cursor: 'pointer', textAlign: 'left' as const }}>
              <div style={{ fontSize: 11, color: '#991b1b', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Deduct</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 20, color: '#991b1b' }}>− Deduct</div>
            </button>
          </div>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8f0f7', overflow: 'hidden' }}>
            {!wallet?.transactions?.length ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#9dafc8' }}>No wallet transactions yet</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: '#f8fafc' }}>
                  {['Date', 'Type', 'Amount', 'Reason', 'Order'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: '#9dafc8', textTransform: 'uppercase' as const, letterSpacing: '0.06em', borderBottom: '1px solid #e8f0f7' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {wallet.transactions.map((t: any) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '10px 16px', color: '#6b7fa3' }}>{format(new Date(t.createdAt), 'dd MMM yyyy, h:mm a')}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: t.type === 'CREDIT' ? '#dcfce7' : '#fee2e2', color: t.type === 'CREDIT' ? '#166534' : '#991b1b' }}>
                          {t.type}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', fontWeight: 700, color: t.type === 'CREDIT' ? '#166534' : '#991b1b' }}>
                        {t.type === 'CREDIT' ? '+' : '-'}{fmt(t.amount)}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#374151' }}>{t.reason}</td>
                      <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 11, color: '#023c62' }}>
                        {t.order?.orderNumber || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── ADDRESSES TAB ────────────────────────────────────────── */}
      {tab === 'addresses' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={() => setShowAddressModal(true)}
              style={{ padding: '10px 20px', background: '#023c62', color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
              + Add Address
            </button>
          </div>
          {!addresses.length ? (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8f0f7', padding: 40, textAlign: 'center', color: '#9dafc8' }}>No addresses saved yet</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
              {addresses.map((addr: any) => (
                <div key={addr.id} style={{ background: '#fff', borderRadius: 12, border: `1px solid ${addr.isDefault ? '#023c62' : '#e8f0f7'}`, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#023c62' }}>{addr.label}</span>
                    {addr.isDefault && <span style={{ fontSize: 10, background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>Default</span>}
                  </div>
                  {addr.line1 && <div style={{ fontSize: 13, color: '#374151', marginBottom: 2 }}>{addr.line1}</div>}
                  {addr.landmark && <div style={{ fontSize: 12, color: '#6b7fa3' }}>Near: {addr.landmark}</div>}
                  <div style={{ fontSize: 12, color: '#6b7fa3' }}>{[addr.city, addr.pincode].filter(Boolean).join(' - ')}</div>
                  {addr.address && !addr.line1 && <div style={{ fontSize: 12, color: '#6b7fa3', marginTop: 4 }}>{addr.address}</div>}
                  {addr.lat && addr.lng && (
                    <a href={`https://www.google.com/maps?q=${addr.lat},${addr.lng}`} target="_blank" rel="noreferrer"
                      style={{ fontSize: 11, color: '#023c62', display: 'inline-block', marginTop: 6 }}>
                      📍 View on Maps →
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ORDERS TAB ───────────────────────────────────────────── */}
      {tab === 'orders' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8f0f7', overflow: 'hidden' }}>
          {!orders.length ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9dafc8' }}>No orders yet</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#f8fafc' }}>
                {['Order #', 'Date', 'Status', 'Amount', 'Payment'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: '#9dafc8', textTransform: 'uppercase' as const, letterSpacing: '0.06em', borderBottom: '1px solid #e8f0f7' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {orders.map((o: any) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <Link href={`/dashboard/orders/${o.id}`} style={{ color: '#023c62', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>{o.orderNumber}</Link>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#6b7fa3' }}>{format(new Date(o.createdAt), 'dd MMM yy')}</td>
                    <td style={{ padding: '10px 16px' }}><span style={{ padding: '3px 8px', background: '#f1f5f9', borderRadius: 4, fontSize: 11 }}>{o.status}</span></td>
                    <td style={{ padding: '10px 16px', fontWeight: 600 }}>{fmt(o.totalAmount || 0)}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, background: o.paymentStatus === 'PAID' ? '#dcfce7' : '#fee2e2', color: o.paymentStatus === 'PAID' ? '#166534' : '#991b1b' }}>
                        {o.paymentStatus || 'UNPAID'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ padding: 12, borderTop: '1px solid #e8f0f7', textAlign: 'right' }}>
            <Link href={`/dashboard/orders?customerId=${id}`} style={{ fontSize: 13, color: '#023c62' }}>View all orders →</Link>
          </div>
        </div>
      )}

      {/* ── WALLET MODAL ─────────────────────────────────────────── */}
      {showWalletModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>
              {walletAction === 'credit' ? '+ Add Wallet Credit' : '− Deduct Wallet Balance'}
            </h2>
            <p style={{ fontSize: 13, color: '#6b7fa3', marginBottom: 20 }}>Current balance: <strong>{fmt(wallet?.balance || 0)}</strong></p>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: '#6b7fa3', display: 'block', marginBottom: 6 }}>Amount (₹) *</label>
                <input type="number" value={walletAmount} onChange={e => setWalletAmount(e.target.value)} placeholder="0"
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 16, fontWeight: 700, boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7fa3', display: 'block', marginBottom: 6 }}>Reason *</label>
                <select value={walletReason} onChange={e => setWalletReason(e.target.value)}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                  <option value="">Select reason</option>
                  {walletAction === 'credit' ? (
                    <>
                      <option value="Goodwill credit">Goodwill credit</option>
                      <option value="Refund">Refund</option>
                      <option value="Compensation">Compensation</option>
                      <option value="Overpayment refund">Overpayment refund</option>
                      <option value="Referral bonus">Referral bonus</option>
                      <option value="Manual adjustment">Manual adjustment</option>
                    </>
                  ) : (
                    <>
                      <option value="Applied to order">Applied to order</option>
                      <option value="Manual deduction">Manual deduction</option>
                      <option value="Admin adjustment">Admin adjustment</option>
                    </>
                  )}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setShowWalletModal(false)} style={{ padding: '8px 16px', fontSize: 13, color: '#6b7fa3', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleWalletAction} disabled={walletLoading}
                style={{ padding: '10px 20px', background: walletAction === 'credit' ? '#166534' : '#991b1b', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: walletLoading ? 0.5 : 1 }}>
                {walletLoading ? 'Processing...' : walletAction === 'credit' ? `Credit ₹${walletAmount || '0'}` : `Deduct ₹${walletAmount || '0'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADDRESS MODAL ────────────────────────────────────────── */}
      {showAddressModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' as const }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 20 }}>Add Address</h2>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
              {[
                { label: 'Label (e.g. Home, Office)', key: 'label', type: 'text' },
                { label: 'Building / Flat / Line 1', key: 'line1', type: 'text', placeholder: 'e.g. Flat 4B, Sunrise Apartments' },
                { label: 'Landmark', key: 'landmark', type: 'text', placeholder: 'e.g. Near Mulund Station' },
                { label: 'City', key: 'city', type: 'text' },
                { label: 'PIN Code', key: 'pincode', type: 'text' },
                { label: 'Latitude (optional)', key: 'lat', type: 'number', placeholder: 'e.g. 19.1648' },
                { label: 'Longitude (optional)', key: 'lng', type: 'number', placeholder: 'e.g. 72.9441' },
              ].map((f: any) => (
                <div key={f.key}>
                  <label style={{ fontSize: 12, color: '#6b7fa3', display: 'block', marginBottom: 6 }}>{f.label}</label>
                  <input type={f.type} value={(addrForm as any)[f.key]} onChange={e => setAddrForm({ ...addrForm, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, boxSizing: 'border-box' as const }} />
                </div>
              ))}
              <div style={{ background: '#eff6ff', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#1d4ed8' }}>
                💡 Tip: Open Google Maps, drop a pin, click Share → copy coordinates (lat, lng) for precise location.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setShowAddressModal(false)} style={{ padding: '8px 16px', fontSize: 13, color: '#6b7fa3', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveAddress} disabled={addrLoading}
                style={{ padding: '10px 20px', background: '#023c62', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: addrLoading ? 0.5 : 1 }}>
                {addrLoading ? 'Saving...' : 'Save Address'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
