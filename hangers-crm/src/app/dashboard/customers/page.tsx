'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { customersAPI, ironAPI, metadataAPI } from '@/lib/api'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { ArrowRight, Plus, Search } from 'lucide-react'
import { PageHeader, Button } from '@/components/ui'
import { PaginationControls } from '@/components/ui/PaginationControls'
const asArray = (value: any, keys: string[] = []) => {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}

export default function CustomersPage() {
  const [customers,setCustomers]=useState<any[]>([])
  const [total,setTotal]=useState(0); const [loading,setLoading]=useState(true)
  const [search,setSearch]=useState(''); const [page,setPage]=useState(1)
  const [pageSize,setPageSize]=useState(30)
  const [showAdd,setShowAdd]=useState(false)
  const [newPhone,setNewPhone]=useState(''); const [newName,setNewName]=useState(''); const [adding,setAdding]=useState(false)
  const [newLanguage,setNewLanguage]=useState('ENGLISH')
  const [languageOptions,setLanguageOptions]=useState<Array<{ value: string; label: string }>>([])
  const [enrollDailyIron,setEnrollDailyIron]=useState(false)

  const load=useCallback(async()=>{
    setLoading(true)
    try{const r=await customersAPI.list({page,limit:pageSize,search:search||undefined});setCustomers(asArray(r.data, ['customers', 'items']));setTotal(r.data?.pagination?.total || 0)}
    catch{toast.error('Failed to load')}finally{setLoading(false)}
  },[page,pageSize,search])

  useEffect(()=>{load()},[load])
  useEffect(() => {
    metadataAPI.getAll().then((r:any) => {
      const metadata = r?.metadata || r?.data?.metadata || {}
      setLanguageOptions(metadata.languages || [])
    }).catch(() => {
      toast.error('Failed to load customer language options')
    })
  }, [])

  const addCustomer=async()=>{
    if(!newPhone||newPhone.replace(/\D/g,'').length!==10){toast.error('Valid 10-digit phone needed');return}
    setAdding(true)
    try{
      const response = await customersAPI.create({
        phone:newPhone.replace(/\D/g,'').slice(-10),
        name:newName||undefined,
        preferredLanguage:newLanguage,
      })
      const createdCustomer = response.data?.customer || response.data
      if(enrollDailyIron){
        await ironAPI.createSubscription({ customerId: createdCustomer.id, applicationStatus: 'ACTIVE' })
      }
      toast.success(enrollDailyIron ? 'Customer added and enrolled in Daily Iron!' : 'Customer added!')
      setShowAdd(false)
      setNewPhone('')
      setNewName('')
      setNewLanguage('ENGLISH')
      setEnrollDailyIron(false)
      load()
    }
    catch(e:any){toast.error(e.message)}finally{setAdding(false)}
  }

  return (
    <div style={{padding:'32px 36px',maxWidth:1200,margin:'0 auto',fontFamily:"var(--crm-font-ui)"}}>
      <PageHeader
        title="Customers"
        subtitle={`${total} registered customers`}
        actions={<Button variant="primary" icon={<Plus size={16}/>} onClick={()=>setShowAdd(true)}>Add Customer</Button>}
      />

      {showAdd&&(
        <div style={{background:'#fff',borderRadius:20,padding:24,border:'1px solid #e8f0f7',boxShadow:'0 4px 20px rgba(2,60,98,0.1)',marginBottom:20}}>
          <h3 style={{fontFamily:"var(--crm-font-display)",fontWeight:700,fontSize:16,color:'#023c62',margin:'0 0 16px'}}>Add New Customer</h3>
          <div style={{display:'grid',gridTemplateColumns:'1.1fr 1fr 0.9fr auto auto',gap:12,alignItems:'end'}}>
            <div>
              <label style={{display:'block',fontSize:11,fontWeight:600,color:'#6b7fa3',textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:5}}>Mobile *</label>
              <input value={newPhone} onChange={e=>setNewPhone(e.target.value)} placeholder="9876543210" type="tel"
                style={{width:'100%',border:'1.5px solid #dce8f0',borderRadius:10,padding:'11px 14px',fontSize:14,outline:'none'}}/>
            </div>
            <div>
              <label style={{display:'block',fontSize:11,fontWeight:600,color:'#6b7fa3',textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:5}}>Name</label>
              <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Customer name"
                style={{width:'100%',border:'1.5px solid #dce8f0',borderRadius:10,padding:'11px 14px',fontSize:14,outline:'none'}}/>
            </div>
            <div>
              <label style={{display:'block',fontSize:11,fontWeight:600,color:'#6b7fa3',textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:5}}>Language</label>
              <select value={newLanguage} onChange={e=>setNewLanguage(e.target.value)}
                style={{width:'100%',border:'1.5px solid #dce8f0',borderRadius:10,padding:'11px 14px',fontSize:14,outline:'none',background:'#fff'}}>
                {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <button onClick={addCustomer} disabled={adding} style={{background:'#023c62',color:'#fff',border:'none',borderRadius:10,padding:'11px 20px',fontWeight:700,cursor:'pointer',fontSize:14}}>
              {adding?'Adding...':'Add'}
            </button>
            <button onClick={()=>setShowAdd(false)} style={{background:'#f0f4f8',color:'#6b7fa3',border:'none',borderRadius:10,padding:'11px 16px',cursor:'pointer',fontSize:14}}>Cancel</button>
          </div>
          <div style={{marginTop:14,padding:'12px 14px',background:'#eefbf3',border:'1px solid #bbf7d0',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:'#166534'}}>Enroll in Daily Iron</div>
              <div style={{fontSize:12,color:'#15803d',marginTop:2}}>If turned on, the customer will be enrolled immediately after creation through the Daily Iron API.</div>
            </div>
            <button onClick={()=>setEnrollDailyIron(v=>!v)} style={{padding:'7px 14px',border:'none',borderRadius:999,cursor:'pointer',fontSize:12,fontWeight:700,background:enrollDailyIron?'#166534':'#d1fae5',color:enrollDailyIron?'#fff':'#166534',minWidth:88}}>
              {enrollDailyIron?'ON':'OFF'}
            </button>
          </div>
        </div>
      )}

      <div style={{display:'flex',gap:12,marginBottom:20}}>
        <div style={{flex:1,position:'relative'}}>
          <Search size={16} color="#9dafc8" style={{position:'absolute',left:14,top:12}} />
          <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search by name or phone..."
            style={{width:'100%',border:'1.5px solid #dce8f0',borderRadius:10,padding:'10px 14px 10px 38px',fontSize:14,outline:'none',background:'#fff'}}/>
        </div>
      </div>

      <div style={{background:'#fff',borderRadius:20,border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)',overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr style={{background:'#f7f9fc'}}>
            {['Customer','Phone','Orders','Last Order','Joined',''].map(h=><th key={h} style={{padding:'11px 20px',textAlign:'left',fontSize:11,fontWeight:600,color:'#6b7fa3',textTransform:'uppercase' as const,letterSpacing:'0.08em',borderBottom:'1px solid #e8f0f7'}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {loading?<tr><td colSpan={6} style={{padding:48,textAlign:'center',color:'#9dafc8'}}>Loading...</td></tr>
            :!customers.length?<tr><td colSpan={6} style={{padding:48,textAlign:'center',color:'#9dafc8'}}>No customers found.</td></tr>
            :customers.map((c:any,i)=>(
              <tr key={c.id} style={{borderBottom:'1px solid #f0f4f8',background:i%2===0?'#fff':'#fafbfd'}}>
                <td style={{padding:'13px 20px'}}>
                  <div style={{fontSize:14,fontWeight:600,color:'#1a2332'}}>{c.name||<span style={{color:'#9dafc8',fontStyle:'italic'}}>No name</span>}</div>
                </td>
                <td style={{padding:'13px 20px',fontFamily:"var(--crm-font-mono)",fontSize:13,color:'#023c62'}}>+91 {c.phone}</td>
                <td style={{padding:'13px 20px',fontSize:14,color:'#6b7fa3'}}>{c._count?.orders||0} order{c._count?.orders!==1?'s':''}</td>
                <td style={{padding:'13px 20px'}}>
                  {c.orders?.[0]?(
                    <div>
                      <div style={{fontSize:13,fontFamily:"var(--crm-font-mono)",color:'#023c62'}}>{c.orders[0].orderNumber}</div>
                      <div style={{fontSize:11,color:'#9dafc8'}}>{format(new Date(c.orders[0].createdAt),'dd MMM yy')}</div>
                    </div>
                  ):<span style={{fontSize:13,color:'#9dafc8'}}>—</span>}
                </td>
                <td style={{padding:'13px 20px',fontSize:13,color:'#6b7fa3'}}>{format(new Date(c.createdAt),'dd MMM yy')}</td>
                <td style={{padding:'13px 20px'}}>
                  <Link href={`/dashboard/customers/${c.id}`} style={{fontSize:13,color:'#035a8f',fontWeight:500,textDecoration:'none',display:'inline-flex',alignItems:'center',gap:6}}>View <ArrowRight size={14} /></Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PaginationControls
        page={page}
        pageSize={pageSize}
        totalItems={total}
        itemLabel="customers"
        onPageChange={setPage}
        onPageSizeChange={(size)=>{setPageSize(size);setPage(1)}}
        pageSizeOptions={[10,20,30,50,100]}
      />
    </div>
  )
}
