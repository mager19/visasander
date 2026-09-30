create table if not exists applications (
  id uuid primary key,
  token text not null unique,
  short_id text not null unique,
  client_name text not null,
  code_hash text not null,
  status text not null default 'created' check (status in ('created','in_progress','submitted','reviewed')),
  answers jsonb not null default '{}'::jsonb,
  failed_attempts int not null default 0,
  locked boolean not null default false,
  manager_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  expires_at timestamptz not null
);
create table if not exists sessions (
  id uuid primary key,
  application_id uuid not null references applications(id) on delete cascade,
  token_hash text not null unique,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create table if not exists files (
  id uuid primary key,
  application_id uuid not null references applications(id) on delete cascade,
  kind text not null check (kind in ('passport','photo','national_id','previous_visa','employment_letter')),
  object_key text not null unique,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_at timestamptz not null default now()
);
create table if not exists rate_limits (
  key text primary key,
  count int not null,
  window_start timestamptz not null
);
create index if not exists files_application_idx on files(application_id);
create index if not exists sessions_application_idx on sessions(application_id);
create index if not exists applications_expires_idx on applications(expires_at);
