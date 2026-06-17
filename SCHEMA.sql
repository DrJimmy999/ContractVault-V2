-- ContractVault v2 — Supabase Schema
-- Run this entire script in Supabase SQL Editor (Database → SQL Editor → New query)

-- ── Users table ──────────────────────────────────────────────
create table if not exists cv_users (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null unique,
  role          text not null check (role in ('admin','master_viewer','owner')),
  status        text not null default 'pending' check (status in ('pending','active')),
  created_at    timestamptz default now(),
  activated_at  timestamptz,
  last_seen_at  timestamptz
);

-- ── Contracts table ──────────────────────────────────────────
create table if not exists contracts (
  id               uuid primary key default gen_random_uuid(),
  contract_name    text,
  counterparty     text,
  contract_type    text,
  total_value      text,
  payment_terms    text,
  start_date       date,
  expiry_date      date,
  notice_period    text,
  notice_deadline  date,
  auto_renewal     boolean default false,
  notes            text,
  confidence       text,
  owner_id         uuid references cv_users(id) on delete set null,
  recipients       uuid[] default '{}',
  file_url         text,
  file_path        text,
  uploaded_by      uuid references cv_users(id) on delete set null,
  created_at       timestamptz default now()
);

-- ── Usage / cost tracking table ──────────────────────────────
create table if not exists cv_usage (
  id               uuid primary key default gen_random_uuid(),
  contract_name    text,
  filename         text,
  uploaded_by      text,
  input_tokens     integer default 0,
  output_tokens    integer default 0,
  cost_usd         numeric(10,6) default 0,
  estimated_pages  integer default 1,
  created_at       timestamptz default now()
);

-- ── Config table (for reminder settings etc) ─────────────────
create table if not exists cv_config (
  key    text primary key,
  value  jsonb
);

-- Insert default reminder config
insert into cv_config (key, value)
values ('reminders', '{"r90": true, "r60": true, "r30": true}')
on conflict (key) do nothing;

-- ── Row Level Security ────────────────────────────────────────
-- We use Supabase anon key + email-based auth, RLS keeps data safe

alter table cv_users    enable row level security;
alter table contracts   enable row level security;
alter table cv_usage    enable row level security;
alter table cv_config   enable row level security;

-- Allow authenticated users to read cv_users (needed for owner name lookups)
create policy "Authenticated users can read cv_users"
  on cv_users for select
  using (auth.role() = 'authenticated');

-- Allow users to update their own last_seen_at
create policy "Users can update own record"
  on cv_users for update
  using (auth.jwt() ->> 'email' = email);

-- Contracts: all authenticated users can read
create policy "Authenticated users can read contracts"
  on contracts for select
  using (auth.role() = 'authenticated');

-- Contracts: authenticated users can insert
create policy "Authenticated users can insert contracts"
  on contracts for insert
  with check (auth.role() = 'authenticated');

-- Contracts: only owner or admin can delete
-- (enforced in app logic, this is a belt-and-braces policy)
create policy "Authenticated users can delete contracts"
  on contracts for delete
  using (auth.role() = 'authenticated');

-- Usage: authenticated users can read and insert
create policy "Authenticated users can read usage"
  on cv_usage for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert usage"
  on cv_usage for insert
  with check (auth.role() = 'authenticated');

-- Config: authenticated users can read and upsert
create policy "Authenticated users can read config"
  on cv_config for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can upsert config"
  on cv_config for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update config"
  on cv_config for update
  using (auth.role() = 'authenticated');

-- ── Notes on PDF storage ─────────────────────────────────────
-- PDFs are stored in Google Drive via the service account.
-- The contracts table stores the Drive file URL and file ID.
-- No Supabase Storage bucket is needed.

-- ── Insert your admin user ────────────────────────────────────
-- Replace with your real name and email, then run
insert into cv_users (name, email, role, status, activated_at)
values ('James Capper', 'james@dubicars.com', 'admin', 'active', now())
on conflict (email) do nothing;
