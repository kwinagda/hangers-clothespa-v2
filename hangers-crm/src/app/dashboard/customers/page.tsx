'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { customersAPI } from '@/lib/api'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export default function CustomersPage() {
  const [customers,setCustomers]=useState<any[]>([])
  const [total,setTotal]=useState(0); const [loading,setLoading]=useState(true)
  const [search,setSearch]=useState(''); const [page,setPage]=useState(1)
  const [showAdd,setShowAdd]=useState(false)
  const [newPhone,setNewPhone]=useState(''); const [newName,setNewName]=useState(''); const [adding,setAdding]=useState(false)

  const load=useCallback(async()=>{
    setLoading(true)
    try{const r=await customersAPI.list({page,limit:30,search:search||undefined});setCustomers(r.data.customers);setTotal(r.data.pagination.total)}
    catch{toast.error('Failed to load')}finally{setLoading(false)}
  },[page,search])

  useEffect(()=>{load()},[load])

  const addCustomer=async()=>{
    if(!newPhone||newPhone.replace(/\D/g,'').length!==10){toast.error('Valid 10-digit phone needed');return}
    setAdding(true)
    try{await customersAPI.create({phone:newPhone.replace(/\D/g,'').slice(-10),name:newName||undefined});toast.success('Customer added!');setShowAdd(false);setNewPhone('');setNewName('');load()}
    catch(e:any){toast.error(e.message)}finally{setAdding(false)}
  }

  return (
    <div style={{padding:'32px 36px',maxWidth:1200,margin:'0 auto',fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:28}}>
        <div>
          <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:28,color:'#023c62',margin:'0 0 4px'}}>Customers</h1>
          <p style={{fontSize:14,color:'#6b7fa3',margin:0}}>{total} registered customers</p>
        </div>
        <button onClick={()=>setShowAdd(true)} style={{background:'#023c62',color:'#fff',border:'none',borderRadius:12,padding:'12px 22px',fontWeight:700,fontFamily:"'Syne',sans-serif",fontSize:14,cursor:'pointer'}}>
          ＋ Add Customer
        </button>
      </div>

      {showAdd&&(
        <div style={{background:'#fff',borderRadius:20,padding:24,border:'1px solid #e8f0f7',boxShadow:'0 4px 20px rgba(2,60,98,0.1)',marginBottom:20}}>
          <h3 style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:16,color:'#023c62',margin:'0 0 16px'}}>Add New Customer</h3>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto auto',gap:12,alignItems:'end'}}>
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
            <button onClick={addCustomer} disabled={adding} style={{background:'#023c62',color:'#fff',border:'none',borderRadius:10,padding:'11px 20px',fontWeight:700,cursor:'pointer',fontSize:14}}>
              {adding?'Adding...':'Add'}
            </button>
            <button onClick={()=>setShowAdd(false)} style={{background:'#f0f4f8',color:'#6b7fa3',border:'none',borderRadius:10,padding:'11px 16px',cursor:'pointer',fontSize:14}}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{display:'flex',gap:12,marginBottom:20}}>
        <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="🔍  Search by name or phone..."
          style={{flex:1,border:'1.5px solid #dce8f0',borderRadius:10,padding:'10px 14px',fontSize:14,outline:'none',background:'#fff'}}/>
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
                  {c.email&&<div style={{fontSize:12,color:'#9dafc8'}}>{c.email}</div>}
                </td>
                <td style={{padding:'13px 20px',fontFamily:"'DM Mono',monospace",fontSize:13,color:'#023c62'}}>+91 {c.phone}</td>
                <td style={{padding:'13px 20px',fontSize:14,color:'#6b7fa3'}}>{c._count?.orders||0} order{c._count?.orders!==1?'s':''}</td>
                <td style={{padding:'13px 20px'}}>
                  {c.orders?.[0]?(
                    <div>
                      <div style={{fontSize:13,fontFamily:"'DM Mono',monospace",color:'#023c62'}}>{c.orders[0].orderNumber}</div>
                      <div style={{fontSize:11,color:'#9dafc8'}}>{format(new Date(c.orders[0].createdAt),'dd MMM yy')}</div>
                    </div>
                  ):<span style={{fontSize:13,color:'#9dafc8'}}>—</span>}
                </td>
                <td style={{padding:'13px 20px',fontSize:13,color:'#6b7fa3'}}>{format(new Date(c.createdAt),'dd MMM yy')}</td>
                <td style={{padding:'13px 20px'}}>
                  <Link href={`/dashboard/customers/${c.id}`} style={{fontSize:13,color:'#035a8f',fontWeight:500,textDecoration:'none'}}>View →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
