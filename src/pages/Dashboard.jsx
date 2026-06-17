// src/pages/Dashboard.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { daysUntil, formatValueAED, totalInAED, fmtDate } from '../utils/helpers'

function StatusBadge({ contract }) {
  const d = daysUntil(contract.notice_deadline)
  if (d === null)  return <span className="badge b-gray">No deadline</span>
  if (d < 0)       return <span className="badge b-urg">Overdue</span>
  if (d <= 30)     return <span className="badge b-urg">Urgent</span>
  if (d <= 90)     return <span className="badge b-warn">Notice due</span>
  return <span className="badge b-ok">Active</span>
}

export default function Dashboard({ setActiveTab, profile }) {
  const [contracts, setContracts] = useState([])
  const [users, setUsers]         = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: c }, { data: u }] = await Promise.all([
      supabase.from('contracts').select('*').order('created_at', { ascending: false }),
      supabase.from('cv_users').select('*')
    ])
    setContracts(c || [])
    setUsers(u || [])
    setLoading(false)
  }

  const isOwner   = profile.role === 'owner'
  const visible   = isOwner ? contracts.filter(c => c.owner_id === profile.id) : contracts
  const urgent    = visible.filter(c => { const d = daysUntil(c.notice_deadline); return d !== null && d >= 0 && d <= 90 })
  const aedTotal  = Math.round(totalInAED(visible))
  const ownerName = id => users.find(u => u.id === id)?.name || '—'

  if (loading) return <div className="empty-state"><div className="spin">⟳</div></div>

  return (
    <div>
      <div className="metrics">
        <div className="met">
          <div className="met-lbl">Contracts</div>
          <div className="met-val">{visible.length}</div>
          <div className="met-sub">{isOwner ? 'assigned to you' : 'total'}</div>
        </div>
        <div className="met">
          <div className="met-lbl">Action needed</div>
          <div className="met-val" style={{ color:'var(--red)' }}>{urgent.length}</div>
          <div className="met-sub">within 90 days</div>
        </div>
        <div className="met">
          <div className="met-lbl">Total annual value</div>
          <div className="met-val" style={{ fontSize:16 }}>AED {aedTotal.toLocaleString('en-GB')}</div>
          <div className="met-sub">converted to AED</div>
        </div>
        <div className="met">
          <div className="met-lbl">Users</div>
          <div className="met-val">{users.length}</div>
          <div className="met-sub">active accounts</div>
        </div>
      </div>

      <div className="sec-hd"><div className="sec-title">Upcoming notice deadlines</div></div>
      <div className="alert-list">
        {!urgent.length
          ? <div className="empty-state" style={{ background:'var(--bg)', borderRadius:'var(--radius-lg)', border:'0.5px solid var(--border)', padding:20 }}>✓ No notice deadlines in the next 90 days</div>
          : urgent.sort((a, b) => daysUntil(a.notice_deadline) - daysUntil(b.notice_deadline)).map(c => {
              const d = daysUntil(c.notice_deadline)
              const cls = d <= 30 ? 'ai-d' : d <= 60 ? 'ai-w' : 'ai-i'
              return (
                <div key={c.id} className={`alert-i ${cls}`} onClick={() => setActiveTab('contracts')}>
                  <div className="ait">
                    <div className="at">{c.contract_name || c.counterparty} — notice deadline</div>
                    <div className="as">{fmtDate(c.notice_deadline)} · {c.notice_period || '—'} notice · Owner: {ownerName(c.owner_id)}</div>
                  </div>
                  <div className="aid">{d} days</div>
                </div>
              )
            })
        }
      </div>

      <div className="sec-hd" style={{ marginTop:20 }}>
        <div className="sec-title">Recent contracts</div>
        <button className="btn" onClick={() => setActiveTab('contracts')}>View all →</button>
      </div>
      <div className="card">
        <table>
          <thead><tr>
            <th style={{width:'30%'}}>Contract</th>
            <th style={{width:'18%'}}>Owner</th>
            <th style={{width:'22%'}}>Value</th>
            <th style={{width:'15%'}}>Expiry</th>
            <th style={{width:'15%'}}>Status</th>
          </tr></thead>
          <tbody>
            {!visible.length
              ? <tr><td colSpan={5} className="empty-state">No contracts yet</td></tr>
              : visible.slice(0, 5).map(c => (
                <tr key={c.id} onClick={() => setActiveTab('contracts')}>
                  <td><div className="cn">📄 {c.contract_name || c.counterparty || 'Unnamed'}</div></td>
                  <td style={{ color:'var(--muted)', fontSize:13 }}>{ownerName(c.owner_id)}</td>
                  <td style={{ fontSize:12 }}>{formatValueAED(c.total_value)}</td>
                  <td style={{ fontSize:13 }}>{fmtDate(c.expiry_date)}</td>
                  <td><StatusBadge contract={c} /></td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}
