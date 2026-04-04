'use client'
import { Suspense, useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ordersAPI, challanAPI, metadataAPI } from '@/lib/api'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { ClipboardList, Lock, MoreHorizontal, Plus, Search } from 'lucide-react'
import { InlineLoader, TableLoader } from '@/components/ui/Feedback'
import { PaginationControls } from '@/components/ui/PaginationControls'

const getStatusLabel = (status: string, source: string, labels: Record<string, string>) => {
  if (status === 'PICKED_UP' && (source === 'counter' || source === 'COUNTER' || source === 'walk-in')) return 'Received'
  return labels[status] || status
}

function OrdersPageContent() {
  const sp                      = useSearchParams()
  const [orders, setOrders]     = useState<any[]>([])
  const [total,  setTotal]      = useState(0)
  const [loading,setLoading]    = useState(true)
  const [search, setSearch]     = useState('')
  const [status, setStatus]     = useState(sp.get('status')||'')
  const [statusOptions, setStatusOptions] = useState<Array<{ key: string; label: string }>>([{ key: '', label: 'All Statuses' }])
  const [plantStatuses, setPlantStatuses] = useState<string[]>([])
  const [editableStatuses, setEditableStatuses] = useState<string[]>([])
  const [statusLabels, setStatusLabels] = useState<Record<string, string>>({})
  const [plantPartners, setPlantPartners] = useState<Array<{ value: string; label: string }>>([])
  const [page,   setPage]       = useState(1)
  const [pageSize, setPageSize] = useState(30)

  // Bulk select state
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showChallanModal, setShowChallanModal] = useState(false)
  const [challanForm, setChallanForm] = useState({ plant: '', driverName: '', vehicleNo: '' })
  const [creatingChallan, setCreatingChallan] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await ordersAPI.list({ page, limit:pageSize, status:status||undefined, search:search||undefined })
      setOrders(r.data.orders)
      setTotal(r.data.pagination.total)
    } catch { toast.error('Failed to load orders') }
    finally { setLoading(false) }
  }, [page, pageSize, status, search])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    metadataAPI.getAll()
      .then((r: any) => {
        const metadata = r?.metadata || r?.data?.metadata || {}
        const orderStatuses = metadata.orderStatuses || []
        setStatusOptions([{ key: '', label: 'All Statuses' }, ...orderStatuses.map((item: any) => ({ key: item.key, label: item.label }))])
        setPlantStatuses(orderStatuses.filter((item: any) => item.plantManaged).map((item: any) => item.key))
        setEditableStatuses(orderStatuses.filter((item: any) => item.crmEditable).map((item: any) => item.key))
        setStatusLabels(Object.fromEntries(orderStatuses.map((item: any) => [item.key, item.label])))
        const nextPlantPartners = metadata.plantPartners || []
        setPlantPartners(nextPlantPartners)
        if (nextPlantPartners.length) {
          setChallanForm((prev) => ({ ...prev, plant: prev.plant || nextPlantPartners[0].value }))
        }
      })
      .catch(() => {})
  }, [])

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      await ordersAPI.updateStatus(id, newStatus)
      toast.success('Status updated')
      load()
    } catch(e:any) { toast.error(e.message) }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const toggleAll = () => {
    if (selected.size === orders.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(orders.map((o:any) => o.id)))
    }
  }

  const createChallan = async () => {
    if (selected.size === 0) { toast.error('Select at least one order'); return }
    setCreatingChallan(true)
    try {
      const selectedOrders = orders.filter((o:any) => selected.has(o.id))
      await challanAPI.create({
        plant: challanForm.plant,
        orderIds: selectedOrders.map((o:any) => o.id),
        driverName: challanForm.driverName,
        vehicleNo: challanForm.vehicleNo,
      })

      toast.success(`${selected.size} challan${selected.size > 1 ? 's' : ''} created — orders sent to plant`)
      setSelected(new Set())
      setShowChallanModal(false)
      setChallanForm({ plant: plantPartners[0]?.value || '', driverName: '', vehicleNo: '' })
      load()
    } catch(e:any) {
      toast.error(e.message || 'Failed to create challans')
    }
    setCreatingChallan(false)
  }

  const selectedOrders = orders.filter((o:any) => selected.has(o.id))

  return (
    <div className="crm-page-enter" style={{padding:'32px 36px',maxWidth:1300,margin:'0 auto'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:28}}>
        <div>
          <h1 style={{fontFamily:"var(--crm-font-display)",fontWeight:800,fontSize:28,color:'#023c62',margin:'0 0 4px'}}>Orders</h1>
          <p style={{fontSize:14,color:'#6b7fa3',margin:0}}>{total} total orders</p>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          {selected.size > 0 && (
            <button onClick={() => setShowChallanModal(true)}
              style={{display:'inline-flex',alignItems:'center',gap:8,background:'#166534',color:'#fff',padding:'12px 22px',borderRadius:12,fontWeight:700,fontFamily:"var(--crm-font-ui)",fontSize:14,border:'none',cursor:'pointer'}}>
              <ClipboardList size={16} /> Create Challan ({selected.size} order{selected.size > 1 ? 's' : ''})
            </button>
          )}
          <Link href="/dashboard/orders/new"
            className="crm-card-hover"
            style={{display:'inline-flex',alignItems:'center',gap:8,background:'#023c62',color:'#fff',textDecoration:'none',padding:'12px 22px',borderRadius:12,fontWeight:700,fontFamily:"var(--crm-font-ui)",fontSize:14}}>
            <Plus size={16} /> New Order
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:12,marginBottom:20,flexWrap:'wrap' as const}}>
        <div style={{flex:1,minWidth:220,position:'relative'}}>
          <Search size={16} color="#9dafc8" style={{position:'absolute',left:14,top:12}} />
          <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search order #, name, phone..."
            style={{width:'100%',border:'1.5px solid #dce8f0',borderRadius:10,padding:'10px 14px 10px 38px',fontSize:14,outline:'none',background:'#fff'}}/>
        </div>
        <select value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}
          style={{border:'1.5px solid #dce8f0',borderRadius:10,padding:'10px 14px',fontSize:14,outline:'none',background:'#fff',color:'#1a2332',minWidth:160}}>
          {statusOptions.map((item)=><option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
        <button onClick={load}
          style={{padding:'10px 20px',borderRadius:10,background:'#e8f0f7',border:'1px solid #dce8f0',color:'#023c62',fontWeight:600,fontSize:14,cursor:'pointer'}}>
          Refresh
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{background:'#023c62',borderRadius:10,padding:'10px 16px',marginBottom:12,display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:13,color:'#fff'}}>
          <span><strong>{selected.size}</strong> order{selected.size > 1 ? 's' : ''} selected</span>
          <div style={{display:'flex',gap:8}}>
            <button onClick={() => setShowChallanModal(true)}
              style={{padding:'6px 14px',background:'#fff',color:'#023c62',borderRadius:8,fontSize:12,fontWeight:700,border:'none',cursor:'pointer'}}>
              Create Challan & Send to Plant
            </button>
            <button onClick={() => setSelected(new Set())}
              style={{padding:'6px 14px',background:'rgba(255,255,255,0.15)',color:'#fff',borderRadius:8,fontSize:12,border:'none',cursor:'pointer'}}>
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="crm-surface crm-card-hover" style={{borderRadius:20,overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr style={{background:'#f7f9fc'}}>
            <th style={{padding:'11px 16px',borderBottom:'1px solid #e8f0f7',width:40}}>
              <input type="checkbox" checked={selected.size === orders.length && orders.length > 0}
                onChange={toggleAll} style={{cursor:'pointer'}}/>
            </th>
            {['Order #','Customer','Items','Status','Amount','Date','Actions'].map(h=>(
              <th key={h} style={{padding:'11px 16px',textAlign:'left',fontSize:11,fontWeight:600,color:'#6b7fa3',letterSpacing:'0.08em',textTransform:'uppercase' as const,borderBottom:'1px solid #e8f0f7'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {loading
              ? <tr><td colSpan={8} style={{padding:0}}><TableLoader rows={6} columns={7} /></td></tr>
              : !orders.length
                ? <tr><td colSpan={8} style={{padding:48,textAlign:'center',color:'#9dafc8',fontSize:15}}>
                    No orders found.<br/>
                    <Link href="/dashboard/orders/new" style={{color:'#023c62',fontWeight:600}}>Create the first one →</Link>
                  </td></tr>
                : orders.map((o:any,i:number)=>{
                    const isSentToPlant = o.status === 'SENT_TO_PLANT'
                    return (
                      <tr key={o.id} className="crm-table-row" style={{borderBottom:'1px solid #f0f4f8',background:selected.has(o.id)?'#eff6ff':i%2===0?'#fff':'#fafbfd'}}>
                        <td style={{padding:'13px 16px'}}>
                          <input type="checkbox" checked={selected.has(o.id)}
                            onChange={() => toggleSelect(o.id)} style={{cursor:'pointer'}}
                            disabled={isSentToPlant}/>
                        </td>
                        <td style={{padding:'13px 16px'}}>
                          <Link href={`/dashboard/orders/${o.id}`}
                            style={{fontFamily:"var(--crm-font-mono)",fontSize:13,fontWeight:600,color:'#023c62',textDecoration:'none'}}>
                            {o.orderNumber}
                          </Link>
                          {isSentToPlant && <span style={{fontSize:10,background:'#fef9c3',color:'#854d0e',padding:'2px 6px',borderRadius:4,marginLeft:6,fontWeight:600}}>AT PLANT</span>}
                        </td>
                        <td style={{padding:'13px 16px'}}>
                          <div style={{fontSize:14,fontWeight:500,color:'#1a2332'}}>{o.customer?.name||'—'}</div>
                          <div style={{fontSize:12,color:'#9dafc8'}}>+91 {o.customer?.phone}</div>
                        </td>
                        <td style={{padding:'13px 16px',fontSize:13,color:'#6b7fa3'}}>{o.items?.length||0} item{o.items?.length!==1?'s':''}</td>
                        <td style={{padding:'13px 16px'}}>
                          {plantStatuses.includes(o.status)
                            ? <span style={{fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:6,...(o.status==='SENT_TO_PLANT'?{color:'#854d0e',background:'#fef9c3'}:o.status==='READY_FOR_DELIVERY'?{color:'#166534',background:'#dcfce7'}:{color:'#1e40af',background:'#dbeafe'})}}>
                                <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Lock size={12} /> {getStatusLabel(o.status, o.source, statusLabels)}</span>
                              </span>
                            : <select value={o.status} onChange={e=>updateStatus(o.id,e.target.value)}
                                className={`status-badge status-${o.status}`}
                                style={{border:'none',cursor:'pointer',fontFamily:"var(--crm-font-ui)",fontWeight:600,fontSize:11,letterSpacing:'0.03em',outline:'none'}}>
                                {editableStatuses.map(s=><option key={s} value={s}>{getStatusLabel(s, o.source, statusLabels)}</option>)}
                              </select>
                          }
                        </td>
                        <td style={{padding:'13px 16px',fontWeight:600,color:'#023c62',fontSize:14}}>₹{o.totalAmount?.toLocaleString('en-IN')}</td>
                        <td style={{padding:'13px 16px',fontSize:12,color:'#6b7fa3'}}>
                          {format(new Date(o.createdAt),'dd MMM yy')}<br/>
                          {format(new Date(o.createdAt),'h:mm a')}
                        </td>
                        <td style={{padding:'13px 16px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                            <Link href={`/dashboard/orders/${o.id}`}
                              style={{fontSize:12,color:'#035a8f',fontWeight:500,textDecoration:'none'}}>
                              View
                            </Link>
                            <details style={{position:'relative'}}>
                              <summary style={{listStyle:'none',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',width:28,height:28,borderRadius:8,border:'1px solid #dce8f0',background:'#fff',color:'#6b7fa3'}}>
                                <MoreHorizontal size={14} />
                              </summary>
                              <div style={{position:'absolute',right:0,top:34,minWidth:170,background:'#fff',border:'1px solid #dce8f0',borderRadius:12,boxShadow:'0 16px 34px rgba(2,60,98,0.14)',padding:8,zIndex:20}}>
                                <Link href={`/dashboard/print?orderId=${o.id}&type=receipt`} style={{display:'block',padding:'8px 10px',fontSize:12,color:'#023c62',textDecoration:'none',borderRadius:8}}>Print A4 Receipt</Link>
                                <Link href={`/dashboard/print?orderId=${o.id}&type=thermal`} style={{display:'block',padding:'8px 10px',fontSize:12,color:'#023c62',textDecoration:'none',borderRadius:8}}>Print 80mm Thermal</Link>
                                <Link href={`/dashboard/print?orderId=${o.id}&type=garment`} style={{display:'block',padding:'8px 10px',fontSize:12,color:'#023c62',textDecoration:'none',borderRadius:8}}>Print Garment Tags</Link>
                                <Link href={`/dashboard/print?orderId=${o.id}&type=bag`} style={{display:'block',padding:'8px 10px',fontSize:12,color:'#023c62',textDecoration:'none',borderRadius:8}}>Print Bag Tags</Link>
                              </div>
                            </details>
                          </div>
                        </td>
                      </tr>
                    )
                  })
            }
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <PaginationControls
        page={page}
        pageSize={pageSize}
        totalItems={total}
        itemLabel="orders"
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
        pageSizeOptions={[10, 20, 30, 50, 100]}
      />

      {/* Create Challan Modal */}
      {showChallanModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50}}>
          <div style={{background:'#fff',borderRadius:16,padding:24,width:'100%',maxWidth:480,boxShadow:'0 20px 60px rgba(0,0,0,0.15)'}}>
            <h2 style={{fontFamily:"var(--crm-font-display)",fontWeight:700,fontSize:18,marginBottom:4}}>Create Delivery Challan</h2>
            <p style={{fontSize:13,color:'#6b7fa3',marginBottom:20}}>
              {selected.size} order{selected.size > 1 ? 's' : ''} will be sent to the plant and locked until the plant marks them as received.
            </p>

            {/* Selected orders preview */}
            <div style={{background:'#f8fafc',borderRadius:8,padding:12,marginBottom:16,maxHeight:120,overflowY:'auto' as const}}>
              {selectedOrders.map((o:any) => (
                <div key={o.id} style={{fontSize:12,color:'#374151',padding:'3px 0',display:'flex',justifyContent:'space-between'}}>
                  <span style={{fontFamily:'monospace',color:'#023c62'}}>{o.orderNumber}</span>
                  <span style={{color:'#6b7fa3'}}>{o.customer?.name}</span>
                </div>
              ))}
            </div>

            <div style={{display:'flex',flexDirection:'column' as const,gap:14}}>
              <div>
                <label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Send to Plant *</label>
                <select value={challanForm.plant} onChange={(e:any)=>setChallanForm({...challanForm,plant:e.target.value})}
                  style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13}}>
                  {plantPartners.map((plant) => <option key={plant.value} value={plant.value}>{plant.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Driver Name</label>
                <input type="text" value={challanForm.driverName} onChange={(e:any)=>setChallanForm({...challanForm,driverName:e.target.value})}
                  placeholder="Optional"
                  style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13,boxSizing:'border-box' as const}}/>
              </div>
              <div>
                <label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Vehicle No</label>
                <input type="text" value={challanForm.vehicleNo} onChange={(e:any)=>setChallanForm({...challanForm,vehicleNo:e.target.value})}
                  placeholder="Optional"
                  style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13,boxSizing:'border-box' as const}}/>
              </div>
            </div>

            <div style={{background:'#fef9c3',borderRadius:8,padding:'10px 14px',marginTop:14,fontSize:12,color:'#854d0e'}}>
              Once sent to plant, orders will be locked from status updates until the plant marks the challan as Received.
            </div>

            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20}}>
              <button onClick={()=>setShowChallanModal(false)}
                style={{padding:'8px 16px',fontSize:13,color:'#6b7fa3',background:'none',border:'none',cursor:'pointer'}}>
                Cancel
              </button>
              <button onClick={createChallan} disabled={creatingChallan}
                style={{padding:'10px 20px',background:'#166534',color:'#fff',borderRadius:8,fontSize:13,fontWeight:700,border:'none',cursor:'pointer',opacity:creatingChallan?0.5:1}}>
                {creatingChallan ? <InlineLoader label="Creating" tone="light" /> : `Send to Plant & Create Challan${selected.size > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div style={{ padding: '32px 36px', color: '#6b7fa3' }}><InlineLoader label="Loading orders" /></div>}>
      <OrdersPageContent />
    </Suspense>
  )
}
