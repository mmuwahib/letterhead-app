# Staging vs Production — Environment Strategy

This document describes how to run a separate **test/staging** environment for the
Gulf Cryo Letterhead app alongside the existing **production** deployment. It is
a planning/reference document — no infrastructure has been created yet.

---

## 1. Overview

Today there is one Lovable project, one Supabase project, and one published URL.
Any change pushed to `main` immediately affects real users, real approvals,
real documents, real activity logs, and real storage objects.

A staging environment gives us a safe place to:

- Validate UI changes against realistic data without disturbing prod users.
- Test database migrations, RLS policies, and edge functions before they touch
  the production schema.
- Try new auth flows (Microsoft Entra changes, role/permission tweaks) without
  locking real users out.
- Train or demo the app without polluting prod activity logs.

### Target architecture

```text
GitHub branch: main      ──►  PROD Lovable project      ──►  gcletterhead.lovable.app
                              Supabase: afnmgtzxnsunudzdmngu      (+ custom domain, if any)

GitHub branch: staging   ──►  STAGING Lovable project   ──►  gc-letterhead-staging.lovable.app
                              Supabase: <new staging ref>
```

One GitHub repository, two long-lived branches, two Lovable projects, two
Supabase projects.

---

## 2. Do we need a new Supabase project?

**Yes.** A second Supabase project is strongly recommended because:

- The current Supabase project (`afnmgtzxnsunudzdmngu`) holds real auth users,
  approvals, documents, watermarks, and activity logs. Running test migrations
  against it risks data loss or accidental exposure.
- RLS policies and edge functions evolve; they should be exercised against
  throwaway data first.
- Storage buckets (`documents` private, `watermarks` public) and their
  policies need to be validated before promotion.
- Auth providers (Microsoft Entra) require a different redirect URI per
  environment so test logins don't create sessions in prod.

Sharing a single Supabase project between prod and staging is **not**
recommended — even with separate schemas, RLS and storage are global.

---

## 3. One-time setup steps

### A. Create the staging Lovable project

1. Open the current project in Lovable.
2. Use **Share → Remix** (or Project Settings → Remix) to clone the codebase
   into a new Lovable project.
3. Rename the clone to `gc-letterhead-staging`.
4. The remix gets its own preview URL automatically; once published it will be
   reachable at `gc-letterhead-staging.lovable.app`.

### B. Create the staging Supabase project

1. In the Supabase dashboard click **New project** and name it
   `gc-letterhead-staging`.
2. In the **staging Lovable project**, disconnect the inherited prod Supabase
   link and connect to the new staging Supabase. Lovable will repopulate
   `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
   `VITE_SUPABASE_PROJECT_ID`) with the staging values automatically.
3. Replay the schema. The repo already contains every migration under
   `supabase/migrations/`; on first connect Lovable applies them to the new
   database. If anything is missing, re-run the migration tool from the
   staging project.
4. Recreate the storage buckets:
   - `documents` — **private**.
   - `watermarks` — **public**.
   Re-attach the same policies that exist in prod.
5. Re-add Supabase secrets used by edge functions (`LOVABLE_API_KEY`, etc.).
   They can be the same values as prod or freshly generated.

### C. Microsoft Entra (SSO) per environment

Pick one of two approaches:

- **Single app, multiple redirect URIs** — open the existing Azure app
  registration and add a second Web redirect URI:
  `https://<staging-supabase-ref>.supabase.co/auth/v1/callback`. Simpler, but
  any secret rotation affects both environments.
- **Two separate app registrations** — register a brand-new Entra app for
  staging following `Entra.md`, with its own client ID/secret. Cleaner
  isolation; preferred if you have Azure admin access.

Then in the **staging Supabase** dashboard → Authentication → Providers →
Azure, paste the chosen client ID, secret, and tenant URL.

Allowlist the staging URLs in Supabase → Authentication → URL Configuration:

- `https://gc-letterhead-staging.lovable.app/**`
- Any preview URLs Lovable shows for the staging project.

---

## 4. GitHub branching plan

Keep **one** GitHub repository with two long-lived branches:

| Branch    | Tracked by                | Deploys to                                  |
|-----------|---------------------------|---------------------------------------------|
| `main`    | Prod Lovable project      | `gcletterhead.lovable.app` + custom domain  |
| `staging` | Staging Lovable project   | `gc-letterhead-staging.lovable.app`         |

Wiring:

1. Connect the staging Lovable project to the **same** GitHub repo via
   **Connectors → GitHub**.
2. Enable Lovable's branch switching feature: Account Settings → **Labs** →
   "GitHub Branch Switching".
3. In the staging Lovable project, switch its tracked branch from `main` to
   `staging`.
4. Leave the prod project tracking `main`.

Day-to-day workflow:

```text
feature/<name>
   │  pull request
   ▼
staging  ──►  staging Lovable + staging Supabase update automatically
   │  manual QA
   │  pull request
   ▼
main     ──►  prod Lovable updates; click "Publish → Update" to push to users
              prod Supabase migrations apply automatically on deploy
```

---

## 5. Maintaining two URLs

- **Production:** `https://gcletterhead.lovable.app` (and any custom domain
  attached today).
- **Staging:** `https://gc-letterhead-staging.lovable.app` — publish from the
  staging project. Do **not** attach the production custom domain to staging.
- Optional: attach a friendlier subdomain such as `staging.<yourdomain>` to the
  staging project via Project Settings → Domains.

Keep the two URLs visually distinguishable (e.g. a small "STAGING" badge in
the header, gated by an env flag) so testers never confuse environments.

---

## 6. Day-to-day promotion checklist

1. Branch off `staging` for a feature: `git checkout -b feature/<name>`.
2. Open a PR into `staging`. Once merged, the staging Lovable project rebuilds
   and the staging Supabase applies any new migrations from
   `supabase/migrations/`.
3. Verify on `gc-letterhead-staging.lovable.app` against staging data.
4. When happy, open a PR from `staging` → `main`.
5. Merge to `main`. Prod Supabase auto-applies the same migrations.
6. In the prod Lovable project click **Publish → Update** to roll out the new
   frontend bundle.

---

## 7. Schema sync & data refresh (optional)

To keep staging realistic, periodically refresh it from prod:

1. `pg_dump` the prod Supabase database (Supabase dashboard → Database →
   Backups, or `pg_dump` with the prod connection string).
2. Scrub PII before loading into staging — at minimum, randomize
   `profiles.full_name`, mask emails in `auth.users`, and drop sensitive rows
   from `activity_logs`.
3. `pg_restore` into the staging Supabase database.
4. Recreate storage objects only if needed — usually a small synthetic set is
   enough.

No script is committed yet; add `scripts/sync-prod-to-staging.sh` later if the
team wants this automated.

---

## 8. Rollback

- **Code:** use Lovable's built-in version history on the affected project to
  revert to a prior version.
- **Database:** Supabase point-in-time restore (paid feature) — only for
  catastrophic data loss. For ordinary mistakes, write a corrective migration
  on `staging` first, then promote.

---

## 9. Reference IDs

| Item                          | Value                                       |
|-------------------------------|---------------------------------------------|
| Prod Lovable project ID       | `f6d7d740-be25-46e1-b868-1e4e7fb8314b`      |
| Prod Supabase project ref     | `afnmgtzxnsunudzdmngu`                      |
| Prod published URL            | `https://gcletterhead.lovable.app`          |
| Staging Lovable project ID    | _to be filled in after remix_               |
| Staging Supabase project ref  | _to be filled in after creation_            |
| Staging published URL         | `https://gc-letterhead-staging.lovable.app` |

---

## 10. See also

- `Entra.md` — Microsoft Entra (Azure AD) SSO setup. Repeat the steps there
  for the staging Supabase project, substituting the staging callback URL.
- `README.md` — project overview.
- `supabase/migrations/` — every schema change committed so far; this is the
  source of truth used to bootstrap the staging database.
