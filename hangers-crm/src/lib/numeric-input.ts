export const sanitizeDecimalInput = (value: string, decimals = 2) => {
  const cleaned = String(value || '').replace(/[^\d.]/g, '')
  const [whole, ...rest] = cleaned.split('.')
  const fraction = rest.join('').slice(0, decimals)
  return rest.length ? `${whole}.${fraction}` : whole
}

export const sanitizeIntegerInput = (value: string) => String(value || '').replace(/\D/g, '')

export const isStrictMoneyText = (value: string) => /^\d+(\.\d{1,2})?$/.test(String(value || '').trim())
export const isStrictPositiveIntText = (value: string) => /^[1-9]\d*$/.test(String(value || '').trim())
