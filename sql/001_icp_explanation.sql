-- Adds a column for the score explanation and one for the component breakdown (for "numbers behind the conclusion").
-- Run once in Supabase → SQL Editor.
alter table conference_editions
  add column if not exists icp_explanation text,
  add column if not exists icp_breakdown jsonb;

-- Refresh the PostgREST schema cache so the new columns are available right away
notify pgrst, 'reload schema';
