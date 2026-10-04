'use client'

import { useMemo, useState } from 'react'

type RateItem = { id: string; name: string; price: number; sortOrder?: number }
type RateCategory = { id?: string; key?: string; label: string; items?: RateItem[] }
type FlatRow = RateItem & { categoryKey: string; categoryLabel: string; categoryIndex: number; itemIndex: number }

const GROUP_PAGE_SIZE = 12
const FLAT_PAGE_SIZE = 24

const inr = (value: unknown) => `₹${Number(value || 0).toLocaleString('en-IN')}`
const rs = (value: unknown) => `Rs. ${Number(value || 0).toLocaleString('en-IN')}`
const normalize = (value: unknown) => String(value || '').toLowerCase().trim()
const family = (name: string) => name.split('-')[0].trim()

const STYLE = `
.rate-root{font-family:'Space Grotesk',sans-serif;color:#0b2536}
.rate-bar{position:sticky;top:68px;z-index:40;background:rgba(247,249,252,.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);padding:14px 0;border-bottom:1px solid #d6e2ec}
.rate-bar-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:center}
.rate-search{height:52px;width:100%;border:1px solid #c9d9e6;border-radius:999px;background:#fff;padding:0 22px;font-size:16px;color:#0b2536;outline:none}
.rate-search::placeholder{color:#7b92a3}
.rate-search:focus{border-color:#023c62;box-shadow:0 0 0 4px rgba(2,60,98,.12)}
.rate-select{height:52px;border:1px solid #c9d9e6;border-radius:999px;background:#fff;padding:0 18px;font-size:15px;font-weight:600;color:#023c62}
.rate-chips{display:flex;gap:8px;overflow-x:auto;margin-top:12px;padding-bottom:2px;scrollbar-width:none}
.rate-category-button{flex:0 0 auto;min-height:40px;padding:0 16px;border:1px solid #c9d9e6;border-radius:999px;background:#fff;color:#023c62;font-size:14px;font-weight:600;cursor:pointer;display:inline-flex;gap:8px;align-items:center}
.rate-category-button span{color:#5b7486;font-weight:500}
.rate-category-button.is-active{background:#023c62;border-color:#023c62;color:#fff}
.rate-category-button.is-active span{color:#d3e4f1}
.rate-toggle{display:inline-flex;border:1px solid #c9d9e6;border-radius:999px;overflow:hidden;background:#fff}
.rate-toggle button{min-height:52px;padding:0 16px;border:0;background:transparent;color:#023c62;font-size:14px;font-weight:600;cursor:pointer}
.rate-toggle button.is-active{background:#023c62;color:#fff}
.rate-result{margin:18px 0 0;color:#5b7486;font-size:14px}
.rate-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:16px;margin-top:20px}
.rate-group{background:#fff;border:1px solid #d6e2ec;border-radius:24px;padding:22px}
.rate-group-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.rate-group h3{margin:0;color:#023c62;font-size:22px;letter-spacing:-.03em}
.rate-tag{display:inline-block;padding:4px 10px;border-radius:999px;background:#E8F0F7;color:#023c62;font-size:12px;font-weight:600;white-space:nowrap}
.rate-range{margin:10px 0 14px;color:#3d5668;font-size:15px}
.rate-range strong{color:#023c62;font-size:20px}
.rate-variant{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid #e3ecf3;font-size:15px;color:#0b2536}
.rate-variant b{color:#023c62;white-space:nowrap}
.rate-flat{margin-top:20px;background:#fff;border:1px solid #d6e2ec;border-radius:24px;overflow:hidden}
.rate-flat-head,.rate-flat-row{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1.1fr) auto;gap:12px;align-items:center;padding:16px 24px}
.rate-flat-head{background:#E8F0F7;color:#5b7486;font-size:13px;font-weight:600}
.rate-flat-row{border-top:1px solid #d6e2ec}
.rate-flat-row .name{color:#023c62;font-size:18px;font-weight:600}
.rate-flat-row .cat{color:#3d5668;font-size:15px}
.rate-flat-row .price{color:#023c62;font-size:18px;font-weight:700;text-align:right;white-space:nowrap}
.rate-pager{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:28px;flex-wrap:wrap}
.rate-page-btn{min-height:44px;padding:0 20px;border:1.5px solid #023c62;border-radius:999px;background:#fff;color:#023c62;font-size:15px;font-weight:600;cursor:pointer}
.rate-page-btn:disabled{opacity:.35;cursor:not-allowed;border-color:#b9c8d4;color:#7b92a3}
.rate-page-count{color:#5b7486;font-size:14px}
.rate-empty{margin:30px 0;padding:28px;text-align:center;color:#3d5668;background:#fff;border:1px solid #d6e2ec;border-radius:24px}
.rate-note{margin-top:24px;color:#5b7486;font-size:14px}
@media(max-width:760px){.rate-bar-row{grid-template-columns:1fr}.rate-toggle{width:100%}.rate-toggle button{flex:1}.rate-flat-head{display:none}.rate-flat-row{grid-template-columns:1fr auto}.rate-flat-row .cat{grid-column:1/-1;order:3}}
`

export default function RateChartClient({ categories }: { categories: RateCategory[] }) {
  const [query, setQuery] = useState('')
  const [categoryKey, setCategoryKey] = useState('ALL')
  const [sort, setSort] = useState('category')
  const [view, setView] = useState<'garment' | 'flat'>('garment')
  const [page, setPage] = useState(1)

  const rows = useMemo<FlatRow[]>(() => categories.flatMap((category, categoryIndex) => (category.items || []).map((item, itemIndex) => ({
    ...item,
    categoryKey: category.key || category.id || category.label,
    categoryLabel: category.label,
    categoryIndex,
    itemIndex,
  }))), [categories])

  const filtered = useMemo(() => {
    const q = normalize(query)
    const matches = rows.filter((row) => (categoryKey === 'ALL' || row.categoryKey === categoryKey) && (!q || normalize(`${row.name} ${row.categoryLabel}`).includes(q)))
    return [...matches].sort((a, b) => {
      if (sort === 'name_asc') return a.name.localeCompare(b.name)
      if (sort === 'name_desc') return b.name.localeCompare(a.name)
      if (sort === 'price_low') return Number(a.price || 0) - Number(b.price || 0) || a.name.localeCompare(b.name)
      if (sort === 'price_high') return Number(b.price || 0) - Number(a.price || 0) || a.name.localeCompare(b.name)
      return a.categoryIndex - b.categoryIndex || a.itemIndex - b.itemIndex || a.name.localeCompare(b.name)
    })
  }, [categoryKey, query, rows, sort])

  const groups = useMemo(() => {
    const map = new Map<string, FlatRow[]>()
    filtered.forEach((row) => {
      const key = family(row.name)
      if (!map.has(key)) map.set(key, [])
      map.get(key)?.push(row)
    })
    return Array.from(map.entries()).map(([name, items]) => {
      const prices = items.map((item) => Number(item.price || 0))
      return { name, items, min: Math.min(...prices), max: Math.max(...prices) }
    })
  }, [filtered])

  const pageSize = view === 'garment' ? GROUP_PAGE_SIZE : FLAT_PAGE_SIZE
  const total = view === 'garment' ? groups.length : filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const visibleGroups = groups.slice(start, start + GROUP_PAGE_SIZE)
  const visibleRows = filtered.slice(start, start + FLAT_PAGE_SIZE)

  const reset = (fn: () => void) => { fn(); setPage(1) }
  const selectCategory = (next: string) => reset(() => setCategoryKey(next))

  if (!categories.length) return <section className="rate-empty rate-root">No active rate chart items are available right now.</section>

  const shownFrom = total ? start + 1 : 0
  const shownTo = Math.min(start + pageSize, total)

  return <div className="rate-root">
    <style>{STYLE}</style>
    <div className="rate-bar">
      <div className="rate-bar-row">
        <input className="rate-search" value={query} onChange={(event) => reset(() => setQuery(event.target.value))} placeholder="Search garment, e.g. saree" aria-label="Search rate chart" />
        <select className="rate-select" value={sort} onChange={(event) => reset(() => setSort(event.target.value))} aria-label="Sort by">
          <option value="category">Sort by: Service wise</option>
          <option value="name_asc">Sort by: Name A-Z</option>
          <option value="name_desc">Sort by: Name Z-A</option>
          <option value="price_low">Sort by: Price low-high</option>
          <option value="price_high">Sort by: Price high-low</option>
        </select>
        <div className="rate-toggle" role="group" aria-label="View">
          <button type="button" className={view === 'garment' ? 'is-active' : ''} aria-pressed={view === 'garment'} onClick={() => reset(() => setView('garment'))}>Garment</button>
          <button type="button" className={view === 'flat' ? 'is-active' : ''} aria-pressed={view === 'flat'} onClick={() => reset(() => setView('flat'))}>Flat list</button>
        </div>
      </div>
      <div className="rate-chips">
        <button type="button" className={`rate-category-button ${categoryKey === 'ALL' ? 'is-active' : ''}`} onClick={() => selectCategory('ALL')}>All services <span>{rows.length}</span></button>
        {categories.map((category) => {
          const key = category.key || category.id || category.label
          return <button type="button" key={key} className={`rate-category-button ${categoryKey === key ? 'is-active' : ''}`} onClick={() => selectCategory(key)}>{category.label} <span>{(category.items || []).length}</span></button>
        })}
      </div>
    </div>

    <p className="rate-result">{total ? `${shownFrom}–${shownTo} of ${total}` : '0 matching rates'}</p>

    {!filtered.length && <section className="rate-empty">No rates matched your search.</section>}

    {filtered.length > 0 && view === 'garment' && <div className="rate-groups">
      {visibleGroups.map((group) => <article className="rate-group" key={group.name}>
        <div className="rate-group-head"><h3>{group.name}</h3><span className="rate-tag">{group.items.length} {group.items.length === 1 ? 'product' : 'products'}</span></div>
        <div className="rate-range">from <strong>{inr(group.min)}</strong>{group.min !== group.max && <> · {inr(group.min)} – {inr(group.max)}</>}</div>
        {group.items.map((item) => <div className="rate-variant" key={item.id}><span>{item.name}</span><b>{inr(item.price)}</b></div>)}
      </article>)}
    </div>}

    {filtered.length > 0 && view === 'flat' && <div className="rate-flat">
      <div className="rate-flat-head"><span>Item</span><span>Service</span><span style={{ textAlign: 'right' }}>Rate</span></div>
      {visibleRows.map((row) => <div className="rate-flat-row" key={row.id}><span className="name">{row.name}</span><span className="cat">{row.categoryLabel}</span><span className="price">{rs(row.price)}</span></div>)}
    </div>}

    {filtered.length > 0 && <div className="rate-pager">
      <button className="rate-page-btn" type="button" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
      <div className="rate-page-count">{shownFrom}–{shownTo} of {total}</div>
      <button className="rate-page-btn" type="button" disabled={safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</button>
    </div>}

    <p className="rate-note">Rates are subject to item and fabric inspection.</p>
  </div>
}
