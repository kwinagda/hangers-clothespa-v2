'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown> | unknown[]>
    gtag?: (...args: unknown[]) => void
  }
}

const GTM_ID = 'GTM-5M5WF5CV'
const GA_MEASUREMENT_ID = 'G-D23MCHNN38'
const CRM_PATH_PREFIXES = ['/dashboard']
const CRM_PATHS = ['/login', '/change-password']
const MARKETING_HOSTS = new Set(['hangers-cs.com', 'www.hangers-cs.com'])

function isPublicPath(pathname: string) {
  return !CRM_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) && !CRM_PATHS.includes(pathname)
}

export default function PublicGoogleTagManager() {
  const pathname = usePathname()
  const [isMarketingSite, setIsMarketingSite] = useState(false)
  const publicPath = isMarketingSite && isPublicPath(pathname)

  useEffect(() => {
    setIsMarketingSite(MARKETING_HOSTS.has(window.location.hostname))
  }, [])

  useEffect(() => {
    if (!publicPath) return
    window.dataLayer = window.dataLayer || []

    if (!document.querySelector(`script[src="https://www.googletagmanager.com/gtm.js?id=${GTM_ID}"]`)) {
      window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' })
      const script = document.createElement('script')
      script.async = true
      script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`
      document.head.appendChild(script)
    }

    if (!document.querySelector(`script[src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"]`)) {
      const script = document.createElement('script')
      script.async = true
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
      document.head.appendChild(script)
    }

    window.gtag = (...args) => window.dataLayer?.push(args)
    window.gtag('js', new Date())
    window.gtag('config', GA_MEASUREMENT_ID, { send_page_view: false })
    window.gtag('event', 'page_view', {
      page_path: pathname,
      page_location: window.location.href,
      page_title: document.title,
    })

    window.dataLayer.push({
      event: 'page_view',
      page_path: pathname,
      page_location: window.location.href,
      page_title: document.title,
    })
  }, [pathname, publicPath])

  return null
}
