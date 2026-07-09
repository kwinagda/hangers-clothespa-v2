'use client'
import { useEffect, useState } from 'react'
import { campaignsAPI, automationsAPI, metadataAPI } from '@/lib/api'
import { PageHeader } from '@/components/ui'
import { PaginationControls } from '@/components/ui/PaginationControls'
type Tab = 'campaigns'|'automations'
const asArray = (value: any, keys: string[] = []) => {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}
const unwrapRecord = (value: any, keys: string[] = []) => {
  if (!value || Array.isArray(value)) return null
  for (const key of keys) {
    if (value?.[key] && typeof value[key] === 'object' && !Array.isArray(value[key])) return value[key]
  }
  return value
}
export default function MarketingPage() {
  const [tab,setTab] = useState<Tab>('campaigns')
  const [triggers,setTriggers] = useState<any[]>([])
  const [audiences,setAudiences] = useState<any[]>([])
  const [campaigns,setCampaigns] = useState<any[]>([])
  const [automations,setAutomations] = useState<any[]>([])
  const [showCamp,setShowCamp] = useState(false)
  const [showAuto,setShowAuto] = useState(false)
  const [loading,setLoading] = useState(false)
  const [sending,setSending] = useState<string|null>(null)
  const [campaignPage,setCampaignPage] = useState(1)
  const [automationPage,setAutomationPage] = useState(1)
  const [pageSize,setPageSize] = useState(12)
  const [cf,setCf] = useState({name:'',message:'',audience:'ALL'})
  const [af,setAf] = useState({name:'',trigger:'ORDER_PLACED',message:'',delayHours:'0'})
  const audienceLabel = (value: string) => audiences.find((item:any) => item.value === value)?.label || value
  const triggerLabel = (value: string) => triggers.find((item:any) => item.value === value)?.label || value
  useEffect(()=>{
    metadataAPI.getAll().then((r:any)=>{
      const metadata = r?.metadata || r?.data?.metadata || {}
      const nextAudiences = metadata.marketingAudiences || []
      const nextTriggers = metadata.marketingTriggers || []
      setAudiences(nextAudiences)
      setTriggers(nextTriggers)
      if (nextAudiences[0]?.value) setCf(prev => ({ ...prev, audience: nextAudiences[0].value }))
      if (nextTriggers[0]?.value) setAf(prev => ({ ...prev, trigger: nextTriggers[0].value }))
    }).catch(()=>{})
    campaignsAPI.getAll().then((r:any)=>setCampaigns(asArray(r.data, ['campaigns', 'items']))).catch(()=>setCampaigns([]))
    automationsAPI.getAll().then((r:any)=>setAutomations(asArray(r.data, ['automations', 'items']))).catch(()=>setAutomations([]))
  },[])
  const s = {fontFamily:"var(--crm-font-ui)"}
  const pagedCampaigns = campaigns.slice((campaignPage - 1) * pageSize, campaignPage * pageSize)
  const pagedAutomations = automations.slice((automationPage - 1) * pageSize, automationPage * pageSize)
  const tabBtn = (t:Tab,l:string) => <button onClick={()=>setTab(t)} style={{padding:'8px 18px',borderRadius:8,fontSize:13,fontWeight:600,border:'none',cursor:'pointer',background:tab===t?'#fff':'transparent',color:tab===t?'#023c62':'#6b7fa3',boxShadow:tab===t?'0 1px 4px rgba(0,0,0,0.08)':'none'}}>{l}</button>
  const SS: Record<string,any> = {DRAFT:{bg:'#f3f4f6',color:'#374151'},SENT:{bg:'#dcfce7',color:'#166534'},FAILED:{bg:'#fee2e2',color:'#991b1b'}}
  return (
    <div style={{padding:'32px 36px',maxWidth:900,margin:'0 auto',...s}}>
      <PageHeader title="Marketing & Automations" subtitle="WhatsApp campaigns and automated customer messaging" />
      <div style={{display:'flex',gap:4,marginBottom:24,background:'#f1f5f9',borderRadius:12,padding:4,width:'fit-content'}}>
        {tabBtn('campaigns','WhatsApp Campaigns')}{tabBtn('automations','Automations')}
      </div>
      {tab==='campaigns'&&<div>
        <div style={{display:'flex',justifyContent:'flex-end',marginBottom:16}}>
          <button onClick={()=>setShowCamp(true)} style={{padding:'10px 20px',background:'#166534',color:'#fff',borderRadius:10,fontSize:13,fontWeight:700,border:'none',cursor:'pointer'}}>+ New Campaign</button>
        </div>
        <div style={{display:'flex',flexDirection:'column' as const,gap:12}}>
          {campaigns.length===0?<div style={{padding:40,textAlign:'center',color:'#9dafc8',background:'#fff',borderRadius:12,border:'1px solid #e8f0f7'}}>No campaigns yet</div>:
          pagedCampaigns.map((c:any)=><div key={c.id} style={{background:'#fff',borderRadius:12,border:'1px solid #e8f0f7',padding:20}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,color:'#023c62',marginBottom:4}}>{c.name}</div>
                <div style={{fontSize:13,color:'#6b7fa3',marginBottom:8}}>Audience: {audienceLabel(c.audience)}</div>
                <div style={{fontSize:13,background:'#f8fafc',borderRadius:8,padding:'8px 12px',color:'#374151'}}>{c.message}</div>
              </div>
              <div style={{display:'flex',flexDirection:'column' as const,alignItems:'flex-end',gap:8}}>
                <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:SS[c.status]?.bg||'#f3f4f6',color:SS[c.status]?.color||'#374151'}}>{c.status}</span>
                {c.status==='DRAFT'&&<button onClick={async()=>{try{setSending(c.id);const r:any=await campaignsAPI.send(c.id);const sentCount = r?.data?.sentCount ?? r?.sentCount ?? c.sentCount;setCampaigns(campaigns.map(x=>x.id===c.id?{...x,status:'SENT',sentCount}:x))}finally{setSending(null)}}} disabled={sending===c.id} style={{padding:'6px 14px',background:'#166534',color:'#fff',borderRadius:8,fontSize:12,fontWeight:700,border:'none',cursor:'pointer',opacity:sending===c.id?0.5:1}}>{sending===c.id?'Sending...':'Send Now'}</button>}
                {c.status==='SENT'&&<div style={{fontSize:12,color:'#6b7fa3'}}>Sent to {c.sentCount}</div>}
              </div>
            </div>
          </div>)}
        </div>
        <PaginationControls
          page={campaignPage}
          pageSize={pageSize}
          totalItems={campaigns.length}
          itemLabel="campaigns"
          onPageChange={setCampaignPage}
          onPageSizeChange={(size)=>{setPageSize(size); setCampaignPage(1)}}
          pageSizeOptions={[6,12,18,24]}
        />
      </div>}
      {tab==='automations'&&<div>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16,gap:16}}>
          <p style={{fontSize:13,color:'#6b7fa3',margin:0}}>Use variables: <code style={{background:'#f1f5f9',padding:'1px 6px',borderRadius:4,fontSize:12}}>{'{{customerName}}'}</code> <code style={{background:'#f1f5f9',padding:'1px 6px',borderRadius:4,fontSize:12}}>{'{{orderNumber}}'}</code> <code style={{background:'#f1f5f9',padding:'1px 6px',borderRadius:4,fontSize:12}}>{'{{amount}}'}</code></p>
          <button onClick={()=>setShowAuto(true)} style={{padding:'10px 20px',background:'#023c62',color:'#fff',borderRadius:10,fontSize:13,fontWeight:700,border:'none',cursor:'pointer',flexShrink:0}}>+ New Automation</button>
        </div>
        <div style={{display:'flex',flexDirection:'column' as const,gap:12}}>
          {automations.length===0?<div style={{padding:40,textAlign:'center',color:'#9dafc8',background:'#fff',borderRadius:12,border:'1px solid #e8f0f7'}}>No automations configured</div>:
          pagedAutomations.map((a:any)=><div key={a.id} style={{background:'#fff',borderRadius:12,border:'1px solid #e8f0f7',padding:20}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16}}>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                  <span style={{fontWeight:700,color:'#023c62'}}>{a.name}</span>
                  <span style={{padding:'2px 8px',background:'#dbeafe',color:'#1e40af',borderRadius:4,fontSize:11,fontWeight:600}}>{triggerLabel(a.trigger)}</span>
                  {a.delayHours>0&&<span style={{fontSize:11,color:'#6b7fa3'}}>+{a.delayHours}h delay</span>}
                </div>
                <div style={{fontSize:13,background:'#f8fafc',borderRadius:8,padding:'8px 12px',color:'#374151'}}>{a.message}</div>
              </div>
              <div style={{display:'flex',flexDirection:'column' as const,alignItems:'flex-end',gap:8}}>
                <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:a.isActive?'#dcfce7':'#f3f4f6',color:a.isActive?'#166534':'#6b7280'}}>{a.isActive?'Active':'Paused'}</span>
                <button onClick={()=>automationsAPI.toggle(a.id).then(()=>setAutomations(automations.map(x=>x.id===a.id?{...x,isActive:!x.isActive}:x))).catch(()=>{})} style={{fontSize:12,color:'#023c62',background:'none',border:'none',cursor:'pointer'}}>{a.isActive?'Pause':'Enable'}</button>
              </div>
            </div>
          </div>)}
        </div>
        <PaginationControls
          page={automationPage}
          pageSize={pageSize}
          totalItems={automations.length}
          itemLabel="automations"
          onPageChange={setAutomationPage}
          onPageSizeChange={(size)=>{setPageSize(size); setAutomationPage(1)}}
          pageSizeOptions={[6,12,18,24]}
        />
      </div>}
      {showCamp&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50}}>
        <div style={{background:'#fff',borderRadius:16,padding:24,width:'100%',maxWidth:440,boxShadow:'0 20px 60px rgba(0,0,0,0.15)'}}>
          <h2 style={{fontFamily:"var(--crm-font-ui)",fontWeight:700,fontSize:18,marginBottom:20}}>New WhatsApp Campaign</h2>
          <div style={{display:'flex',flexDirection:'column' as const,gap:14}}>
            <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Campaign Name *</label><input type="text" value={cf.name} onChange={e=>setCf({...cf,name:e.target.value})} placeholder="e.g. Diwali Offer 2026" style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13,boxSizing:'border-box' as const}}/></div>
            <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Audience</label><select value={cf.audience} onChange={e=>setCf({...cf,audience:e.target.value})} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13}}>{audiences.map((a:any)=><option key={a.value} value={a.value}>{a.label}</option>)}</select></div>
            <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Message *</label><textarea value={cf.message} onChange={e=>setCf({...cf,message:e.target.value})} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13,height:100,resize:'none',boxSizing:'border-box' as const}} placeholder="Hi {{customerName}}, get 20% off this week!"/></div>
          </div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20}}>
            <button onClick={()=>setShowCamp(false)} style={{padding:'8px 16px',fontSize:13,color:'#6b7fa3',background:'none',border:'none',cursor:'pointer'}}>Cancel</button>
            <button onClick={async()=>{try{setLoading(true);const r=await campaignsAPI.create(cf);const created = unwrapRecord(r?.data, ['campaign']) || r?.data;if(created) setCampaigns([created,...campaigns]);setShowCamp(false)}finally{setLoading(false)}}} disabled={loading} style={{padding:'8px 16px',background:'#166534',color:'#fff',borderRadius:8,fontSize:13,border:'none',cursor:'pointer',opacity:loading?0.5:1}}>{loading?'Creating...':'Create'}</button>
          </div>
        </div>
      </div>}
      {showAuto&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50}}>
        <div style={{background:'#fff',borderRadius:16,padding:24,width:'100%',maxWidth:440,boxShadow:'0 20px 60px rgba(0,0,0,0.15)'}}>
          <h2 style={{fontFamily:"var(--crm-font-ui)",fontWeight:700,fontSize:18,marginBottom:20}}>New Automation</h2>
          <div style={{display:'flex',flexDirection:'column' as const,gap:14}}>
            <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Name *</label><input type="text" value={af.name} onChange={e=>setAf({...af,name:e.target.value})} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13,boxSizing:'border-box' as const}}/></div>
            <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Trigger</label><select value={af.trigger} onChange={e=>setAf({...af,trigger:e.target.value})} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13}}>{triggers.map((t:any)=><option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
            <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Delay (hours)</label><input type="number" value={af.delayHours} onChange={e=>setAf({...af,delayHours:e.target.value})} min="0" style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13,boxSizing:'border-box' as const}}/></div>
            <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Message *</label><textarea value={af.message} onChange={e=>setAf({...af,message:e.target.value})} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13,height:90,resize:'none',boxSizing:'border-box' as const}} placeholder="Hi {{customerName}}, your order {{orderNumber}} is ready!"/></div>
          </div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20}}>
            <button onClick={()=>setShowAuto(false)} style={{padding:'8px 16px',fontSize:13,color:'#6b7fa3',background:'none',border:'none',cursor:'pointer'}}>Cancel</button>
            <button onClick={async()=>{try{setLoading(true);const r=await automationsAPI.create(af);const created = unwrapRecord(r?.data, ['automation']) || r?.data;if(created) setAutomations([created,...automations]);setShowAuto(false)}finally{setLoading(false)}}} disabled={loading} style={{padding:'8px 16px',background:'#023c62',color:'#fff',borderRadius:8,fontSize:13,border:'none',cursor:'pointer',opacity:loading?0.5:1}}>{loading?'Creating...':'Create'}</button>
          </div>
        </div>
      </div>}
    </div>
  )
}
