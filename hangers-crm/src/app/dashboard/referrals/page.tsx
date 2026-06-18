'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { customersAPI, settingsAPI } from '@/lib/api'

const fmt = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

export default function ReferralsReportPage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<any>(null)
  const [program, setProgram] = useState<any>(null)
  const [topReferrers, setTopReferrers] = useState<any[]>([])
  const [recentReferrals, setRecentReferrals] = useState<any[]>([])
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsForm, setSettingsForm] = useState({
    referral_reward_percent: '20',
    referral_reward_cap: '200',
    referral_min_order_amount: '300',
    referral_program_enabled: '1',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [response, settingsResponse] = await Promise.all([
        customersAPI.referralReport({ from: from || undefined, to: to || undefined }),
        settingsAPI.getAll(),
      ])
      setSummary(response?.data?.summary || {})
      setProgram(response?.data?.program || null)
      setTopReferrers(Array.isArray(response?.data?.topReferrers) ? response.data.topReferrers : [])
      setRecentReferrals(Array.isArray(response?.data?.recentReferrals) ? response.data.recentReferrals : [])
      const map = settingsResponse?.data?.map || {}
      setSettingsForm({
        referral_reward_percent: String(map.referral_reward_percent ?? 20),
        referral_reward_cap: String(map.referral_reward_cap ?? 200),
        referral_min_order_amount: String(map.referral_min_order_amount ?? 300),
        referral_program_enabled: String(map.referral_program_enabled ?? 1),
      })
    } catch (e: any) {
      setSummary(null)
      setProgram(null)
      setTopReferrers([])
      setRecentReferrals([])
      toast.error(e.message || 'Failed to load referral report')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    load()
  }, [load])

  const saveProgramSettings = async () => {
    setSavingSettings(true)
    try {
      await settingsAPI.update({
        referral_reward_percent: Number(settingsForm.referral_reward_percent || 0),
        referral_reward_cap: Number(settingsForm.referral_reward_cap || 0),
        referral_min_order_amount: Number(settingsForm.referral_min_order_amount || 0),
        referral_program_enabled: Number(settingsForm.referral_program_enabled || 0) > 0 ? 1 : 0,
      })
      toast.success('Referral program settings updated')
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Failed to update referral settings')
    } finally {
      setSavingSettings(false)
    }
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1240, margin: '0 auto', fontFamily: 'var(--crm-font-ui)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--crm-font-display)', fontWeight: 800, fontSize: 28, color: '#023c62', margin: '0 0 6px' }}>Referral Report</h1>
          <p style={{ fontSize: 14, color: '#6b7fa3', margin: 0 }}>Cross-customer referral visibility from the existing master database referral and wallet-credit records.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ border: '1px solid #dce8f0', borderRadius: 10, padding: '10px 12px', fontSize: 13 }} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ border: '1px solid #dce8f0', borderRadius: 10, padding: '10px 12px', fontSize: 13 }} />
          <button onClick={load} style={{ padding: '10px 16px', background: '#023c62', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Refresh
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 14, marginBottom: 22 }}>
        {[
          { label: 'Total Referrals', value: summary?.totalReferrals || 0, note: 'Referral records captured in range' },
          { label: 'Credits Awarded', value: fmt(summary?.totalCreditsAwarded || 0), note: 'Wallet credit issued from referrals' },
          { label: 'Rewarded', value: summary?.rewardedReferrals || 0, note: 'Qualified referrals already rewarded' },
          { label: 'Pending', value: summary?.pendingReferrals || 0, note: 'Waiting for first delivered paid order' },
        ].map((card) => (
          <div key={card.label} style={{ background: '#fff', borderRadius: 18, border: '1px solid #e4edf5', padding: '18px 18px 16px', boxShadow: '0 10px 24px rgba(2,60,98,0.05)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7fa3', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{card.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#142033' }}>{card.value}</div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#8ba0bb', lineHeight: 1.45 }}>{card.note}</div>
          </div>
        ))}
      </div>

      <section style={{ background: '#fff', borderRadius: 22, border: '1px solid #e4edf5', boxShadow: '0 12px 28px rgba(2,60,98,0.06)', overflow: 'hidden', marginBottom: 22 }}>
        <div style={{ padding: '20px 24px 18px', borderBottom: '1px solid #edf3f8', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontFamily: 'var(--crm-font-display)', fontWeight: 700, fontSize: 19, color: '#023c62' }}>Program Settings</h2>
            <p style={{ margin: 0, fontSize: 13, color: '#6b7fa3', lineHeight: 1.45 }}>Industry-style referral rule: capture at signup, reward only after the referred customer’s first delivered and fully paid qualifying order.</p>
          </div>
          <span style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: Number(settingsForm.referral_program_enabled) > 0 ? '#dcfce7' : '#fee2e2', color: Number(settingsForm.referral_program_enabled) > 0 ? '#166534' : '#991b1b' }}>
            {Number(settingsForm.referral_program_enabled) > 0 ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12 }}>
            {[
              { key: 'referral_reward_percent', label: 'Reward %', suffix: '%', note: 'Wallet credit per side based on first qualifying order total.' },
              { key: 'referral_reward_cap', label: 'Reward Cap', suffix: '₹', note: 'Maximum wallet credit per side for one referral.' },
              { key: 'referral_min_order_amount', label: 'Min Order', suffix: '₹', note: 'Minimum first-order value required to qualify.' },
            ].map((field) => (
              <div key={field.key}>
                <label style={{ fontSize: 12, color: '#6b7fa3', display: 'block', marginBottom: 6 }}>{field.label}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    min="0"
                    value={(settingsForm as any)[field.key]}
                    onChange={(e) => setSettingsForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    style={{ width: '100%', border: '1px solid #dce8f0', borderRadius: 10, padding: '10px 12px', fontSize: 13, boxSizing: 'border-box' as const }}
                  />
                  <span style={{ position: 'absolute', right: 10, top: 10, fontSize: 12, color: '#8ba0bb' }}>{field.suffix}</span>
                </div>
                <div style={{ fontSize: 11, color: '#8ba0bb', marginTop: 6, lineHeight: 1.4 }}>{field.note}</div>
              </div>
            ))}
            <div>
              <label style={{ fontSize: 12, color: '#6b7fa3', display: 'block', marginBottom: 6 }}>Program Status</label>
              <select
                value={settingsForm.referral_program_enabled}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, referral_program_enabled: e.target.value }))}
                style={{ width: '100%', border: '1px solid #dce8f0', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}
              >
                <option value="1">Enabled</option>
                <option value="0">Disabled</option>
              </select>
              <div style={{ fontSize: 11, color: '#8ba0bb', marginTop: 6, lineHeight: 1.4 }}>Disable to stop new referral rewards without deleting history.</div>
            </div>
          </div>
          <div style={{ background: '#f8fbfd', border: '1px solid #e4edf5', borderRadius: 16, padding: 16 }}>
            <div style={{ fontWeight: 700, color: '#023c62', marginBottom: 8 }}>Current Rule</div>
            <div style={{ fontSize: 13, color: '#41556f', lineHeight: 1.65 }}>
              New customers can enter a referral code at signup. The referral stays pending until that customer completes their first delivered and fully paid order meeting the minimum amount. Then both sides receive wallet credit based on the configured percentage, capped to the configured maximum.
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: '#6b7fa3', lineHeight: 1.6 }}>
              Live values: {program?.rewardPercent ?? Number(settingsForm.referral_reward_percent || 0)}% reward, cap {fmt(program?.rewardCap ?? Number(settingsForm.referral_reward_cap || 0))}, minimum order {fmt(program?.minOrderAmount ?? Number(settingsForm.referral_min_order_amount || 0))}.
            </div>
            <button onClick={saveProgramSettings} disabled={savingSettings} style={{ marginTop: 14, padding: '10px 16px', background: '#023c62', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: savingSettings ? 0.6 : 1 }}>
              {savingSettings ? 'Saving…' : 'Save Referral Settings'}
            </button>
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 16 }}>
        <section style={{ background: '#fff', borderRadius: 22, border: '1px solid #e4edf5', boxShadow: '0 12px 28px rgba(2,60,98,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px 18px', borderBottom: '1px solid #edf3f8' }}>
            <h2 style={{ margin: '0 0 4px', fontFamily: 'var(--crm-font-display)', fontWeight: 700, fontSize: 19, color: '#023c62' }}>Top Referrers</h2>
            <p style={{ margin: 0, fontSize: 13, color: '#6b7fa3', lineHeight: 1.45 }}>Customers driving the highest number of rewarded referral conversions.</p>
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9dafc8' }}>Loading referral leaderboard…</div>
          ) : !topReferrers.length ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9dafc8' }}>No referral leaderboard data for this range.</div>
          ) : (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topReferrers.map((entry: any, index: number) => (
                <div key={entry.referrer?.id || index} style={{ display: 'grid', gridTemplateColumns: '56px 1fr auto', gap: 14, alignItems: 'center', padding: '12px 14px', borderRadius: 14, border: '1px solid #edf3f8', background: '#fbfdff' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 999, display: 'grid', placeItems: 'center', background: '#eff6ff', color: '#1d4ed8', fontWeight: 800 }}>
                    {index + 1}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: '#023c62' }}>{entry.referrer?.name || 'Unnamed customer'}</div>
                    <div style={{ fontSize: 12, color: '#6b7fa3', marginTop: 2 }}>
                      {entry.referrer?.phone ? `+91 ${entry.referrer.phone}` : 'Phone unavailable'}{entry.referrer?.referralCode ? ` · ${entry.referrer.referralCode}` : ''}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7fa3', marginTop: 2 }}>
                      Last referral {entry.lastReferralAt ? format(new Date(entry.lastReferralAt), 'dd MMM yyyy') : '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: '#023c62', fontSize: 18 }}>{entry.referredCount || 0}</div>
                    <div style={{ fontSize: 11, color: '#6b7fa3', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Rewarded</div>
                    <div style={{ marginTop: 6, fontWeight: 700, color: '#166534' }}>{fmt(entry.totalEarned || 0)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={{ background: '#fff', borderRadius: 22, border: '1px solid #e4edf5', boxShadow: '0 12px 28px rgba(2,60,98,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px 18px', borderBottom: '1px solid #edf3f8' }}>
            <h2 style={{ margin: '0 0 4px', fontFamily: 'var(--crm-font-display)', fontWeight: 700, fontSize: 19, color: '#023c62' }}>Recent Referrals</h2>
            <p style={{ margin: 0, fontSize: 13, color: '#6b7fa3', lineHeight: 1.45 }}>Most recent customer-to-customer referral joins recorded in the system.</p>
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9dafc8' }}>Loading referral activity…</div>
          ) : !recentReferrals.length ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9dafc8' }}>No referrals recorded for this range.</div>
          ) : (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentReferrals.map((item: any) => (
                <div key={item.id} style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid #edf3f8', background: '#fbfdff' }}>
                  <div style={{ fontWeight: 700, color: '#023c62' }}>
                    {item.referrer?.name || 'Unknown referrer'} referred {item.referred?.name || 'Unnamed customer'}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7fa3', marginTop: 4 }}>
                    {item.referrer?.phone ? `Referrer +91 ${item.referrer.phone}` : 'Referrer phone unavailable'} · {item.referred?.phone ? `Customer +91 ${item.referred.phone}` : 'Customer phone unavailable'}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8, fontSize: 12 }}>
                    <span style={{ color: '#6b7fa3' }}>{item.createdAt ? format(new Date(item.createdAt), 'dd MMM yyyy, h:mm a') : '—'}</span>
                    <span style={{ fontWeight: 700, color: item.status === 'REWARDED' ? '#166534' : item.status === 'PENDING' ? '#b45309' : '#991b1b' }}>
                      {item.status === 'REWARDED' ? `+${fmt(item.creditAwarded || 0)}` : item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
