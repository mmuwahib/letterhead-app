# Microsoft Azure (Entra ID) SSO — Setup Guide

Enable "Sign in with Microsoft" for this app. Configuration happens in two
places: **Azure Portal** (app registration) and **Supabase Dashboard** (auth
provider). A small frontend snippet wires it into the login page.

---

## Step 1 — Register an app in Azure Entra ID

1. Go to [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. **Name**: e.g. `Gulf Cryo Letterhead`.
3. **Supported account types** — choose one:
   - *Single tenant* — only your organization
   - *Multitenant* — any Microsoft Entra org
   - *Multitenant + personal Microsoft accounts* — broadest
4. **Redirect URI** — select **Web**, enter:
   ```
   https://afnmgtzxnsunudzdmngu.supabase.co/auth/v1/callback
   ```
5. Click **Register**.

---

## Step 2 — Get credentials

From the new app's **Overview** page, copy:

- **Application (client) ID**
- **Directory (tenant) ID** (needed if you chose single-tenant)

Then open **Certificates & secrets** → **New client secret** → set expiry → **Add**, and copy the **Value** (shown only once).

---

## Step 3 — Configure API permissions

Open **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions**, then add:

- `openid`
- `email`
- `profile`
- `offline_access`

Click **Grant admin consent** (requires admin role).

---

## Step 4 — Enable Azure provider in Supabase

1. Open the [Supabase Auth Providers page](https://supabase.com/dashboard/project/afnmgtzxnsunudzdmngu/auth/providers).
2. Find **Azure (Microsoft)** → toggle **Enable**.
3. Paste:
   - **Application (client) ID**
   - **Secret Value** (from Step 2)
   - **Azure Tenant URL**:
     - Single-tenant: `https://login.microsoftonline.com/<TENANT_ID>/v2.0`
     - Multitenant: `https://login.microsoftonline.com/common/v2.0`
4. Click **Save**.

---

## Step 5 — Add the login button in the app

On the auth page, add a "Sign in with Microsoft" button that calls:

```ts
import { supabase } from '@/integrations/supabase/client';

await supabase.auth.signInWithOAuth({
  provider: 'azure',
  options: {
    scopes: 'email openid profile offline_access',
    redirectTo: `${window.location.origin}/`,
  },
});
```

The existing `onAuthStateChange` listener in `AuthContext` will pick up the
session after the redirect. Azure-signed-in users still flow through the
`profiles.approved_at` / `user_roles` gate — admins must approve new users
before they can use the app.

---

## Step 6 — Allowlist redirect URLs

In Supabase → **Authentication** → **URL Configuration**, add to **Redirect URLs**:

- `https://id-preview--f6d7d740-be25-46e1-b868-1e4e7fb8314b.lovable.app/**`
- `https://gcletterhead.lovable.app/**`
- Your custom domain (if any), e.g. `https://letterhead.example.com/**`

Set **Site URL** to your primary production URL (e.g. `https://gcletterhead.lovable.app`).

---

## Troubleshooting

- **`redirect_uri_mismatch`** — the URI in Azure must exactly match
  `https://afnmgtzxnsunudzdmngu.supabase.co/auth/v1/callback`.
- **`AADSTS65001` (consent required)** — an admin must click *Grant admin
  consent* in Step 3, or each user must consent on first login.
- **User signs in but sees "pending approval"** — expected. Approve them
  from the **User Management** page in the app.
- **Secret expired** — generate a new client secret in Azure (Step 2) and
  update it in the Supabase provider settings (Step 4).