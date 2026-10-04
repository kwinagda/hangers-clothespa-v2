'use client'

import { useEffect, type RefObject } from 'react'
import { EASE, finePointer, reduceMotion } from './marketingMotion'

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const FROM: Record<string, string> = { up: 'translateY(34px)', left: 'translateX(-40px)', right: 'translateX(40px)', scale: 'scale(.88)', blur: 'translateY(20px)' }

export function useHangersMotion(rootRef: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const root = rootRef.current
    if (!enabled || !root) return
    const reduce = reduceMotion()
    const fine = finePointer()
    const mobileQuery = window.matchMedia('(max-width:760px)')
    const $$ = <T extends Element = HTMLElement>(s: string) => Array.from(root.querySelectorAll<T>(s))
    const seen = new WeakSet<Element>()
    const cleanups: Array<() => void> = []

    const countUp = (el: HTMLElement) => {
      const from = +(el.dataset.from || 0), to = +(el.dataset.to || 0), dec = +(el.dataset.dec || 0), t0 = performance.now()
      if (reduce) return
      const frame = (t: number) => {
        const k = clamp((t - t0) / 1400)
        el.textContent = (from + (to - from) * (1 - Math.pow(1 - k, 3))).toFixed(dec)
        if (k < 1) requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    }

    const io = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      const el = entry.target as HTMLElement & { _rv?: boolean; _words?: HTMLElement[] }
      io.unobserve(el)
      if (el._rv) { el.style.transitionDelay = (el.dataset.d || '0') + 'ms'; el.style.opacity = '1'; el.style.transform = 'none'; el.style.filter = 'none' }
      if (el._words) el._words.forEach((w, i) => { w.style.transitionDelay = `${i * 55}ms`; w.style.transform = 'translateY(0)' })
      if (el.hasAttribute('data-count')) countUp(el)
    }), { threshold: 0.12 })

    const scan = () => {
      if (root.querySelector('.dp-body')) {
        $$<HTMLElement>('.dp-body .dp-section, .dp-body .dp-card, .dp-body .dp-fact, .dp-body .dp-band, .dp-body .dp-media, .dp-body .dp-list, .dp-body .dp-faq details').forEach((el) => {
          if (!el.hasAttribute('data-rv') && !seen.has(el)) el.setAttribute('data-rv', 'up')
        })
      }
      $$<HTMLElement>('[data-rv]').forEach((el) => {
        if (seen.has(el)) return
        seen.add(el)
        if (reduce) return
        const kind = el.dataset.rv || 'up'
        const tagged = el as HTMLElement & { _rv?: boolean }
        tagged._rv = true
        el.style.opacity = '0'
        el.style.transform = FROM[kind] || FROM.up
        if (kind === 'blur') el.style.filter = 'blur(8px)'
        el.style.transition = `opacity .8s ${EASE}, transform .8s ${EASE}, filter .8s ${EASE}`
        io.observe(el)
      })
      $$<HTMLElement>('[data-words]').forEach((el) => {
        if (seen.has(el)) return
        seen.add(el)
        if (reduce || !el.textContent?.trim()) return
        const words = el.textContent.trim().split(/\s+/)
        el.textContent = ''
        const inner: HTMLElement[] = []
        words.forEach((w) => {
          const outer = document.createElement('span')
          outer.style.cssText = 'display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.14em;margin-bottom:-.14em'
          const word = document.createElement('span')
          word.textContent = w
          word.style.cssText = `display:inline-block;transform:translateY(110%);transition:transform .9s ${EASE}`
          outer.appendChild(word)
          el.appendChild(outer)
          el.appendChild(document.createTextNode(' '))
          inner.push(word)
        })
        ;(el as HTMLElement & { _words?: HTMLElement[] })._words = inner
        io.observe(el)
      })
      $$<HTMLElement>('[data-scrub]').forEach((el) => {
        if (seen.has(el)) return
        seen.add(el)
        if (reduce || !el.textContent?.trim()) return
        const words = el.textContent.trim().split(/\s+/)
        el.textContent = ''
        words.forEach((w) => {
          const span = document.createElement('span')
          span.textContent = w + ' '
          span.style.opacity = '.16'
          span.style.transition = 'opacity .25s'
          el.appendChild(span)
        })
      })
      $$<HTMLElement>('[data-count]').forEach((el) => { if (!seen.has(el)) { seen.add(el); io.observe(el) } })
      applyMobile()
    }

    const applyMobile = () => {
      $$<HTMLElement>('[data-hide-m]').forEach((el) => {
        const d = (el as HTMLElement & { _d?: string })._d ?? ((el as HTMLElement & { _d?: string })._d = el.style.display)
        el.style.display = mobileQuery.matches ? 'none' : d
      })
    }
    mobileQuery.addEventListener('change', applyMobile)

    const onDown = (e: PointerEvent) => {
      const target = (e.target as Element | null)?.closest?.('[data-ripple]') as HTMLElement | null
      if (!target || reduce) return
      if (getComputedStyle(target).position === 'static') target.style.position = 'relative'
      target.style.overflow = 'hidden'
      const r = target.getBoundingClientRect()
      const size = Math.max(r.width, r.height) * 2.2
      const dot = document.createElement('span')
      dot.style.cssText = `position:absolute;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px;width:${size}px;height:${size}px;border-radius:50%;background:currentColor;opacity:.18;pointer-events:none`
      target.appendChild(dot)
      dot.animate([{ transform: 'scale(0)', opacity: 0.22 }, { transform: 'scale(1)', opacity: 0 }], { duration: 650, easing: 'ease-out' }).onfinish = () => dot.remove()
    }
    root.addEventListener('pointerdown', onDown)

    let mx = -100, my = -100, rx = -100, ry = -100
    const useCursor = fine && !reduce
    let ring: HTMLDivElement | null = null, dot: HTMLDivElement | null = null
    const onMove = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY
      if (ring && dot) {
        ring.style.opacity = '1'; dot.style.opacity = '1'
        const hover = (e.target as Element | null)?.closest?.('a,button,[data-hover]')
        ring.style.width = ring.style.height = hover ? '64px' : '36px'
        ring.style.margin = hover ? '-32px 0 0 -32px' : '-18px 0 0 -18px'
        ring.style.background = hover ? 'rgba(2,60,98,.12)' : 'transparent'
      }
      if (reduce) return
      $$<HTMLElement>('[data-mag]').forEach((m) => {
        const r = m.getBoundingClientRect()
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2)
        const near = Math.hypot(dx, dy) < Math.max(r.width, r.height) * 0.8
        m.style.transition = near ? 'transform .15s' : `transform .5s ${EASE}`
        m.style.transform = near ? `translate(${dx * 0.25}px,${dy * 0.35}px)` : 'translate(0,0)'
      })
      $$<HTMLElement>('[data-tilt]').forEach((t) => {
        const r = t.getBoundingClientRect()
        const px = clamp((e.clientX - r.left) / r.width, -0.3, 1.3) - 0.5
        const py = clamp((e.clientY - r.top) / r.height, -0.3, 1.3) - 0.5
        t.style.transform = `perspective(900px) rotateY(${px * 12}deg) rotateX(${-py * 10}deg)`
      })
    }
    if (useCursor) {
      ring = document.createElement('div'); dot = document.createElement('div')
      ring.style.cssText = 'position:fixed;left:0;top:0;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:1.5px solid #023c62;pointer-events:none;z-index:300;opacity:0;transition:width .25s,height .25s,margin .25s,background .25s,opacity .3s'
      dot.style.cssText = 'position:fixed;left:0;top:0;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#023c62;pointer-events:none;z-index:301;opacity:0'
      document.body.append(ring, dot)
      document.body.classList.add('hgm-cur')
      window.addEventListener('mousemove', onMove)
    }

    let stop = false
    let last = performance.now(), marqueeOffset = 0
    let lastY = window.scrollY, vel = 0
    const loop = (t: number) => {
      if (stop) return
      const dt = t - last; last = t
      const vh = window.innerHeight, y = window.scrollY
      vel += ((y - lastY) - vel) * 0.1; lastY = y
      if (useCursor && ring && dot) {
        rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18
        ring.style.transform = `translate(${rx}px,${ry}px)`
        dot.style.transform = `translate(${mx}px,${my}px)`
      }
      if (!reduce) {
        $$<HTMLElement>('[data-par]').forEach((el) => {
          const r = el.getBoundingClientRect()
          if (r.bottom < -200 || r.top > vh + 200) return
          el.style.transform = `translateY(${(r.top + r.height / 2 - vh / 2) * -parseFloat(el.dataset.par || '0')}px)`
        })
        marqueeOffset += dt * 0.06 + Math.abs(vel) * 0.5
        $$<HTMLElement>('[data-marq]').forEach((m) => {
          const half = m.scrollWidth / 2
          if (half > 0) m.style.transform = `translateX(${-(marqueeOffset % half)}px)`
        })
      }
      if (!reduce) {
        $$<HTMLElement>('[data-scrub]').forEach((el) => {
          const words = el.querySelectorAll<HTMLElement>('span')
          const r = el.getBoundingClientRect()
          if (r.bottom < 0 || r.top > vh) return
          const p = clamp((vh * 0.85 - r.top) / (r.height + vh * 0.35))
          const n = Math.round(p * words.length)
          words.forEach((w, i) => { w.style.opacity = i < n ? '1' : '.16' })
        })
        $$<HTMLElement>('[data-spin]').forEach((el) => { el.style.transform = `rotate(${y * +(el.dataset.spin || 0)}deg)` })
        $$<HTMLElement>('[data-fill]').forEach((el) => {
          const r = el.getBoundingClientRect()
          el.style.transform = `scaleX(${clamp((vh * 0.9 - r.top) / (vh * 0.6))})`
        })
      }
      if (!reduce) {
        const hero = root.querySelector<HTMLElement>('[data-hero]')
        if (hero) {
          const r = hero.getBoundingClientRect()
          const p = clamp(-r.top / (r.height - vh))
          $$<HTMLElement>('[data-line]').forEach((line) => {
            const i = +(line.dataset.line || 0)
            const k = clamp(1.3 - Math.abs(p * 3 - (i + 0.5)))
            line.style.opacity = String(0.16 + 0.84 * k)
            line.style.transform = `translateX(${(1 - k) * 12}px)`
          })
          const hanger = root.querySelector<SVGGElement>('[data-hanger]')
          const paths = hanger ? Array.from(hanger.querySelectorAll<SVGPathElement>('path')) : []
          paths.forEach((path) => {
            const len = path.getTotalLength()
            path.style.strokeDasharray = String(len)
            path.style.strokeDashoffset = String(len * (1 - clamp(p * 1.8)))
          })
        }
        const pin = root.querySelector<HTMLElement>('[data-pin]')
        if (pin) {
          const r = pin.getBoundingClientRect()
          const p = clamp(-r.top / (r.height - vh))
          const idx = Math.min(3, Math.floor(p * 4))
          $$<HTMLElement>('[data-step]').forEach((s) => {
            const n = +(s.dataset.step || 0), on = n === idx
            s.style.opacity = on ? '1' : '0'
            s.style.transform = on ? 'none' : n < idx ? 'translateY(-40px)' : 'translateY(40px)'
          })
          $$<HTMLElement>('[data-rail]').forEach((s) => { s.style.opacity = +(s.dataset.rail || 0) <= idx ? '1' : '.35' })
          const fill = root.querySelector<HTMLElement>('[data-railfill]')
          if (fill) fill.style.height = `${p * 100}%`
        }
      }
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)

    scan()
    const mo = new MutationObserver(() => scan())
    mo.observe(root, { childList: true, subtree: true })
    cleanups.push(() => mo.disconnect())
    cleanups.push(() => io.disconnect())
    cleanups.push(() => { stop = true })
    cleanups.push(() => mobileQuery.removeEventListener('change', applyMobile))
    cleanups.push(() => root.removeEventListener('pointerdown', onDown))
    cleanups.push(() => window.removeEventListener('mousemove', onMove))
    cleanups.push(() => { ring?.remove(); dot?.remove(); document.body.classList.remove('hgm-cur') })

    return () => cleanups.forEach((fn) => fn())
  }, [rootRef, enabled])
}
