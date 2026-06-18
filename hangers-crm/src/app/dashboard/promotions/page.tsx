'use client'
import { ChangeEvent, useEffect, useState } from 'react'
import { couponsAPI, loyaltyAPI, metadataAPI, upchargesAPI } from '@/lib/api'
import { PaginationControls } from '@/components/ui/PaginationControls'
import toast from 'react-hot-toast'
type Tab = 'coupons'|'loyalty'|'upcharges'
const asArray = (value: any, keys: string[] = []) => {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}
export default function PromotionsPage() {
  const [tab,setTab] = useState<Tab>('coupons')
  const [coupons,setCoupons] = useState<any[]>([])
  const [loyalty,setLoyalty] = useState<any>(null)
  const [upcharges,setUpcharges] = useState<any[]>([])
  const [showCoupon,setShowCoupon] = useState(false)
  const [showUp,setShowUp] = useState(false)
  const [saving,setSaving] = useState(false)
  const [loading,setLoading] = useState(false)
  const [loadError,setLoadError] = useState('')
  const [discountTypes,setDiscountTypes] = useState<Array<{ value: string; label: string }>>([])
  const [couponPage,setCouponPage] = useState(1)
  const [upchargePage,setUpchargePage] = useState(1)
  const [pageSize,setPageSize] = useState(20)
  const [cf,setCf] = useState({code:'',type:'PERCENT',value:'',minOrderValue:'',maxDiscount:'',usageLimit:'',validUntil:''})
  const [uf,setUf] = useState({name:'',type:'PERCENT',value:''})
  const [lf,setLf] = useState({earnPerRupee:1,redeemPerPoint:0.5,minRedeemPoints:100})
  const onInput = (setter: (value: string) => void) => (e: ChangeEvent<HTMLInputElement>) => setter(e.target.value)
  const onSelect = (setter: (value: string) => void) => (e: ChangeEvent<HTMLSelectElement>) => setter(e.target.value)
  useEffect(()=>{
    metadataAPI.getAll().then((r:any) => {
      const metadata = r?.metadata || r?.data?.metadata || {}
      setDiscountTypes(metadata.discountValueTypes || [])
    }).catch((e:any) => {
      setDiscountTypes([])
      toast.error(e.message || 'Failed to load metadata')
    })
    couponsAPI.getAll().then((r:any)=>{ setCoupons(asArray(r.data, ['coupons', 'items'])); setLoadError('') }).catch((e:any)=>{ setCoupons([]); setLoadError(e.message || 'Failed to load promotions data.'); toast.error(e.message || 'Failed to load coupons') })
    loyaltyAPI.getRules().then((r:any)=>{setLoyalty(r.data);if(r.data)setLf({earnPerRupee:r.data.earnPerRupee,redeemPerPoint:r.data.redeemPerPoint,minRedeemPoints:r.data.minRedeemPoints})}).catch((e:any)=>{ toast.error(e.message || 'Failed to load loyalty rules') })
    upchargesAPI.getAll().then((r:any)=>setUpcharges(asArray(r.data, ['upcharges', 'items']))).catch((e:any)=>{ setUpcharges([]); toast.error(e.message || 'Failed to load upcharges') })
  },[])
  const s = {fontFamily:"var(--crm-font-ui)"}
  const pagedCoupons = coupons.slice((couponPage - 1) * pageSize, couponPage * pageSize)
  const pagedUpcharges = upcharges.slice((upchargePage - 1) * pageSize, upchargePage * pageSize)
  const tabBtn = (t:Tab,l:string) => <button onClick={()=>setTab(t)} style={{padding:'8px 18px',borderRadius:8,fontSize:13,fontWeight:600,border:'none',cursor:'pointer',background:tab===t?'#fff':'transparent',color:tab===t?'#023c62':'#6b7fa3',boxShadow:tab===t?'0 1px 4px rgba(0,0,0,0.08)':'none'}}>{l}</button>
  const inp = (label:string,value:string,onChange:any,type='text',placeholder='') => <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>{label}</label><input type={type} value={value} onChange={onChange} placeholder={placeholder} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13,boxSizing:'border-box' as const}}/></div>
  return (
    <div style={{padding:'32px 36px',maxWidth:1000,margin:'0 auto',...s}}>
      <h1 style={{fontFamily:"var(--crm-font-display)",fontWeight:800,fontSize:26,color:'#023c62',marginBottom:24}}>Promotions & Pricing</h1>
      <div style={{display:'flex',gap:4,marginBottom:24,background:'#f1f5f9',borderRadius:12,padding:4,width:'fit-content'}}>
        {tabBtn('coupons','Coupons')}{tabBtn('loyalty','Loyalty Points')}{tabBtn('upcharges','Upcharges')}
      </div>
      {tab==='coupons'&&<div>
        <div style={{display:'flex',justifyContent:'flex-end',marginBottom:16}}>
          <button onClick={()=>setShowCoupon(true)} style={{padding:'10px 20px',background:'#023c62',color:'#fff',borderRadius:10,fontSize:13,fontWeight:700,border:'none',cursor:'pointer'}}>+ Create Coupon</button>
        </div>
        <div style={{background:'#fff',borderRadius:12,border:'1px solid #e8f0f7',overflow:'hidden'}}>
          {loadError?<div style={{padding:20,color:'#b91c1c',fontSize:13}}>{loadError}</div>:null}
          {coupons.length===0?<div style={{padding:40,textAlign:'center',color:'#9dafc8'}}>No coupons yet</div>:
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr style={{background:'#f8fafc'}}>{['Code','Type','Value','Min Order','Used','Valid Until','Status',''].map(h=><th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:11,color:'#9dafc8',textTransform:'uppercase' as const,letterSpacing:'0.06em',borderBottom:'1px solid #e8f0f7'}}>{h}</th>)}</tr></thead>
            <tbody>{pagedCoupons.map((c:any)=><tr key={c.id} style={{borderBottom:'1px solid #f8fafc'}}>
              <td style={{padding:'10px 16px',fontFamily:'monospace',fontWeight:700,color:'#023c62'}}>{c.code}</td>
              <td style={{padding:'10px 16px'}}><span style={{padding:'3px 8px',background:'#f3f4f6',borderRadius:4,fontSize:11}}>{c.type}</span></td>
              <td style={{padding:'10px 16px'}}>{c.type==='PERCENT'?`${c.value}%`:`₹${c.value}`}</td>
              <td style={{padding:'10px 16px',color:'#6b7fa3'}}>{c.minOrderValue>0?`₹${c.minOrderValue}`:'—'}</td>
              <td style={{padding:'10px 16px',color:'#6b7fa3'}}>{c.usedCount}{c.usageLimit?`/${c.usageLimit}`:''}</td>
              <td style={{padding:'10px 16px',color:'#6b7fa3'}}>{c.validUntil?new Date(c.validUntil).toLocaleDateString('en-IN'):'∞'}</td>
              <td style={{padding:'10px 16px'}}><span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:c.isActive?'#dcfce7':'#f3f4f6',color:c.isActive?'#166534':'#6b7280'}}>{c.isActive?'Active':'Inactive'}</span></td>
              <td style={{padding:'10px 16px'}}><button onClick={async()=>{try{await couponsAPI.toggle(c.id);setCoupons(coupons.map(x=>x.id===c.id?{...x,isActive:!x.isActive}:x));toast.success(c.isActive?'Coupon disabled':'Coupon enabled')}catch(e:any){toast.error(e.message || 'Failed to update coupon')}}} style={{fontSize:12,color:'#023c62',background:'none',border:'none',cursor:'pointer'}}>{c.isActive?'Disable':'Enable'}</button></td>
            </tr>)}</tbody>
          </table>}
        </div>
        <PaginationControls
          page={couponPage}
          pageSize={pageSize}
          totalItems={coupons.length}
          itemLabel="coupons"
          onPageChange={setCouponPage}
          onPageSizeChange={(size)=>{setPageSize(size); setCouponPage(1)}}
          pageSizeOptions={[10,20,30,50,100]}
        />
      </div>}
      {tab==='loyalty'&&<div style={{background:'#fff',borderRadius:12,border:'1px solid #e8f0f7',padding:24,maxWidth:480}}>
        <div style={{fontWeight:700,fontSize:14,color:'#023c62',marginBottom:20}}>Loyalty Points Configuration</div>
        <div style={{display:'flex',flexDirection:'column' as const,gap:16}}>
          {[{label:'Points earned per ₹1 spent',key:'earnPerRupee',step:'0.1'},{label:'₹ value per point redeemed',key:'redeemPerPoint',step:'0.1'},{label:'Minimum points to redeem',key:'minRedeemPoints',step:'1'}].map((f:any)=>(
            <div key={f.key}>
              <label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>{f.label}</label>
              <input type="number" step={f.step} value={(lf as any)[f.key]} onChange={(e: ChangeEvent<HTMLInputElement>)=>setLf({...lf,[f.key]:parseFloat(e.target.value)})} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13,boxSizing:'border-box' as const}}/>
            </div>
          ))}
          <div style={{background:'#eff6ff',borderRadius:8,padding:12,fontSize:13,color:'#1d4ed8'}}>
            <strong>Example:</strong> Spend ₹500 → earn {Math.round(500*lf.earnPerRupee)} pts → worth ₹{(500*lf.earnPerRupee*lf.redeemPerPoint).toFixed(0)} discount
          </div>
          <button onClick={async()=>{setSaving(true);try{await loyaltyAPI.updateRules(lf);toast.success('Loyalty rules saved')}catch(e:any){toast.error(e.message || 'Failed to save loyalty rules')}finally{setSaving(false)}}} disabled={saving} style={{padding:'10px',background:'#023c62',color:'#fff',borderRadius:8,fontSize:13,fontWeight:700,border:'none',cursor:'pointer',opacity:saving?0.5:1}}>
            {saving?'Saving...':'Save Rules'}
          </button>
        </div>
      </div>}
      {tab==='upcharges'&&<div>
        <div style={{display:'flex',justifyContent:'flex-end',marginBottom:16}}>
          <button onClick={()=>setShowUp(true)} style={{padding:'10px 20px',background:'#023c62',color:'#fff',borderRadius:10,fontSize:13,fontWeight:700,border:'none',cursor:'pointer'}}>+ Add Upcharge</button>
        </div>
        <div style={{display:'flex',flexDirection:'column' as const,gap:10}}>
          {upcharges.length===0?<div style={{padding:40,textAlign:'center',color:'#9dafc8',background:'#fff',borderRadius:12,border:'1px solid #e8f0f7'}}>No upcharges configured</div>:
          pagedUpcharges.map((u:any)=><div key={u.id} style={{background:'#fff',borderRadius:12,border:'1px solid #e8f0f7',padding:'16px 20px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div><div style={{fontWeight:600}}>{u.name}</div><div style={{fontSize:12,color:'#6b7fa3'}}>{u.type==='PERCENT'?`+${u.value}%`:`+₹${u.value}`}</div></div>
            <span style={{padding:'4px 12px',background:'#fff7ed',color:'#c2410c',borderRadius:20,fontSize:12,fontWeight:600}}>{u.type}</span>
          </div>)}
        </div>
        <PaginationControls
          page={upchargePage}
          pageSize={pageSize}
          totalItems={upcharges.length}
          itemLabel="upcharges"
          onPageChange={setUpchargePage}
          onPageSizeChange={(size)=>{setPageSize(size); setUpchargePage(1)}}
          pageSizeOptions={[10,20,30,50,100]}
        />
      </div>}
      {showCoupon&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50}}>
        <div style={{background:'#fff',borderRadius:16,padding:24,width:'100%',maxWidth:400,boxShadow:'0 20px 60px rgba(0,0,0,0.15)',maxHeight:'90vh',overflowY:'auto' as const}}>
          <h2 style={{fontFamily:"var(--crm-font-display)",fontWeight:700,fontSize:18,marginBottom:20}}>Create Coupon</h2>
          <div style={{display:'flex',flexDirection:'column' as const,gap:14}}>
            {inp('Code *',cf.code,onInput((value) => setCf({...cf,code:value})),'text','e.g. SAVE20')}
            <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Type</label>
              <select value={cf.type} onChange={onSelect((value) => setCf({...cf,type:value}))} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13}}>
                {discountTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select></div>
            {inp('Value *',cf.value,onInput((value) => setCf({...cf,value})),'number')}
            {inp('Min Order (₹)',cf.minOrderValue,onInput((value) => setCf({...cf,minOrderValue:value})),'number','0')}
            {inp('Max Discount (₹)',cf.maxDiscount,onInput((value) => setCf({...cf,maxDiscount:value})),'number','No cap')}
            {inp('Usage Limit',cf.usageLimit,onInput((value) => setCf({...cf,usageLimit:value})),'number','Unlimited')}
            {inp('Valid Until',cf.validUntil,onInput((value) => setCf({...cf,validUntil:value})),'date')}
          </div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20}}>
            <button onClick={()=>setShowCoupon(false)} style={{padding:'8px 16px',fontSize:13,color:'#6b7fa3',background:'none',border:'none',cursor:'pointer'}}>Cancel</button>
            <button onClick={async()=>{if(!cf.code.trim()||!cf.value){toast.error('Coupon code and value are required');return}setLoading(true);try{const r=await couponsAPI.create({...cf,code:cf.code.trim().toUpperCase()});setCoupons([r.data,...coupons]);setShowCoupon(false);setCf({code:'',type:discountTypes[0]?.value || 'PERCENT',value:'',minOrderValue:'',maxDiscount:'',usageLimit:'',validUntil:''});toast.success('Coupon created')}catch(e:any){toast.error(e.message || 'Failed to create coupon')}finally{setLoading(false)}}} disabled={loading} style={{padding:'8px 16px',background:'#023c62',color:'#fff',borderRadius:8,fontSize:13,border:'none',cursor:'pointer',opacity:loading?0.5:1}}>{loading?'Creating...':'Create'}</button>
          </div>
        </div>
      </div>}
      {showUp&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50}}>
        <div style={{background:'#fff',borderRadius:16,padding:24,width:'100%',maxWidth:380,boxShadow:'0 20px 60px rgba(0,0,0,0.15)'}}>
          <h2 style={{fontFamily:"var(--crm-font-display)",fontWeight:700,fontSize:18,marginBottom:20}}>Add Upcharge</h2>
          <div style={{display:'flex',flexDirection:'column' as const,gap:14}}>
            {inp('Name *',uf.name,onInput((value) => setUf({...uf,name:value})),'text','e.g. Express, Starch')}
            <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Type</label>
              <select value={uf.type} onChange={onSelect((value) => setUf({...uf,type:value}))} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13}}>
                {discountTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select></div>
            {inp('Value *',uf.value,onInput((value) => setUf({...uf,value})),'number')}
          </div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20}}>
            <button onClick={()=>setShowUp(false)} style={{padding:'8px 16px',fontSize:13,color:'#6b7fa3',background:'none',border:'none',cursor:'pointer'}}>Cancel</button>
            <button onClick={async()=>{if(!uf.name.trim()||!uf.value){toast.error('Upcharge name and value are required');return}setLoading(true);try{const r=await upchargesAPI.create({...uf,name:uf.name.trim()});setUpcharges([...upcharges,r.data]);setShowUp(false);setUf({name:'',type:discountTypes[0]?.value || 'PERCENT',value:''});toast.success('Upcharge added')}catch(e:any){toast.error(e.message || 'Failed to add upcharge')}finally{setLoading(false)}}} disabled={loading} style={{padding:'8px 16px',background:'#023c62',color:'#fff',borderRadius:8,fontSize:13,border:'none',cursor:'pointer',opacity:loading?0.5:1}}>{loading?'Adding...':'Add'}</button>
          </div>
        </div>
      </div>}
    </div>
  )
}
