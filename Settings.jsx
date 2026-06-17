// src/pages/Settings.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { fmtDate, fmtRelative, ROLES, AV_COLORS, initials } from '../utils/helpers'

export default function Settings({ profile }) {
  const [sp, setSP] = useState('users')
  const panels = [
    { id:'users',   label:'👥 Users & roles' },
    { id:'add',     label:'➕ Add user' },
    { id:'remind',  label:'🔔 Reminders' },
    { id:'usage',   label:'💰 API usage' }
  ]
  return (
    <div>
      <div className="sec-hd"><div className="sec-title">Settings</div></div>
      <div className="settings-wrap">
        <div className="settings-nav">
          <div className="sni-lbl">Admin</div>
          {panels.map(p => (
            <div key={p.id} className={`sni${sp===p.id?' active':''}`} onClick={() => setSP(p.id)}>{p.label}</div>
          ))}
        </div>
        <div className="settings-body">
          {sp==='users'  && <UsersPanel profile={profile} />}
          {sp==='add'    && <AddUserPanel setSP={setSP} />}
          {sp==='remind' && <RemindersPanel />}
          {sp==='usage'  && <UsagePanel />}
        </div>
      </div>
    </div>
  )
}

function UsersPanel({ profile }) {
  const [users, setUsers]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('cv_users').select('*').order('created_at').then(({ data }) => {
      setUsers(data || []); setLoading(false)
    })
  }, [])

  async function removeUser(id) {
    if (!window.confirm('Remove this user? They will no longer be able to sign in.')) return
    const { error } = await supabase.from('cv_users').delete().eq('id', id)
    if (error) { alert('Error removing user: ' + error.message); return }
    setUsers(prev => prev.filter(u => u.id !== id))
  }

  if (loading) return <div className="empty-state"><span className="spin">⟳</span></div>

  return (
    <div>
      <div className="sp-title">Users & roles</div>
      {users.map((u, i) => {
        const r = ROLES[u.role] || ROLES.owner
        const [bg, fg] = AV_COLORS[i % AV_COLORS.length]
        const canRemove = profile.id !== u.id
        return (
          <div key={u.id} className="user-row">
            <div className="uinfo">
              <div className="uav" style={{ background:bg, color:fg, width:36, height:36 }}>{initials(u.name)}</div>
              <div>
                <div className="uname">{u.name}</div>
                <div className="uemail">{u.email}</div>
                {u.status === 'active' && u.last_seen_at && <div className="umeta">Last seen {fmtRelative(u.last_seen_at)}</div>}
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              {u.status === 'pending'
                ? <span className="badge b-warn">⏱ Pending</span>
                : <span className="badge b-ok">✓ {u.activated_at ? 'Joined ' + fmtDate(u.activated_at) : 'Active'}</span>}
              <span className={`badge ${r.cls}`}>{r.label}</span>
              {canRemove && <button className="btn btn-d btn-sm" onClick={() => removeUser(u.id)}>Remove</button>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AddUserPanel({ setSP }) {
  const [name, setName]     = useState('')
  const [email, setEmail]   = useState('')
  const [role, setRole]     = useState('owner')
  const [status, setStatus] = useState(null)
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!name || !email) { setStatus({ ok:false, msg:'Please enter a name and email.' }); return }
    if (!email.endsWith('@dubicars.com')) { setStatus({ ok:false, msg:'Only @dubicars.com email addresses are allowed.' }); return }
    setSending(true); setStatus(null)
    try {
      // Remove any existing record for this email (pending or otherwise) before re-adding
      await supabase.from('cv_users').delete().eq('email', email)

      // Insert fresh user record
      const { error: insertErr } = await supabase.from('cv_users').insert({
        name, email, role, status: 'pending', created_at: new Date().toISOString()
      })
      if (insertErr) throw new Error(insertErr.message)

      // Send magic link
      const { error: authErr } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
          data: { name, role }
        }
      })
      if (authErr) throw new Error(authErr.message)

      setStatus({ ok:true, msg:`✓ ${name} added and sign-in link sent to ${email}` })
      setName(''); setEmail(''); setRole('owner')
    } catch (e) {
      setStatus({ ok:false, msg:'Error: ' + e.message })
    }
    setSending(false)
  }

  return (
    <div>
      <div className="sp-title">Add a new user</div>
      <div className="info-bar ib-blue">A magic sign-in link will be sent automatically to their Dubicars email.</div>
      <div className="frow"><label>Full name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" /></div>
      <div className="frow"><label>Email address</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@dubicars.com" /></div>
      <div className="frow">
        <label>Role</label>
        <select value={role} onChange={e => setRole(e.target.value)}>
          <option value="admin">Admin — full access, can manage users and settings</option>
          <option value="master_viewer">Master Viewer — can view all contracts, read-only</option>
          <option value="owner">Contract Owner — can upload and view their own contracts</option>
        </select>
      </div>
      <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:4 }}>
        <button className="btn btn-p" disabled={sending} onClick={send}>
          {sending ? <><span className="spin">⟳</span> Sending...</> : '✉️ Add user & send link'}
        </button>
        {status && <span style={{ fontSize:13, color: status.ok ? 'var(--green)' : 'var(--red)' }}>{status.msg}</span>}
      </div>
    </div>
  )
}

function RemindersPanel() {
  const [cfg, setCfg]     = useState({ r90:true, r60:true, r30:true })
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('cv_config').select('*').eq('key', 'reminders').single().then(({ data }) => {
      if (data?.value) setCfg(data.value)
      setLoading(false)
    })
  }, [])

  async function save() {
    await supabase.from('cv_config').upsert({ key:'reminders', value:cfg }, { onConflict:'key' })
    setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return <div className="empty-state"><span className="spin">⟳</span></div>

  return (
    <div>
      <div className="sp-title">Reminder settings</div>
      <div className="info-bar ib-blue">🔔 Reminders are sent from james@dubicars.com to Admins, Master Viewers, and the contract's Owner at 90, 60, and 30 days before the notice deadline.</div>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {[['r90','90-day reminder','Early warning — review options'],
          ['r60','60-day reminder','Prompt decision — negotiate or notify'],
          ['r30','30-day reminder','Final alert — act imminently']].map(([key,label,sub]) => (
          <div key={key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'var(--bg2)', borderRadius:'var(--radius)', border:'0.5px solid var(--border)' }}>
            <div><div style={{ fontSize:13, fontWeight:500 }}>{label}</div><div style={{ fontSize:12, color:'var(--muted)' }}>{sub}</div></div>
            <label style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', fontSize:13 }}>
              <input type="checkbox" checked={cfg[key]} onChange={e => setCfg(p => ({...p,[key]:e.target.checked}))} style={{ width:'auto' }} />
              Enabled
            </label>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:14 }}>
        <button className="btn btn-p" onClick={save}>✓ Save</button>
        {saved && <span style={{ fontSize:13, color:'var(--green)' }}>✓ Saved</span>}
      </div>
    </div>
  )
}

function UsagePanel() {
  const [usage, setUsage]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('cv_usage').select('*').order('created_at', { ascending:false }).limit(20).then(({ data }) => {
      setUsage(data || []); setLoading(false)
    })
  }, [])

  if (loading) return <div className="empty-state"><span className="spin">⟳</span></div>

  const totalCost = usage.reduce((s, r) => s + (r.cost_usd || 0), 0)
  const totalIn   = usage.reduce((s, r) => s + (r.input_tokens || 0), 0)
  const totalOut  = usage.reduce((s, r) => s + (r.output_tokens || 0), 0)

  return (
    <div>
      <div className="sp-title">API usage &amp; costs</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:14 }}>
        <div className="met"><div className="met-lbl">Total extractions</div><div className="met-val">{usage.length}</div><div className="met-sub">PDFs analysed</div></div>
        <div className="met"><div className="met-lbl">Total spend</div><div className="met-val">${totalCost.toFixed(4)}</div><div className="met-sub">AED {(totalCost * 3.6725).toFixed(3)}</div></div>
        <div className="met"><div className="met-lbl">Input tokens</div><div className="met-val">{totalIn.toLocaleString()}</div><div className="met-sub">sent to Claude</div></div>
        <div className="met"><div className="met-lbl">Output tokens</div><div className="met-val">{totalOut.toLocaleString()}</div><div className="met-sub">returned by Claude</div></div>
      </div>
      <div className="info-bar ib-amber">Pricing: $3.00/1M input · $15.00/1M output (Claude Sonnet 4.6)</div>
      <div style={{ fontSize:13, fontWeight:500, marginBottom:8 }}>Recent extractions</div>
      <div className="card">
        <table>
          <thead><tr><th style={{width:'36%'}}>Contract</th><th style={{width:'20%'}}>By</th><th style={{width:'14%'}}>In</th><th style={{width:'14%'}}>Out</th><th style={{width:'16%'}}>Cost</th></tr></thead>
          <tbody>
            {!usage.length
              ? <tr><td colSpan={5} className="empty-state">No extractions yet</td></tr>
              : usage.map((r,i) => (
                <tr key={i}>
                  <td><div style={{ fontWeight:500 }}>{r.contract_name || r.filename || '—'}</div><div style={{ fontSize:11, color:'var(--muted)' }}>{fmtDate(r.created_at)}</div></td>
                  <td style={{ color:'var(--muted)', fontSize:12 }}>{(r.uploaded_by||'—').split('@')[0]}</td>
                  <td>{(r.input_tokens||0).toLocaleString()}</td>
                  <td>{(r.output_tokens||0).toLocaleString()}</td>
                  <td style={{ fontWeight:500 }}>${(r.cost_usd||0).toFixed(4)}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}
