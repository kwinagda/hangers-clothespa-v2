'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { metadataAPI, ordersAPI, ironAPI } from '@/lib/api'
import { format } from 'date-fns'
import { ArrowRight, CheckCircle2, ClipboardList, Clock3, IndianRupee, PackagePlus, Plus, Truck, Users } from 'lucide-react'

export default function DashboardPage() {
  const [stats, setStats]     = useState<any>(null)
  const [ironSummary, setIronSummary] = useState<any>(null)
  const [statusLabels, setStatusLabels] = useState<Record<string,string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        metadataAPI.getAll().then((r:any) => {
          const metadata = r?.metadata || r?.data?.metadata || {}
          const labels = (metadata.orderStatuses || []).reduce((acc: Record<string, string>, item: any) => {
            acc[item.key] = item.label || item.key
            return acc
          }, {})
          setStatusLabels(labels)
        }).catch(() => {})
        const orderPromise = ordersAPI.stats().then((r:any) => setStats(r.data)).catch(() => setStats(null))
        const ironPromise = (async () => {
          try {
            const all = await ironAPI.listSubscriptions()
            const subscriptions = all?.data?.subscriptions || []
            const active = subscriptions.filter((sub: any) => sub.applicationStatus === 'ACTIVE')
            const pending = subscriptions.filter((sub: any) => sub.applicationStatus === 'PENDING_REVIEW')
            const today = new Date().toISOString().slice(0, 10)

            const [logResponses, billResponses] = await Promise.all([
              Promise.all(active.map((sub: any) => ironAPI.getLogsByPeriod(sub.customerId, today, today).catch(() => ({ data: { totals: { pieces: 0 } } })))),
              Promise.all(active.map((sub: any) => ironAPI.getBills(sub.customerId).catch(() => ({ data: { bills: [] } })))),
            ])

            const piecesToday = logResponses.reduce((sum: number, res: any) => sum + (res?.data?.totals?.pieces || 0), 0)
            const billsPending = billResponses.reduce((sum: number, res: any) => {
              const bills = res?.data?.bills || []
              return sum + bills.filter((bill: any) => bill.status !== 'PAID').length
            }, 0)

            setIronSummary({ active: active.length, pending: pending.length, piecesToday, billsPending })
          } catch {
            setIronSummary(null)
          }
        })()

        await Promise.all([orderPromise, ironPromise])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const fmt = (n: number) => `₹${(n||0).toLocaleString('en-IN')}`
  const card = (Icon:any,label:string,value:any,sub:string,color='#023c62') => (
    <div className="crm-card-hover" style={{background:'#fff',borderRadius:20,padding:'22px 24px',border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)',flex:1,minWidth:0}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <Icon size={24} color={color} />
        <span style={{fontSize:11,fontWeight:600,color:'#6b7fa3',textTransform:'uppercase' as const,letterSpacing:'0.08em'}}>{label}</span>
      </div>
      <div style={{fontFamily:"var(--crm-font-ui)",fontWeight:800,fontSize:32,color,lineHeight:1}}>{loading?'—':value}</div>
      <div style={{fontSize:12,color:'#9dafc8',marginTop:6}}>{sub}</div>
    </div>
  )

  return (
    <div style={{padding:'32px 36px',maxWidth:1300,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:32}}>
        <div>
          <h1 style={{fontFamily:"var(--crm-font-display)",fontWeight:800,fontSize:28,color:'#023c62',margin:'0 0 4px'}}>Dashboard</h1>
          <p style={{fontSize:14,color:'#6b7fa3',margin:0}}>{new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
        </div>
        <Link href="/dashboard/orders/new" className="crm-card-hover" style={{display:'inline-flex',alignItems:'center',gap:8,background:'#023c62',color:'#fff',textDecoration:'none',padding:'12px 22px',borderRadius:12,fontWeight:700,fontFamily:"var(--crm-font-ui)",fontSize:14}}>
          <Plus size={16} /> New Order
        </Link>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:24}}>
        {card(ClipboardList,"Today's Orders",stats?.today?.orders??0,'Total orders today')}
        {card(Clock3,'Active Orders',stats?.active?.pending??0,'Pending & processing','#b35a00')}
        {card(CheckCircle2,'Ready to Deliver',stats?.active?.ready??0,'Awaiting pickup','#0d7a4e')}
        {card(IndianRupee,"Today's Revenue",fmt(stats?.today?.revenue),'From delivered orders')}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:32}}>
        <div style={{background:'linear-gradient(135deg,#023c62,#035a8f)',borderRadius:20,padding:'24px',color:'#fff'}}>
          <div style={{fontSize:11,color:'rgba(184,208,232,0.7)',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase' as const,marginBottom:10}}>All-Time Revenue</div>
          <div style={{fontFamily:"var(--crm-font-ui)",fontWeight:800,fontSize:36,marginBottom:4}}>{loading?'—':fmt(stats?.allTime?.revenue)}</div>
          <div style={{fontSize:13,color:'rgba(184,208,232,0.6)'}}>Total from all delivered orders</div>
        </div>
        <div style={{background:'#fff',borderRadius:20,padding:'24px',border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)'}}>
          <div style={{fontSize:11,color:'#6b7fa3',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase' as const,marginBottom:12}}>Quick Actions</div>
          {[
            {href:'/dashboard/orders/new',Icon:PackagePlus,l:'Create Walk-in Order'},
            {href:'/dashboard/orders?status=READY_FOR_DELIVERY',Icon:Truck,l:'View Ready Orders'},
            {href:'/dashboard/customers',Icon:Users,l:'Customer Directory'}
          ].map(a=>(
            <Link key={a.href} href={a.href} className="crm-card-hover" style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:10,background:'#f7f9fc',border:'1px solid #e8f0f7',textDecoration:'none',color:'#023c62',fontSize:14,fontWeight:500,marginBottom:8}}>
              <a.Icon size={16} />
              {a.l}
            </Link>
          ))}
        </div>
      </div>

      <div style={{background:'#fff',borderRadius:20,padding:'24px',border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)',marginBottom:32}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
          <div>
            <h2 style={{fontFamily:"var(--crm-font-display)",fontWeight:700,fontSize:18,color:'#023c62',margin:'0 0 4px'}}>Daily Iron Snapshot</h2>
            <p style={{fontSize:13,color:'#6b7fa3',margin:0}}>Fast view of the subscription pipeline and today&apos;s logged pieces.</p>
          </div>
          <Link href="/dashboard/iron/logs" style={{fontSize:13,color:'#035a8f',fontWeight:600,textDecoration:'none',display:'inline-flex',alignItems:'center',gap:6}}>Open logs <ArrowRight size={14} /></Link>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
          {[
            { label:'Active Subscribers', value: ironSummary?.active ?? '—', color:'#023c62' },
            { label:'Pending Applications', value: ironSummary?.pending ?? '—', color:'#b35a00' },
            { label:'Pieces Today', value: ironSummary?.piecesToday ?? '—', color:'#166534' },
            { label:'Bills Pending', value: ironSummary?.billsPending ?? '—', color:'#6d28d9' },
          ].map((item) => (
            <div key={item.label} style={{background:'#f8fafc',border:'1px solid #eef4f8',borderRadius:14,padding:'16px 18px'}}>
              <div style={{fontSize:11,color:'#6b7fa3',fontWeight:600,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:6}}>{item.label}</div>
              <div style={{fontFamily:"var(--crm-font-ui)",fontSize:28,fontWeight:800,color:item.color}}>{loading ? '—' : item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{background:'#fff',borderRadius:20,border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)',overflow:'hidden'}}>
        <div style={{padding:'20px 24px',borderBottom:'1px solid #e8f0f7',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <h2 style={{fontFamily:"var(--crm-font-display)",fontWeight:700,fontSize:18,color:'#023c62',margin:0}}>Recent Orders</h2>
          <Link href="/dashboard/orders" style={{fontSize:13,color:'#035a8f',fontWeight:500,textDecoration:'none',display:'inline-flex',alignItems:'center',gap:6}}>View all <ArrowRight size={14} /></Link>
        </div>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr style={{background:'#f7f9fc'}}>
            {['Order #','Customer','Status','Amount','Date'].map(h=>(
              <th key={h} style={{padding:'11px 20px',textAlign:'left',fontSize:11,fontWeight:600,color:'#6b7fa3',letterSpacing:'0.08em',textTransform:'uppercase' as const,borderBottom:'1px solid #e8f0f7'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} style={{padding:40,textAlign:'center',color:'#9dafc8'}}>Loading...</td></tr>
            : !stats?.recentOrders?.length ? <tr><td colSpan={5} style={{padding:40,textAlign:'center',color:'#9dafc8'}}>No orders yet. <Link href="/dashboard/orders/new" style={{color:'#023c62'}}>Create the first one</Link></td></tr>
            : stats.recentOrders.map((o:any)=>(
              <tr key={o.id} style={{borderBottom:'1px solid #f0f4f8',cursor:'pointer'}} onClick={()=>window.location.href=`/dashboard/orders/${o.id}`}>
                <td style={{padding:'13px 20px',fontFamily:"var(--crm-font-mono)",fontSize:13,fontWeight:500,color:'#023c62'}}>{o.orderNumber}</td>
                <td style={{padding:'13px 20px'}}>
                  <div style={{fontSize:14,fontWeight:500,color:'#1a2332'}}>{o.customer?.name||'—'}</div>
                  <div style={{fontSize:12,color:'#9dafc8'}}>+91 {o.customer?.phone}</div>
                </td>
                <td style={{padding:'13px 20px'}}><span className={`status-badge status-${o.status}`}>{statusLabels[o.status] || o.status}</span></td>
                <td style={{padding:'13px 20px',fontWeight:600,color:'#023c62',fontSize:14}}>₹{o.totalAmount?.toLocaleString('en-IN')}</td>
                <td style={{padding:'13px 20px',fontSize:13,color:'#6b7fa3'}}>{format(new Date(o.createdAt),'dd MMM, h:mm a')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
