-- WhatsApp SaaS Tables
-- Supabase SQL Editor mein yeh paste karke Run dabao

create table if not exists clients (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  wa_phone_id text not null,
  wa_token text not null,
  ai_provider text not null default 'gemini',
  ai_key text not null,
  system_prompt text not null,
  plan text default 'starter',
  google_sheet_id text default '',
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists conversations (
  id text primary key,
  client_id uuid references clients(id),
  client_name text,
  user_phone text,
  messages jsonb default '[]',
  last_updated timestamptz default now()
);
