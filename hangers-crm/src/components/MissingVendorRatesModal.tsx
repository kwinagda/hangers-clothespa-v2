'use client'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { vendorPriceAPI } from '@/lib/api'
import { deriveServiceCode } from '@/lib/serviceCode'

export type MissingVendorRate = { serviceId: string | null; serviceName: string; variant?: string | null; category?: string | null; orderCount?: number }

export default function MissingVendorRatesModal({
  open, plant, plantLabel, services, onClose, onSaved,
}: {
  open: boolean
  plant: string
  plantLabel?: string
  services: MissingVendorRate[]
  onClose: () => void
  onSaved: () => void
}) {
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const keyFor = (s: MissingVendorRate) => s.serviceId || s.serviceName

  const allFilled = services.length > 0 && services.every((s) => {
    const v = parseFloat(prices[keyFor(s)] ?? '')
    return Number.isFinite(v) && v > 0
  })

  const save = async () => {
    setSaving(true)
    try {
      await vendorPriceAPI.bulkSave(plant, services.map((s) => ({
        serviceId: s.serviceId || s.serviceName,
        serviceName: s.serviceName,
        costPrice: parseFloat(prices[keyFor(s)]),
      })))
      toast.success(`${services.length} vendor rate${services.length > 1 ? 's' : ''} saved`)
      onSaved()
    } catch (e: any) {
      toast.error(e.message || 'Failed to save vendor rates')
    }
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: 'min(560px, 100%)', maxHeight: 'min(640px, calc(100vh - 40px))', boxShadow: '0 24px 70px rgba(2,60,98,0.25)', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid #e8f0f7' }}>
          <h2 style={{ fontFamily: 'var(--crm-font-display)', fontWeight: 800, fontSize: 18, margin: '0 0 6px', color: '#023c62' }}>
            Set Vendor Rates{plantLabel ? ` — ${plantLabel}` : ''}
          </h2>
          <p style={{ fontSize: 13, color: '#6b7fa3', margin: 0, lineHeight: 1.5 }}>
            {services.length} service{services.length > 1 ? 's' : ''} in this challan {services.length > 1 ? "don't" : "doesn't"} have a vendor rate set yet.
            Enter the rate {plantLabel || 'this vendor'} charges per piece — it'll save to the price list and the challan will send automatically.
          </p>
        </div>

        <div style={{ padding: '16px 24px', overflowY: 'auto' as const, flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
          {services.map((s, idx) => (
            <div key={keyFor(s)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f8fafc', border: '1px solid #e3edf6', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1a2332' }}>
                  {s.serviceName}
                  {(() => {
                    const code = s.variant || deriveServiceCode(s.category)
                    return code && !s.serviceName.includes(code) ? ` (${code})` : ''
                  })()}
                </div>
                {!!s.orderCount && (
                  <div style={{ fontSize: 11, color: '#9dafc8', marginTop: 2 }}>
                    Affects {s.orderCount} order{s.orderCount > 1 ? 's' : ''} in this challan
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <span style={{ fontSize: 13, color: '#6b7fa3' }}>₹</span>
                <input
                  type="number" min="0" step="0.01"
                  autoFocus={idx === 0}
                  value={prices[keyFor(s)] ?? ''}
                  onChange={(e) => setPrices({ ...prices, [keyFor(s)]: e.target.value })}
                  placeholder="0"
                  style={{ width: 90, border: '1px solid #dce8f0', borderRadius: 8, padding: '7px 9px', fontSize: 13, fontWeight: 700, textAlign: 'right' as const, boxSizing: 'border-box' as const }}
                />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e8f0f7' }}>
          <button onClick={onClose} disabled={saving}
            style={{ padding: '8px 16px', fontSize: 13, color: '#6b7fa3', background: 'none', border: 'none', cursor: saving ? 'wait' : 'pointer' }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving || !allFilled}
            style={{ padding: '10px 20px', background: '#166534', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: (saving || !allFilled) ? 'not-allowed' : 'pointer', opacity: (saving || !allFilled) ? 0.5 : 1 }}>
            {saving ? 'Saving...' : 'Save & Send to Plant'}
          </button>
        </div>
      </div>
    </div>
  )
}
