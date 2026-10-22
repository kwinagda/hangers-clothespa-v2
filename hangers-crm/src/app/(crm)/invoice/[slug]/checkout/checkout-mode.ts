export type CheckoutMode = 'TEST' | 'LIVE'

export function customCheckoutModeAllowed({
  mode,
  key,
  hostname,
  protocol,
  liveEnabled,
  siteUrl,
}: {
  mode: unknown
  key: unknown
  hostname: string
  protocol: string
  liveEnabled: boolean
  siteUrl: string
}) {
  if (mode === 'TEST') return hostname === 'localhost' && typeof key === 'string' && key.startsWith('rzp_test_')
  if (mode !== 'LIVE' || !liveEnabled || protocol !== 'https:' || typeof key !== 'string' || !key.startsWith('rzp_live_')) return false
  try {
    return hostname === new URL(siteUrl).hostname
  } catch {
    return false
  }
}
