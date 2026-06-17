// src/App.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { DataProvider } from './context/DataContext'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import Contracts from './pages/Contracts'
import Settings from './pages/Settings'
import { ROLES, initials, AV_COLORS } from './utils/helpers'

const ALLOWED_DOMAIN = 'dubicars.com'

export default function App() {
  const [session, setSession]       = useState(null)
  const [profile, setProfile]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [activeTab, setActiveTab]   = useState('dash')
  const [authError, setAuthError]   = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) loadProfile(session.user)
      else { setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(user) {
    setLoading(true)
    const { data, error } = await supabase
      .from('cv_users')
      .select('*')
      .eq('email', user.email)
      .single()
    if (error || !data) {
      setAuthError('Your account has not been set up. Ask your admin to add you.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }
    // Activate pending user on first login
    if (data.status === 'pending') {
      await supabase.from('cv_users').update({
        status: 'active',
        activated_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString()
      }).eq('id', data.id)
      data.status = 'active'
      data.activated_at = new Date().toISOString()
    } else {
      await supabase.from('cv_users').update({ last_seen_at: new Date().toISOString() }).eq('id', data.id)
    }
    setProfile(data)
    setLoading(false)
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg2)' }}>
      <div style={{ textAlign:'center', color:'var(--muted)' }}>
        <div className="spin" style={{ fontSize:24, display:'block', marginBottom:10 }}>⟳</div>
        Loading ContractVault...
      </div>
    </div>
  )

  if (!session || !profile) return <LoginPage authError={authError} setAuthError={setAuthError} />

  const canUpload = profile.role === 'admin' || profile.role === 'owner'
  const isAdmin   = profile.role === 'admin'
  const tabs = [
    { id: 'dash',      label: 'Dashboard' },
    { id: 'upload',    label: 'Upload',   hidden: !canUpload },
    { id: 'contracts', label: 'Contracts' },
    { id: 'settings',  label: 'Settings', hidden: !isAdmin }
  ].filter(t => !t.hidden)

  const role = ROLES[profile.role] || ROLES.owner
  const [bg, fg] = AV_COLORS[0]

  return (
    <DataProvider>
      <div>
        <nav className="nav">
          <div className="nav-left" style={{ display:'flex', alignItems:'center', gap:20 }}>
            <div className="brand">
              <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
                <rect width="40" height="40" rx="8" fill="rgba(255,255,255,0.15)"/>
                <path d="M10 28V14l10-4 10 4v14l-10 4-10-4z" stroke="rgba(255,255,255,0.9)" strokeWidth="2" fill="none"/>
                <path d="M20 10v18M10 14l10 4 10-4" stroke="rgba(255,255,255,0.9)" strokeWidth="2"/>
              </svg>
              ContractVault
            </div>
            <div className="nav-tabs">
              {tabs.map(t => (
                <button key={t.id} className={`nt${activeTab === t.id ? ' active' : ''}`} onClick={() => setActiveTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="nav-right">
            <div className="nav-user">
              <div className="nav-av">{initials(profile.name)}</div>
              <span>{profile.name}</span>
              <span className={`nav-role-badge`}>{role.label}</span>
            </div>
            <button className="btn btn-sm" style={{ background:'rgba(255,255,255,0.12)', color:'#fff', border:'0.5px solid rgba(255,255,255,0.2)', fontSize:12 }}
              onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </nav>
        <div className="page">
          {activeTab === 'dash'      && <Dashboard setActiveTab={setActiveTab} profile={profile} />}
          {activeTab === 'upload'    && canUpload && <Upload setActiveTab={setActiveTab} profile={profile} />}
          {activeTab === 'contracts' && <Contracts profile={profile} />}
          {activeTab === 'settings'  && isAdmin && <Settings profile={profile} />}
        </div>
      </div>
    </DataProvider>
  )
}

function LoginPage({ authError, setAuthError }) {
  const [email, setEmail]     = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState(authError)

  const handleSend = async (e) => {
    e.preventDefault()
    setError(null)
    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      setError(`Only @${ALLOWED_DOMAIN} email addresses are permitted.`)
      return
    }
    setSending(true)
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    })
    if (err) {
      setError(err.message)
    } else {
      setSent(true)
    }
    setSending(false)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <svg width="48" height="48" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="10" fill="#1a5276"/>
            <path d="M10 28V14l10-4 10 4v14l-10 4-10-4z" stroke="#aed6f1" strokeWidth="1.5" fill="none"/>
            <path d="M20 10v18M10 14l10 4 10-4" stroke="#aed6f1" strokeWidth="1.5"/>
          </svg>
        </div>
        <h1>ContractVault</h1>
        <p>Enter your Dubicars email address to receive a sign-in link</p>

        {error && <div className="login-error">{error}</div>}

        {sent ? (
          <div className="login-success">
            ✓ Sign-in link sent to <strong>{email}</strong><br/>
            <span style={{ fontSize:12, marginTop:4, display:'block' }}>Check your inbox and click the link to continue. You can close this tab.</span>
          </div>
        ) : (
          <form onSubmit={handleSend}>
            <div className="login-input-wrap">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@dubicars.com"
                required
                style={{ flex:1 }}
              />
              <button className="btn btn-p" type="submit" disabled={sending}>
                {sending ? <span className="spin">⟳</span> : 'Send link'}
              </button>
            </div>
          </form>
        )}
        <div className="login-note">Access is restricted to @dubicars.com accounts that have been set up by an admin.</div>
      </div>
    </div>
  )
}
