'use client'

import { useMemo, useState } from 'react'

type RateItem = {
  id: string
  name: string
  price: number
}

type RateCategory = {
  id?: string
  key?: string
  label: string
  color?: string
  lightColor?: string
  items?: RateItem[]
}

const PAGE_SIZE = 24

const money = (value: any) => `₹${Number(value || 0).toLocaleString('en-IN')}`

const normalize = (value: any) => String(value || '').toLowerCase().trim()

export default function RateChartClient({ categories }: { categories: RateCategory[] }) {
  const [query, setQuery] = useState('')
  const [categoryKey, setCategoryKey] = useState('ALL')
  const [sort, setSort] = useState('category')
  const [page, setPage] = useState(1)

  const flatItems = useMemo(() => {
    return categories.flatMap((category) => (category.items || []).map((item) => ({
      ...item,
      categoryKey: category.key || category.id || category.label,
      categoryLabel: category.label,
      categoryColor: category.color || '#023c62',
      categoryLightColor: category.lightColor || '#f7fbff',
    })))
  }, [categories])

  const filteredItems = useMemo(() => {
    const q = normalize(query)
    const selected = categoryKey
    const rows = flatItems.filter((item) => {
      const categoryMatches = selected === 'ALL' || item.categoryKey === selected
      const queryMatches = !q || normalize(`${item.name} ${item.categoryLabel}`).includes(q)
      return categoryMatches && queryMatches
    })
    return [...rows].sort((a, b) => {
      if (sort === 'name_asc') return a.name.localeCompare(b.name)
      if (sort === 'name_desc') return b.name.localeCompare(a.name)
      if (sort === 'price_low') return Number(a.price || 0) - Number(b.price || 0) || a.name.localeCompare(b.name)
      if (sort === 'price_high') return Number(b.price || 0) - Number(a.price || 0) || a.name.localeCompare(b.name)
      return a.categoryLabel.localeCompare(b.categoryLabel) || a.name.localeCompare(b.name)
    })
  }, [categoryKey, flatItems, query, sort])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedItems = filteredItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const groupedItems = useMemo(() => {
    const map = new Map<string, typeof pagedItems>()
    pagedItems.forEach((item) => {
      if (!map.has(item.categoryKey)) map.set(item.categoryKey, [])
      map.get(item.categoryKey)?.push(item)
    })
    return Array.from(map.entries()).map(([key, items]) => ({ key, items, first: items[0] }))
  }, [pagedItems])

  const resetPage = (fn: () => void) => {
    fn()
    setPage(1)
  }

  if (!categories.length) return <section className="rate-empty">No active rate chart items are available right now.</section>

  return (
    <>
      <section className="rate-toolbar">
        <input
          className="rate-search"
          value={query}
          onChange={(event) => resetPage(() => setQuery(event.target.value))}
          placeholder="Search saree, shirt, sofa..."
          aria-label="Search rate chart"
        />
        <div className="rate-controls">
          <select className="rate-select" value={categoryKey} onChange={(event) => resetPage(() => setCategoryKey(event.target.value))} aria-label="Filter category">
            <option value="ALL">All categories</option>
            {categories.map((category) => (
              <option key={category.key || category.id || category.label} value={category.key || category.id || category.label}>{category.label}</option>
            ))}
          </select>
          <select className="rate-select" value={sort} onChange={(event) => resetPage(() => setSort(event.target.value))} aria-label="Sort rate chart">
            <option value="category">Service wise</option>
            <option value="name_asc">Name A-Z</option>
            <option value="name_desc">Name Z-A</option>
            <option value="price_low">Price low-high</option>
            <option value="price_high">Price high-low</option>
          </select>
        </div>
        <div className="rate-result-line">
          Showing {filteredItems.length ? `${(safePage - 1) * PAGE_SIZE + 1}-${Math.min(safePage * PAGE_SIZE, filteredItems.length)} of ${filteredItems.length}` : '0'} matching rates
        </div>
      </section>

      {filteredItems.length ? (
        <>
          {groupedItems.map((group, groupIndex) => (
            <section className="rate-section rate-animate" style={{ animationDelay: `${Math.min(groupIndex * 45, 180)}ms` }} key={group.key}>
              <div className="rate-section-head" style={{ background: group.first.categoryLightColor }}>
                <h2 className="rate-section-title" style={{ color: group.first.categoryColor }}>{group.first.categoryLabel}</h2>
                <div className="rate-section-count">{group.items.length} shown</div>
              </div>
              <div className="rate-list">
                {group.items.map((item, index) => <RateRow item={item} key={item.id} index={index} />)}
              </div>
            </section>
          ))}

          <div className="rate-pager">
            <button className="rate-page-btn" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
            <div className="rate-page-count">Page {safePage} / {totalPages}</div>
            <button className="rate-page-btn" disabled={safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</button>
          </div>
        </>
      ) : (
        <section className="rate-empty">No rates matched your search.</section>
      )}
    </>
  )
}

function RateRow({ item, index }: { item: any; index: number }) {
  return (
    <div className="rate-row rate-row-animate" style={{ animationDelay: `${Math.min(index * 18, 220)}ms` }}>
      <div className="rate-name">{item.name}</div>
      <div className="rate-price">{money(item.price)}</div>
    </div>
  )
}
