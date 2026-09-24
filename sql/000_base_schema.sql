-- The base schema. Run first, in Supabase → SQL Editor, then 001 and 002.
-- Reconstructed from the live project's schema (the original tables were created in the Supabase dashboard).
-- Safe to re-run: every statement is "if not exists".
--
-- Note: there is no login, so the anon (publishable) key gets full read/write on every table.
-- That's acceptable for an internal tool. Anyone with the site link can change data.

create table if not exists conference_series (
  id text primary key,                      -- slug: "money2020-usa"
  name text not null,
  brand text,                               -- groups editions: "money2020"
  vertical text,
  region text,                              -- europe | north-america | apac | middle-east | africa | global-rotating
  website text,
  audience_mix jsonb,                       -- { platforms, payments_psp, embedded_fintech, saas_vertical, treasury, travel_wholesale, travel_general, banks, other } in %, total 100
  seniority_pct numeric,
  has_expo_floor boolean,
  has_meeting_system boolean,
  meeting_system_name text,
  has_attendee_list boolean,
  has_evening_events boolean,
  notes text,
  data_confidence text,
  manually_set text[] default '{}',         -- fields edited by hand; automated jobs don't overwrite them
  created_at timestamptz not null default now()
);

create table if not exists conference_editions (
  id text primary key,                      -- slug + year: "money2020-usa-2026"
  series_id text references conference_series(id) on delete cascade,
  start_date date,
  end_date date,
  duration_days integer,
  city text,
  country text,
  venue text,
  ticket_cost_usd numeric,
  attendees jsonb,                          -- { min, max, value, spread, sources[] }
  exhibitors integer,
  companies integer,
  meetings_facilitated integer,
  icp_score numeric,
  last_verified date,
  confidence jsonb,
  status text,                              -- upcoming | historical
  notes text,
  manually_set text[] default '{}'
);

create table if not exists score_history (
  id uuid primary key default gen_random_uuid(),
  edition_id text references conference_editions(id) on delete cascade,
  old_score numeric,
  new_score numeric,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  phone text unique,                        -- E.164, the primary identifier
  email text,
  linkedin_name text,
  linkedin_url text,
  first_name text,
  last_name text,
  current_company text,
  current_title text,
  status text not null default 'active',    -- active | archived
  created_at timestamptz not null default now()
);

create table if not exists encounters (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id) on delete cascade,
  edition_id text references conference_editions(id),
  rep_name text,
  company text,                             -- as it was at the time of the encounter
  title text,
  transcript text,
  identity_line text,
  extracted jsonb,                          -- { pain, timing, currencies[], authority, next_step }
  external_id text,                         -- from a QR badge, if any
  created_at timestamptz not null default now()
);

create table if not exists merge_decisions (
  id uuid primary key default gen_random_uuid(),
  person_a uuid,
  person_b uuid,
  decision text,                            -- same | different
  decided_by text,
  created_at timestamptz not null default now()
);

create table if not exists app_settings (
  key text primary key,                     -- "icp_formula": all ICP weights and thresholds
  value jsonb
);

-- Access for the site (anon key) and the scripts
do $$
declare t text;
begin
  foreach t in array array['conference_series','conference_editions','score_history','people','encounters','merge_decisions','app_settings']
  loop
    execute format('alter table %I disable row level security', t);
    execute format('grant select, insert, update, delete on %I to anon, authenticated', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
