'use client'

import Script from 'next/script'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>
  }
}

const GTM_ID = 'GTM-5M5WF5CV'
const CRM_PATH_PREFIXES = ['/dashboard']
const CRM_PATHS = ['/login', '/change-password']

function isPublicPath(pathname: string) {
  return !CRM_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) && !CRM_PATHS.includes(pathname)
}

export default function PublicGoogleTagManager() {
  const pathname = usePathname()
  const publicPath = isPublicPath(pathname)

  useEffect(() => {
    if (!publicPath) return
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({
      event: 'page_view',
      page_path: pathname,
      page_location: window.location.href,
      page_title: document.title,
    })
  }, [pathname, publicPath])

  if (!publicPath) return null

  return (
    <>
      <Script id="google-tag-manager" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
      </Script>
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height="0"
          width="0"
          style={{ display: 'none', visibility: 'hidden' }}
        />
      </noscript>
    </>
  )
}
