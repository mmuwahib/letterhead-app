## Goal
Let any approved user open the **Activity Logs** page and see a personal audit trail of their own actions, while keeping managers/admins on their current broader scope.

## Changes

### 1. `src/pages/ActivityLogs.tsx` — open access, scope per role
- Replace the `allowed` gate so every active (approved, non-banned) user can reach the page. Keep the redirect only for unauthenticated/unapproved users (already handled by `ProtectedRoute`).
- Detect "personal scope" mode: `isPersonal = role !== 'admin' && role !== 'manager' && !hasPermission('view_logs')`.
- When `isPersonal` is true:
  - Update the page header copy to "My activity" with subtitle "A log of actions you've performed."
  - Hide the **Legal entity** and **Site** filters (not meaningful for a single user).
  - Keep Search, Action filter, and Date range filter.
  - Hide action types a regular user cannot generate (e.g. `user_approve`, `user_ban`, `user_role`, `template_*`) from the Action dropdown.
- For admins/managers: page behavior is unchanged.

### 2. `src/components/AppLayout.tsx` — sidebar entry
- Show the "Activity Logs" nav item to any approved user (not just `view_logs`/manager/admin). Label stays "Activity Logs" for elevated roles; for personal-scope users show "My Activity".

### 3. `src/components/help/pageHelp.ts` (if a `/logs` entry exists)
- Add a short note that regular users see only their own actions.

## What is NOT changing
- **No database migration.** The existing RLS policy `Users can view own logs` already restricts row visibility per user — a regular user querying `activity_logs` only ever gets their own rows. We are simply removing the client-side redirect.
- Manager and admin scopes, dashboards, archive, exports — all untouched.
- The CSV/ZIP export on the Archive page is unchanged.

## Verification
- Log in as `testuser@gmail.com` → sidebar shows "My Activity" → `/logs` loads and lists only that user's own events (currently 0; will populate after they upload/download).
- Log in as a manager → page still shows department-scoped events.
- Log in as an admin → page still shows all events.
