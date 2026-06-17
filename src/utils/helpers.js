// src/utils/helpers.js

export const FX = { USD: 3.6725, GBP: 4.9, EUR: 4.2, AED: 1 }

export function formatValueAED(raw) {
  if (!raw || raw === '—') return raw || '—'
  const s = String(raw)
  let currency = null
  if (s.match(/AED|د\.إ/i))  currency = 'AED'
  else if (s.match(/£|GBP/i)) currency = 'GBP'
  else if (s.match(/€|EUR/i)) currency = 'EUR'
  else if (s.match(/\$|USD/i)) currency = 'USD'
  const numMatch = s.replace(/,/g, '').match(/[\d]+(\.\d+)?/)
  if (!numMatch || !currency || currency === 'AED') return s
  const amount = parseFloat(numMatch[0])
  const suffix = s.replace(/^.*?([\d,]+(\.\d+)?)/, '').replace(/[£$€]|AED|GBP|EUR|USD/gi, '').trim()
  const aed = amount * FX[currency]
  const symMap = { USD: '$', GBP: '£', EUR: '€' }
  const orig = symMap[currency] + amount.toLocaleString('en-GB', { maximumFractionDigits: 0 })
  const aedStr = 'AED ' + Math.round(aed).toLocaleString('en-GB')
  return orig + (suffix ? ' ' + suffix : '') + ' / ' + aedStr + (suffix ? ' ' + suffix : '')
}

export function totalInAED(contracts) {
  return contracts.reduce((total, c) => {
    const s = String(c.total_value || '').replace(/,/g, '')
    let currency = null
    if (s.match(/AED|د\.إ/i))  currency = 'AED'
    else if (s.match(/£|GBP/i)) currency = 'GBP'
    else if (s.match(/€|EUR/i)) currency = 'EUR'
    else if (s.match(/\$|USD/i)) currency = 'USD'
    const numMatch = s.match(/[\d]+(\.\d+)?/)
    if (!numMatch || !currency) return total
    return total + parseFloat(numMatch[0]) * FX[currency]
  }, 0)
}

export function daysUntil(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  return Math.ceil((d - new Date()) / 86400000)
}

export function computeNoticeDeadline(expiryDate, noticePeriod) {
  if (!expiryDate || !noticePeriod) return null
  const exp = new Date(expiryDate)
  if (isNaN(exp)) return null
  const match = noticePeriod.match(/(\d+)\s*(day|month|week)/i)
  if (!match) return null
  const n = parseInt(match[1])
  const unit = match[2].toLowerCase()
  const d = new Date(exp)
  if (unit.startsWith('day'))        d.setDate(d.getDate() - n)
  else if (unit.startsWith('week'))  d.setDate(d.getDate() - n * 7)
  else                               d.setMonth(d.getMonth() - n)
  return d.toISOString().split('T')[0]
}

export function fmtDate(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtRelative(isoStr) {
  const d = new Date(isoStr)
  if (isNaN(d)) return '—'
  const mins = Math.floor((Date.now() - d) / 60000)
  if (mins < 2)   return 'just now'
  if (mins < 60)  return `${mins} mins ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)   return `${days}d ago`
  return fmtDate(isoStr)
}

export function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()
}

export const AV_COLORS = [
  ['#aed6f1','#1a5276'], ['#a9dfbf','#1e8449'], ['#f5cba7','#784212'],
  ['#d7bde2','#6c3483'], ['#f9e79f','#7d6608'], ['#a8d8ea','#1a5276'],
  ['#fadbd8','#922b21'], ['#d5f5e3','#1e8449']
]

export const ROLES = {
  admin:         { label: 'Admin',          cls: 'b-urg'    },
  master_viewer: { label: 'Master Viewer',  cls: 'b-purple' },
  owner:         { label: 'Contract Owner', cls: 'b-info'   }
}
