'use client'

import { useEffect } from 'react'

const labelTable = (table: HTMLTableElement) => {
  if (table.classList.contains('crm-keep-table')) return
  const headings = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'))
    .map((heading) => heading.textContent?.trim() || '')
  if (!headings.length) return

  table.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((row) => {
    Array.from(row.children).forEach((cell, index) => {
      if (!(cell instanceof HTMLTableCellElement) || cell.dataset.label) return
      cell.dataset.label = headings[index] || ''
    })
  })
  if (table.dataset.responsiveLabels !== 'ready') {
    table.dataset.responsiveLabels = 'ready'
    table.classList.add('crm-responsive-table')
  }
}

export function ResponsiveTableLabels() {
  useEffect(() => {
    const root = document.querySelector('.crm-dashboard-main')
    if (!root) return
    const scan = () => root.querySelectorAll<HTMLTableElement>('table').forEach(labelTable)
    scan()
    const observer = new MutationObserver(scan)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return null
}
