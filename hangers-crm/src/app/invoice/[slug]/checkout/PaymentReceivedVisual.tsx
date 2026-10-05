import type { CSSProperties } from 'react'
import { Check } from 'lucide-react'
import CheckoutMotion from './CheckoutMotion'
import styles from '../RazorpayCustomCheckout.module.css'

export function PaymentReceivedMark() {
  return <CheckoutMotion
    src="/checkout-motion/payment-success.mp4"
    className={styles.successMotion}
    videoClassName={styles.stateMotionVideo}
    fallback={<span className={styles.successVisual}>
      <span className={styles.successRipple} />
      {Array.from({ length: 8 }, (_, index) => <span key={index} className={styles.confetti} />)}
      <span className={styles.successMark}><Check size={38} strokeWidth={3} /></span>
    </span>}
  />
}

export function PaidAmount({ label }: { label: string }) {
  return <strong className={styles.paidAmount}>
    <span className={styles.amountAccessible}>{label}</span>
    <span aria-hidden="true" className={styles.amountReel}>
      {Array.from(label).map((character, index) => /\d/.test(character)
        ? <span key={index} className={styles.amountDigit}><span style={{ '--amount-digit': Number(character) } as CSSProperties}>{Array.from({ length: 10 }, (_, digit) => <span key={digit}>{digit}</span>)}</span></span>
        : <span key={index}>{character}</span>)}
    </span>
  </strong>
}
