'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

type CheckoutMotionProps = {
  src: string
  poster?: string
  className: string
  videoClassName: string
  fallback: ReactNode
  loop?: boolean
}

export default function CheckoutMotion({
  src,
  poster,
  className,
  videoClassName,
  fallback,
  loop = true,
}: CheckoutMotionProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [motionAllowed, setMotionAllowed] = useState(false)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const videoFailed = failedSource === src

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncPreference = () => setMotionAllowed(!preference.matches)
    syncPreference()
    preference.addEventListener('change', syncPreference)
    return () => preference.removeEventListener('change', syncPreference)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !motionAllowed || videoFailed) {
      video?.pause()
      return
    }
    void video.play().catch(() => setFailedSource(src))
    return () => video.pause()
  }, [motionAllowed, src, videoFailed])

  return <span className={className} aria-hidden="true">
    {motionAllowed && !videoFailed
      ? <video
          ref={videoRef}
          className={videoClassName}
          src={src}
          poster={poster}
          autoPlay
          muted
          playsInline
          loop={loop}
          preload="metadata"
          onError={() => setFailedSource(src)}
        />
      : fallback}
  </span>
}
