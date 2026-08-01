'use client'

import { useEffect } from 'react'

const EXCLUDED_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'date',
  'datetime-local',
  'email',
  'file',
  'hidden',
  'month',
  'number',
  'password',
  'radio',
  'range',
  'reset',
  'submit',
  'tel',
  'time',
  'url',
  'week',
])

const EXCLUDED_FIELD_HINTS = [
  'amount',
  'barcode',
  'code',
  'email',
  'hcs',
  'id',
  'link',
  'map',
  'mobile',
  'order',
  'otp',
  'password',
  'phone',
  'pin',
  'pincode',
  'price',
  'qr',
  'rate',
  'reference',
  'search',
  'upi',
  'url',
  'vehicle',
  'vpa',
]

const fieldHints = (element: HTMLInputElement | HTMLTextAreaElement) => {
  const label = element.closest('label')?.textContent || ''
  return [
    element.name,
    element.id,
    element.getAttribute('aria-label'),
    element.getAttribute('placeholder'),
    element.getAttribute('autocomplete'),
    label,
  ].filter(Boolean).join(' ').toLowerCase()
}

const shouldSkip = (element: HTMLInputElement | HTMLTextAreaElement) => {
  if (element.dataset.capitalize === 'off') return true
  if (element instanceof HTMLInputElement && EXCLUDED_INPUT_TYPES.has((element.type || 'text').toLowerCase())) return true
  if (element.getAttribute('contenteditable') === 'true') return true

  const hints = fieldHints(element)
  return EXCLUDED_FIELD_HINTS.some((hint) => hints.includes(hint))
}

const isNameField = (element: HTMLInputElement | HTMLTextAreaElement) => {
  if (element.dataset.capitalize === 'name') return true
  const hints = fieldHints(element)
  return /\b(customer\s+name|full\s+name|staff\s+name|driver\s+name|name)\b/.test(hints)
}

const capitalizeFirstLetter = (value: string) => value.replace(/^(\s*)([a-z])/, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`)

const capitalizeNameWords = (value: string) => value.replace(/(^|\s)([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`)

const setCursor = (element: HTMLInputElement | HTMLTextAreaElement, start: number | null, end: number | null) => {
  if (start === null || end === null) return
  try {
    element.setSelectionRange(start, end)
  } catch {
    // Some input types do not support selection ranges.
  }
}

export default function TextInputCapitalizer() {
  useEffect(() => {
    const onInput = (event: Event) => {
      const target = event.target
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return
      if (target.readOnly || target.disabled || shouldSkip(target)) return
      if ((event as InputEvent).isComposing) return

      const previous = target.value
      const next = isNameField(target) ? capitalizeNameWords(previous) : capitalizeFirstLetter(previous)
      if (next === previous) return

      const selectionStart = target.selectionStart
      const selectionEnd = target.selectionEnd
      target.value = next
      setCursor(target, selectionStart, selectionEnd)
    }

    document.addEventListener('input', onInput, true)
    return () => document.removeEventListener('input', onInput, true)
  }, [])

  return null
}
