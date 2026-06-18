'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowRight } from 'lucide-react'
import { authAPI } from '@/lib/api'
import { LOGO_WHITE_URL } from '@/lib/branding'

export default function LoginPage() {
  const router = useRouter()
  const [email,   setEmail]   = useState('')
  const [pw,      setPw]      = useState('')
  const [err,     setErr]     = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    let active = true
    authAPI.me()
      .then(() => {
        if (!active) return
        router.replace('/dashboard')
      })
      .catch(() => {
        if (!active) return
        setCheckingSession(false)
      })
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

  const s = { fontFamily:"var(--crm-font-ui)", minHeight:'100vh', background:'linear-gradient(135deg,#023c62 0%,#035a8f 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }

  if (checkingSession) {
    return (
      <div style={s}>
        <div style={{color:'#fff',fontSize:14,opacity:0.9}}>Checking session...</div>
      </div>
    )
  }

  return (
    <div style={s}>
      <div style={{position:'fixed',top:-100,right:-100,width:400,height:400,borderRadius:'50%',background:'rgba(3,90,143,0.4)',pointerEvents:'none'}}/>
      <div style={{width:'100%',maxWidth:420}}>
        <div style={{textAlign:'center',marginBottom:36}}>
          <div style={{display:'flex',justifyContent:'center',marginBottom:6}}>
            <img src={LOGO_WHITE_URL} alt="Hangers" style={{height:42,width:'auto',objectFit:'contain'}} />
          </div>
          <h1 style={{fontFamily:"var(--crm-font-ui)",fontWeight:800,fontSize:18,color:'#fff',margin:'0 0 4px'}}>CRM</h1>
          <p style={{color:'rgba(184,208,232,0.7)',fontSize:14,margin:0}}>Staff Management Dashboard</p>
        </div>
        <div style={{background:'#fff',borderRadius:24,padding:36,boxShadow:'0 24px 64px rgba(0,0,0,0.25)'}}>
          <h2 style={{fontFamily:"var(--crm-font-ui)",fontWeight:700,fontSize:20,color:'#1a2332',margin:'0 0 4px'}}>Welcome back</h2>
          <p style={{fontSize:14,color:'#6b7fa3',margin:'0 0 24px'}}>Sign in with your staff credentials</p>
          {err && (
            <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:10,padding:'10px 14px',marginBottom:16,fontSize:13,color:'#b91c1c',display:'flex',alignItems:'center',gap:8}}>
              <AlertCircle size={16} />
              <span>{err}</span>
            </div>
          )}
          <form onSubmit={handleLogin}>
            {[
              {label:'Email',type:'email',val:email,set:setEmail,ph:'your.staff@company.com'},
              {label:'Password',type:'password',val:pw,set:setPw,ph:'••••••••'},
            ].map(f => (
              <div key={f.label} style={{marginBottom:16}}>
                <label style={{display:'block',fontSize:12,fontWeight:500,color:'#6b7fa3',marginBottom:6,textTransform:'uppercase' as const,letterSpacing:'0.06em'}}>{f.label}</label>
                <input type={f.type} value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph} required
                  style={{width:'100%',border:'1.5px solid #dce8f0',borderRadius:10,padding:'13px 14px',fontSize:15,color:'#1a2332',outline:'none',background:'#f7f9fc',fontFamily:"var(--crm-font-ui)"}}/>
              </div>
            ))}
            <div style={{marginBottom:24}}/>
            <button type="submit" disabled={loading} style={{width:'100%',background:loading?'#b8d0e8':'#023c62',color:'#fff',border:'none',borderRadius:12,padding:'16px',fontSize:16,fontWeight:700,fontFamily:"var(--crm-font-ui)",cursor:loading?'not-allowed':'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8}}>
              {loading ? 'Signing in...' : <>Sign In <ArrowRight size={16} /></>}
            </button>
          </form>
          <div style={{marginTop:20,padding:'12px 14px',background:'#f7f9fc',borderRadius:10,border:'1px solid #e8f0f7',fontSize:12,color:'#6b7fa3',lineHeight:1.7}}>
            Use your staff credentials. If you need access, contact the system administrator.
          </div>
        </div>
      </div>
    </div>
  )
}
