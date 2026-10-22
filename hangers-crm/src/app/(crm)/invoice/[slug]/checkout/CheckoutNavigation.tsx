'use client'

import { createContext, ReactNode, useCallback, useContext, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

type BackHandler = { priority: number; run: () => boolean }
const Navigation = createContext<{
  register: (handler: BackHandler) => () => void
  back: () => boolean
}>({ register: () => () => {}, back: () => false })

export function CheckoutNavigation({ children }: { children: ReactNode }) {
  const handlers = useRef(new Set<BackHandler>())
  const register = useCallback((handler: BackHandler) => {
    handlers.current.add(handler)
    return () => { handlers.current.delete(handler) }
  }, [])
  const back = useCallback(() => Array.from(handlers.current).sort((a, b) => b.priority - a.priority)
    .some((handler) => handler.run()), [])
  return <Navigation.Provider value={{ register, back }}>{children}</Navigation.Provider>
}

export function useCheckoutBack(priority: number, handler: () => boolean) {
  const { register } = useContext(Navigation)
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => register({ priority, run: () => latest.current() }), [register, priority])
}

export function CheckoutBack({ href, className }: { href: string; className?: string }) {
  const { back } = useContext(Navigation)
  const router = useRouter()
  return <Link href={href} className={className} aria-label="Back to invoice details" onClick={(event) => {
    if (back()) event.preventDefault()
    else if (window.history.length > 1) { event.preventDefault(); router.back() }
  }}><ChevronLeft size={22} aria-hidden="true" /></Link>
}
