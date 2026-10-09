# Setup guide (Phase 0)

About 45–60 minutes, once, on a computer. You'll create two databases, connect GitHub to
them, and put the app on Vercel. Every screen and every choice is listed below.

> **Never paste a password, key or token into chat, a GitHub issue or a commit.**
> They only go into Supabase, GitHub or Vercel settings pages, and your password manager.

## Your notes

Keep these lines in your password manager (or a private note) and fill them in as you go:

```
Expensify prod DB password:
Expensify staging DB password:
Staging project ID:
Staging URL:
Staging publishable key:
Prod project ID:
Prod URL:
Prod publishable key:
Supabase access token:            (expires after 1 year)
Production app URL:
Google client ID:                  (Part 6)
Google client secret:              (Part 6)
```

---

## Part 1 — Supabase: two projects

### 1.1 Create the projects

1. Go to <https://supabase.com/dashboard> and sign in (**Continue with GitHub** is easiest).
2. If asked to create an organization: any name, **Type: Personal**, **Plan: Free** → **Create organization**.
3. Click **New project** and fill in:
   - **Organization:** your organization
   - **Project name:** `expensify-prod`
   - **Database password:** click **Generate a password** → **Copy** → save as *Expensify prod DB password*
   - **Region:** **Southeast Asia (Singapore)**
   - Any security options (Data API, "automatically expose new tables", automatic RLS): leave the defaults.
     The database setup sets its own permissions, so any choice works.
4. Click **Create new project**. It takes about 2 minutes.
5. Repeat for a second project named `expensify-staging`, saving its password as *Expensify staging DB password*.

### 1.2 Collect each project's ID, URL and key

Do this for **expensify-staging**, then switch projects (top-left project name) and repeat for **expensify-prod**:

1. Open the project. In the left sidebar, click the gear icon **Project Settings** (near the bottom).
2. **General** opens. Next to **Project ID** (20 lowercase letters), click the copy icon → paste into *… project ID*.
3. Your URL is `https://` + project ID + `.supabase.co` → type it into *… URL*.
4. In Project Settings, click **API Keys**. Copy the **Publishable key** (starts with `sb_publishable_`) → *… publishable key*.
   - Only see **Legacy API keys** with an **anon / public** key? Copy that instead; either works.
   - Never copy the **secret** or **service_role** key.

### 1.3 Create an access token for GitHub

1. Go to <https://supabase.com/dashboard/account/tokens> → **Generate new token**.
2. Fill in **Step 1 · Configure**:
   - **Name:** `github-actions`
   - **Expires in:** keep the default (one year). Set a reminder to renew it.
   - **Resource access:** **Project**
   - **Organization:** the one that holds your two projects
   - **Select projects:** tick **expensify-prod** and **expensify-staging**
   - **Permissions → Preset:** the full-access preset (named like *Full access* / *Admin*). It only applies to the two
     projects above. Leave the permission sections below it alone.
3. Click **Review access** → check both projects are listed → **Generate token**.
4. Copy the token immediately (shown once) → *Supabase access token*.

If a later step fails with a permission error, generate a new token with a broader preset,
or use **Create legacy token** (full access to your account).

---

## Part 2 — GitHub: five secrets

1. Open <https://github.com/huiminlatsg/dragon-turtle-ledger-app>.
2. Click **Settings**, the last tab along the top of the repo (not your profile settings).
3. Left menu, under **Security**: **Secrets and variables** → **Actions**.
4. Stay on the **Secrets** tab. Click **New repository secret**, type the **Name** exactly, paste the **Secret**,
   click **Add secret**. Repeat for all five:

| Name | Secret |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase access token |
| `SUPABASE_STAGING_PROJECT_REF` | Staging project ID |
| `SUPABASE_STAGING_DB_PASSWORD` | Expensify staging DB password |
| `SUPABASE_PROD_PROJECT_REF` | Prod project ID |
| `SUPABASE_PROD_DB_PASSWORD` | Expensify prod DB password |

The list should show all five names; values stay hidden, which is normal.

5. Tell Claude "secrets done". Claude re-runs the database setup on **staging** and checks it worked.

---

## Part 3 — Vercel: put the app online

### 3.1 Sign up and import

1. Go to <https://vercel.com/signup>.
2. **Plan type:** choose **I'm working on personal projects** (Hobby, free). Enter your name → **Continue**.
3. **Continue with GitHub** → sign in → **Authorize Vercel**.
4. You land on **Let's build something new** / **Import Git Repository**.
   - If `expensify` is listed, click **Import** next to it.
   - If not: click **Install** (or **Adjust GitHub App Permissions**) → choose your account `huiminlatsg` →
     **Only select repositories** → pick `expensify` → **Install** (or **Save**). Back on Vercel, click **Import**.
5. On **New Project**:
   - **Vercel Team:** your personal Hobby team
   - **Project Name:** `expensify`
   - **Root Directory:** `./` (leave)
   - **Application Preset:** change **Other** to **Next.js** (Vercel reads `main`, which has no app until the first merge)
   - **Build and Output Settings** and **Environment Variables:** leave closed
6. Click **Deploy**. **This first deploy fails** with "No Next.js version detected" — expected, because the app
   isn't on `main` yet. It succeeds after the merge in Part 5.
7. Click **Go to Project**. Note the domain (e.g. `expensify-xxxx.vercel.app`) as *Production app URL*.

### 3.2 Add environment variables

The app needs to know which database to use: **Production** uses the prod project, **Preview**
(every pull request) uses staging. Three variables each.

1. Project → **Settings** → **Environments** (left menu).
2. Click the **Production** row → **Add Environment Variable**:
   - **Type: Config** (not Secret — these values are public by design; Vercel warns if `NEXT_PUBLIC_` values are Secret)
   - Add the three Production rows below (use **+ Add new variable** for the 2nd and 3rd)
   - **Environments:** Production → **Save**
3. Back to **Environments** → click the **Preview** row → same, with the three Preview rows and **Environments: Preview**.

| Key | Production value | Preview value |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Prod URL | Staging URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Prod publishable key | Staging publishable key |
| `NEXT_PUBLIC_APP_ENV` | `production` | `staging` |

Leave **Development** and **Custom Environments** (paid) alone.

4. Variables only apply to new deployments. Tell Claude "Vercel done" and Claude pushes a small update to the
   pull request, which builds a fresh preview with these settings.

### 3.3 Optional: let GitHub test Vercel previews

Vercel protects preview links behind a Vercel login by default, which blocks GitHub's automatic post-deploy tests.

1. Vercel project → **Settings** → **Deployment Protection**.
2. Find **Protection Bypass for Automation** → **Add Secret** (or **Create**) → copy the value.
3. In GitHub (Part 2 steps 1–4), add a secret named `VERCEL_AUTOMATION_BYPASS_SECRET` with that value.

Skip this if the option isn't there; every change is still fully tested before it can be merged.

---

## Part 4 — Check it on your iPhone

1. On your iPhone, open the **GitHub** app (or github.com in Safari) → repo `expensify` → **Pull requests** → **#1**.
2. Scroll to the **vercel** bot comment → tap **Visit Preview**. (Asked to log in? Sign in with your Vercel account —
   that's the preview protection from 3.3.)
3. The status card should show **Environment: staging** and **Database: Connected** (green).
4. In Safari: tap **Share** (square with arrow) → scroll down → **Add to Home Screen** → **Add**.
   An Expensify icon appears; opening it shows the app full-screen without the Safari bar.

## Part 5 — Merge

1. On pull request #1, scroll to the bottom: all checks should be green ✓.
2. Click **Merge pull request** → **Confirm merge**. (Optionally **Delete branch** afterwards.)
3. Within a few minutes:
   - GitHub sets up the **production** database (**Actions** tab → *Database migrations* shows green).
   - Vercel deploys production. Open your *Production app URL*: **Environment: production**, **Database: Connected**.
4. On your iPhone, add the **production** URL to your Home Screen (this is the one you'll use day to day) and
   remove the preview one.

Done — Phase 0 is live.

---

## Part 6 — Google sign-in (Phase 1)

About 15 minutes, once, on a computer. The app signs people in with their Google account. Google needs to
know the app exists and where to send people back after signing in.

### 6.1 Create a Google Cloud project

1. Go to <https://console.cloud.google.com> and sign in with your Google account.
2. Top bar → project picker → **New project** → **Project name:** `Expensify` → **Create**. Make sure it's
   selected in the top bar afterwards.

### 6.2 Set up the sign-in screen

1. Left menu (☰) → **APIs & Services** → **OAuth consent screen** (may be called **Google Auth Platform** →
   **Branding**). Click **Get started** if asked.
2. **App name:** `Expensify` · **User support email:** your email → **Next**.
3. **Audience:** **External** → **Next**. **Contact email:** your email → **Next** → agree → **Create**.
4. Open **Audience** (or **Test users**) → **Add users** → add the Google accounts allowed to sign in:
   yours and your family's (later, any other family you invite) → **Save**.
   Leave **Publishing status** as **Testing**: only these accounts can sign in, which keeps strangers out.

### 6.3 Create the sign-in client

1. Left menu → **APIs & Services** → **Credentials** (or **Google Auth Platform** → **Clients**) →
   **Create credentials** / **Create client** → **OAuth client ID**.
2. **Application type:** **Web application** · **Name:** `Expensify`.
3. **Authorised redirect URIs** → **Add URI** twice and paste exactly:
   - `https://<prod project ID>.supabase.co/auth/v1/callback` (production)
   - `https://<staging project ID>.supabase.co/auth/v1/callback` (staging)
4. **Create**. A box shows the **Client ID** and **Client secret** → copy both into your password manager as
   *Google client ID* and *Google client secret*.

### 6.4 Add two GitHub secrets

Same place as Part 2: repo **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

| Name | Secret |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google client ID |
| `GOOGLE_CLIENT_SECRET` | Google client secret |

Then tell Claude "Google secrets done". Claude turns on Google sign-in for staging, you try it on the preview,
and it goes to production when the pull request is merged.

### 6.5 Show the app's address on Google's account picker (v0.8.0)

Without this, Google's picker says "continue to `<project>.supabase.co`". With it, people see the app's own address.
In the same client (**Google Auth Platform** → **Clients** → **Expensify**):

1. **Authorised redirect URIs** → keep the two Supabase ones and add `https://dragon-turtle-ledger.vercel.app/auth/google` (and, while it still works, `https://expensify-pi.vercel.app/auth/google`).
2. Save. (The client ID is public and already in `lib/google-signin.ts`; the secret is never needed here.)

Google needs exact addresses (no wildcards), so the direct Google sign-in is used only on addresses listed in
`GOOGLE_ORIGINS` in `lib/google-signin.ts`. Any other address (such as a new preview) keeps the earlier sign-in
through Supabase, which still works. To test a preview with the new sign-in, add its `/auth/google` as a redirect
URI in Google Cloud and its address to `GOOGLE_ORIGINS`.

How it works: the sign-in button sends the person to Google, which returns to `/auth/google` with a signed ID token
after the `#` in the address (a normal link, so it also works from the iPhone home-screen app). That page checks a
one-time state and nonce, then signs in to Supabase with the token (`signInWithIdToken`).

**Inviting someone new later:** add their Google account under **Test users** (6.2 step 4) before sending
them the invite link, or Google will refuse their sign-in.

---

## Not needed yet

- **Gemini API key** — Phase 5 (receipt reading), created then at <https://aistudio.google.com/apikey>.
- **Branch protection** — this repo is public, so a ruleset protects `main` (pull requests only, no force
  pushes or deletion).

## If something looks different

Screens change. Tell Claude which part and step you're on, what you see (a screenshot helps — crop out any keys),
and Claude will tell you what to pick.
