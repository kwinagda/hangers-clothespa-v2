'use client'

import { Banknote, Check, Landmark, LoaderCircle, Smartphone } from 'lucide-react'
import CheckoutMotion from './CheckoutMotion'
import styles from '../RazorpayCustomCheckout.module.css'

export type Handoff = { method: string; label: string; upiMode?: 'qr' | 'intent'; stage: 'opening' | 'waiting' }

export default function CheckoutHandoff({ handoff }: { handoff: Handoff }) {
  const upi = handoff.method === 'upi'
  const title = upi
    ? handoff.upiMode === 'qr' ? 'Approve your UPI payment' : `Complete your payment in ${handoff.label}`
    : handoff.method === 'card' || handoff.method === 'emi'
      ? handoff.stage === 'opening' ? 'Opening bank verification' : 'Waiting for your bank to confirm'
      : handoff.stage === 'opening' ? `Redirecting to ${handoff.label}` : `Waiting for ${handoff.label} to confirm`
  const steps = upi
    ? [handoff.upiMode === 'qr' ? 'Scan the QR in the Razorpay payment window' : `Open ${handoff.label}`, 'Approve using your UPI PIN in the app', 'Return here for payment confirmation']
    : ['Payment submitted to Razorpay', 'Complete verification on the bank or provider page', 'Wait for your invoice to update after confirmation']
  return <section className={styles.handoff} aria-label="Payment in progress" aria-live="polite">
    <div className={styles.handoffHeader}>
      <CheckoutMotion
        src={upi && handoff.stage === 'waiting' ? '/checkout-motion/upi-waiting.mp4' : '/checkout-motion/payment-processing.mp4'}
        className={styles.handoffMotion}
        videoClassName={styles.handoffMotionVideo}
        fallback={upi
          ? <span className={styles.waitRing}><Smartphone size={30} /></span>
          : <div className={styles.processingJourney}><Banknote size={30} /><span /><Landmark size={30} /></div>}
      />
      <div><span className={styles.handoffBadge}>Awaiting confirmation</span><h2>{title}</h2></div>
    </div>
    <ol className={styles.handoffSteps}>{steps.map((step, index) => <li key={step}>
      <span aria-hidden="true">{index === 0 && !upi ? <Check size={16} /> : index + 1}</span>{step}
    </li>)}</ol>
    <p className={styles.handoffHint}>{upi ? 'Enter your UPI PIN only inside your UPI app. Hangers never asks for it.' : 'Complete bank authentication outside Hangers. Keep this page open while we check the result.'}</p>
    <p className={styles.loading}><LoaderCircle size={18} aria-hidden="true" />Payment is not confirmed yet. Do not pay again.</p>
  </section>
}
