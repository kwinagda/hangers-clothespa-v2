'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CalendarDays, Check, ClipboardList, Ellipsis, FileText, Home, IndianRupee,
  LayoutGrid, Package, Plus, Search, Settings, Shirt, Sofa, Users, X,
} from 'lucide-react'

type NavItem = { href: string; label: string; permission?: string }
type NavSection = { label: string; items: NavItem[] }
type PreferenceItem = { id: string; href: string }

const ICONS: Array<[string, typeof Home]> = [
  ['/dashboard/orders/new', Plus], ['/dashboard/orders', Package],
  ['/dashboard/customers', Users], ['/dashboard/iron', Shirt],
  ['/dashboard/pickup-requests', ClipboardList], ['/dashboard/quotations', FileText],
  ['/dashboard/service-appointments', Sofa], ['/dashboard/plantchallans', ClipboardList],
  ['/dashboard/finance', IndianRupee], ['/dashboard/cashbook', IndianRupee],
  ['/dashboard/attendance', CalendarDays], ['/dashboard/print', Settings],
]

const iconFor = (href: string) => ICONS.find(([prefix]) => href.startsWith(prefix))?.[1] || LayoutGrid

export function MobileAppNavigation({
  sections, pathname, pageLabel, primaryIds, availableItems, onSavePrimary,
}: {
  sections: NavSection[]
  pathname: string
  pageLabel: string
  primaryIds: string[]
  availableItems: PreferenceItem[]
  onSavePrimary: (items: string[]) => Promise<void>
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>(primaryIds)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)

  const flatItems = useMemo(() => sections.flatMap((section) => section.items), [sections])
  const availableById = useMemo(() => new Map(availableItems.map((item) => [item.id, item.href])), [availableItems])
  const resolvedPrimaryIds = useMemo(() => Array.from(new Set([
    ...primaryIds,
    'orders',
    'daily_iron',
    ...availableItems.map((item) => item.id),
  ])).filter((id) => {
    const href = availableById.get(id)
    return Boolean(href && flatItems.some((item) => item.href.split('?')[0] === href))
  }).slice(0, 2), [availableById, availableItems, flatItems, primaryIds])

  useEffect(() => {
    setMoreOpen(false)
    setEditing(false)
    setQuery('')
  }, [pathname])

  useEffect(() => setDraft(resolvedPrimaryIds), [resolvedPrimaryIds])

  useEffect(() => {
    if (!moreOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setMoreOpen(false)
    window.addEventListener('keydown', close)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', close)
    }
  }, [moreOpen])

  const primary = resolvedPrimaryIds.map((id) => {
    const href = availableById.get(id)
    return href ? flatItems.find((item) => item.href.split('?')[0] === href) : undefined
  }).filter(Boolean) as NavItem[]
  const filteredSections = sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase())),
  })).filter((section) => section.items.length)

  const toggleDraft = (id: string) => {
    setDraft((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : current.length < 2 ? [...current, id] : [current[1], id])
  }

  const save = async () => {
    if (draft.length !== 2) return
    setSaving(true)
    try {
      await onSavePrimary(draft)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <header className="crm-appbar">
        <div className="crm-appbar-brand" aria-hidden="true">H</div>
        <div className="crm-appbar-copy">
          <span>Hangers CRM</span>
          <strong>{pageLabel}</strong>
        </div>
        <button onClick={() => setMoreOpen(true)} aria-label="Open all CRM sections"><Ellipsis size={22} /></button>
      </header>

      <nav className="crm-bottom-nav" aria-label="Primary navigation">
        <BottomLink href="/dashboard" label="Home" icon={Home} active={pathname === '/dashboard'} />
        {primary.map((item) => <BottomLink key={item.href} href={item.href} label={item.label.replace('All ', '')} icon={iconFor(item.href)} active={pathname.startsWith(item.href.split('?')[0])} />)}
        <BottomLink href="/dashboard/search" label="Search" icon={Search} active={pathname === '/dashboard/search'} />
        <button className={moreOpen ? 'active' : ''} onClick={() => setMoreOpen(true)}><Ellipsis size={21} /><span>More</span></button>
      </nav>

      {moreOpen && (
        <section className="crm-more-screen" aria-label="All CRM sections">
          <header>
            <div><small>Hangers CRM</small><h1>{editing ? 'Choose shortcuts' : 'All sections'}</h1></div>
            <button onClick={() => { setMoreOpen(false); setEditing(false) }} aria-label="Close"><X size={22} /></button>
          </header>
          {editing ? (
            <div className="crm-shortcut-editor">
              <p>Select exactly two destinations for your bottom navigation.</p>
              <div>
                {availableItems.map(({ id, href }) => {
                  const item = flatItems.find((candidate) => candidate.href.split('?')[0] === href)
                  if (!item) return null
                  const Icon = iconFor(href)
                  const selected = draft.includes(id)
                  return <button key={id} className={selected ? 'selected' : ''} onClick={() => toggleDraft(id)}><Icon size={19} /><span>{item.label}</span>{selected && <Check size={18} />}</button>
                })}
              </div>
              <footer><button onClick={() => { setDraft(resolvedPrimaryIds); setEditing(false) }}>Cancel</button><button className="primary" disabled={draft.length !== 2 || saving} onClick={save}>{saving ? 'Saving…' : 'Save shortcuts'}</button></footer>
            </div>
          ) : (
            <>
              <div className="crm-more-tools">
                <label><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a section" /></label>
                <button onClick={() => { setDraft(resolvedPrimaryIds); setEditing(true) }}>Edit shortcuts</button>
              </div>
              <div className="crm-more-list">
                {filteredSections.map((section) => <section key={section.label}><h2>{section.label}</h2><div>{section.items.map((item) => { const Icon = iconFor(item.href); return <Link key={item.href} href={item.href}><Icon size={20} /><span>{item.label}</span></Link> })}</div></section>)}
              </div>
            </>
          )}
        </section>
      )}
    </>
  )
}

function BottomLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Home; active: boolean }) {
  return <Link href={href} className={active ? 'active' : ''}><Icon size={21} /><span>{label}</span></Link>
}
