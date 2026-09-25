-- Suggested next actions per encounter (PRD 9): [{ "fact": "...", "action": "..." }], generated once by the AI and stored.
--   null = not generated yet (the Person screen offers "צור המלצות")
--   []   = generated, and there was nothing said to base an action on (nothing is shown)
-- Run once in Supabase → SQL Editor. Safe to re-run.

alter table encounters add column if not exists suggested_actions jsonb;
