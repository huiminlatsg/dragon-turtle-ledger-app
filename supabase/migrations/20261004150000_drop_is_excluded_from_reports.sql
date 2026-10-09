-- B-12: drop the deprecated categories.is_excluded_from_reports flag.
-- It was superseded by categories.nature (living / financial / pass_through / ...)
-- in 20261003120000_category_redesign_ledgers.sql and nothing reads it
-- (no views, functions, policies or app code reference it).
alter table public.categories drop column if exists is_excluded_from_reports;
