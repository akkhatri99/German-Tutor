# Supabase setup

Lina is built around a Supabase backend. **An account is required** so:

- streaks and progress survive switching device or browser
- the user appears on the leaderboard (planned)
- the chosen AI provider + API key restore automatically on a new device,
  so the user doesn't have to redo onboarding everywhere

If the env vars in this guide aren't set at build time, the app falls
back to a localStorage-only "no backend" mode — useful for forks and
local development without a Supabase project. In that mode the auth
gate disappears and everything stays on one device.

## What gets synced

The user's row is the only place their data lives. Row-Level Security
makes sure no other user (and no anonymous browser) can read it.

| Synced (Supabase, per user)                          | Local-only             |
|------------------------------------------------------|------------------------|
| Profile (name, country, level)                       | Word translation cache |
| XP, streak, total minutes                            | Onboarding step flag   |
| Vocabulary, grammar topics                           |                        |
| Session history + summaries                          |                        |
| Homework (pending + history)                         |                        |
| Zero-to-Hero plan                                    |                        |
| **Settings**: AI provider, API key, model, voice key |                        |

API keys are stored in the user's own row, encrypted at rest by Supabase
and gated by RLS — only the authenticated owner can `SELECT` them. They
travel between the user's devices via their account, not via shared
infrastructure.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New Project** (free tier is fine).
2. Pick any region close to your users. Wait ~1 minute for provisioning.

## 2. Run the schema

1. In your project, open **SQL Editor → New query**.
2. Paste the entire contents of [`schema.sql`](./schema.sql) and click **Run**.
3. You should see "Success. No rows returned." — six tables, RLS policies,
   and the auto-provision trigger are now in place.

The schema is idempotent (`create table if not exists` etc.), so re-running
it is safe.

## 3. Wire the keys into the frontend

1. In Supabase: **Settings → API**.
2. Copy **Project URL** and **anon public** key.
3. In the repo root, create `.env.local` (gitignored) and paste:

   ```
   VITE_SUPABASE_URL=https://your-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

   The anon key is **safe to ship to browsers**. Row-Level Security
   in Postgres is what actually protects user data — every row is
   tagged with `auth.uid()` and the policies only let users see/edit
   their own rows.

   **Never put a service-role key here.** That key bypasses RLS.

4. Restart `npm run dev` so Vite picks up the new env vars.

## 4. Configure email auth

By default Supabase sends magic links from a generic sender address with a
low rate limit. For real users you'll want to:

- **Auth → URL Configuration**: add your dev origin (e.g.
  `http://localhost:5173`) and your production domain to **Redirect URLs**.
  The app passes `window.location.origin` as `emailRedirectTo`, so anything
  not on that allowlist will be rejected.
- **Auth → Email Templates**: customize the magic-link email if you'd like
  branding. The default works fine for testing.
- **Auth → Providers → Email**: keep "Confirm email" enabled (default).
  Magic-link sign-up doesn't require a separate verification step — the
  link itself is the verification.

## 4b. Enable Google sign-in (recommended)

The app already wires the **Continue with Google** button — you just need
to flip on the provider in your Supabase dashboard. Until you do, that
button shows a friendly "not enabled yet" message instead of working.

1. Go to [Google Cloud Console](https://console.cloud.google.com) → create
   a project (or pick an existing one).
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - **Authorized redirect URIs**: paste your Supabase callback URL. You'll
     find it in the Supabase dashboard at
     **Authentication → Providers → Google → Callback URL**. It looks like
     `https://YOUR-REF.supabase.co/auth/v1/callback`.
3. Copy the resulting **Client ID** and **Client secret**.
4. Back in Supabase: **Authentication → Providers → Google** → toggle
   "Enable Sign in with Google" → paste both values → save.
5. (One-time, for production) Add your production redirect URL to the
   **Authorized redirect URIs** in Google Cloud as well.

That's it — the Google button now works. New Google users get auto-created
in `auth.users` and the trigger seeds their empty profile/progress/settings rows.

## 4c. Enable Apple sign-in (optional, more setup)

Apple sign-in requires a paid **Apple Developer Program** membership
($99/year) and configuring a Services ID + private key. Full walkthrough:
[Supabase → Sign in with Apple guide](https://supabase.com/docs/guides/auth/social-login/auth-apple).
The app's "Continue with Apple" button will work as soon as the provider
is toggled on — no frontend changes needed.

If you don't want Apple sign-in, you can hide the button by removing the
Apple block in `src/components/Auth.jsx`. Leaving it in is fine — the
error handler shows a helpful "not enabled yet" message if anyone clicks it.

## 5. Verify

1. Open the app → Auth screen appears (because Supabase is now configured).
2. Sign in with Google, Apple, or email magic link.
3. For magic-link: open the email on the **same device** → click the link
   → app reloads into the cloud-synced version.
4. Open the same URL on a different device → sign in again → your
   progress + API keys are already there.

If something goes wrong, open the browser DevTools → Console: sync errors
are logged with the `[sync]` prefix and never block the UI.

## 6. Inspecting users

Once people start signing up, you can see them in two places:

- **Dashboard → Authentication → Users** — the canonical UI. Shows email,
  provider (email / google / apple), sign-up time, last sign-in, and
  lets you delete or send password resets.
- **SQL Editor** — for ad-hoc analysis you can query `auth.users` and
  join against your app tables. Examples:

  ```sql
  -- How many users signed up in the last 7 days?
  select count(*)
  from auth.users
  where created_at > now() - interval '7 days';

  -- Top countries by user count (joins the profile we provision on signup):
  select p.country, count(*)
  from public.profiles p
  group by p.country
  order by count(*) desc;

  -- Active learners: users whose last session was within 14 days.
  select u.email, pr.streak_days, pr.last_session_date
  from auth.users u
  join public.progress pr on pr.user_id = u.id
  where pr.last_session_date > current_date - interval '14 days'
  order by pr.streak_days desc;
  ```

  These queries run as the dashboard's admin role — they bypass RLS, which
  is what you want for analytics. **Never expose the service-role key
  to the browser.**

## How conflict resolution works

The app does fire-and-forget pushes on every storage write, plus a full
pull-and-merge on sign-in. Conflicts are handled per-field:

- **Profile / plan / settings**: server fields override local if non-null.
- **Counters** (xp, streak, minutes, sessions completed): the higher value wins.
- **Vocabulary / grammar**: union of both sides, picking the higher
  strength/mastery on collision.
- **Homework history**: deduped by `prompt + completed` timestamp.
- **Sessions**: deduped by `client_id` (the original `startedAt` ISO).

This means if you practice offline on your phone and online on your
laptop in the same day, you don't lose either side — they merge.

## Disabling sync (dev / fork only)

Leave both env vars blank (or unset) and the app falls back to
localStorage-only mode. The Auth screen disappears, the Settings panel
hides the Account section, and `getSupabase()` returns `null` everywhere.
Recommended only for local development — production builds should always
ship with the env vars set so users get a real account.
