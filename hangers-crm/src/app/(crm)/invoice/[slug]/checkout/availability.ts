export function checkoutAvailability(balance: unknown, status: unknown, outstanding: boolean) {
  const amount = Number(balance)
  const invoiceStatus = String(status || '').toUpperCase()
  if (!Number.isFinite(amount) || amount < 0) return 'UNAVAILABLE'
  if (!outstanding && ['CANCELLED', 'VOID'].includes(invoiceStatus)) return 'CANCELLED'
  if (amount === 0) return !outstanding && invoiceStatus === 'PAID' ? 'PAID' : 'NO_BALANCE'
  if (!outstanding && invoiceStatus === 'PAID') return 'UNAVAILABLE'
  return amount >= 1 ? 'PAYABLE' : 'BELOW_MINIMUM'
}
