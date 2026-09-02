'use client'

import { ReactNode, useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

type DialogSize = 'sm' | 'md' | 'lg' | 'xl'

interface ResponsiveDialogProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: DialogSize
  closeOnBackdrop?: boolean
  className?: string
}

const focusableSelector = [
  'button:not([disabled])', 'a[href]', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

export function ResponsiveDialog({ open, title, description, onClose, children, footer, size = 'md', closeOnBackdrop = true, className = '' }: ResponsiveDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const historyMarkerRef = useRef(`crm-overlay-${Math.random().toString(36).slice(2)}`)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    openerRef.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const marker = historyMarkerRef.current
    window.history.pushState({ ...window.history.state, __crmOverlay: marker }, '', window.location.href)
    const focusFirst = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector)
      ;(focusable?.[0] || panelRef.current)?.focus()
    }, 0)
    const handlePopState = () => onCloseRef.current()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (window.history.state?.__crmOverlay === marker) window.history.back()
        else onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(focusableSelector))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('popstate', handlePopState)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusFirst)
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (window.history.state?.__crmOverlay === marker) window.history.back()
      openerRef.current?.focus?.()
    }
  }, [open])

  if (!open) return null
  const requestClose = () => {
    if (window.history.state?.__crmOverlay === historyMarkerRef.current) window.history.back()
    else onClose()
  }

  return (
    <div className="crm-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (closeOnBackdrop && event.target === event.currentTarget) requestClose()
    }}>
      <div ref={panelRef} className={`crm-responsive-dialog crm-dialog-${size} ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1}>
        <header className="crm-dialog-header">
          <div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div>
          <button type="button" onClick={requestClose} aria-label={`Close ${title}`}><X size={20} /></button>
        </header>
        <div className="crm-dialog-body">{children}</div>
        {footer && <footer className="crm-dialog-footer">{footer}</footer>}
      </div>
    </div>
  )
}
