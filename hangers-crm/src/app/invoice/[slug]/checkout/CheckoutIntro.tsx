'use client'

import { useEffect, useState } from 'react'
import { LOGO_BLUE_URL } from '@/lib/branding'
import styles from './page.module.css'

export default function CheckoutIntro({ skip }: { skip: boolean }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (skip || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    try {
      if (sessionStorage.getItem('hangers-checkout-intro')) return
      sessionStorage.setItem('hangers-checkout-intro', 'seen')
    } catch {
      // Storage restrictions must not prevent checkout or repeat the intro on navigation.
      return
    }
    setVisible(true)
    const timer = window.setTimeout(() => setVisible(false), 2800)
    return () => window.clearTimeout(timer)
  }, [skip])
  return visible ? <div className={styles.intro} aria-hidden="true"><img src={LOGO_BLUE_URL} alt="" /></div> : null
}
