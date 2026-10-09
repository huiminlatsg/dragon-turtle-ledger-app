# Runbook

What to do when something goes wrong.

## The app is broken after a deploy

1. Vercel → project → **Deployments** → find the last good one → **⋯ → Promote to Production**
   (instant rollback). Your data is untouched.
2. The fix goes through a normal pull request.

## A database change went wrong

Migrations only add or carefully transform. A column or table is removed only in a later
release, after the code stops using it, so rolling the app back never needs the old schema.

If data itself was damaged, it can only be restored from a backup. Backups and loading accounts from JSON are run
from the owner's private operations repo, not from this one, because their inputs and outputs are family data.

## The free Supabase project paused

Free projects pause after about a week without activity. Daily use keeps production awake; staging can pause
when no pull request has touched it for a while. If it does: Supabase dashboard → project → **Restore**.

## A secret leaked

Rotate it immediately where it was issued (Supabase → API keys / database password / access tokens;
Vercel; Google Cloud), then update the GitHub secret or Vercel variable that held it.
