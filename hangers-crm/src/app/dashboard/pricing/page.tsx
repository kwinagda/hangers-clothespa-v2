'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { servicesAPI } from '@/lib/api'

interface CatalogItem {
  name: string
  price: number
}

interface CatalogSection {
  category: string
  items: CatalogItem[]
}

// ── Full Hangers price catalog (matches new order form) ───────────────────────
const DEFAULT_CATALOG = [
  { category: 'Dry Clean — Men', items: [
    { name: 'Shirt', price: 80 }, { name: 'T-Shirt', price: 70 }, { name: 'Trousers', price: 90 },
    { name: 'Jeans', price: 110 }, { name: 'Blazer', price: 180 }, { name: 'Suit (2pc)', price: 320 },
    { name: 'Suit (3pc)', price: 420 }, { name: 'Sherwani', price: 500 }, { name: 'Kurta', price: 100 },
    { name: 'Kurta-Pajama', price: 150 }, { name: 'Jacket', price: 200 }, { name: 'Sweater', price: 140 },
    { name: 'Hoodie', price: 150 }, { name: 'Shorts', price: 80 }, { name: 'Waistcoat', price: 120 },
  ]},
  { category: 'Dry Clean — Women', items: [
    { name: 'Saree (Simple)', price: 200 }, { name: 'Saree (Heavy)', price: 350 }, { name: 'Blouse', price: 80 },
    { name: 'Salwar Suit (2pc)', price: 180 }, { name: 'Salwar Suit (3pc)', price: 240 }, { name: 'Kurti', price: 100 },
    { name: 'Lehenga', price: 500 }, { name: 'Lehenga Choli', price: 600 }, { name: 'Gown', price: 350 },
    { name: 'Dress', price: 200 }, { name: 'Tops', price: 70 }, { name: 'Skirt', price: 100 },
    { name: 'Dupatta', price: 80 }, { name: 'Scarf / Stole', price: 60 }, { name: 'Abaya', price: 280 },
  ]},
  { category: 'Dry Clean — Kids', items: [
    { name: 'Kids Shirt', price: 50 }, { name: 'Kids T-Shirt', price: 50 }, { name: 'Kids Jeans', price: 70 },
    { name: 'Kids Frock', price: 80 }, { name: 'School Uniform', price: 60 }, { name: 'Party Wear', price: 150 },
  ]},
  { category: 'Dry Clean — Home', items: [
    { name: 'Single Bedsheet', price: 150 }, { name: 'Double Bedsheet', price: 200 },
    { name: 'Pillow Cover', price: 50 }, { name: 'Blanket (Single)', price: 300 }, { name: 'Blanket (Double)', price: 400 },
    { name: 'Quilt (Single)', price: 350 }, { name: 'Quilt (Double)', price: 450 }, { name: 'Curtain (per panel)', price: 200 },
    { name: 'Sofa Cover (1 seater)', price: 200 }, { name: 'Sofa Cover (3 seater)', price: 500 },
    { name: 'Carpet (per sqft)', price: 25 }, { name: 'Table Cloth', price: 100 },
  ]},
  { category: 'Steam Ironing', items: [
    { name: 'Shirt / T-Shirt', price: 20 }, { name: 'Trousers / Jeans', price: 25 }, { name: 'Kurta', price: 25 },
    { name: 'Saree', price: 50 }, { name: 'Suit (2pc)', price: 60 }, { name: 'Dress', price: 40 },
    { name: 'Blouse', price: 20 }, { name: 'Bedsheet', price: 40 }, { name: 'Pillowcase', price: 15 },
  ]},
  { category: 'Normal Ironing', items: [
    { name: 'Shirt / T-Shirt', price: 12 }, { name: 'Trousers / Jeans', price: 15 }, { name: 'Kurta', price: 15 },
    { name: 'Saree', price: 35 }, { name: 'Bedsheet (Single)', price: 25 }, { name: 'Bedsheet (Double)', price: 35 },
  ]},
  { category: 'Roll Press', items: [
    { name: 'Shirt', price: 15 }, { name: 'T-Shirt', price: 12 }, { name: 'Trousers', price: 18 },
    { name: 'Saree', price: 40 }, { name: 'Bedsheet', price: 30 },
  ]},
  { category: 'Shoe Cleaning', items: [
    { name: 'Sneakers (Basic)', price: 150 }, { name: 'Sneakers (Deep Clean)', price: 250 },
    { name: 'Formal Shoes', price: 120 }, { name: 'Boots', price: 200 }, { name: 'Sandals', price: 80 },
    { name: 'Heels', price: 100 }, { name: 'Canvas Shoes', price: 120 },
  ]},
]

export default function PricingPage() {
  const [catalog, setCatalog] = useState<CatalogSection[]>([])
  const [editing, setEditing] = useState<{catIdx:number,itemIdx:number}|null>(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState(DEFAULT_CATALOG[0].category)

  // Load prices from API on mount
  useEffect(() => {
    servicesAPI.getPriceList().then((res: any) => {
      if (!res?.data?.catalog?.length) return
      setCatalog(res.data.catalog.map((cat: any): CatalogSection => ({
        category: cat.category,
        items: cat.items.map((i: any): CatalogItem => ({ name: i.name, price: i.price })),
      })))
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
    <div style={{padding:'32px 36px',maxWidth:1300,margin:'0 auto',fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:28}}>
        <div>
          <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:28,color:'#023c62',margin:'0 0 4px'}}>Pricing & Services</h1>
          <p style={{fontSize:14,color:'#6b7fa3',margin:0}}>{totalItems} services across {catalog.length} categories — click any price to edit</p>
        </div>
        <div style={{display:'flex',gap:10}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search service..."
            style={{border:'1.5px solid #dce8f0',borderRadius:10,padding:'10px 14px',fontSize:14,outline:'none',width:220}}/>
        </div>
      </div>

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
                  <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:15,color:'#fff'}}>{cat.category}</span>
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
                                  style={{background:'#f0f4f8',color:'#6b7fa3',border:'none',borderRadius:7,padding:'4px 10px',fontSize:12,cursor:'pointer'}}>✕</button>
                              </div>
                            ) : (
                              <span style={{fontFamily:"'DM Mono',monospace",fontWeight:600,color:'#022c50',fontSize:15}}>₹{item.price}</span>
                            )}
                          </td>
                          <td style={{padding:'11px 16px',textAlign:'center'}}>
                            {!isEditing && (
                              <button onClick={()=>startEdit(realCatIdx, itemIdx, item.price)}
                                style={{background:'transparent',border:'none',color:'#9dafc8',cursor:'pointer',fontSize:16,lineHeight:1}} title="Edit price">✏️</button>
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
    </div>
  )
}
