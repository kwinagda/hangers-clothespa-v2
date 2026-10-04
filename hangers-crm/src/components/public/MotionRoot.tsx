'use client'

import { useRef, type ReactNode } from 'react'
import { useHangersMotion } from './useHangersMotion'

export default function MotionRoot({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useHangersMotion(ref)
  return <div ref={ref}>{children}</div>
}
