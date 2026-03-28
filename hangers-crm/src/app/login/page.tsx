'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import { authAPI } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [email,   setEmail]   = useState('')
  const [pw,      setPw]      = useState('')
  const [err,     setErr]     = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setErr('')
    try {
      const res = await authAPI.login(email, pw)
      Cookies.set('crm_token', res.data.token, { expires: 1 })
      router.push('/dashboard')
    } catch (e: any) { setErr(e.message || 'Invalid credentials') }
    finally { setLoading(false) }
  }

  const s = { fontFamily:"'DM Sans',sans-serif", minHeight:'100vh', background:'linear-gradient(135deg,#023c62 0%,#035a8f 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }

  return (
    <div style={s}>
      <div style={{position:'fixed',top:-100,right:-100,width:400,height:400,borderRadius:'50%',background:'rgba(3,90,143,0.4)',pointerEvents:'none'}}/>
      <div style={{width:'100%',maxWidth:420}}>
        <div style={{textAlign:'center',marginBottom:36}}>
          <div style={{width:72,height:72,borderRadius:20,background:'rgba(255,255,255,0.1)',border:'1px solid rgba(184,208,232,0.2)',display:'inline-flex',alignItems:'center',justifyContent:'center',marginBottom:16,fontSize:32}}>🧺</div>
          <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:28,color:'#fff',margin:'0 0 4px'}}>Hangers CRM</h1>
          <p style={{color:'rgba(184,208,232,0.7)',fontSize:14,margin:0}}>Staff Management Dashboard</p>
        </div>
        <div style={{background:'#fff',borderRadius:24,padding:36,boxShadow:'0 24px 64px rgba(0,0,0,0.25)'}}>
          <h2 style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:20,color:'#1a2332',margin:'0 0 4px'}}>Welcome back</h2>
          <p style={{fontSize:14,color:'#6b7fa3',margin:'0 0 24px'}}>Sign in with your staff credentials</p>
          {err && <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:10,padding:'10px 14px',marginBottom:16,fontSize:13,color:'#b91c1c'}}>⚠ {err}</div>}
          <form onSubmit={handleLogin}>
            {[
              {label:'Email',type:'email',val:email,set:setEmail,ph:'admin@hangers.in'},
              {label:'Password',type:'password',val:pw,set:setPw,ph:'••••••••'},
            ].map(f => (
              <div key={f.label} style={{marginBottom:16}}>
                <label style={{display:'block',fontSize:12,fontWeight:500,color:'#6b7fa3',marginBottom:6,textTransform:'uppercase' as const,letterSpacing:'0.06em'}}>{f.label}</label>
                <input type={f.type} value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph} required
                  style={{width:'100%',border:'1.5px solid #dce8f0',borderRadius:10,padding:'13px 14px',fontSize:15,color:'#1a2332',outline:'none',background:'#f7f9fc',fontFamily:"'DM Sans',sans-serif"}}/>
              </div>
            ))}
            <div style={{marginBottom:24}}/>
            <button type="submit" disabled={loading} style={{width:'100%',background:loading?'#b8d0e8':'#023c62',color:'#fff',border:'none',borderRadius:12,padding:'16px',fontSize:16,fontWeight:700,fontFamily:"'Syne',sans-serif",cursor:loading?'not-allowed':'pointer'}}>
              {loading ? 'Signing in...' : 'Sign In →'}
            </button>
          </form>
          <div style={{marginTop:20,padding:'12px 14px',background:'#f7f9fc',borderRadius:10,border:'1px solid #e8f0f7',fontSize:12,color:'#6b7fa3',lineHeight:1.7}}>
            <strong style={{color:'#023c62'}}>Default admin:</strong><br/>admin@hangers.in · Hangers@2025
          </div>
        </div>
      </div>
    </div>
  )
}
