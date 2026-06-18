'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ironAPI, metadataAPI } from '@/lib/api'
import { format } from 'date-fns'
import IronSectionTabs from '../_components/IronSectionTabs'
import { InlineLoader, SkeletonCard, TableLoader } from '@/components/ui/Feedback'
import { PaginationControls } from '@/components/ui/PaginationControls'
const asArray = (value: any, keys: string[] = []) => {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}

export default function IronApplicationsPage() {
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [languageLabels, setLanguageLabels] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await ironAPI.listSubscriptions('PENDING_REVIEW')
      setSubscriptions(asArray(response?.data, ['subscriptions', 'items']))
    } catch {
      toast.error('Failed to load Daily Iron applications')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [pageSize, subscriptions.length])
  useEffect(() => {
    metadataAPI.getAll().then((response: any) => {
      const metadata = response?.metadata || response?.data?.metadata || {}
      const labels = (metadata.languages || []).reduce((acc: Record<string, string>, item: any) => {
        acc[item.value] = item.label || item.value
        return acc
      }, {})
      setLanguageLabels(labels)
    }).catch((e: any) => {
      setLanguageLabels({})
      toast.error(e.message || 'Failed to load language labels')
    })
  }, [])

  const handleConfirm = async (subscriptionId: string) => {
    setBusyId(`confirm-${subscriptionId}`)
    try {
      await ironAPI.confirmSubscription(subscriptionId)
      toast.success('Application confirmed')
      load()
    } catch (e: any) {
      toast.error(e.message || 'Failed to confirm application')
    }
    setBusyId(null)
  }

  const handleDecline = async (subscriptionId: string) => {
    setBusyId(`decline-${subscriptionId}`)
    try {
      await ironAPI.updateSubscriptionStatus(subscriptionId, 'CANCELLED')
      toast.success('Application declined')
      load()
    } catch (e: any) {
      toast.error(e.message || 'Failed to decline application')
    }
    setBusyId(null)
  }
  const pagedSubscriptions = subscriptions.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div style={{ padding:'32px 36px', maxWidth:1200, margin:'0 auto', fontFamily:"var(--crm-font-ui)" }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <h1 style={{ fontFamily:"var(--crm-font-ui)", fontWeight:800, fontSize:28, color:'#023c62', margin:'0 0 4px' }}>Daily Iron Applications</h1>
          <p style={{ fontSize:14, color:'#6b7fa3', margin:0 }}>Review app requests and activate customers for monthly ironing billing.</p>
        </div>
        <button onClick={load} style={{ background:'#fff', border:'1px solid #dce8f0', borderRadius:12, padding:'10px 16px', color:'#023c62', fontWeight:700, cursor:'pointer', minWidth:112 }}>
          {loading ? <InlineLoader label="Loading" /> : 'Refresh'}
        </button>
      </div>

      <IronSectionTabs />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:24 }}>
        <div className="crm-surface crm-card-hover" style={{ borderRadius:16, padding:'18px 20px' }}>
          <div style={{ fontSize:11, color:'#6b7fa3', letterSpacing:'0.06em', textTransform:'uppercase' as const, marginBottom:6 }}>Pending Review</div>
          <div style={{ fontFamily:"var(--crm-font-ui)", fontWeight:800, fontSize:30, color:'#023c62' }}>{loading ? '—' : subscriptions.length}</div>
        </div>
        <div className="crm-surface crm-card-hover" style={{ borderRadius:16, padding:'18px 20px' }}>
          <div style={{ fontSize:11, color:'#6b7fa3', letterSpacing:'0.06em', textTransform:'uppercase' as const, marginBottom:6 }}>Next Step</div>
          <div style={{ fontWeight:700, color:'#023c62', lineHeight:1.4 }}>Confirm from here, then staff can start logging garments from the customer profile.</div>
        </div>
        <Link href="/dashboard/customers" className="crm-card-hover" style={{ background:'linear-gradient(135deg,#023c62,#035a8f)', borderRadius:16, padding:'18px 20px', textDecoration:'none', color:'#fff', boxShadow:'0 2px 12px rgba(2,60,98,0.06)' }}>
          <div style={{ fontSize:11, color:'rgba(184,208,232,0.75)', letterSpacing:'0.06em', textTransform:'uppercase' as const, marginBottom:6 }}>Customer Directory</div>
          <div style={{ fontWeight:700, lineHeight:1.4 }}>Open customer records to manage active Daily Iron accounts →</div>
        </Link>
      </div>

      <div className="crm-surface crm-card-hover" style={{ borderRadius:20, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#f7f9fc' }}>
              {['Customer','Applied','Language','Notes','Actions'].map((heading) => (
                <th key={heading} style={{ padding:'11px 18px', textAlign:'left', fontSize:11, color:'#6b7fa3', fontWeight:600, textTransform:'uppercase' as const, letterSpacing:'0.08em', borderBottom:'1px solid #e8f0f7' }}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding:0 }}><TableLoader rows={5} columns={5} /></td></tr>
            ) : !subscriptions.length ? (
              <tr><td colSpan={5} style={{ padding:44, textAlign:'center', color:'#9dafc8' }}>No pending Daily Iron applications right now.</td></tr>
            ) : pagedSubscriptions.map((sub: any) => (
              <tr key={sub.id} className="crm-table-row" style={{ borderBottom:'1px solid #f1f5f9' }}>
                <td style={{ padding:'14px 18px' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#023c62', marginBottom:2 }}>{sub.customer?.name || 'Unnamed Customer'}</div>
                  <div style={{ fontSize:12, color:'#6b7fa3' }}>+91 {sub.customer?.phone}</div>
                  <Link href={`/dashboard/customers/${sub.customerId}?tab=iron`} style={{ fontSize:12, color:'#035a8f', textDecoration:'none' }}>Open customer →</Link>
                </td>
                <td style={{ padding:'14px 18px', color:'#6b7fa3', fontSize:13 }}>{format(new Date(sub.appliedAt), 'dd MMM yyyy, h:mm a')}</td>
                <td style={{ padding:'14px 18px', fontSize:13 }}>{languageLabels[sub.customer?.preferredLanguage] || sub.customer?.preferredLanguage || 'English'}</td>
                <td style={{ padding:'14px 18px', fontSize:13, color:'#6b7fa3', maxWidth:240 }}>{sub.notes || '—'}</td>
                <td style={{ padding:'14px 18px' }}>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => handleConfirm(sub.id)} disabled={busyId === `confirm-${sub.id}`} style={{ background:'#166534', color:'#fff', border:'none', borderRadius:9, padding:'9px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                      {busyId === `confirm-${sub.id}` ? <InlineLoader label="Confirming" tone="light" /> : 'Confirm'}
                    </button>
                    <button onClick={() => handleDecline(sub.id)} disabled={busyId === `decline-${sub.id}`} style={{ background:'#fff1f2', color:'#991b1b', border:'1px solid #fecdd3', borderRadius:9, padding:'9px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                      {busyId === `decline-${sub.id}` ? <InlineLoader label="Declining" /> : 'Decline'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginationControls
        page={page}
        pageSize={pageSize}
        totalItems={subscriptions.length}
        itemLabel="applications"
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
        pageSizeOptions={[5, 10, 20, 30]}
      />
    </div>
  )
}
