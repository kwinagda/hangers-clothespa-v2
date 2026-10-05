'use client'

import { useEffect, useRef, useState } from 'react'
import { MARKETING_CLIPS, clipRatio, clipSources, type MarketingClipId } from '@/lib/marketingClips'
import { reduceMotion } from './marketingMotion'

const MAX_WIDTH: Record<string, string> = { '16/10': '1100px', '16/9': '1100px', '4/5': '460px', '1/1': '460px', '9/16': '360px' }

export default function VideoSlot({ clip, caption = true }: { clip: MarketingClipId; caption?: boolean }) {
  const item = MARKETING_CLIPS[clip]
  const videoRef = useRef<HTMLVideoElement>(null)
  const [mobile, setMobile] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [needsTap, setNeedsTap] = useState(false)
  const [still, setStill] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width:760px)')
    const update = () => setMobile(query.matches)
    update()
    query.addEventListener('change', update)
    setStill(reduceMotion())
    return () => query.removeEventListener('change', update)
  }, [])
  const ratio = clipRatio(item, mobile)
  const sources = clipSources(item, mobile)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = true
    const tryPlay = () => {
      const result = video.play()
      if (result && typeof result.catch === 'function') result.then(() => setNeedsTap(false)).catch(() => setNeedsTap(true))
    }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { if (!still) tryPlay() } else video.pause()
    }), { threshold: 0.1 })
    observer.observe(video)
    return () => observer.disconnect()
  }, [still, sources.webm])

  const play = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = true
    video.play().then(() => setNeedsTap(false)).catch(() => {})
  }

  return <figure style={{ margin: '0 auto', maxWidth: MAX_WIDTH[ratio] || '460px' }}>
    <div style={{ position: 'relative', aspectRatio: ratio, borderRadius: 28, overflow: 'hidden', background: 'linear-gradient(150deg,#E8F0F7,#c4d9ea)', boxShadow: '0 20px 50px rgba(2,60,98,.12)' }}>
      <img src={sources.webm.replace(/\.webm$/, '.jpg')} alt="" aria-hidden="true" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }} />
      {!loaded && <div aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <span style={{ width: 52, height: 52, borderRadius: '50%', background: '#023c62' }} />
      </div>}
      <video ref={videoRef} aria-label={item.title} muted loop playsInline preload="none" poster={`${sources.webm.replace(/\.webm$/, '.jpg')}`} onLoadedData={() => setLoaded(true)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0, transition: 'opacity .5s', zIndex: 1 }}>
        <source src={sources.webm} type="video/webm" />
        <source src={sources.mp4} type="video/mp4" />
      </video>
      {(needsTap || still) && <button type="button" onClick={play} aria-label={`Play video: ${item.title}`} style={{ position: 'absolute', inset: 0, zIndex: 3, border: 0, background: 'rgba(2,60,98,.25)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
        <span style={{ width: 72, height: 72, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center' }}>
          <span style={{ borderLeft: '20px solid #023c62', borderTop: '12px solid transparent', borderBottom: '12px solid transparent', marginLeft: 6 }} />
        </span>
      </button>}
    </div>
    {caption && <figcaption style={{ marginTop: 12, fontWeight: 600, color: '#023c62', textAlign: 'center' }}>{item.title}</figcaption>}
  </figure>
}
