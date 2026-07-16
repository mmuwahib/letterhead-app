# Azure Static Web Apps Deployment Guide
## Gulf Cryo Letterhead Creator

**Last Updated:** 2026-05-07  
**Status:** Complete Deployment Instructions  
**Target Platform:** Azure Static Web Apps  
**Application:** React + TypeScript + Vite  
**Backend:** Supabase (PostgreSQL + Auth)

---

## Table of Contents
1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Architecture Overview](#architecture-overview)
3. [Step 1: Azure Prerequisites](#step-1-azure-prerequisites)
4. [Step 2: Prepare Your Repository](#step-2-prepare-your-repository)
5. [Step 3: Create Azure Static Web App](#step-3-create-azure-static-web-app)
6. [Step 4: Configure Environment Variables](#step-4-configure-environment-variables)
7. [Step 5: Verify Deployment](#step-5-verify-deployment)
8. [Step 6: Custom Domain Setup](#step-6-custom-domain-setup)
9. [Step 7: Security & Monitoring](#step-7-security--monitoring)
10. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

### Your Project Status ✅
- **Framework:** React 18.3.1 + TypeScript
- **Build Tool:** Vite 5.4.19
- **Node Version Required:** 18+ (recommended 20 LTS)
- **Package Manager:** npm (using package-lock.json)
- **Backend:** Supabase (PostgreSQL + Auth)
- **Build Output:** `dist/`
- **Entry Point:** `index.html`
- **Currently Deployed:** Lovable.app

### Assets Present ✅
- PWA Configuration (`manifest.json`, icons)
- Tailwind CSS + PostCSS configured
- ESLint & TypeScript validation
- Vitest for unit testing
- Azure Entra ID (SSO) already configured
- Supabase migrations ready

### Pre-Deployment Tasks
- [ ] Azure subscription active and verified
- [ ] GitHub PAT (Personal Access Token) with `repo` scope created
- [ ] Supabase credentials backed up securely
- [ ] Custom domain registered (if needed)
- [ ] Staging environment planned (see staging.md)
- [ ] Current production users notified
- [ ] All secrets moved out of `.env` (will be set in Azure)

---

## Architecture Overview

### Current State (Lovable.app)
```
GitHub (main branch)
    ↓
Lovable Project
    ↓
Frontend: gcletterhead.lovable.app
Backend: Supabase (afnmgtzxnsunudzdmngu)
Auth: Azure Entra ID (SSO)
```

### Target State (Azure)
```
GitHub (main branch)
    ↓
Azure Static Web Apps (auto CI/CD)
    ↓
Frontend: https://gcletterhead.azurewebsites.net (or custom domain)
Backend: Supabase (afnmgtzxnsunudzdmngu) - SAME
Auth: Azure Entra ID (SSO) - SAME
```

### Deployment Flow
```
┌─────────────────────────────────────┐
│  GitHub Push to main                │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  Azure Static Web Apps              │
│  - Detects commit                   │
│  - Triggers GitHub Action           │
│  - npm ci                           │
│  - npm run build                    │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  Azure CDN                          │
│  - Deploys dist/ to edge            │
│  - Routes *.js, *.css to CDN        │
│  - Serves index.html for SPA routes │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  Live URL                           │
│  https://your-custom-domain.com     │
└─────────────────────────────────────┘
```

---

## Step 1: Azure Prerequisites

### 1.1 Create/Verify Azure Subscription
```bash
# Login to Azure
az login

# Check subscription
az account show

# List all subscriptions
az account list --output table
```

### 1.2 Create Resource Group
```bash
# Create a dedicated resource group
az group create \
  --name letterhead-rg \
  --location eastus

# Verify
az group show --name letterhead-rg
```

**Location Options:**
- `eastus` - Best for US-based users
- `westus` - US West Coast
- `northeurope` - Europe (Ireland)
- `southeastasia` - Asia-Pacific

### 1.3 Generate GitHub Personal Access Token (PAT)

1. Go to GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. Click **Generate new token**
3. **Name:** `Azure Static Web Apps`
4. **Scopes:**
   - ✅ `repo` (full)
   - ✅ `workflow`
   - ✅ `admin:public_key`
5. **Expiration:** 90 days (rotate periodically)
6. Click **Generate token** and **copy immediately** (shown only once)
7. Store safely (e.g., Azure Key Vault, or temporarily in notepad)

---

## Step 2: Prepare Your Repository

### 2.1 Verify Build Configuration

Your `package.json` is already optimized:
```json
{
  "scripts": {
    "build": "vite build",        // ✅ Correct
    "preview": "vite preview",    // ✅ For local testing
    "lint": "eslint .",           // ✅ Pre-deployment check
    "test": "vitest run"          // ✅ Optional CI checks
  }
}
```

### 2.2 Verify Vite Configuration

Your `vite.config.ts` is ready:
```typescript
// Key settings for Azure Static Web Apps:
- resolve.alias "@" for import paths ✅
- dedupe React/ReactDOM ✅
- HMR overlay disabled ✅
```

**No changes needed.**

### 2.3 Fix .gitignore (Optional but Recommended)

Add Azure-specific entries to `.gitignore`:
```bash
# Add to .gitignore
.env.local
.env.*.local
*.swp
.vscode/
.idea/
azure-pipelines.yml
```

**Current .gitignore is adequate.**

### 2.4 Create staticwebapp.config.json

Add this file to the repository root to optimize SPA routing:

```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/images/*", "/css/*", "/fonts/*", "*.png", "*.jpg", "*.gif", "*.svg", "*.ico"]
  },
  "mimeTypes": {
    ".json": "application/json",
    ".wasm": "application/wasm"
  },
  "auth": {
    "identityProviders": {
      "customOpenIdConnectProviders": {}
    }
  },
  "responseOverrides": {
    "400": {
      "rewrite": "/index.html"
    },
    "404": {
      "rewrite": "/index.html"
    }
  }
}
```

**Action:** Create this file to ensure React Router works correctly.

---

## Step 3: Create Azure Static Web App

### 3.1 Via Azure Portal (Recommended - Easiest)

1. **Open Azure Portal:** https://portal.azure.com
2. **Search:** "Static Web Apps"
3. **Click:** "+ Create"
4. **Fill Form:**
   - **Subscription:** Select your subscription
   - **Resource Group:** `letterhead-rg` (created in Step 1)
   - **Name:** `gc-letterhead-prod` (or your preferred name)
   - **Plan Type:** Free (or Standard for custom domains)
   - **Region:** East US (or nearest to users)
   - **Source:** GitHub

5. **Authorize GitHub:**
   - Click "Sign in with GitHub"
   - Authorize Azure Static Web Apps
   - Select organization: **abdul037**
   - Select repository: **letterhead-creator**
   - Select branch: **main**

6. **Build Details:**
   - **Build presets:** React
   - **App location:** `/` (root)
   - **API location:** (leave blank - using Supabase)
   - **Output location:** `dist`

7. **Review + Create:**
   - Click "Create"
   - Wait 2-3 minutes for deployment
   - Azure creates GitHub Action workflow automatically

### 3.2 Via Azure CLI (Advanced)

```bash
# Create Static Web App
az staticwebapp create \
  --name gc-letterhead-prod \
  --resource-group letterhead-rg \
  --source https://github.com/abdul037/letterhead-creator \
  --branch main \
  --token YOUR_GITHUB_PAT_HERE \
  --app-location "/" \
  --output-location "dist" \
  --login-with-github

# Verify creation
az staticwebapp show \
  --name gc-letterhead-prod \
  --resource-group letterhead-rg
```

### 3.3 What Azure Creates Automatically

When you create the Static Web App, Azure:
1. ✅ Creates GitHub Actions workflow (`.github/workflows/azure-static-web-apps-*.yml`)
2. ✅ Adds deployment trigger on `main` branch
3. ✅ Creates Azure resource
4. ✅ Generates a preview URL (e.g., `https://abc123.azurewebsites.net`)
5. ✅ Sets up continuous deployment

---

## Step 4: Configure Environment Variables

### 4.1 Add Environment Variables in Azure Portal

1. **Navigate to:** Azure Portal → Static Web Apps → `gc-letterhead-prod`
2. **Left menu:** Configuration → **Application settings**
3. **Add the following:**

| Name | Value | Source |
|------|-------|--------|
| `VITE_SUPABASE_URL` | `https://afnmgtzxnsunudzdmngu.supabase.co` | Your `.env` |
| `VITE_SUPABASE_PROJECT_ID` | `afnmgtzxnsunudzdmngu` | Your `.env` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | Your `.env` |

**Where to get these values:**
- Open `.env` in your repo OR
- Supabase Dashboard → Project Settings → API

### 4.2 Update Your .env for Local Development

**IMPORTANT:** Never commit `.env` with real secrets to GitHub.

Create `.env.example` for team reference:
```bash
VITE_SUPABASE_URL=https://afnmgtzxnsunudzdmngu.supabase.co
VITE_SUPABASE_PROJECT_ID=afnmgtzxnsunudzdmngu
VITE_SUPABASE_PUBLISHABLE_KEY=<your_key_here>
```

Ensure `.gitignore` has `.env`:
```bash
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
git add .gitignore
git commit -m "Add .env to gitignore for security"
git push origin main
```

### 4.3 Add Secrets to GitHub (Optional - for pre-build validation)

If you want GitHub Actions to validate builds:

1. **Go to:** GitHub → Settings → Secrets and variables → Actions
2. **New repository secret:**
   - Name: `VITE_SUPABASE_URL`
   - Value: `https://afnmgtzxnsunudzdmngu.supabase.co`

**Repeat for:**
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

---

## Step 5: Verify Deployment

### 5.1 Check GitHub Actions Workflow

1. Go to **GitHub** → Your repo → **Actions** tab
2. Look for workflow: `Azure Static Web Apps - ...`
3. Verify job runs successfully:
   - ✅ Checkout code
   - ✅ Install Node dependencies (`npm ci`)
   - ✅ Build (`npm run build`)
   - ✅ Upload artifacts
   - ✅ Deploy to Azure

### 5.2 Test the Deployment

```bash
# Get your Static Web App URL
az staticwebapp show \
  --name gc-letterhead-prod \
  --resource-group letterhead-rg \
  --query "defaultHostname"

# Example output: abc123xyz.azurewebsites.net
```

1. **Open URL in browser:** `https://abc123xyz.azurewebsites.net`
2. **Expected:**
   - Sees "Gulf Cryo Letterhead" page
   - React app loads (check Console for errors)
   - Supabase connects (check Network tab)
   - Auth redirects work

### 5.3 Common Issues During First Deploy

| Issue | Cause | Solution |
|-------|-------|----------|
| 404 errors on refresh | SPA routing not configured | Add `staticwebapp.config.json` |
| `VITE_*` env vars undefined | Env vars not set in Azure | Add to Application Settings |
| Build fails (npm ci timeout) | Node modules too large | Check `package-lock.json` is committed |
| Supabase connection fails | CORS not allowed | See Step 5.4 |
| Authentication broken | Redirect URIs not updated | See Step 6.2 |

### 5.4 Enable Supabase CORS for Azure Domain

1. **Go to:** Supabase Dashboard → Project Settings → API
2. **URL Configuration:**
   - **Site URL:** `https://abc123xyz.azurewebsites.net` (your Azure URL)
   - **Redirect URLs:** Add:
     ```
     https://abc123xyz.azurewebsites.net/**
     https://abc123xyz.azurewebsites.net/auth/callback
     ```
   - Click **Update** and **Save**

---

## Step 6: Custom Domain Setup

### 6.1 Domain Requirements

- Registered domain (e.g., `letterhead.yourcompany.com`)
- Domain registrar access (GoDaddy, Namecheap, Route 53, etc.)
- Optional: Azure DNS Zone (easier management)

### 6.2 Add Custom Domain to Azure Static Web Apps

1. **Azure Portal** → Static Web App → **Settings** → **Custom domains**
2. **Add custom domain:**
   - Domain: `letterhead.yourcompany.com`
   - Click **Validate**
   - Azure shows TXT record to add

3. **Update DNS at your registrar:**
   - Add TXT record: `asuid.<hash>` (provided by Azure)
   - Add CNAME record: `letterhead.yourcompany.com` → `abc123xyz.azurewebsites.net`
   - Wait 5-30 minutes for DNS propagation

4. **Verify:**
   ```bash
   nslookup letterhead.yourcompany.com
   ```

### 6.3 Update Supabase for New Domain

1. **Supabase Dashboard** → **Authentication** → **URL Configuration**
2. **Update Site URL:** `https://letterhead.yourcompany.com`
3. **Add to Redirect URLs:**
   ```
   https://letterhead.yourcompany.com/**
   https://letterhead.yourcompany.com/auth/callback
   ```
4. **Save**

### 6.4 Update Azure Entra ID (SSO)

If using Microsoft Entra for SSO (currently configured):

1. **Azure Portal** → **App registrations** → Your app
2. **Authentication** → **Web** → Add URI:
   ```
   https://letterhead.yourcompany.com/auth/callback
   ```
3. **Save**

---

## Step 7: Security & Monitoring

### 7.1 Enable HTTPS (Automatic)

✅ Azure Static Web Apps automatically:
- Issues SSL/TLS certificates (Let's Encrypt)
- Enforces HTTPS
- Redirects HTTP → HTTPS

**No manual setup needed.**

### 7.2 Set Up Monitoring

#### Azure Application Insights (Optional)

```bash
# Create App Insights resource
az monitor app-insights component create \
  --app gc-letterhead-insights \
  --location eastus \
  --resource-group letterhead-rg \
  --application-type web

# Get instrumentation key
az monitor app-insights component show \
  --app gc-letterhead-insights \
  --resource-group letterhead-rg \
  --query "instrumentationKey"
```

#### Enable Logging

1. **Azure Portal** → Static Web App → **Monitoring** → **Logs**
2. Add diagnostic settings:
   - Destination: Log Analytics Workspace
   - Log categories: AppServiceHTTPLogs, AppServicePlatformLogs

### 7.3 Set Up Alerts

```bash
# Alert if build fails
az monitor metrics alert create \
  --name "Static Web App Build Failure" \
  --resource-group letterhead-rg \
  --scopes /subscriptions/{sub-id}/resourceGroups/letterhead-rg/providers/Microsoft.Web/staticSites/gc-letterhead-prod \
  --condition "total errors > 0" \
  --window-size PT5M \
  --evaluation-frequency PT1M \
  --action email admin@yourcompany.com
```

### 7.4 Security Best Practices

- [ ] Keep Node.js version updated (`package.json` specifies version in engines)
- [ ] Rotate GitHub PAT every 90 days
- [ ] Regularly update npm dependencies:
  ```bash
  npm audit
  npm audit fix
  ```
- [ ] Enable branch protection on `main`
- [ ] Require PR reviews before merge
- [ ] Use Azure Key Vault for sensitive secrets (prod environments)
- [ ] Monitor Azure costs (Static Web Apps tier can scale)

---

## Troubleshooting

### Build Fails: "npm ERR! 404 Not Found"

**Cause:** Node modules version mismatch

**Fix:**
```bash
# Delete lock file and reinstall locally
rm package-lock.json
npm install
git add package-lock.json
git commit -m "Update dependencies"
git push origin main
```

### Deployment Succeeds But App Shows 404

**Cause:** SPA routing not configured

**Fix:** Ensure `staticwebapp.config.json` exists with correct `navigationFallback`

### Environment Variables Not Loading

**Cause:** Azure app settings not synced with runtime

**Fix:**
1. Delete and recreate the Static Web App
2. OR manually force rebuild:
   ```bash
   # Make dummy commit
   git commit --allow-empty -m "Trigger rebuild"
   git push origin main
   ```

### Supabase Connection Fails (CORS Error)

**Cause:** Frontend domain not in Supabase allowlist

**Fix:** Update Supabase URL Configuration with Azure domain

### High Build Times (> 10 minutes)

**Cause:** Large node_modules

**Fix:** Add build cache to GitHub Actions (automatic for Static Web Apps)

### Azure Portal Won't Connect GitHub

**Cause:** GitHub app permissions revoked

**Fix:**
1. Go to GitHub → Settings → Applications → Authorized OAuth Apps
2. Find "Azure Static Web Apps"
3. Click "Revoke"
4. Retry connection in Azure Portal

---

## Post-Deployment Checklist

- [ ] **Frontend Accessibility:**
  - App loads at custom domain
  - React Router works (no 404 on refresh)
  - PWA manifest loads
  - Icons render correctly

- [ ] **Backend Integration:**
  - Supabase connects (check Network tab)
  - Authentication works
  - Database queries succeed
  - File uploads work (storage buckets)

- [ ] **Performance:**
  - Lighthouse score > 90 (audit locally)
  - Core Web Vitals in Azure dashboard
  - CDN caching enabled

- [ ] **Security:**
  - HTTPS enforced
  - Security headers set (CSP, X-Frame-Options)
  - No secrets in frontend code
  - Supabase RLS policies active

- [ ] **Monitoring:**
  - App Insights capturing events
  - Logs aggregated
  - Alerts configured
  - Error budget tracked

- [ ] **Maintenance:**
  - Team has Azure access
  - Deployment runbook documented
  - Rollback procedure tested
  - Incident response plan ready

---

## Deployment Troubleshooting Flowchart

```
App not loading?
├─ Check browser console for errors
│  ├─ "Cannot find module '@/...'" → Path alias issue
│  └─ "Supabase connection refused" → CORS/env vars
├─ Check Azure Portal → Static Web App → Logs
├─ Check GitHub Actions → Workflow logs
└─ Check Azure status: status.azure.com

Build failing?
├─ Check GitHub Actions job logs
├─ Verify package.json scripts (npm run build works locally?)
├─ Check package-lock.json committed
└─ Clear Azure cache → force rebuild

Environment variables not loading?
├─ Verify set in Azure Portal → Application Settings
├─ Restart deployment (push dummy commit)
├─ Check .env not committed to GitHub
└─ Verify VITE_ prefix (Vite requirement)

Custom domain issues?
├─ Verify DNS propagation (nslookup)
├─ Check Azure shows domain verified ✅
├─ Update Supabase redirect URLs
└─ Clear browser cache and retry
```

---

## Next Steps

1. **Deploy to Staging First** (see `staging.md`)
   - Create `staging` branch deployment
   - Test everything before prod
   - Use staging for team QA

2. **Set Up CI/CD Pipeline**
   - Add lint checks to GitHub Actions
   - Add tests to build pipeline
   - Require passing checks before merge

3. **Migrate Users from Lovable.app**
   - Test authentication flow
   - Verify data persistence
   - Plan cutover date
   - Communicate to users

4. **Monitor & Optimize**
   - Track performance metrics
   - Analyze user patterns
   - Plan scaling if needed

---

## References

- [Azure Static Web Apps Documentation](https://learn.microsoft.com/en-us/azure/static-web-apps/)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)
- [Supabase Azure Integration](https://supabase.com/docs/guides/platform/azure)
- [React Router SPA Routing](https://reactrouter.com/)
- [Your Staging Environment Plan](./staging.md)
- [Azure Entra ID Setup](./Entra.md)

---

## Support

For issues:
1. Check this guide's **Troubleshooting** section
2. Review Azure Portal → Static Web App → Logs
3. Check GitHub Actions workflow logs
4. Contact Azure Support (paid tiers)
5. Contact Supabase Support for backend issues

---

**Happy Deploying! 🚀**
