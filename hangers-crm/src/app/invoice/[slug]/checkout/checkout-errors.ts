export type CheckoutRequestError = { status?: number; code?: string; retryAt?: number; message?: string }

export const isInvoiceNotFound = (error: CheckoutRequestError) => error.code === 'INVOICE_NOT_FOUND'

export function checkoutRequestMessage(error: CheckoutRequestError, context: 'status' | 'methods' | 'prepare') {
  if (isInvoiceNotFound(error)) return 'This invoice link is no longer available. Return to the invoice or contact Hangers.'
  if (error.status === 429) return 'Payment checks are temporarily rate-limited. Wait until the retry time shown, then try again.'
  if (error.status == null || Number(error.status) >= 500 || Number(error.status) === 404) {
    if (context === 'prepare') return 'Secure checkout could not be confirmed. Check payment status before trying again.'
    return context === 'status'
      ? 'Payment status could not be checked just now. Do not pay again until the existing status is confirmed.'
      : 'Secure payment details could not be loaded just now. Retry loading payment methods.'
  }
  if (context === 'prepare') {
    if (error.code === 'CHECKOUT_ATTEMPT_STALE') return 'The invoice balance changed. Reload the invoice to see the current amount.'
    if (['INVOICE_NOT_PAYABLE', 'ORDER_CANCELLED', 'BILL_VOID', 'APPOINTMENT_CANCELLED'].includes(error.code || '')) {
      return 'This invoice cannot accept an online payment. Contact Hangers for help.'
    }
    if (['CUSTOM_CHECKOUT_DISABLED', 'CUSTOM_CHECKOUT_NOT_RELEASED'].includes(error.code || '')) {
      return 'Online payment is temporarily unavailable. Contact Hangers for help.'
    }
    return 'Secure checkout could not be prepared. Check the invoice and try again.'
  }
  return error.message || (context === 'status' ? 'Payment status could not be checked.' : 'Payment methods could not be loaded.')
}
