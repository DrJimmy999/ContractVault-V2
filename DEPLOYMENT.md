# ContractVault v2 — Deployment Guide
## Vite + React → Netlify + Supabase (estimated: 20 minutes)

---

## Overview
- **Hosting:** Netlify (same as before)
- **Database + Auth:** Supabase (replaces Google OAuth entirely)
- **Login:** Magic link email — users click a link sent to their @dubicars.com inbox
- **No Google Cloud Console setup needed**

---

## Step 1 — Create a Supabase project

1. Go to https://supabase.com and sign in
2. Click **New project**
3. Name it `contractvault`, choose a strong database password, select your region (pick EU West or closest to UAE)
4. Click **Create new project** — wait ~2 minutes for it to initialise

---

## Step 2 — Run the database schema

1. In Supabase, go to **SQL Editor** (left sidebar)
2. Click **New query**
3. Open `SCHEMA.sql` from this package, copy the entire contents
4. Paste into the SQL editor and click **Run**
5. You should see "Success. No rows returned"

---

## Step 3 — Add environment variables in Netlify

Go to **Site configuration → Environment variables** and add:

| Key | Value | Secret? |
|-----|-------|---------|
| `VITE_SUPABASE_URL` | Your Supabase Project URL | No |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon public key | No |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (sk-ant-...) | Yes |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full contents of your service account JSON key file | Yes |

The `GOOGLE_SERVICE_ACCOUNT_JSON` is the same service account key from your previous ContractVault setup. PDFs will be saved to the **ContractVault/** folder in your Google Drive, exactly as before. Make sure the service account email still has Editor access to that folder.

Trigger a redeploy after adding these.

---

## Step 7 — Configure Supabase Auth

1. In Supabase go to **Authentication → URL Configuration**
2. Set **Site URL** to your Netlify URL e.g. `https://contractvault.netlify.app`
3. Add the same URL to **Redirect URLs**
4. Go to **Authentication → Email Templates**
5. Customise the magic link email subject if you like (optional)

---

## Step 8 — First login

1. Open your Netlify URL
2. Enter `james@dubicars.com` and click **Send link**
3. Check your inbox — click the magic link
4. You're logged in as Admin automatically (your record was inserted by the SQL schema)

---

## Adding users

Go to **Settings → Add user** in the app:
- Enter their name, @dubicars.com email, and role
- Click **Add user & send link**
- They receive a magic sign-in link automatically
- On first click they are activated and can use the app

**Roles:**
- **Admin** — full access, manages users and settings
- **Master Viewer** — can view all contracts, read-only
- **Contract Owner** — can upload PDFs and view their own contracts only

---

## File structure

```
contractvault-v2/
├── src/
│   ├── App.jsx              ← Auth, routing, nav
│   ├── main.jsx             ← Entry point
│   ├── index.css            ← All styles
│   ├── supabase.js          ← Supabase client
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── Upload.jsx
│   │   ├── Contracts.jsx
│   │   └── Settings.jsx
│   └── utils/
│       └── helpers.js       ← Currency, dates, formatting
├── netlify/
│   └── functions/
│       └── extract.js       ← Anthropic API proxy
├── index.html
├── vite.config.js
├── netlify.toml
├── package.json
└── SCHEMA.sql               ← Run once in Supabase SQL Editor
```
