'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ordersAPI } from '@/lib/api'
import { format } from 'date-fns'

const STATUS_LABEL: Record<string,string> = {
  PENDING:'Pending', PICKED_UP:'Picked Up', PROCESSING:'Processing',
  WASHING:'Washing', DRYING:'Drying', IRONING:'Ironing', QC:'QC Check',
  READY_FOR_DELIVERY:'Ready', OUT_FOR_DELIVERY:'Out for Delivery',
  DELIVERED:'Delivered', CANCELLED:'Cancelled', SENT_TO_PLANT:'At Plant', RETURNED:'Returned',
}

export default function DashboardPage() {
  const [stats, setStats]     = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ordersAPI.stats().then((r:any) => setStats(r.data)).catch(()=>setStats(null)).finally(()=>setLoading(false))
  }, [])

  const fmt = (n: number) => `₹${(n||0).toLocaleString('en-IN')}`
  const card = (icon:string,label:string,value:any,sub:string,color='#023c62') => (
    <div style={{background:'#fff',borderRadius:20,padding:'22px 24px',border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)',flex:1,minWidth:0}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <span style={{fontSize:28}}>{icon}</span>
        <span style={{fontSize:11,fontWeight:600,color:'#6b7fa3',textTransform:'uppercase' as const,letterSpacing:'0.08em'}}>{label}</span>
      </div>
      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:32,color,lineHeight:1}}>{loading?'—':value}</div>
      <div style={{fontSize:12,color:'#9dafc8',marginTop:6}}>{sub}</div>
    </div>
  )

  return (
    <div style={{padding:'32px 36px',maxWidth:1300,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:32}}>
        <div>
          <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:28,color:'#023c62',margin:'0 0 4px'}}>Dashboard</h1>
          <p style={{fontSize:14,color:'#6b7fa3',margin:0}}>{new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
        </div>
        <Link href="/dashboard/orders/new" style={{display:'inline-flex',alignItems:'center',gap:8,background:'#023c62',color:'#fff',textDecoration:'none',padding:'12px 22px',borderRadius:12,fontWeight:700,fontFamily:"'Syne',sans-serif",fontSize:14}}>
          ＋ New Order
        </Link>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:24}}>
        {card('📋',"Today's Orders",stats?.today?.orders??0,'Total orders today')}
        {card('⏳','Active Orders',stats?.active?.pending??0,'Pending & processing','#b35a00')}
        {card('✅','Ready to Deliver',stats?.active?.ready??0,'Awaiting pickup','#0d7a4e')}
        {card('💰',"Today's Revenue",fmt(stats?.today?.revenue),'From delivered orders')}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:32}}>
        <div style={{background:'linear-gradient(135deg,#023c62,#035a8f)',borderRadius:20,padding:'24px',color:'#fff'}}>
          <div style={{fontSize:11,color:'rgba(184,208,232,0.7)',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase' as const,marginBottom:10}}>All-Time Revenue</div>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:36,marginBottom:4}}>{loading?'—':fmt(stats?.allTime?.revenue)}</div>
          <div style={{fontSize:13,color:'rgba(184,208,232,0.6)'}}>Total from all delivered orders</div>
        </div>
        <div style={{background:'#fff',borderRadius:20,padding:'24px',border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)'}}>
          <div style={{fontSize:11,color:'#6b7fa3',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase' as const,marginBottom:12}}>Quick Actions</div>
          {[{href:'/dashboard/orders/new',icon:'📦',l:'Create Walk-in Order'},{href:'/dashboard/orders?status=READY_FOR_DELIVERY',icon:'🚚',l:'View Ready Orders'},{href:'/dashboard/customers',icon:'👥',l:'Customer Directory'}].map(a=>(
            <Link key={a.href} href={a.href} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:10,background:'#f7f9fc',border:'1px solid #e8f0f7',textDecoration:'none',color:'#023c62',fontSize:14,fontWeight:500,marginBottom:8}}><span>{a.icon}</span>{a.l}</Link>
          ))}
        </div>
      </div>

      <div style={{background:'#fff',borderRadius:20,border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)',overflow:'hidden'}}>
        <div style={{padding:'20px 24px',borderBottom:'1px solid #e8f0f7',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <h2 style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:18,color:'#023c62',margin:0}}>Recent Orders</h2>
          <Link href="/dashboard/orders" style={{fontSize:13,color:'#035a8f',fontWeight:500,textDecoration:'none'}}>View all →</Link>
        </div>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr style={{background:'#f7f9fc'}}>
            {['Order #','Customer','Status','Amount','Date'].map(h=>(
              <th key={h} style={{padding:'11px 20px',textAlign:'left',fontSize:11,fontWeight:600,color:'#6b7fa3',letterSpacing:'0.08em',textTransform:'uppercase' as const,borderBottom:'1px solid #e8f0f7'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} style={{padding:40,textAlign:'center',color:'#9dafc8'}}>Loading...</td></tr>
            : !stats?.recentOrders?.length ? <tr><td colSpan={5} style={{padding:40,textAlign:'center',color:'#9dafc8'}}>No orders yet. <Link href="/dashboard/orders/new" style={{color:'#023c62'}}>Create the first one →</Link></td></tr>
            : stats.recentOrders.map((o:any)=>(
              <tr key={o.id} style={{borderBottom:'1px solid #f0f4f8',cursor:'pointer'}} onClick={()=>window.location.href=`/dashboard/orders/${o.id}`}>
                <td style={{padding:'13px 20px',fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:500,color:'#023c62'}}>{o.orderNumber}</td>
                <td style={{padding:'13px 20px'}}>
                  <div style={{fontSize:14,fontWeight:500,color:'#1a2332'}}>{o.customer?.name||'—'}</div>
                  <div style={{fontSize:12,color:'#9dafc8'}}>+91 {o.customer?.phone}</div>
                </td>
                <td style={{padding:'13px 20px'}}><span className={`status-badge status-${o.status}`}>{STATUS_LABEL[o.status]}</span></td>
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
