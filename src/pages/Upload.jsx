// src/pages/Upload.jsx
import { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabase'
import { formatValueAED, computeNoticeDeadline } from '../utils/helpers'

const STEPS = [
  'Reading PDF document',
  'AI extracting key commercial terms',
  'Calculating notice deadlines & uploading to Google Drive',
  'Saving to database'
]

export default function Upload({ setActiveTab, profile }) {
  const [step, setStep]             = useState(-1)
  const [extracted, setExtracted]   = useState(null)
  const [costSummary, setCostSummary] = useState(null)
  const [driveResult, setDriveResult] = useState(null)
  const [filename, setFilename]     = useState('')
  const [b64, setB64]               = useState('')
  const [owner, setOwner]           = useState('')
  const [recipients, setRecipients] = useState([])
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [error, setError]           = useState(null)
  const [dragging, setDragging]     = useState(false)
  const [users, setUsers]           = useState([])
  const fileRef = useRef()

  useEffect(() => {
    supabase.from('cv_users').select('id, name, role').eq('status', 'active').then(({ data }) => setUsers(data || []))
    // Pre-select current user as owner if they are an owner role
    if (profile.role === 'owner') setOwner(profile.id)
  }, [])

  const toB64 = file => new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result.split(',')[1])
    r.onerror = () => rej(new Error('Read failed'))
    r.readAsDataURL(file)
  })

  const handleFile = async (file) => {
    if (!file?.name?.toLowerCase().endsWith('.pdf')) { setError('Please upload a PDF file.'); return }
    setError(null); setExtracted(null); setSaved(false); setCostSummary(null)
    setFilename(file.name); setStep(0)
    const base64 = await toB64(file)
    setB64(base64); setStep(1)
    try {
      const res = await fetch('/.netlify/functions/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, filename: file.name })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setStep(2)
      const deadline = computeNoticeDeadline(data.extracted.expiryDate, data.extracted.noticePeriod)
      data.extracted.noticeDeadline = deadline
      setExtracted(data.extracted)
      setCostSummary(data.usage)
      setDriveResult(data.drive || null)
      setStep(3)
      await new Promise(r => setTimeout(r, 300))
      setStep(4)
    } catch (e) {
      setError('Extraction failed: ' + e.message)
      setStep(-1)
    }
  }

  const handleSave = async () => {
    setSaving(true); setError(null)
    try {
      // PDF is already in Google Drive from the extract step — use returned URL
      const fileUrl  = driveResult?.fileUrl  || null
      const fileId   = driveResult?.fileId   || null
      const driveErr = driveResult?.error    || null

      if (driveErr) {
        console.warn('Drive upload had an issue:', driveErr)
      }

      // Save contract metadata to Supabase
      const { error: dbErr } = await supabase.from('contracts').insert({
        contract_name:   extracted.contractName,
        counterparty:    extracted.counterparty,
        contract_type:   extracted.contractType,
        total_value:     extracted.totalValue,
        payment_terms:   extracted.paymentTerms,
        start_date:      extracted.startDate || null,
        expiry_date:     extracted.expiryDate || null,
        notice_period:   extracted.noticePeriod,
        notice_deadline: extracted.noticeDeadline || null,
        auto_renewal:    extracted.autoRenewal || false,
        notes:           extracted.notes,
        confidence:      extracted.confidence,
        owner_id:        owner || null,
        recipients:      recipients,
        file_url:        fileUrl,
        file_path:       fileId,
        uploaded_by:     profile.id
      })
      if (dbErr) throw new Error(dbErr.message)

      // Save usage record
      if (costSummary) {
        await supabase.from('cv_usage').insert({
          contract_name:   extracted.contractName || filename,
          filename,
          uploaded_by:     profile.email,
          input_tokens:    costSummary.inputTokens,
          output_tokens:   costSummary.outputTokens,
          cost_usd:        costSummary.costUsd,
          estimated_pages: costSummary.estimatedPages
        })
      }
      setSaved(true)
    } catch (e) {
      setError('Save failed: ' + e.message)
    }
    setSaving(false)
  }

  const reset = () => {
    setStep(-1); setExtracted(null); setSaved(false); setB64(''); setFilename('')
    setError(null); setCostSummary(null); setDriveResult(null)
    setOwner(profile.role === 'owner' ? profile.id : ''); setRecipients([])
    if (fileRef.current) fileRef.current.value = ''
  }

  if (saved) return (
    <div style={{ textAlign:'center', padding:'60px 20px' }}>
      <div style={{ width:56, height:56, borderRadius:'50%', background:'var(--green-bg)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', fontSize:24, color:'var(--green)' }}>✓</div>
      <div style={{ fontSize:17, fontWeight:600, marginBottom:6 }}>Contract saved</div>
      <div style={{ fontSize:13, color:'var(--muted)', marginBottom:20 }}>Added to the repository · Reminders will be sent automatically</div>
      <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
        <button className="btn btn-p" onClick={() => setActiveTab('contracts')}>View repository →</button>
        <button className="btn" onClick={reset}>Upload another</button>
      </div>
    </div>
  )

  return (
    <div>
      <div className="sec-hd"><div className="sec-title">Upload contract</div></div>

      {step === -1 && (
        <div className={`dz${dragging ? ' over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
          onClick={() => fileRef.current?.click()}
        >
          <input type="file" accept=".pdf" ref={fileRef} style={{ display:'none' }} onChange={e => handleFile(e.target.files[0])} />
          <div style={{ fontSize:36, marginBottom:10 }}>☁</div>
          <div style={{ fontSize:15, fontWeight:500, marginBottom:5 }}>Drop a PDF contract here</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginBottom:14 }}>AI will extract all key commercial terms automatically</div>
          <button className="btn btn-p" onClick={e => { e.stopPropagation(); fileRef.current?.click() }}>Choose PDF</button>
        </div>
      )}

      {error && <div className="info-bar ib-red" style={{ marginTop:12 }}>{error}</div>}

      {step >= 0 && step < 4 && (
        <div className="card-inner">
          <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:12 }}>
            <span style={{ fontSize:18 }}>📄</span>
            <div>
              <div style={{ fontSize:13, fontWeight:500 }}>{filename}</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Processing with AI...</div>
            </div>
          </div>
          <div className="slist">
            {STEPS.map((s, i) => (
              <div key={i} className={`srow${i < step ? ' done' : i === step ? ' cur' : ''}`}>
                <div className={`sic${i < step ? ' done' : i === step ? ' cur' : ' pend'}`}>
                  {i < step ? '✓' : i === step ? <span className="spin">⟳</span> : '○'}
                </div>
                {s}
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 4 && extracted && (
        <div className="card-inner">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
            <div style={{ fontSize:14, fontWeight:600 }}>✨ AI extraction complete</div>
            <span className={`badge ${extracted.confidence === 'High' ? 'b-ok' : extracted.confidence === 'Low' ? 'b-urg' : 'b-warn'}`}>
              {extracted.confidence} confidence
            </span>
          </div>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>Extracted from: <strong>{filename}</strong></div>

          <div className="eg">
            {[['Counterparty', extracted.counterparty], ['Contract type', extracted.contractType],
              ['Total value', formatValueAED(extracted.totalValue)], ['Payment terms', extracted.paymentTerms],
              ['Start date', extracted.startDate], ['Expiry date', extracted.expiryDate],
              ['Notice period', extracted.noticePeriod]].map(([label, val]) => (
              <div key={label} className="ef"><div className="el">{label}</div><div className="ev">{val || '—'}</div></div>
            ))}
            <div className="ef" style={{ background:'var(--red-bg)' }}>
              <div className="el" style={{ color:'var(--red)' }}>Notice deadline</div>
              <div className="ev" style={{ color:'var(--red)' }}>{extracted.noticeDeadline ? new Date(extracted.noticeDeadline).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—'}</div>
            </div>
          </div>
          <div className="notes-box">{extracted.notes || '—'}</div>

          {costSummary && (
            <div className="cost-box">
              <div className="cost-title">💰 API usage for this extraction</div>
              <div className="cost-grid">
                <div className="cost-item"><div className="cost-lbl">Est. pages</div><div className="cost-val">{costSummary.estimatedPages}</div></div>
                <div className="cost-item"><div className="cost-lbl">This extraction</div><div className="cost-val">${costSummary.costUsd?.toFixed(4)}</div></div>
                <div className="cost-item"><div className="cost-lbl">Model</div><div className="cost-val" style={{ fontSize:11 }}>Sonnet 4.6</div></div>
              </div>
              <div className="cost-tokens">{costSummary.inputTokens?.toLocaleString()} input + {costSummary.outputTokens?.toLocaleString()} output tokens</div>
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:14 }}>
            <div className="frow">
              <label>Contract owner</label>
              <select value={owner} onChange={e => setOwner(e.target.value)} disabled={profile.role === 'owner'}>
                <option value="">— Select owner —</option>
                {users.filter(u => u.role === 'owner' || u.role === 'admin').map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div className="frow">
              <label>Additional reminder recipients</label>
              <select multiple style={{ height:72 }} value={recipients} onChange={e => setRecipients(Array.from(e.target.selectedOptions, o => o.value))}>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <button className="btn btn-p" disabled={saving} onClick={handleSave}>
              {saving ? <><span className="spin">⟳</span> Saving...</> : '💾 Save contract'}
            </button>
            <button className="btn" onClick={reset}>✕ Discard</button>
          </div>
        </div>
      )}
    </div>
  )
}
