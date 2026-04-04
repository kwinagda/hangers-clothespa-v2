'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Pencil, Search, X } from 'lucide-react'
import { servicesAPI } from '@/lib/api'

interface CatalogItem {
  name: string
  price: number
}

interface CatalogSection {
  category: string
  items: CatalogItem[]
}

export default function PricingPage() {
  const [catalog, setCatalog] = useState<CatalogSection[]>([])
  const [editing, setEditing] = useState<{catIdx:number,itemIdx:number}|null>(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('')

  // Load prices from API on mount
  useEffect(() => {
    servicesAPI.getPriceList().then((res: any) => {
      if (!res?.data?.catalog?.length) return
      const nextCatalog = res.data.catalog.map((cat: any): CatalogSection => ({
        category: cat.category,
        items: cat.items.map((i: any): CatalogItem => ({ name: i.name, price: i.price })),
      }))
      setCatalog(nextCatalog)
      setActiveCategory((current) => current || nextCatalog[0]?.category || '')
    }).catch(() => {})
  }, [])

  const filteredCatalog = search
    ? catalog.map((cat: CatalogSection): CatalogSection => ({
        ...cat,
        items: cat.items.filter((i: CatalogItem) => i.name.toLowerCase().includes(search.toLowerCase()))
      })).filter((cat: CatalogSection) => cat.items.length > 0)
    : catalog.filter((cat: CatalogSection) => cat.category === activeCategory)

  const startEdit = (catIdx: number, itemIdx: number, currentPrice: number) => {
    setEditing({catIdx, itemIdx})
    setEditVal(String(currentPrice))
  }

  const saveEdit = async () => {
    if (!editing) return
    const newPrice = parseFloat(editVal)
    if (isNaN(newPrice) || newPrice < 0) { toast.error('Enter a valid price'); return }

    setSaving(true)
    const updated = catalog.map((cat: CatalogSection, ci: number) =>
      ci === editing.catIdx
        ? { ...cat, items: cat.items.map((item: CatalogItem, ii: number) => ii === editing.itemIdx ? { ...item, price: newPrice } : item) }
        : cat
    )
    setCatalog(updated)

    try {
      await servicesAPI.saveCatalog(updated)
      toast.success('Price updated!')
    } catch {
      toast.error('Saved locally — backend update failed')
    }
    setEditing(null)
    setSaving(false)
  }

  const totalItems = catalog.reduce((s: number, c: CatalogSection) => s + c.items.length, 0)

  return (
    <div style={{padding:'32px 36px',maxWidth:1300,margin:'0 auto',fontFamily:"var(--crm-font-ui)"}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:28}}>
        <div>
          <h1 style={{fontFamily:"var(--crm-font-display)",fontWeight:800,fontSize:28,color:'#023c62',margin:'0 0 4px'}}>Pricing & Services</h1>
          <p style={{fontSize:14,color:'#6b7fa3',margin:0}}>{totalItems} services across {catalog.length} categories — click any price to edit</p>
        </div>
        <div style={{display:'flex',gap:10}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search service..."
            style={{border:'1.5px solid #dce8f0',borderRadius:10,padding:'10px 14px',fontSize:14,outline:'none',width:220}}/>
        </div>
      </div>

      {!catalog.length ? (
        <div style={{background:'#fff',borderRadius:16,border:'1px solid #e8f0f7',padding:'40px 32px',textAlign:'center',color:'#6b7fa3'}}>
          No pricing catalog found in the database. Bootstrap it once from seed or create services from CRM.
        </div>
      ) : (

      <div style={{display:'grid',gridTemplateColumns:'220px 1fr',gap:20,alignItems:'start'}}>
        {/* Category sidebar */}
        <div style={{background:'#fff',borderRadius:16,border:'1px solid #e8f0f7',padding:12,position:'sticky',top:20}}>
          {catalog.map(cat=>(
            <button key={cat.category} onClick={()=>{setActiveCategory(cat.category);setSearch('')}}
              style={{width:'100%',textAlign:'left',padding:'10px 14px',borderRadius:10,border:'none',background:activeCategory===cat.category&&!search?'#023c62':'transparent',color:activeCategory===cat.category&&!search?'#fff':'#6b7fa3',fontWeight:activeCategory===cat.category?700:400,cursor:'pointer',fontSize:13,marginBottom:2,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span>{cat.category}</span>
              <span style={{fontSize:11,opacity:0.7}}>{cat.items.length}</span>
            </button>
          ))}
          <div style={{borderTop:'1px solid #e8f0f7',marginTop:8,paddingTop:10}}>
            <div style={{fontSize:11,color:'#6b7fa3',textAlign:'center'}}>Click any price to edit</div>
          </div>
        </div>

        {/* Items table */}
        <div>
          {filteredCatalog.map((cat, catIdx)=>{
            const realCatIdx = catalog.findIndex(c => c.category === cat.category)
            return (
              <div key={cat.category} style={{background:'#fff',borderRadius:16,border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)',marginBottom:16,overflow:'hidden'}}>
                <div style={{background:'#023c62',padding:'14px 20px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontFamily:"var(--crm-font-ui)",fontWeight:700,fontSize:15,color:'#fff'}}>{cat.category}</span>
                  <span style={{fontSize:12,color:'rgba(184,208,232,0.7)'}}>{cat.items.length} items</span>
                </div>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr style={{background:'#f7f9fc'}}>
                    <th style={{padding:'9px 20px',textAlign:'left',fontSize:11,fontWeight:600,color:'#6b7fa3',textTransform:'uppercase',letterSpacing:'0.06em',width:'70%'}}>Service / Item</th>
                    <th style={{padding:'9px 20px',textAlign:'right',fontSize:11,fontWeight:600,color:'#6b7fa3',textTransform:'uppercase',letterSpacing:'0.06em'}}>Price (₹)</th>
                    <th style={{width:60}}/>
                  </tr></thead>
                  <tbody>
                    {cat.items.map((item, itemIdx)=>{
                      const isEditing = editing?.catIdx===realCatIdx && editing?.itemIdx===itemIdx
                      return (
                        <tr key={item.name} style={{borderBottom:'1px solid #f0f4f8'}}>
                          <td style={{padding:'11px 20px',fontSize:14}}>{item.name}</td>
                          <td style={{padding:'11px 20px',textAlign:'right'}}>
                            {isEditing ? (
                              <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8}}>
                                <span style={{fontSize:14,color:'#6b7fa3'}}>₹</span>
                                <input value={editVal} onChange={e=>setEditVal(e.target.value)} autoFocus
                                  onKeyDown={e=>{if(e.key==='Enter')saveEdit();if(e.key==='Escape')setEditing(null)}}
                                  style={{width:80,border:'1.5px solid #023c62',borderRadius:8,padding:'4px 8px',fontSize:14,textAlign:'right',outline:'none'}}/>
                                <button onClick={saveEdit} disabled={saving}
                                  style={{background:'#023c62',color:'#fff',border:'none',borderRadius:7,padding:'4px 12px',fontSize:12,fontWeight:700,cursor:'pointer'}}>Save</button>
                                <button onClick={()=>setEditing(null)}
                                  style={{background:'#f0f4f8',color:'#6b7fa3',border:'none',borderRadius:7,padding:'4px 10px',fontSize:12,cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><X size={14} /></button>
                              </div>
                            ) : (
                              <span style={{fontFamily:"var(--crm-font-mono)",fontWeight:600,color:'#022c50',fontSize:15}}>₹{item.price}</span>
                            )}
                          </td>
                          <td style={{padding:'11px 16px',textAlign:'center'}}>
                            {!isEditing && (
                              <button onClick={()=>startEdit(realCatIdx, itemIdx, item.price)}
                                style={{background:'transparent',border:'none',color:'#9dafc8',cursor:'pointer',fontSize:16,lineHeight:1,display:'inline-flex',alignItems:'center',justifyContent:'center'}} title="Edit price"><Pencil size={15} /></button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      </div>
      )}
    </div>
  )
}
