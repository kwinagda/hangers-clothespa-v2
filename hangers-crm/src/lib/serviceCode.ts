// Derived from the plant's existing garment-tagging convention (see historical OrderItem.variant
// values for DRY CLEAN / NORMAL IRONING / STEAM IRONING / ROLL PRESS categories).
const DASH = '—'
const CATEGORY_CODES: Record<string, string> = {
  [`DRY CLEAN ${DASH} MEN`]: 'DC/M',
  [`DRY CLEAN ${DASH} WOMEN`]: 'DC/W',
  [`DRY CLEAN ${DASH} KIDS`]: 'DC/K',
  [`DRY CLEAN ${DASH} HOUSE HOLD`]: 'DC/HH',
  [`DRY CLEAN ${DASH} ACCESSORIES`]: 'DC/A',
  'NORMAL IRONING': 'NI',
  'STEAM IRONING': 'SI',
  'ROLL PRESS': 'RP',
  'SHOE CLEANING': 'SC/S',
  'SOFA CLEANING': 'SC/SC',
  DAILY_IRON: 'D/G',
}

export const deriveServiceCode = (category?: string | null): string | null => {
  if (!category) return null
  return CATEGORY_CODES[category] || null
}

export const itemServiceCode = (item: any): string | null => {
  const explicit = item?.variant ? String(item.variant).trim() : ''
  if (explicit) return explicit
  return deriveServiceCode(item?.service?.category || item?.serviceCategory)
}
