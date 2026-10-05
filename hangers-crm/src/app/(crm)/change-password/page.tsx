'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { AlertCircle, Lock } from 'lucide-react'
import { authAPI } from '@/lib/api'
import { LOGO_BLUE_URL } from '@/lib/branding'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    let active = true
    authAPI.me()
      .then((r: any) => {
        if (!active) return
        const staff = r?.staff || r?.data?.staff
        if (!staff?.mustChangePassword) router.replace('/dashboard')
      })
      .catch(() => router.replace('/login'))
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [router])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    if (newPassword !== confirmPassword) {
      setErr('New password and confirmation do not match')
      return
    }
    setLoading(true)
    try {
      await authAPI.changePassword(currentPassword, newPassword)
      toast.success('Password changed')
      router.replace('/dashboard')
    } catch (e: any) {
      setErr(e.message || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try { await authAPI.logout() } catch {}
    router.replace('/login')
  }

  if (checking) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'var(--crm-font-ui)', color: '#6b7fa3' }}>Checking session...</div>
  }

  return (
    <div style={{ fontFamily: 'var(--crm-font-ui)', minHeight: '100vh', background: '#023c62', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 430 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '38px 36px 32px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <img src={LOGO_BLUE_URL} alt="Hangers Clothes Spa" style={{ height: 40, objectFit: 'contain' }} />
          </div>
          <div style={{ textAlign: 'center', fontFamily: 'var(--crm-font-display)', fontWeight: 800, fontSize: 20, color: '#142033', marginBottom: 5 }}>Change Password</div>
          <div style={{ textAlign: 'center', fontSize: 13, color: '#6b7fa3', marginBottom: 24 }}>Set a new password before using the CRM.</div>

          {err && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} />
              <span>{err}</span>
            </div>
          )}

          <form onSubmit={submit}>
            {[
              ['Current Password', currentPassword, setCurrentPassword],
              ['New Password', newPassword, setNewPassword],
              ['Confirm New Password', confirmPassword, setConfirmPassword],
            ].map(([label, value, setter]: any) => (
              <div key={label} style={{ marginBottom: 15 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#3d5470', marginBottom: 7, display: 'block' }}>{label}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 10, border: '1.5px solid #dce8f0', background: '#fff' }}>
                  <Lock size={15} color="#9dafc8" />
                  <input type="password" value={value} onChange={(e) => setter(e.target.value)} required
                    style={{ border: 'none', outline: 'none', fontSize: 14, color: '#1a2332', width: '100%', fontFamily: 'var(--crm-font-ui)' }} />
                </div>
              </div>
            ))}
            <div style={{ fontSize: 12, color: '#6b7fa3', lineHeight: 1.5, marginBottom: 16 }}>
              Password must be at least 12 characters and include uppercase, lowercase, number, and symbol.
            </div>
            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: 13, borderRadius: 10, background: loading ? '#b8d0e8' : '#023c62', color: '#fff', fontSize: 14.5, fontWeight: 800, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--crm-font-ui)' }}>
              {loading ? 'Changing...' : 'Change Password'}
            </button>
          </form>
          <button onClick={logout} style={{ width: '100%', marginTop: 12, padding: 11, borderRadius: 10, background: '#fff', color: '#52677f', border: '1px solid #dce8f0', fontWeight: 800, cursor: 'pointer' }}>Logout</button>
        </div>
      </div>
    </div>
  )
}
