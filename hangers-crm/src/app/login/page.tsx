'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { authAPI } from '@/lib/api'
import { LOGO_BLUE_URL } from '@/lib/branding'

export default function LoginPage() {
  const router = useRouter()
  const [email,   setEmail]   = useState('')
  const [pw,      setPw]      = useState('')
  const [err,     setErr]     = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    authAPI.me()
      .then(() => { if (!active) return; router.replace('/dashboard') })
      .catch(() => {})
    return () => { active = false }
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setErr('')
    try {
      await authAPI.login(email, pw)
      await authAPI.me()
      router.replace('/dashboard')
    } catch (e: any) { setErr(e.message || 'Invalid credentials') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ fontFamily:'var(--crm-font-ui)', minHeight:'100vh', background:'#023c62', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ width:'100%', maxWidth:400 }}>
        <div style={{ background:'#fff', borderRadius:16, padding:'40px 36px 34px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>

          <div style={{ display:'flex', justifyContent:'center', marginBottom:22 }}>
            <img src={LOGO_BLUE_URL} alt="Hangers Clothes Spa" style={{ height:40, objectFit:'contain' }} />
          </div>
          <div style={{ textAlign:'center', fontFamily:'var(--crm-font-display)', fontWeight:700, fontSize:19, color:'#142033', marginBottom:4 }}>Hangers CRM</div>
          <div style={{ textAlign:'center', fontSize:13, color:'#6b7fa3', marginBottom:28 }}>Sign in to manage orders and customers</div>

          {err && (
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:13, color:'#b91c1c', display:'flex', alignItems:'center', gap:8 }}>
              <AlertCircle size={16} />
              <span>{err}</span>
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12.5, fontWeight:600, color:'#3d5470', marginBottom:7, display:'block' }}>Email</label>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:10, border:'1.5px solid #dce8f0', background:'#fff' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9dafc8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6a2 2 0 0 1 2-2h2l2 5-2 1.4a11 11 0 0 0 5.6 5.6L15 14l5 2v2a2 2 0 0 1-2 2A15 15 0 0 1 4 6z"/></svg>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required
                  style={{ border:'none', outline:'none', fontSize:14, color:'#1a2332', width:'100%', fontFamily:'var(--crm-font-ui)' }} />
              </div>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12.5, fontWeight:600, color:'#3d5470', marginBottom:7, display:'block' }}>Password</label>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:10, border:'1.5px solid #dce8f0', background:'#fff' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9dafc8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="10.5" width="15" height="9.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>
                <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" required
                  style={{ border:'none', outline:'none', fontSize:14, color:'#1a2332', width:'100%', fontFamily:'var(--crm-font-ui)' }} />
              </div>
            </div>
            <button type="submit" disabled={loading}
              style={{ width:'100%', padding:13, borderRadius:10, background: loading ? '#b8d0e8' : '#023c62', color:'#fff', fontSize:14.5, fontWeight:700, border:'none', marginTop:8, cursor: loading ? 'not-allowed' : 'pointer', fontFamily:'var(--crm-font-ui)' }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div style={{ textAlign:'center', fontSize:12, color:'#9dafc8', marginTop:22 }}>Forgot password? Contact your manager.</div>
        </div>
      </div>
    </div>
  )
}
