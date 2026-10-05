export const EASE = 'cubic-bezier(.2,.7,.2,1)'

export function reduceMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function finePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer:fine)').matches
}
