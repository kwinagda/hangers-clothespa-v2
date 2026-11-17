'use client'

type Props = {
  availableBalance: number
  outstandingBalance: number
  value: string
  onChange: (value: string) => void
  externalAmount?: number
  onExternalAmountChange?: (value: string) => void
  disabled?: boolean
}

const money = (value: number) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function WalletTenderInput({ availableBalance, outstandingBalance, value, onChange, externalAmount = 0, onExternalAmountChange, disabled = false }: Props) {
  const available = Math.max(0, Number(availableBalance || 0))
  const outstanding = Math.max(0, Number(outstandingBalance || 0))
  const maximum = Math.min(available, outstanding)
  const updateWalletAmount = (nextValue: string) => {
    onChange(nextValue)
    const nextWallet = Number(nextValue || 0)
    if (onExternalAmountChange && Number.isFinite(nextWallet) && externalAmount + nextWallet > outstanding) {
      onExternalAmountChange(Math.max(0, outstanding - nextWallet).toFixed(2))
    }
  }

  return (
    <div style={{ display:'grid', gap:8, padding:12, border:'1px solid #bae6d3', borderRadius:10, background:'#f3fbf7' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:12 }}>
        <span style={{ fontSize:12, fontWeight:700, color:'#166534' }}>Customer wallet</span>
        <strong style={{ fontSize:13, color:'#14532d' }}>{money(available)}</strong>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'minmax(0, 1fr) auto', gap:8 }}>
        <input
          aria-label="Wallet amount to apply"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          max={maximum}
          disabled={disabled || maximum <= 0}
          value={value}
          onChange={(event) => updateWalletAmount(event.target.value)}
          placeholder={maximum > 0 ? `Apply up to ${money(maximum)}` : 'No wallet balance available'}
          style={{ minWidth:0, padding:'9px 10px', border:'1px solid #9ed8bd', borderRadius:8, background:'#fff' }}
        />
        <button
          type="button"
          disabled={disabled || maximum <= 0}
          onClick={() => updateWalletAmount(maximum.toFixed(2))}
          style={{ padding:'8px 11px', border:'1px solid #86c9aa', borderRadius:8, background:'#fff', color:'#166534', fontWeight:700, cursor:disabled || maximum <= 0 ? 'not-allowed' : 'pointer', opacity:disabled || maximum <= 0 ? .5 : 1 }}
        >
          Use maximum
        </button>
      </div>
    </div>
  )
}
