// src/pages/Contracts.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useData } from '../context/DataContext'
import { daysUntil, formatValueAED, fmtDate, ROLES, AV_COLORS, initials, computeNoticeDeadline } from '../utils/helpers'

function StatusBadge({ contract }) {
  const d = daysUntil(contract.notice_deadline)
  if (d === null) return <span className="badge b-gray">No deadline</span>
  if (d < 0)     return <span className="badge b-urg">Overdue</span>
  if (d <= 30)   return <span className="badge b-urg">Urgent</span>
  if (d <= 90)   return <span className="badge b-warn">Notice due</span>
  return <span className="badge b-ok">Active</span>
}

function Avatar({ user, idx, size = 28 }) {
  const [bg, fg] = AV_COLORS[idx % AV_COLORS.length]
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:bg, color:fg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.36, fontWeight:600, flexShrink:0 }}>
      {initials(user?.name || '?')}
    </div>
  )
}

// ── Editable field component ──────────────────────────────────
function EditField({ label, value, onChange, type = 'text', urgent }) {
  return (
    <div className="d-card" style={urgent ? { borderColor:'rgba(192,57,43,.3)', borderLeft:'3px solid var(--red)', background:'var(--red-bg)' } : {}}>
      <div className="d-lbl" style={urgent ? { color:'var(--red)' } : {}}>{label}</div>
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        style={{ fontSize:14, fontWeight:500, padding:'4px 6px', marginTop:2, color: urgent ? 'var(--red)' : 'var(--text)' }}
      />
    </div>
  )
}

export default function Contracts({ profile }) {
  const { contracts, users, loadContracts, loadUsers, updateContract, removeContract, contractsLoaded } = useData()
  const [detail, setDetail]       = useState(null)
  const [editing, setEditing]     = useState(false)
  const [editData, setEditData]   = useState({})
  const [saving, setSaving]       = useState(false)
  const [saveMsg, setSaveMsg]     = useState(null)
  const [search, setSearch]       = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [deleting, setDeleting]   = useState(false)

  useEffect(() => {
    loadContracts()
    loadUsers()
  }, [])

  const isOwner  = profile.role === 'owner'
  const base     = contracts.filter(c => !isOwner || c.owner_id === profile.id)
  const filtered = base.filter(c => {
    const mq = !search || (c.contract_name||'').toLowerCase().includes(search.toLowerCase()) || (c.counterparty||'').toLowerCase().includes(search.toLowerCase())
    const mo = !ownerFilter || c.owner_id === ownerFilter
    return mq && mo
  })

  const ownerUser = id => users.find(u => u.id === id)
  const ownerIdx  = id => users.findIndex(u => u.id === id)
  const canDelete = c => profile.role === 'admin' || c.owner_id === profile.id
  const canEdit   = c => profile.role === 'admin' || c.owner_id === profile.id

  function openDetail(c) {
    setDetail(c)
    setEditing(false)
    setEditData({})
    setSaveMsg(null)
  }

  function startEdit() {
    setEditData({
      contract_name:   detail.contract_name || '',
      counterparty:    detail.counterparty || '',
      contract_type:   detail.contract_type || '',
      total_value:     detail.total_value || '',
      payment_terms:   detail.payment_terms || '',
      start_date:      detail.start_date || '',
      expiry_date:     detail.expiry_date || '',
      notice_period:   detail.notice_period || '',
      notice_deadline: detail.notice_deadline || '',
      auto_renewal:    detail.auto_renewal || false,
      notes:           detail.notes || '',
      owner_id:        detail.owner_id || ''
    })
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setEditData({})
    setSaveMsg(null)
  }

  function handleEditChange(field, value) {
    setEditData(prev => {
      const updated = { ...prev, [field]: value }
      // Auto-recalculate notice deadline when expiry or notice period changes
      if (field === 'expiry_date' || field === 'notice_period') {
        const deadline = computeNoticeDeadline(
          field === 'expiry_date' ? value : prev.expiry_date,
          field === 'notice_period' ? value : prev.notice_period
        )
        if (deadline) updated.notice_deadline = deadline
      }
      return updated
    })
  }

  async function saveEdit() {
    setSaving(true); setSaveMsg(null)
    try {
      const { data: updated, error } = await supabase
        .from('contracts')
        .update(editData)
        .eq('id', detail.id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      updateContract(updated)
      setDetail(updated)
      setEditing(false)
      setSaveMsg({ ok: true, msg: '✓ Contract updated' })
    } catch (e) {
      setSaveMsg({ ok: false, msg: 'Save failed: ' + e.message })
    }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!window.confirm('Remove this contract from the repository?')) return
    setDeleting(true)
    await supabase.from('contracts').delete().eq('id', id)
    removeContract(id)
    setDetail(null)
    setDeleting(false)
  }

  if (!contractsLoaded) return <div className="empty-state"><span className="spin">⟳</span></div>

  // ── Detail view ───────────────────────────────────────────
  if (detail) {
    const c = editing ? { ...detail, ...editData } : detail
    const ownerU = ownerUser(c.owner_id)
    const oidx   = ownerIdx(c.owner_id)
    const d = daysUntil(c.notice_deadline)
    const urgent = d !== null && d <= 30
    const base2 = c.notice_deadline ? new Date(c.notice_deadline) : null
    const rems = base2 ? [
      { label: '90-day reminder', date: new Date(base2.getTime() - 90*864e5) },
      { label: '60-day reminder', date: new Date(base2.getTime() - 60*864e5) },
      { label: '30-day reminder', date: new Date(base2.getTime() - 30*864e5) }
    ] : []

    return (
      <div>
        <div className="detail-back" onClick={() => { setDetail(null); setEditing(false) }}>← Back to contracts</div>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            {editing
              ? <input value={editData.contract_name} onChange={e => handleEditChange('contract_name', e.target.value)} style={{ fontSize:19, fontWeight:700, marginBottom:4, width:'100%' }} />
              : <div style={{ fontSize:20, fontWeight:700, marginBottom:4 }}>{c.contract_name || c.counterparty || 'Contract'}</div>
            }
            <div style={{ fontSize:13, color:'var(--muted)', display:'flex', alignItems:'center', gap:10 }}>
              {c.counterparty} <StatusBadge contract={c} />
            </div>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
            {c.file_url && !editing && <a className="btn" href={c.file_url} target="_blank" rel="noreferrer">↗ View PDF</a>}
            {canEdit(detail) && !editing && <button className="btn btn-p" onClick={startEdit}>✏️ Edit</button>}
            {editing && <>
              <button className="btn btn-p" disabled={saving} onClick={saveEdit}>{saving ? <><span className="spin">⟳</span> Saving</> : '✓ Save changes'}</button>
              <button className="btn" onClick={cancelEdit}>Cancel</button>
            </>}
            {canDelete(detail) && !editing && <button className="btn btn-d" disabled={deleting} onClick={() => handleDelete(detail.id)}>🗑 Delete</button>}
          </div>
        </div>

        {saveMsg && <div className={`info-bar ${saveMsg.ok ? 'ib-green' : 'ib-red'}`} style={{ marginBottom:12 }}>{saveMsg.msg}</div>}

        {editing ? (
          <>
            <div className="d-grid">
              <EditField label="Counterparty"   value={editData.counterparty}    onChange={v => handleEditChange('counterparty', v)} />
              <EditField label="Contract type"  value={editData.contract_type}   onChange={v => handleEditChange('contract_type', v)} />
              <EditField label="Total value"    value={editData.total_value}     onChange={v => handleEditChange('total_value', v)} />
            </div>
            <div className="d-grid">
              <EditField label="Payment terms"  value={editData.payment_terms}   onChange={v => handleEditChange('payment_terms', v)} />
              <EditField label="Start date"     value={editData.start_date}      onChange={v => handleEditChange('start_date', v)} type="date" />
              <EditField label="Expiry date"    value={editData.expiry_date}     onChange={v => handleEditChange('expiry_date', v)} type="date" />
            </div>
            <div className="d-grid">
              <EditField label="Notice period"  value={editData.notice_period}   onChange={v => handleEditChange('notice_period', v)} />
              <EditField label="Notice deadline" value={editData.notice_deadline} onChange={v => handleEditChange('notice_deadline', v)} type="date" urgent={urgent} />
              <div className="d-card">
                <div className="d-lbl">Owner</div>
                <select value={editData.owner_id} onChange={e => handleEditChange('owner_id', e.target.value)} style={{ marginTop:4 }}>
                  <option value="">— Unassigned —</option>
                  {(users||[]).filter(u => u.status==='active').map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="frow" style={{ marginTop:4 }}>
              <label>Notes</label>
              <textarea value={editData.notes} onChange={e => handleEditChange('notes', e.target.value)} rows={3} />
            </div>
            <div className="frow">
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                <input type="checkbox" checked={editData.auto_renewal} onChange={e => handleEditChange('auto_renewal', e.target.checked)} style={{ width:'auto' }} />
                Auto-renewal
              </label>
            </div>
          </>
        ) : (
          <>
            <div className="d-grid">
              <div className="d-card">
                <div className="d-lbl">Value</div>
                <div className="d-val" style={{ fontSize:13 }}>{formatValueAED(c.total_value)}</div>
                <div className="d-sub">{c.payment_terms || '—'}</div>
              </div>
              <div className="d-card">
                <div className="d-lbl">Owner</div>
                <div className="d-val" style={{ display:'flex', alignItems:'center', gap:8, fontSize:14 }}>
                  {ownerU && <Avatar user={ownerU} idx={oidx} size={22} />}
                  {ownerU?.name || 'Unassigned'}
                </div>
                <div className="d-sub">{ownerU ? (ROLES[ownerU.role]?.label || ownerU.role) : '—'}</div>
              </div>
              <div className={`d-card${urgent ? ' urgent' : ''}`}>
                <div className="d-lbl">Notice deadline</div>
                <div className="d-val">{fmtDate(c.notice_deadline)}</div>
                <div className="d-sub">{c.notice_period ? c.notice_period + ' notice required' : '—'}</div>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div className="d-card">
                <div className="d-lbl">Contract period</div>
                <div className="d-val" style={{ fontSize:13 }}>{fmtDate(c.start_date)} – {fmtDate(c.expiry_date)}</div>
                <div className="d-sub">{c.contract_type || '—'}</div>
              </div>
              <div className="d-card">
                <div className="d-lbl">Auto renewal</div>
                <div className="d-val">{c.auto_renewal ? 'Yes' : 'No'}</div>
                <div className="d-sub">Confidence: {c.confidence || '—'}</div>
              </div>
            </div>
            <div className="notes-box" style={{ marginBottom:14 }}>{c.notes || 'No notes extracted.'}</div>
          </>
        )}

        {rems.length > 0 && !editing && (
          <div className="rem-section">
            <div style={{ fontSize:14, fontWeight:600, marginBottom:12 }}>🔔 Reminder schedule</div>
            {rems.map(r => {
              const sent = r.date < new Date()
              return (
                <div key={r.label} className="rem-row">
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ color: sent ? 'var(--green)' : 'var(--blue-light)', fontSize:16 }}>{sent ? '🔔' : '🔕'}</span>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500 }}>{r.label}</div>
                      <div style={{ fontSize:12, color:'var(--muted)' }}>
                        {r.date.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })} ·{' '}
                        <span style={{ color: sent ? 'var(--green)' : 'var(--blue-light)' }}>{sent ? 'Sent' : 'Scheduled'}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                    {(c.recipients || []).map((id, i) => {
                      const u = (users||[]).find(u => u.id === id)
                      if (!u) return null
                      return <Avatar key={id} user={u} idx={i} size={22} />
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── List view ─────────────────────────────────────────────
  return (
    <div>
      <div className="sec-hd">
        <div className="sec-title">All contracts ({filtered.length}){isOwner ? ' — assigned to you' : ''}</div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ width:160 }} />
          {!isOwner && (
            <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} style={{ width:140 }}>
              <option value="">All owners</option>
              {(users||[]).filter(u => u.role === 'owner' || u.role === 'admin').map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="card">
        <table>
          <thead><tr>
            <th style={{width:'26%'}}>Contract</th>
            <th style={{width:'15%'}}>Owner</th>
            <th style={{width:'20%'}}>Value</th>
            <th style={{width:'16%'}}>Notice deadline</th>
            <th style={{width:'13%'}}>Status</th>
            <th style={{width:'10%'}}></th>
          </tr></thead>
          <tbody>
            {!filtered.length
              ? <tr><td colSpan={6} className="empty-state"><div className="es-icon">📂</div>{isOwner ? 'No contracts assigned to you yet' : 'No contracts yet'}</td></tr>
              : filtered.map(c => {
                  const d = daysUntil(c.notice_deadline)
                  const ndStyle = d !== null && d <= 30 ? { color:'var(--red)', fontWeight:600 } : d !== null && d <= 90 ? { color:'var(--amber)', fontWeight:500 } : {}
                  const ou   = ownerUser(c.owner_id)
                  const oidx = ownerIdx(c.owner_id)
                  return (
                    <tr key={c.id} onClick={() => openDetail(c)}>
                      <td><div className="cn">📄 {c.contract_name || c.counterparty || 'Unnamed'}</div></td>
                      <td>{ou
                        ? <div style={{ display:'flex', alignItems:'center', gap:6 }}><Avatar user={ou} idx={oidx} size={20} /><span style={{ fontSize:13 }}>{ou.name.split(' ')[0]}</span></div>
                        : <span style={{ color:'var(--muted)' }}>—</span>}
                      </td>
                      <td style={{ fontSize:12 }}>{formatValueAED(c.total_value)}</td>
                      <td style={ndStyle}>{fmtDate(c.notice_deadline)}</td>
                      <td><StatusBadge contract={c} /></td>
                      <td>{canDelete(c) && (
                        <button className="btn btn-d btn-sm" onClick={e => { e.stopPropagation(); handleDelete(c.id) }}>🗑</button>
                      )}</td>
                    </tr>
                  )
                })
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}

