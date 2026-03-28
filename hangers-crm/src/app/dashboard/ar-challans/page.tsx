'use client'
import { useEffect, useState } from 'react'
import { challanAPI, ordersAPI, vendorBillAPI, vendorPriceAPI, servicesAPI } from '@/lib/api'
import toast from 'react-hot-toast'

type Tab = 'challans' | 'transfers' | 'vendor-bills' | 'vendor-prices'

const SS: Record<string, { bg: string; color: string }> = {
  DISPATCHED: { bg: '#dbeafe', color: '#1e40af' },
  PROCESSED:  { bg: '#fef9c3', color: '#854d0e' },
  RECEIVED:   { bg: '#dcfce7', color: '#166534' },
  PARTIAL:    { bg: '#fff7ed', color: '#c2410c' },
  PENDING:    { bg: '#fef9c3', color: '#854d0e' },
  PAID:       { bg: '#dcfce7', color: '#166534' },
}
const fmt = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const badge = (status: string) => (
  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: SS[status]?.bg || '#f3f4f6', color: SS[status]?.color || '#374151' }}>
    {status}
  </span>
)

export default function ChallansPage() {
  const [tab, setTab]               = useState<Tab>('challans')
  const [challans, setChallans]     = useState<any[]>([])
  const [vendorBills, setVendorBills] = useState<any[]>([])
  const [vendorPrices, setVendorPrices] = useState<any[]>([])
  const [loading, setLoading]       = useState(false)

  // Challan creation
  const [showCreateChallan, setShowCreateChallan] = useState(false)
  const [challanPlant, setChallanPlant]     = useState('WADREX')
  const [challanDriver, setChallanDriver]   = useState('')
  const [challanVehicle, setChallanVehicle] = useState('')
  const [challanNotes, setChallanNotes]     = useState('')
  const [orderSearch, setOrderSearch]       = useState('')
  const [orderResults, setOrderResults]     = useState<any[]>([])
  const [selectedOrders, setSelectedOrders] = useState<any[]>([])
  const [creating, setCreating]             = useState(false)

  // Receive items
  const [showReceive, setShowReceive]           = useState(false)
  const [receivingChallan, setReceivingChallan] = useState<any>(null)
  const [receivedQtys, setReceivedQtys]         = useState<Record<string,number>>({})
  const [receiving, setReceiving]               = useState(false)

  // Vendor bill creation
  const [showCreateBill, setShowCreateBill]     = useState(false)
  const [billPlant, setBillPlant]               = useState('WADREX')
  const [selectedChallans, setSelectedChallans] = useState<Set<string>>(new Set())
  const [billNotes, setBillNotes]               = useState('')

  // Vendor prices
  const [pricesPlant, setPricesPlant]   = useState('WADREX')
  const [activePriceCatState, setActivePriceCatState] = useState('')
  const [priceEdits, setPriceEdits]     = useState<Record<string, string>>({})
  const [savingPrices, setSavingPrices] = useState(false)

  // Transfer modal

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [c, b] = await Promise.all([
        challanAPI.getAll(),
        vendorBillAPI.getAll(),
      ])
      setChallans(c.data || [])
      setVendorBills(b.data || [])
    } catch { toast.error('Failed to load') }
    setLoading(false)
  }

  const loadVendorPrices = async (plant: string) => {
    try {
      const [pricesRes, catalogRes] = await Promise.all([
        vendorPriceAPI.getAll(plant),
        servicesAPI.getCatalog()
      ])
      const existingPrices = pricesRes.data || []
      const priceMap: Record<string,number> = {}
      existingPrices.forEach((p: any) => { priceMap[p.serviceId] = p.costPrice })
      // Merge catalog with prices - show all items
      const merged = (catalogRes as any[]).map((item: any) => ({
        id: item.id,
        serviceId: item.id,
        serviceName: item.name,
        costPrice: priceMap[item.id] || 0,
        category: item.category,
      }))
      setVendorPrices(merged)
    } catch { }
  }

  useEffect(() => { if (tab === 'vendor-prices') loadVendorPrices(pricesPlant) }, [tab, pricesPlant])

  const searchOrders = async (q: string) => {
    if (q.length < 2) { setOrderResults([]); return }
    const r = await ordersAPI.list({ search: q, limit: 8 })
    setOrderResults(r.data?.orders || [])
  }

  const addOrder = (order: any) => {
    if (selectedOrders.find(o => o.id === order.id)) return
    setSelectedOrders([...selectedOrders, order])
    setOrderSearch('')
    setOrderResults([])
  }

  const removeOrder = (id: string) => setSelectedOrders(selectedOrders.filter(o => o.id !== id))

  const createChallan = async () => {
    if (!selectedOrders.length) { toast.error('Select at least one order'); return }
    setCreating(true)
    try {
      const r = await challanAPI.create({
        plant: challanPlant,
        orderIds: selectedOrders.map(o => o.id),
        driverName: challanDriver,
        vehicleNo: challanVehicle,
        notes: challanNotes
      })
      toast.success(`Challan ${r.data.challanNo} created — ${selectedOrders.length} orders sent to plant`)
      setShowCreateChallan(false)
      setSelectedOrders([])
      setChallanDriver('')
      setChallanVehicle('')
      setChallanNotes('')
      loadAll()
    } catch (e: any) { toast.error(e.message || 'Failed to create challan') }
    setCreating(false)
  }

  const openReceive = async (challan: any) => {
    // Fetch full challan with items
    const r = await challanAPI.getOne(challan.id)
    const full = r.data
    setReceivingChallan(full)
    const qtys: Record<string,number> = {}
    full.challanItems?.forEach((i: any) => { qtys[i.id] = i.receivedQty || 0 })
    setReceivedQtys(qtys)
    setShowReceive(true)
  }

  const submitReceive = async () => {
    setReceiving(true)
    try {
      const items = receivingChallan.challanItems?.map((i: any) => ({
        id: i.id,
        receivedQty: receivedQtys[i.id] || 0,
        totalQty: i.quantity
      })) || []
      const r = await challanAPI.receiveItems(receivingChallan.id, items)
      toast.success(r.data?.message || 'Items marked received')
      setShowReceive(false)
      loadAll()
    } catch (e: any) { toast.error(e.message || 'Failed') }
    setReceiving(false)
  }

  const createBill = async () => {
    if (!selectedChallans.size) { toast.error('Select challans'); return }
    try {
      const r = await vendorBillAPI.create({
        plant: billPlant,
        challanIds: Array.from(selectedChallans),
        notes: billNotes
      })
      toast.success(`Bill ${r.data.billNo} created`)
      setShowCreateBill(false)
      setSelectedChallans(new Set())
      loadAll()
    } catch (e: any) { toast.error(e.message || 'Failed') }
  }

  const markBillPaid = async (id: string) => {
    await vendorBillAPI.pay(id)
    toast.success('Bill marked as paid')
    loadAll()
  }

  const savePrices = async () => {
    setSavingPrices(true)
    try {
      const prices = Object.entries(priceEdits).map(([key, val]) => {
        const [serviceId, serviceName] = key.split('||')
        return { serviceId, serviceName, costPrice: parseFloat(val) || 0 }
      })
      await vendorPriceAPI.bulkSave(pricesPlant, prices)
      toast.success('Prices saved')
      loadVendorPrices(pricesPlant)
    } catch { toast.error('Failed') }
    setSavingPrices(false)
  }

  const tabBtn = (t: Tab, l: string) => (
    <button onClick={() => setTab(t)} style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#023c62' : '#6b7fa3', boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
      {l}
    </button>
  )

  const unbilledChallans = challans.filter((c: any) => !c.vendorBillId && c.plant === billPlant)

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1200, margin: '0 auto', fontFamily: "'DM Sans',sans-serif" }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 26, color: '#023c62', margin: '0 0 4px' }}>Plant Challans</h1>
          <p style={{ fontSize: 13, color: '#6b7fa3', margin: 0 }}>Manage plant dispatches and vendor billing</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {tab === 'challans' && <button onClick={() => setShowCreateChallan(true)} style={{ padding: '10px 20px', background: '#023c62', color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>+ New Challan</button>}
          {tab === 'vendor-bills' && <button onClick={() => setShowCreateBill(true)} style={{ padding: '10px 20px', background: '#166534', color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>+ Create Vendor Bill</button>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#f1f5f9', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {tabBtn('challans', 'Delivery Challans')}
        {tabBtn('vendor-bills', 'Vendor Bills')}
        {tabBtn('vendor-prices', 'Vendor Pricing')}
      </div>

      {/* CHALLANS */}
      {tab === 'challans' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8f0f7', overflow: 'hidden' }}>
          {!challans.length ? <div style={{ padding: 40, textAlign: 'center', color: '#9dafc8' }}>No challans yet. Create one from the Orders page or click + New Challan.</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#f8fafc' }}>
                {['Challan No', 'Orders', 'Plant', 'Driver', 'Customer Value', 'Vendor Cost', 'Date', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: '#9dafc8', textTransform: 'uppercase' as const, letterSpacing: '0.06em', borderBottom: '1px solid #e8f0f7' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {challans.map((c: any) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12, color: '#023c62', fontWeight: 700 }}>{c.challanNo}</td>
                    <td style={{ padding: '10px 16px' }}>
                      {c.challanOrders?.slice(0, 2).map((co: any) => (
                        <div key={co.id} style={{ fontSize: 11, color: '#023c62', fontFamily: 'monospace' }}>{co.order?.orderNumber}</div>
                      ))}
                      {(c.challanOrders?.length || 0) > 2 && <div style={{ fontSize: 10, color: '#9dafc8' }}>+{c.challanOrders.length - 2} more</div>}
                    </td>
                    <td style={{ padding: '10px 16px' }}>{c.plant}</td>
                    <td style={{ padding: '10px 16px', color: '#6b7fa3' }}>{c.driverName || '—'}</td>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: '#023c62' }}>{fmt(c.customerValue)}</td>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: '#991b1b' }}>{fmt(c.vendorCost)}</td>
                    <td style={{ padding: '10px 16px', color: '#6b7fa3' }}>{new Date(c.createdAt).toLocaleDateString('en-IN')}</td>
                    <td style={{ padding: '10px 16px' }}>{badge(c.status)}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {['DISPATCHED', 'PROCESSED', 'PARTIAL'].includes(c.status) && (
                          <button onClick={() => openReceive(c)} style={{ fontSize: 12, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontWeight: 600 }}>
                            Mark Received
                          </button>
                        )}
                        <a href={`http://localhost:3000/api/v1/challans/${c.id}/pdf`} target="_blank"
                          style={{ fontSize: 12, color: '#023c62', background: '#e8f0f7', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', textDecoration: 'none', fontWeight: 600 }}>
                          PDF
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* VENDOR BILLS */}
      {tab === 'vendor-bills' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {['WADREX', 'MAMTA'].map(plant => {
              const pb = vendorBills.filter((b: any) => b.plant === plant)
              const pending = pb.filter((b: any) => b.status === 'PENDING').reduce((s: number, b: any) => s + b.totalAmount, 0)
              return (
                <div key={plant} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8f0f7', padding: 20 }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: '#023c62', marginBottom: 12 }}>{plant}</div>
                  <div style={{ display: 'flex', gap: 20 }}>
                    <div><div style={{ fontSize: 11, color: '#9dafc8', marginBottom: 2 }}>PENDING</div><div style={{ fontWeight: 700, color: '#854d0e' }}>{fmt(pending)}</div></div>
                    <div><div style={{ fontSize: 11, color: '#9dafc8', marginBottom: 2 }}>TOTAL BILLS</div><div style={{ fontWeight: 700 }}>{pb.length}</div></div>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8f0f7', overflow: 'hidden' }}>
            {!vendorBills.length ? <div style={{ padding: 40, textAlign: 'center', color: '#9dafc8' }}>No vendor bills yet.</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: '#f8fafc' }}>
                  {['Bill No', 'Plant', 'Challans', 'Total Amount', 'Date', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: '#9dafc8', textTransform: 'uppercase' as const, letterSpacing: '0.06em', borderBottom: '1px solid #e8f0f7' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {vendorBills.map((b: any) => (
                    <tr key={b.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12, color: '#023c62', fontWeight: 700 }}>{b.billNo}</td>
                      <td style={{ padding: '10px 16px' }}>{b.plant}</td>
                      <td style={{ padding: '10px 16px', color: '#6b7fa3' }}>{b.challans?.length || 0} challans</td>
                      <td style={{ padding: '10px 16px', fontWeight: 700, color: '#991b1b' }}>{fmt(b.totalAmount)}</td>
                      <td style={{ padding: '10px 16px', color: '#6b7fa3' }}>{new Date(b.createdAt).toLocaleDateString('en-IN')}</td>
                      <td style={{ padding: '10px 16px' }}>{badge(b.status)}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {b.status === 'PENDING' && <button onClick={() => markBillPaid(b.id)} style={{ fontSize: 12, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontWeight: 600 }}>Mark Paid</button>}
                          <a href={`http://localhost:3000/api/v1/vendor-bills/${b.id}/pdf`} target="_blank"
                            style={{ fontSize: 12, color: '#023c62', background: '#e8f0f7', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', textDecoration: 'none', fontWeight: 600 }}>PDF</a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* VENDOR PRICING */}
      {tab === 'vendor-prices' && (
        <div>
          {/* Plant selector + Save All */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, justifyContent: 'space-between', flexWrap: 'wrap' as const }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#6b7fa3', fontWeight: 600 }}>Plant:</span>
              {['WADREX', 'MAMTA'].map(pl => (
                <button key={pl} onClick={() => setPricesPlant(pl)}
                  style={{ padding: '6px 16px', borderRadius: 8, border: `2px solid ${pricesPlant === pl ? '#023c62' : '#e2e8f0'}`, background: pricesPlant === pl ? '#023c62' : '#fff', color: pricesPlant === pl ? '#fff' : '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  {pl}
                </button>
              ))}
              <span style={{ fontSize: 12, color: '#9dafc8' }}>Set what you pay {pricesPlant} per item</span>
            </div>
            <button onClick={savePrices} disabled={savingPrices}
              style={{ padding: '10px 24px', background: '#023c62', color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: savingPrices ? 0.5 : 1 }}>
              {savingPrices ? 'Saving...' : 'Save All'}
            </button>
          </div>

          {!vendorPrices.length ? (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8f0f7', padding: 40, textAlign: 'center', color: '#9dafc8' }}>Loading...</div>
          ) : (() => {
            // Group by category
            const catMap: Record<string, any[]> = {}
            vendorPrices.forEach((vp: any) => {
              const cat = vp.category || 'Other'
              if (!catMap[cat]) catMap[cat] = []
              catMap[cat].push(vp)
            })
            const cats = Object.keys(catMap)
            const activePriceCat = cats[0] || ''
            return (
              <div>
                {/* Category tabs */}
                <div style={{ background: '#fff', borderRadius: '12px 12px 0 0', borderBottom: '1px solid #e8f0f7', padding: '0 16px', display: 'flex', gap: 0, overflowX: 'auto' as const, border: '1px solid #e8f0f7' }}>
                  {cats.map(cat => (
                    <button key={cat} onClick={() => setActivePriceCatState(cat)}
                      style={{ padding: '12px 16px', border: 'none', borderBottom: `2px solid ${activePriceCatState === cat ? '#023c62' : 'transparent'}`, background: 'transparent', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: activePriceCatState === cat ? '#023c62' : '#6b7fa3', whiteSpace: 'nowrap' as const, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                      {cat.replace('DRY CLEAN — ','')} ({catMap[cat].length})
                    </button>
                  ))}
                </div>

                {/* Items grid */}
                <div style={{ background: '#fff', border: '1px solid #e8f0f7', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                    {(catMap[activePriceCatState] || catMap[cats[0]] || []).map((vp: any) => {
                      const key = `${vp.serviceId}||${vp.serviceName}`
                      const currentVal = priceEdits[key] !== undefined ? priceEdits[key] : String(vp.costPrice || '')
                      return (
                        <div key={vp.serviceId} style={{ background: '#f8fafc', borderRadius: 10, padding: 12, border: '1px solid #e8f0f7' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#1a2332', marginBottom: 8, lineHeight: 1.3, minHeight: 32 }}>{vp.serviceName}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 13, color: '#6b7fa3' }}>₹</span>
                            <input type="number" value={currentVal} min="0"
                              onChange={e => setPriceEdits({ ...priceEdits, [key]: e.target.value })}
                              placeholder="0"
                              style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', fontSize: 13, fontWeight: 600, outline: 'none', width: '100%', boxSizing: 'border-box' as const }} />
                          </div>
                          <div style={{ fontSize: 10, color: '#9dafc8', marginTop: 4 }}>per piece</div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Save category button */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid #e8f0f7' }}>
                    <button onClick={savePrices} disabled={savingPrices}
                      style={{ padding: '8px 20px', background: '#166534', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: savingPrices ? 0.5 : 1 }}>
                      {savingPrices ? 'Saving...' : `Save ${activePriceCatState.replace('DRY CLEAN — ','')}`}
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* CREATE CHALLAN MODAL */}
      {showCreateChallan && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 540, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' as const }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>New Delivery Challan</h2>
            <p style={{ fontSize: 13, color: '#6b7fa3', marginBottom: 20 }}>Search and add orders to send to the plant</p>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: '#6b7fa3', display: 'block', marginBottom: 6 }}>Send to Plant *</label>
                <select value={challanPlant} onChange={(e: any) => setChallanPlant(e.target.value)}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                  <option value="WADREX">Wadrex</option>
                  <option value="MAMTA">Mamta</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7fa3', display: 'block', marginBottom: 6 }}>Add Orders *</label>
                <input type="text" value={orderSearch} onChange={e => { setOrderSearch(e.target.value); searchOrders(e.target.value) }}
                  placeholder="Search by order number or customer name..."
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, boxSizing: 'border-box' as const }} />
                {orderResults.length > 0 && (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 4, background: '#fff', maxHeight: 160, overflowY: 'auto' as const }}>
                    {orderResults.map((o: any) => (
                      <div key={o.id} onClick={() => addOrder(o)}
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f0f7ff')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                        <span><span style={{ fontFamily: 'monospace', color: '#023c62', fontWeight: 700 }}>{o.orderNumber}</span> — {o.customer?.name}</span>
                        <span style={{ color: '#9dafc8', fontSize: 11 }}>{o.items?.length || 0} items</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {selectedOrders.length > 0 && (
                <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, color: '#9dafc8', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{selectedOrders.length} order{selectedOrders.length > 1 ? 's' : ''} selected</div>
                  {selectedOrders.map(o => (
                    <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 13, borderBottom: '1px solid #e8f0f7' }}>
                      <span><span style={{ fontFamily: 'monospace', color: '#023c62', fontWeight: 700 }}>{o.orderNumber}</span> — {o.customer?.name} ({o.items?.length || 0} items)</span>
                      <button onClick={() => removeOrder(o.id)} style={{ fontSize: 11, color: '#991b1b', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#6b7fa3', display: 'block', marginBottom: 6 }}>Driver Name</label>
                  <input type="text" value={challanDriver} onChange={e => setChallanDriver(e.target.value)} placeholder="Optional"
                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, boxSizing: 'border-box' as const }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#6b7fa3', display: 'block', marginBottom: 6 }}>Vehicle No</label>
                  <input type="text" value={challanVehicle} onChange={e => setChallanVehicle(e.target.value)} placeholder="Optional"
                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, boxSizing: 'border-box' as const }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7fa3', display: 'block', marginBottom: 6 }}>Notes</label>
                <input type="text" value={challanNotes} onChange={e => setChallanNotes(e.target.value)} placeholder="Optional"
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, boxSizing: 'border-box' as const }} />
              </div>
            </div>
            <div style={{ background: '#fef9c3', borderRadius: 8, padding: '10px 14px', marginTop: 14, fontSize: 12, color: '#854d0e' }}>
              ⚠️ Orders will be locked as SENT_TO_PLANT until garments are marked as received.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => { setShowCreateChallan(false); setSelectedOrders([]) }} style={{ padding: '8px 16px', fontSize: 13, color: '#6b7fa3', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
              <button onClick={createChallan} disabled={creating || !selectedOrders.length}
                style={{ padding: '10px 20px', background: '#023c62', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: creating || !selectedOrders.length ? 0.5 : 1 }}>
                {creating ? 'Creating...' : `Create Challan (${selectedOrders.length} order${selectedOrders.length > 1 ? 's' : ''})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECEIVE ITEMS MODAL */}
      {showReceive && receivingChallan && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' as const }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Mark Garments Received</h2>
            <p style={{ fontSize: 13, color: '#6b7fa3', marginBottom: 20 }}>Challan: <strong>{receivingChallan.challanNo}</strong> — Tick each garment that came back from the plant</p>
            {receivingChallan.challanOrders?.map((co: any) => (
              <div key={co.id} style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#023c62', fontWeight: 700, marginBottom: 8, padding: '6px 10px', background: '#f0f7ff', borderRadius: 6 }}>
                  {co.order?.orderNumber} — {co.order?.customer?.name}
                </div>
                {receivingChallan.challanItems?.filter((ci: any) =>
                  co.order?.items?.some((oi: any) => oi.id === ci.orderItemId)
                ).map((item: any) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ flex: 1, fontSize: 13 }}>{item.serviceName}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: '#9dafc8' }}>Received:</span>
                      <input type="number" min="0" max={item.quantity}
                        value={receivedQtys[item.id] || 0}
                        onChange={e => setReceivedQtys({ ...receivedQtys, [item.id]: Math.min(parseInt(e.target.value) || 0, item.quantity) })}
                        style={{ width: 50, border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 6px', fontSize: 13, textAlign: 'center' }} />
                      <span style={{ fontSize: 11, color: '#9dafc8' }}>/ {item.quantity}</span>
                      {(receivedQtys[item.id] || 0) >= item.quantity && <span style={{ fontSize: 10, background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>✓ Full</span>}
                      {(receivedQtys[item.id] || 0) > 0 && (receivedQtys[item.id] || 0) < item.quantity && <span style={{ fontSize: 10, background: '#fff7ed', color: '#c2410c', padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>Partial</span>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, padding: '10px 0', borderTop: '1px solid #e8f0f7' }}>
              <span style={{ fontSize: 13, color: '#6b7fa3' }}>{Object.values(receivedQtys).filter(q => q > 0).length} items updated</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowReceive(false)} style={{ padding: '8px 16px', fontSize: 13, color: '#6b7fa3', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                <button onClick={submitReceive} disabled={receiving}
                  style={{ padding: '10px 20px', background: '#166534', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: receiving ? 0.5 : 1 }}>
                  {receiving ? 'Saving...' : 'Save Received Quantities'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE VENDOR BILL MODAL */}
      {showCreateBill && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' as const }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Create Vendor Bill</h2>
            <p style={{ fontSize: 13, color: '#6b7fa3', marginBottom: 20 }}>Select challans to club into a single bill for payment</p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#6b7fa3', display: 'block', marginBottom: 6 }}>Plant</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['WADREX', 'MAMTA'].map(p => (
                  <button key={p} onClick={() => setBillPlant(p)}
                    style={{ padding: '6px 16px', borderRadius: 8, border: `2px solid ${billPlant === p ? '#023c62' : '#e2e8f0'}`, background: billPlant === p ? '#023c62' : '#fff', color: billPlant === p ? '#fff' : '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#6b7fa3', marginBottom: 8 }}>Select Challans (unbilled only)</div>
              {unbilledChallans.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#9dafc8', fontSize: 13, background: '#f8fafc', borderRadius: 8 }}>No unbilled challans for {billPlant}</div>
              ) : unbilledChallans.map((c: any) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                  onClick={() => { const n = new Set(selectedChallans); n.has(c.id) ? n.delete(c.id) : n.add(c.id); setSelectedChallans(n) }}>
                  <input type="checkbox" checked={selectedChallans.has(c.id)} readOnly style={{ width: 16, height: 16 }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontFamily: 'monospace', color: '#023c62', fontWeight: 700, fontSize: 12 }}>{c.challanNo}</span>
                    <span style={{ color: '#6b7fa3', fontSize: 11, marginLeft: 8 }}>{new Date(c.createdAt).toLocaleDateString('en-IN')}</span>
                  </div>
                  <span style={{ fontWeight: 600, color: '#991b1b' }}>{fmt(c.vendorCost)}</span>
                </div>
              ))}
            </div>
            {selectedChallans.size > 0 && (
              <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#166534' }}>{selectedChallans.size} challans selected</span>
                <span style={{ fontWeight: 700, color: '#166534' }}>
                  Total: {fmt(challans.filter((c: any) => selectedChallans.has(c.id)).reduce((s: number, c: any) => s + c.vendorCost, 0))}
                </span>
              </div>
            )}
            <div>
              <label style={{ fontSize: 12, color: '#6b7fa3', display: 'block', marginBottom: 6 }}>Notes</label>
              <input type="text" value={billNotes} onChange={e => setBillNotes(e.target.value)} placeholder="e.g. March 2026 payment"
                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, boxSizing: 'border-box' as const }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setShowCreateBill(false)} style={{ padding: '8px 16px', fontSize: 13, color: '#6b7fa3', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
              <button onClick={createBill} disabled={!selectedChallans.size}
                style={{ padding: '10px 20px', background: '#166634', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: !selectedChallans.size ? 0.5 : 1 }}>
                Create Bill
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
