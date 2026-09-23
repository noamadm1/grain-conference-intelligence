-- What the screens need. Run once in Supabase → SQL Editor. Safe to run more than once.

-- 1. The voice recording that belongs to an encounter (a path in Storage)
alter table encounters add column if not exists audio_path text;

-- 2. Rep assignments to conferences. The planning view uses them for coverage, clusters and conflicts.
--    "The system shows, the manager assigns" (PRD 6), so these rows are only added by hand.
create table if not exists edition_assignments (
  id uuid primary key default gen_random_uuid(),
  edition_id text not null references conference_editions(id) on delete cascade,
  rep_name text not null,
  created_at timestamptz not null default now(),
  unique (edition_id, rep_name)
);
-- Same access as the other tables (no login yet)
alter table edition_assignments disable row level security;
grant select, insert, update, delete on edition_assignments to anon, authenticated;

-- 3. Storage bucket for recordings (private) + permission for the site to upload and play them back
insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

drop policy if exists "recordings insert" on storage.objects;
create policy "recordings insert" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'recordings');

drop policy if exists "recordings read" on storage.objects;
create policy "recordings read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'recordings');

notify pgrst, 'reload schema';
