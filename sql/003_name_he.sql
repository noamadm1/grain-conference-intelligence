-- Hebrew spelling of a contact's name, so a rep can search "וובר" and find "Weber" (like a real CRM).
-- Filled by the demo seed for demo people, and by the AI extraction for new leads (a transliteration of the name).
-- Run once in Supabase → SQL Editor. Safe to re-run.

alter table people add column if not exists name_he text;
