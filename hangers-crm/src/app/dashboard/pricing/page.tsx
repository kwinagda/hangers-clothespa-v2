'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { servicesAPI } from '@/lib/api'
import { PageHeader } from '@/components/ui'

interface CatalogItem {
  id?: string
  name: string
  price: number
  sortOrder?: number
}

interface CatalogSection {
  category: string
  items: CatalogItem[]
}

const asArray = (value: any, keys: string[] = []) => {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}

const csvEscape = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`
const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, '')

const parseCatalogCsv = (raw: string): CatalogSection[] => {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) throw new Error('Add at least one pricing row below the header')

  const headers = lines[0].split(',').map((part) => normalizeHeader(part))
  const categoryIndex = headers.findIndex((header) => header === 'category')
  const nameIndex = headers.findIndex((header) => header === 'name' || header === 'servicename' || header === 'itemname')
  const priceIndex = headers.findIndex((header) => header === 'price' || header === 'rate' || header === 'customerprice')

  if (categoryIndex === -1 || nameIndex === -1 || priceIndex === -1) {
    throw new Error('CSV must include category, name, and price columns')
  }

  const grouped = new Map<string, CatalogItem[]>()

  lines.slice(1).forEach((line, index) => {
    const parts = line.split(',').map((part) => part.trim().replace(/^"|"$/g, ''))
    const category = parts[categoryIndex]
    const name = parts[nameIndex]
    const price = Number(parts[priceIndex] || 0)

    if (!category || !name || Number.isNaN(price) || price < 0) {
      throw new Error(`Invalid pricing row ${index + 2}`)
    }

    const items = grouped.get(category) || []
    items.push({ name, price })
    grouped.set(category, items)
  })

  return Array.from(grouped.entries()).map(([category, items]) => ({ category, items }))
}

export default function PricingPage() {
  const [catalog, setCatalog] = useState<CatalogSection[]>([])
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState<{ catIdx: number; itemIdx: number } | null>(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('')
  const [addingCategory, setAddingCategory] = useState('')
  const [newItemName, setNewItemName] = useState('')
  const [newItemPrice, setNewItemPrice] = useState('')
  const [newItemSortOrder, setNewItemSortOrder] = useState('')
  const bulkUploadInputRef = useRef<HTMLInputElement | null>(null)

  const loadCatalog = useCallback(async () => {
    try {
      const res: any = await servicesAPI.getPriceList()
      const rawCatalog = asArray(res?.data?.catalog, ['catalog'])
      if (!rawCatalog.length) {
        setCatalog([])
        setLoadError('')
        return
      }
      const nextCatalog = rawCatalog.map((cat: any): CatalogSection => ({
        category: cat?.category || 'Uncategorized',
        items: asArray(cat?.items).map((item: any): CatalogItem => ({
          id: item?.id,
          name: item?.name || '',
          price: Number(item?.price || 0),
          sortOrder: Number(item?.sortOrder || 0) || undefined,
        })),
      }))
      setCatalog(nextCatalog)
      setLoadError('')
      setActiveCategory((current) => current && nextCatalog.some((section) => section.category === current) ? current : nextCatalog[0]?.category || '')
    } catch (e: any) {
      setCatalog([])
      setLoadError(e?.message || 'Could not load pricing catalog')
      toast.error(e?.message || 'Could not load pricing catalog')
    }
  }, [])

  useEffect(() => {
    loadCatalog()
  }, [loadCatalog])

  const resetAddForm = () => {
    setAddingCategory('')
    setNewItemName('')
    setNewItemPrice('')
    setNewItemSortOrder('')
  }

  const openAddForm = (category: string) => {
    if (addingCategory === category) {
      resetAddForm()
      return
    }
    setAddingCategory(category)
    setNewItemName('')
    setNewItemPrice('')
    setNewItemSortOrder('')
  }

  const filteredCatalog = search
    ? catalog.map((cat): CatalogSection => ({
        ...cat,
        items: cat.items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())),
      })).filter((cat) => cat.items.length > 0)
    : catalog.filter((cat) => cat.category === activeCategory)

  const startEdit = (catIdx: number, itemIdx: number, currentPrice: number) => {
    setEditing({ catIdx, itemIdx })
    setEditVal(String(currentPrice))
  }

  const saveEdit = async () => {
    if (!editing) return
    const newPrice = parseFloat(editVal)
    if (Number.isNaN(newPrice) || newPrice < 0) {
      toast.error('Enter a valid price')
      return
    }

    const item = catalog[editing.catIdx]?.items?.[editing.itemIdx]
    if (!item?.id) {
      toast.error('This item cannot be edited yet')
      return
    }

    setSaving(true)
    try {
      await servicesAPI.updateItem(item.id, { price: newPrice })
      await loadCatalog()
      toast.success('Price updated')
      setEditing(null)
    } catch (e: any) {
      toast.error(e.message || 'Failed to update price')
    } finally {
      setSaving(false)
    }
  }

  const createItem = async () => {
    if (!addingCategory) return

    const name = newItemName.trim()
    const price = parseFloat(newItemPrice)
    const sortOrder = newItemSortOrder.trim()

    if (!name) {
      toast.error('Enter an item name')
      return
    }
    if (Number.isNaN(price) || price < 0) {
      toast.error('Enter a valid price')
      return
    }
    if (sortOrder && (!Number.isInteger(Number(sortOrder)) || Number(sortOrder) <= 0)) {
      toast.error('Sort order must be a positive integer')
      return
    }

    setSaving(true)
    try {
      await servicesAPI.createItem({
        category: addingCategory,
        name,
        price,
        ...(sortOrder ? { sortOrder: Number.parseInt(sortOrder, 10) } : {}),
      })
      await loadCatalog()
      toast.success(`Added "${name}" to ${addingCategory}`)
      resetAddForm()
    } catch (e: any) {
      toast.error(e.message || 'Failed to create item')
    } finally {
      setSaving(false)
    }
  }

  const deactivateItem = async (item: CatalogItem) => {
    if (!item.id) {
      toast.error('This item cannot be managed yet')
      return
    }
    if (typeof window !== 'undefined' && !window.confirm(`Deactivate "${item.name}"?`)) return

    setSaving(true)
    try {
      await servicesAPI.deactivateItem(item.id)
      await loadCatalog()
      toast.success(`Deactivated "${item.name}"`)
      if (editing) setEditing(null)
    } catch (e: any) {
      toast.error(e.message || 'Failed to deactivate item')
    } finally {
      setSaving(false)
    }
  }

  const totalItems = catalog.reduce((sum, section) => sum + section.items.length, 0)

  const downloadRateCard = () => {
    if (!catalog.length) {
      toast.error('No pricing catalog loaded')
      return
    }
    const rows = [
      ['category', 'name', 'price'],
      ...catalog.flatMap((section) => section.items.map((item) => [section.category, item.name, item.price])),
    ]
    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'customer_rate_card.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const openBulkUpload = () => {
    bulkUploadInputRef.current?.click()
  }

  const uploadRateCard = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setSaving(true)
    try {
      const raw = await file.text()
      const nextCatalog = parseCatalogCsv(raw)
      setCatalog(nextCatalog)
      setActiveCategory((current) => current && nextCatalog.some((section) => section.category === current) ? current : nextCatalog[0]?.category || '')
      await servicesAPI.saveCatalog(nextCatalog)
      await loadCatalog()
      toast.success(`Uploaded ${nextCatalog.reduce((sum, section) => sum + section.items.length, 0)} customer pricing rows`)
    } catch (e: any) {
      toast.error(e.message || 'Failed to upload pricing CSV')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1300, margin: '0 auto', fontFamily: 'var(--crm-font-ui)' }}>
      <PageHeader
        title="Pricing & Services"
        subtitle={`${totalItems} services across ${catalog.length} categories — every item is read from the same master service API`}
        actions={<div style={{display:'flex',gap:10}}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search service..." style={{border:'1.5px solid #dce8f0',borderRadius:10,padding:'10px 14px',fontSize:14,outline:'none',width:220}} />
          <button onClick={downloadRateCard} disabled={!catalog.length} style={{padding:'10px 16px',background:'#fff',color:'#023c62',borderRadius:10,fontSize:13,fontWeight:700,border:'1px solid #dce8f0',cursor:'pointer',opacity:catalog.length?1:0.5}}>Download Rate Card</button>
          <button onClick={openBulkUpload} disabled={saving} style={{padding:'10px 16px',background:'#fff7ed',color:'#9a3412',borderRadius:10,fontSize:13,fontWeight:700,border:'1px solid #fed7aa',cursor:'pointer',opacity:saving?0.5:1}}>Bulk Upload</button>
          <input ref={bulkUploadInputRef} type="file" accept=".csv,text/csv" onChange={uploadRateCard} style={{display:'none'}} />
        </div>}
      />

      <div style={{ background: '#fffaf0', border: '1px solid #fed7aa', borderRadius: 12, padding: '12px 14px', marginBottom: 20, fontSize: 12, color: '#9a3412', lineHeight: 1.55 }}>
        Customer pricing stays on the existing service catalog only. Use <strong>Add Item</strong> inside any category for single-row changes, or <strong>Bulk Upload</strong> when replacing the rate card through the same master-data API.
      </div>

      {!catalog.length ? (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e8f0f7', padding: '40px 32px', textAlign: 'center', color: '#6b7fa3' }}>
          {loadError || 'No pricing catalog found in the database. Bootstrap it once from seed or create services from CRM.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, alignItems: 'start' }}>
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e8f0f7', padding: 12, position: 'sticky', top: 20 }}>
            {catalog.map((cat) => (
              <button
                key={cat.category}
                onClick={() => { setActiveCategory(cat.category); setSearch('') }}
                style={{ width: '100%', textAlign: 'left', padding: '10px 14px', borderRadius: 10, border: 'none', background: activeCategory === cat.category && !search ? '#023c62' : 'transparent', color: activeCategory === cat.category && !search ? '#fff' : '#6b7fa3', fontWeight: activeCategory === cat.category ? 700 : 400, cursor: 'pointer', fontSize: 13, marginBottom: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>{cat.category}</span>
                <span style={{ fontSize: 11, opacity: 0.7 }}>{cat.items.length}</span>
              </button>
            ))}
            <div style={{ borderTop: '1px solid #e8f0f7', marginTop: 8, paddingTop: 10 }}>
              <div style={{ fontSize: 11, color: '#6b7fa3', textAlign: 'center' }}>Add, edit, and deactivate items here. All apps consume the same catalog API.</div>
            </div>
          </div>

          <div>
            {filteredCatalog.map((cat) => {
              const realCatIdx = catalog.findIndex((section) => section.category === cat.category)
              return (
                <div key={cat.category} style={{ background: '#fff', borderRadius: 16, border: '1px solid #e8f0f7', boxShadow: '0 2px 12px rgba(2,60,98,0.06)', marginBottom: 16, overflow: 'hidden' }}>
                  <div style={{ background: '#023c62', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--crm-font-ui)', fontWeight: 700, fontSize: 15, color: '#fff' }}>{cat.category}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, color: 'rgba(184,208,232,0.7)' }}>{cat.items.length} items</span>
                      <button
                        onClick={() => openAddForm(cat.category)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', background: '#fff', color: '#023c62', border: 'none', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                      >
                        <Plus size={14} />
                        Add Item
                      </button>
                    </div>
                  </div>

                  {addingCategory === cat.category && (
                    <div style={{ padding: '14px 20px', background: '#f8fbfe', borderBottom: '1px solid #e8f0f7', display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) 120px 120px auto', gap: 10, alignItems: 'center' }}>
                      <input
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        placeholder={`New item under ${cat.category}`}
                        style={{ border: '1.5px solid #dce8f0', borderRadius: 10, padding: '10px 12px', fontSize: 13, outline: 'none' }}
                      />
                      <input
                        value={newItemPrice}
                        onChange={(e) => setNewItemPrice(e.target.value)}
                        placeholder="Price"
                        style={{ border: '1.5px solid #dce8f0', borderRadius: 10, padding: '10px 12px', fontSize: 13, outline: 'none' }}
                      />
                      <input
                        value={newItemSortOrder}
                        onChange={(e) => setNewItemSortOrder(e.target.value)}
                        placeholder="Sort Order"
                        style={{ border: '1.5px solid #dce8f0', borderRadius: 10, padding: '10px 12px', fontSize: 13, outline: 'none' }}
                      />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                          onClick={createItem}
                          disabled={saving}
                          style={{ padding: '10px 14px', background: '#023c62', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, opacity: saving ? 0.6 : 1 }}
                        >
                          Save Item
                        </button>
                        <button
                          onClick={resetAddForm}
                          style={{ padding: '10px 12px', background: '#fff', color: '#6b7fa3', border: '1px solid #dce8f0', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f7f9fc' }}>
                        <th style={{ padding: '9px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7fa3', textTransform: 'uppercase', letterSpacing: '0.06em', width: '70%' }}>Service / Item</th>
                        <th style={{ padding: '9px 20px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#6b7fa3', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Price (₹)</th>
                        <th style={{ width: 96 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {cat.items.map((item, itemIdx) => {
                        const isEditing = editing?.catIdx === realCatIdx && editing?.itemIdx === itemIdx
                        return (
                          <tr key={item.id || item.name} style={{ borderBottom: '1px solid #f0f4f8' }}>
                            <td style={{ padding: '11px 20px', fontSize: 14 }}>
                              <div style={{ fontWeight: 600, color: '#1a2332' }}>{item.name}</div>
                              {item.sortOrder ? <div style={{ fontSize: 11, color: '#8ca0b8', marginTop: 2 }}>Sort Order: {item.sortOrder}</div> : null}
                            </td>
                            <td style={{ padding: '11px 20px', textAlign: 'right' }}>
                              {isEditing ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                                  <span style={{ fontSize: 14, color: '#6b7fa3' }}>₹</span>
                                  <input
                                    value={editVal}
                                    onChange={(e) => setEditVal(e.target.value)}
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveEdit()
                                      if (e.key === 'Escape') setEditing(null)
                                    }}
                                    style={{ width: 80, border: '1.5px solid #023c62', borderRadius: 8, padding: '4px 8px', fontSize: 14, textAlign: 'right', outline: 'none' }}
                                  />
                                  <button
                                    onClick={saveEdit}
                                    disabled={saving}
                                    style={{ background: '#023c62', color: '#fff', border: 'none', borderRadius: 7, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditing(null)}
                                    style={{ background: '#f0f4f8', color: '#6b7fa3', border: 'none', borderRadius: 7, padding: '4px 10px', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : (
                                <span style={{ fontFamily: 'var(--crm-font-mono)', fontWeight: 600, color: '#022c50', fontSize: 15 }}>₹{item.price}</span>
                              )}
                            </td>
                            <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                              {!isEditing ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                  <button
                                    onClick={() => startEdit(realCatIdx, itemIdx, item.price)}
                                    style={{ background: 'transparent', border: 'none', color: '#9dafc8', cursor: 'pointer', fontSize: 16, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                    title="Edit price"
                                  >
                                    <Pencil size={15} />
                                  </button>
                                  <button
                                    onClick={() => deactivateItem(item)}
                                    style={{ background: 'transparent', border: 'none', color: '#d97706', cursor: 'pointer', fontSize: 16, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                    title="Deactivate item"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              ) : null}
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
