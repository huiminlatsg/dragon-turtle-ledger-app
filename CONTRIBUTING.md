# How changes are made

Changes are made by the owner (HM), mostly through Claude or ChatGPT in chat; the AI runs every step below and
merges only when HM replies "merge" (details in CLAUDE.md). Outside pull requests aren't accepted.

Every change follows the same path, so the live app keeps working:

1. **Backlog item** — what and why, plus "done when" (kept in the owner's private project tracker).
2. **Branch** — `feat/<short-name>` for features, `fix/<short-name>` for fixes. Never commit to `main` directly.
3. **Pull request** — CI runs unit tests, build, type check, iPhone-sized end-to-end tests,
   database security tests, a secret scan and a privacy guard. Database migrations are applied to **staging**.
4. **Preview** — Vercel posts a preview link (staging data). Try it on your iPhone.
5. **Merge** — production deploys, migrations apply to the production database.
6. **Release** — bump `version` in `package.json`, add a `CHANGELOG.md` entry, and tag
   (`git tag v1.1.0 && git push --tags`), then create a GitHub Release from the tag.

## Local development

```sh
npm install
cp .env.example .env.local     # fill in staging values
npm run dev                    # http://localhost:3000
npm test                       # unit tests
npm run test:db                # database migrations + security tests on a throwaway Postgres
npm run build && npm run test:e2e
```

## Database changes

- Add a new file in `supabase/migrations/` named `YYYYMMDDHHMMSS_what_it_does.sql`. Never edit a
  migration that has already been merged.
- New tables must `enable row level security` and get policies using `public.is_member()` /
  `public.can_write()`, plus `revoke all ... from anon`. Supabase grants new tables to `anon`
  by default, so the revoke matters.
- Add checks for the new behaviour to `supabase/tests/rls.test.sql`.
- Destructive changes (dropping a column) happen in two releases: stop using it, then drop it.

## Secrets

Secrets live only in Vercel, Supabase and GitHub settings. `.env*` files are git-ignored and CI
scans every pull request for leaked keys.

## This repo is public

Family data, spending history and planning notes never go here. `scripts/privacy-guard.py` runs on every pull
request and fails on private folders (`design/`, `pm/`), data files (`.csv`), personal email addresses, Supabase
project addresses and a short hashed list of private words. Supabase project IDs live in GitHub and Vercel settings.
