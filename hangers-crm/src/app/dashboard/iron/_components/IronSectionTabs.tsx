'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/dashboard/iron/logs', label: 'Logs' },
  { href: '/dashboard/iron/applications', label: 'Applications' },
]

export default function IronSectionTabs() {
  const pathname = usePathname()

  return (
    <div className="crm-tab-shell">
      {TABS.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`crm-tab-link ${active ? 'crm-tab-link-active' : ''}`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
