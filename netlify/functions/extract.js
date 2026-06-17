// netlify/functions/extract.js
// Handles two tasks in one function:
// 1. AI extraction via Anthropic API
// 2. PDF upload to Google Drive via service account

const crypto = require('crypto')

// ── Service account token ─────────────────────────────────────

async function getServiceAccountToken() {
  const credJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!credJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set')
  const creds = JSON.parse(credJson)
  const now = Math.floor(Date.now() / 1000)
  const header  = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss:   creds.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600
  }
  const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const unsigned = `${b64(header)}.${b64(payload)}`
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(unsigned)
  const signature = sign.sign(creds.private_key, 'base64url')
  const jwt = `${unsigned}.${signature}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to get service account token')
  return data.access_token
}

// ── Drive helpers ─────────────────────────────────────────────

async function getOrCreateFolder(saToken, name = 'ContractVault') {
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${saToken}` }
  })
  const data = await res.json()
  if (data.files?.length) return data.files[0].id
  const created = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${saToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' })
  })
  const f = await created.json()
  return f.id
}

async function uploadPDFToDrive(saToken, folderId, filename, base64Data) {
  const boundary = 'cv_boundary_' + Date.now()
  const meta = JSON.stringify({ name: filename, parents: [folderId], mimeType: 'application/pdf' })
  const binaryData = Buffer.from(base64Data, 'base64')
  const metaPart  = Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n`)
  const filePart  = Buffer.from(`--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`)
  const closePart = Buffer.from(`\r\n--${boundary}--`)
  const combined  = Buffer.concat([metaPart, filePart, binaryData, closePart])
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${saToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': combined.length
    },
    body: combined
  })
  return res.json()
}

// ── Main handler ──────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_API_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }) }

  let body
  try { body = JSON.parse(event.body) }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) } }

  const { base64, filename } = body
  if (!base64 || !filename) return { statusCode: 400, body: JSON.stringify({ error: 'Missing base64 or filename' }) }

  const headers = { 'Content-Type': 'application/json' }

  try {
    // ── Step 1: AI extraction ─────────────────────────────────
    const prompt = `You are a contract analysis AI. Extract the following from this PDF and return ONLY a valid JSON object:
{"contractName":"short descriptive name","counterparty":"other party name","contractType":"e.g. SaaS Licence / NDA / Lease / MSA","totalValue":"e.g. $120,000/yr or AED 440,700/yr","paymentTerms":"e.g. Monthly / Annual / Net 30","startDate":"YYYY-MM-DD","expiryDate":"YYYY-MM-DD","noticePeriod":"e.g. 90 days or 6 months","autoRenewal":true,"notes":"one sentence on key clauses","confidence":"High or Medium or Low"}
Return ONLY the JSON. No markdown, no preamble. Use YYYY-MM-DD format for dates.`

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    })

    const aiData = await aiRes.json()
    if (aiData.error) return { statusCode: 500, headers, body: JSON.stringify({ error: aiData.error.message }) }

    const raw = aiData.content?.[0]?.text || '{}'
    const usage = aiData.usage || {}
    const inputTokens  = usage.input_tokens  || 0
    const outputTokens = usage.output_tokens || 0
    const costUsd = ((inputTokens / 1e6) * 3.00) + ((outputTokens / 1e6) * 15.00)
    const estimatedPages = Math.max(1, Math.round((base64.length * 0.75) / 51200))

    let extracted
    try { extracted = JSON.parse(raw.replace(/```json|```/g, '').trim()) }
    catch { extracted = { contractName: filename, counterparty: 'Unknown', notes: 'Extraction failed.', confidence: 'Low' } }

    // ── Step 2: Upload PDF to Google Drive ───────────────────
    let driveFileId  = null
    let driveFileUrl = null
    let driveError   = null

    try {
      const saToken  = await getServiceAccountToken()
      const folderId = await getOrCreateFolder(saToken, 'ContractVault')
      const driveFile = await uploadPDFToDrive(saToken, folderId, filename, base64)
      driveFileId  = driveFile.id
      driveFileUrl = driveFile.webViewLink
    } catch (e) {
      // Don't fail the whole request if Drive upload fails — log and continue
      driveError = e.message
      console.error('Drive upload failed:', e.message)
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        extracted,
        usage: { inputTokens, outputTokens, costUsd: Math.round(costUsd * 100000) / 100000, estimatedPages },
        drive: { fileId: driveFileId, fileUrl: driveFileUrl, error: driveError }
      })
    }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
