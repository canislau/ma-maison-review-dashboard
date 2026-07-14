# Ma Maison Review Management Dashboard

Internal web app for uploading, analysing, and managing Google Reviews across
Ma Maison outlets. React + TypeScript frontend on Cloudflare Pages, backend
via Cloudflare Pages Functions calling Microsoft Graph, with all data stored
permanently in SharePoint Lists and a SharePoint Document Library.

---

## 1. Architecture at a glance

```
Browser (React + MSAL)
   |  Bearer token (Entra ID ID token, user-delegated)
   v
Cloudflare Pages Functions  (functions/api/**)
   |  verifies user token, resolves role from Entra ID App Roles
   |  acquires its OWN app-only Graph token (client credentials)
   v
Microsoft Graph API
   v
SharePoint:
   - List "Ma Maison Reviews"           -> structured review records
   - List "Review Action Tracker"       -> action items linked by Review ID
   - Doc Library "Ma Maison Review Source Files" -> uploaded CSV/JSON/XLSX
```

Two identities are in play, deliberately:
- The **signed-in user's** Entra ID token authenticates the human and carries
  their **App Role** (Viewer / Manager / Administrator).
- The **backend's own app-only token** (client credentials flow) is what
  actually talks to SharePoint. Individual users never need direct
  SharePoint permissions - only the app registration does.

---

## 2. Folder structure

```
ma-maison-reviews/
├── functions/                     Cloudflare Pages Functions (backend)
│   ├── _lib/
│   │   ├── types.ts                Env bindings, SharePoint raw field types
│   │   ├── graphAuth.ts            App-only Graph token acquisition + cache
│   │   ├── graphClient.ts          Low-level Graph fetch (retry/throttle)
│   │   ├── sharepoint.ts           List CRUD + Document Library upload/list
│   │   ├── fieldMapping.ts         SharePoint fields <-> Review/ActionTracker
│   │   ├── auth.ts                 Entra ID JWT verification + role resolution
│   │   ├── http.ts                 CORS, withAuth() route wrapper, JSON helpers
│   │   ├── validation.ts           Field validation, outlet/date standardisation
│   │   ├── duplicateDetection.ts   Duplicate key + index building
│   │   ├── dashboardCalculations.ts Monthly summaries + trends (pure functions)
│   │   ├── fileParsers.ts          CSV / JSON / XLSX -> Review[] parsers
│   │   └── azureOpenAi.ts          Translation/categorisation/draft-reply AI
│   └── api/
│       ├── reviews/
│       │   ├── index.ts            GET /api/reviews
│       │   ├── [id].ts             GET/PUT/DELETE /api/reviews/:id
│       │   └── import.ts           POST /api/reviews/import (preview + commit)
│       ├── action-tracker/
│       │   ├── index.ts            GET/POST /api/action-tracker
│       │   └── [id].ts             PUT /api/action-tracker/:id
│       ├── files/
│       │   └── index.ts            GET/POST /api/files
│       ├── dashboard.ts            GET /api/dashboard
│       ├── monthly-summary.ts      GET /api/monthly-summary
│       ├── outlets.ts              GET /api/outlets
│       ├── categories.ts           GET /api/categories
│       └── export.ts               GET /api/export
├── src/                            React frontend
│   ├── types/index.ts               Shared types (Review, DashboardData, ...)
│   ├── lib/
│   │   ├── authConfig.ts            MSAL configuration
│   │   └── apiClient.ts             Typed fetch wrapper with token injection
│   ├── hooks/useUserRole.ts         Role derivation from ID token claims
│   ├── components/                  Badges, FilterBar, Pagination, panels...
│   ├── pages/
│   │   ├── OverviewTab.tsx
│   │   ├── ConcernReviewsTab.tsx
│   │   └── AllReviewsTab.tsx
│   ├── App.tsx                      Sign-in gate + 3-tab shell
│   ├── main.tsx                     MSAL provider bootstrap
│   └── index.css                    Tailwind + design tokens
├── wrangler.toml                    Pages Functions config (KV binding, vars)
├── .dev.vars.example                Backend secrets template
├── .env.example                     Frontend public config template
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── vite.config.ts
```

---

## 3. SharePoint setup

You said this is already set up - this section is the exact schema the code
expects, for verification against what you have.

### List 1 - "Ma Maison Reviews"

Create columns with these **internal names** (set explicitly when creating
the column, since a display name with spaces otherwise gets an auto-mangled
internal name):

| Internal Name         | Display Name             | Type                    |
|------------------------|---------------------------|-------------------------|
| Title                  | Review ID                 | Single line of text (repurposed) |
| ReviewID               | Review ID                 | Single line of text     |
| Outlet                 | Outlet                    | Single line of text     |
| Reviewer               | Reviewer                  | Single line of text     |
| ReviewDate             | Review Date                | Date and Time (Date only) |
| StarRating              | Star Rating                | Number                  |
| OriginalReview          | Original Review            | Multiple lines of text  |
| EnglishTranslation      | English Translation        | Multiple lines of text  |
| ManagementReply         | Management Reply           | Multiple lines of text  |
| DraftReply              | Draft Reply                | Multiple lines of text  |
| Category                | Category                   | Choice (see options below) |
| Severity                | Severity                   | Choice: Low, Medium, High, Critical |
| PossibleRootCause       | Possible Root Cause        | Multiple lines of text  |
| ResponsiblePerson       | Responsible Person         | Single line of text     |
| SalesRecovery           | Sales Recovery             | Single line of text     |
| ActionPlan              | Action Plan                 | Multiple lines of text  |
| RecommendedTimeline     | Recommended Timeline        | Date and Time (Date only) |
| Status                  | Status                     | Choice (see options below) |
| Language                 | Language                   | Single line of text     |
| SourceFile               | Source File                 | Single line of text     |
| SourceFileURL             | Source File URL             | Hyperlink or Picture (or plain text) |

**Category choices:** Food Quality, Taste, Food Temperature, Portion Size,
Price and Value, Service, Staff Attitude, Waiting Time, Order Accuracy,
Product Availability, Cleanliness, Restaurant Environment, Queue Management,
Payment, Delivery or Takeaway, Others.

**Severity choices:** Low, Medium, High, Critical.

**Status choices:** New, Under Review, Action Required, In Progress,
Resolved, Closed.

> If your existing list uses different internal names, you only need to edit
> **one file**: `functions/_lib/fieldMapping.ts`. Every route goes through
> `spItemToReview()` / `reviewToSpFields()`, so that's the single source of
> truth for the mapping.

### List 2 - "Review Action Tracker"

| Internal Name       | Display Name         | Type                     |
|----------------------|------------------------|--------------------------|
| Title                | Action ID              | Single line of text (repurposed) |
| ActionID             | Action ID              | Single line of text      |
| ReviewID             | Review ID               | Single line of text (FK to Reviews list) |
| Outlet               | Outlet                 | Single line of text      |
| ResponsiblePerson    | Responsible Person      | Single line of text      |
| ActionPlan            | Action Plan             | Multiple lines of text   |
| RecommendedTimeline   | Recommended Timeline    | Date and Time            |
| Status                | Status                  | Choice (same options as Reviews) |
| CompletionDate         | Completion Date         | Date and Time            |
| Remarks                | Remarks                 | Multiple lines of text   |

### Document Library - "Ma Maison Review Source Files"

A standard SharePoint Document Library. No special columns required - the
app organises uploads into `/{Outlet}/{Year}/{Month}/` folders automatically
via the Graph Drive API.

### Getting your IDs

```
Site ID:               GET https://graph.microsoft.com/v1.0/sites/{hostname}:/sites/{site-path}
Reviews List ID:        GET https://graph.microsoft.com/v1.0/sites/{site-id}/lists?$filter=displayName eq 'Ma Maison Reviews'
Action Tracker List ID: same, filter displayName eq 'Review Action Tracker'
Document Library ID:    GET https://graph.microsoft.com/v1.0/sites/{site-id}/drives  (match by name)
```

Easiest way to run these: [Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer),
signed in as an admin.

---

## 4. Entra ID app registration - what this app expects

Since you already have an app registration, confirm it has:

1. **API permissions** (Application, admin-consented): `Sites.ReadWrite.All`
   (or scoped `Sites.Selected` + a site permission grant - more secure, but
   requires the extra `POST /sites/{id}/permissions` grant step).
2. **App Roles** defined in the manifest, assignable to Users/Groups:
   ```json
   "appRoles": [
     { "value": "Viewer", "displayName": "Viewer", "allowedMemberTypes": ["User"], "id": "<generate-guid>" },
     { "value": "Manager", "displayName": "Manager", "allowedMemberTypes": ["User"], "id": "<generate-guid>" },
     { "value": "Administrator", "displayName": "Administrator", "allowedMemberTypes": ["User"], "id": "<generate-guid>" }
   ]
   ```
   Assign these to specific users/groups under **Enterprise Applications ->
   [your app] -> Users and groups** - intentionally *not* hardcoded
   anywhere in the codebase.
3. **Expose an API** blade: an Application ID URI (`api://<client-id>`) and a
   scope named `access_as_user` - this is what `apiTokenRequest` in
   `src/lib/authConfig.ts` requests.
4. **Authentication** blade: a Single-Page Application platform with redirect
   URI matching your Cloudflare Pages domain (and `http://localhost:5173` for
   local dev).
5. A **client secret** under Certificates & secrets - used by the *backend*
   only, for the app-only Graph client-credentials flow.

---

## 5. Environment variables

### Frontend (`.env`, public/build-time - copy from `.env.example`)

```
VITE_MICROSOFT_CLIENT_ID=<app registration client ID>
VITE_MICROSOFT_TENANT_ID=<tenant ID>
```

### Backend (`.dev.vars` locally / Cloudflare Pages secrets in production -
copy from `.dev.vars.example`)

```
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
SHAREPOINT_SITE_ID=
REVIEWS_LIST_ID=
ACTION_TRACKER_LIST_ID=
DOCUMENT_LIBRARY_ID=
SESSION_SECRET=
ALLOWED_ORIGIN=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_DEPLOYMENT=
AZURE_OPENAI_API_VERSION=
```

`AZURE_OPENAI_*` are optional - if left blank, imports still work, just
without automatic translation/categorisation/draft-reply (those fields are
left blank for manual entry).

In the Cloudflare dashboard: **Pages project -> Settings -> Environment
variables**. Use "Secret" type for `MICROSOFT_CLIENT_SECRET`,
`AZURE_OPENAI_API_KEY`, and `SESSION_SECRET`; plain variables for the rest.
Or via CLI:

```bash
wrangler pages secret put MICROSOFT_CLIENT_SECRET
wrangler pages secret put AZURE_OPENAI_API_KEY
wrangler pages secret put SESSION_SECRET
```

---

## 6. Local development

```bash
npm install

cp .env.example .env               # fill in VITE_MICROSOFT_* values
cp .dev.vars.example .dev.vars      # fill in backend secrets

# Create the KV namespace used for staged-import caching (one-time):
wrangler kv namespace create CACHE
wrangler kv namespace create CACHE --preview
# paste the returned IDs into wrangler.toml

# Terminal 1 - backend Functions on :8788
npm run build && npm run pages:dev

# Terminal 2 - frontend dev server on :5173 (proxies /api to :8788)
npm run dev
```

Visit `http://localhost:5173`.

---

## 7. Deployment (Cloudflare Pages)

```bash
npm run build
wrangler pages deploy dist --project-name=ma-maison-review-dashboard
```

Or connect the Git repo in the Cloudflare dashboard for automatic deploys:
- Build command: `npm run build`
- Build output directory: `dist`
- Set all environment variables/secrets listed in section 5 under the
  Pages project settings (both Production and Preview environments).
- Bind the `CACHE` KV namespace under **Settings -> Functions -> KV namespace
  bindings**.

After first deploy, go back to your Entra ID app registration's
**Authentication** blade and add the deployed `https://your-project.pages.dev`
URL as an additional SPA redirect URI.

---

## 8. Testing checklist

**Auth**
- [ ] Sign-in redirects to Microsoft, returns successfully
- [ ] Viewer role: dashboards/reviews visible, edit fields disabled, no Upload button
- [ ] Manager role: can edit Concern Reviews fields, can upload, cannot delete
- [ ] Administrator role: full access including delete and direct file upload
- [ ] Expired token on an API call surfaces a clear "session expired" message

**Import**
- [ ] CSV upload -> preview shows correct row count, valid/duplicate/error counts
- [ ] JSON upload (array of objects, and `{ "reviews": [...] }` wrapper) both parse
- [ ] XLSX upload with a date-formatted column parses dates correctly
- [ ] Duplicate detection: re-uploading the same file shows all rows as duplicates
- [ ] "Skip duplicates" (default) imports only new rows
- [ ] "Replace existing records" deletes-and-recreates matched duplicates
- [ ] "Import selected only" respects the checked rows
- [ ] Uploaded source file appears in SharePoint under `Outlet/Year/Month/`
- [ ] Imported reviews' "Source File" links back to that file

**Dashboard**
- [ ] Overview tab defaults to current month, all outlets
- [ ] Changing outlet/month filters updates all charts and summaries together
- [ ] Monthly Summary 1/2/3 numbers match a manual count on a small test dataset
- [ ] Outlet comparison table shows all outlets with data

**Concern Reviews**
- [ ] All 1-star and 2-star reviews appear
- [ ] A 5-star review with Severity=Critical appears
- [ ] Editing and saving a field persists after page refresh
- [ ] Overdue badge appears only when Recommended Timeline is past and Status isn't Resolved/Closed

**All Reviews**
- [ ] Search matches reviewer name and review text
- [ ] Sorting by Date and Rating toggles ascending/descending
- [ ] Pagination controls move between pages correctly
- [ ] Export CSV / Export Excel download filtered (not full) dataset

**Performance / resilience**
- [ ] Import of 200+ rows completes without timing out (batched writes)
- [ ] Simulated Graph 429 (throttle) - request retries rather than failing immediately

---

## 9. Security checklist

- [ ] `MICROSOFT_CLIENT_SECRET` and `AZURE_OPENAI_API_KEY` set as Cloudflare **secrets**, never plain vars, never committed
- [ ] `.env` and `.dev.vars` are in `.gitignore` (already included) and never committed
- [ ] `ALLOWED_ORIGIN` set to your exact production domain, not `*`, once live
- [ ] Entra ID App Roles (not a hardcoded name list) gate all Manager/Administrator actions
- [ ] Every mutating route (`PUT`, `DELETE`, `POST /import`) checks role server-side
- [ ] SharePoint app registration uses least-privilege Graph permissions where feasible
- [ ] Rotate `MICROSOFT_CLIENT_SECRET` before its expiry

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| 401 on every API call | Token audience/tenant mismatch | Confirm `VITE_MICROSOFT_CLIENT_ID` matches the backend's `MICROSOFT_CLIENT_ID`, and both match the app registration used for the "Expose an API" scope |
| Sign-in works but role always shows "Viewer" | App Role not assigned to the user, or roles claim missing from token | Assign the role under Enterprise Application -> Users and groups; confirm `"roles"` appears in the decoded ID token (jwt.ms) |
| Graph calls fail with 403 | App-only permission not granted/consented | Grant admin consent for `Sites.ReadWrite.All` (or your `Sites.Selected` grant) |
| Graph calls fail with 429 repeatedly | Sustained high request volume | Client already retries with backoff; for very large imports, narrow `BATCH_SIZE` in `sharepoint.ts` or import in smaller file chunks |
| Import preview says "expired" | Staged import in KV passed its 30-minute TTL | Re-upload the file |
| CSV dates parse incorrectly | Ambiguous DD/MM vs MM/DD format | `standardiseReviewDate()` assumes DD/MM/YYYY when ambiguous - export source as ISO (`YYYY-MM-DD`) to avoid ambiguity |
| AI fields blank after import | Azure OpenAI env vars not set, or the call failed | Check `AZURE_OPENAI_ENDPOINT/API_KEY/DEPLOYMENT`; failures are logged server-side but never block the import |
| "A KV namespace must be bound as CACHE" | `wrangler.toml` KV IDs are placeholders | Run `wrangler kv namespace create CACHE` (and `--preview`), paste real IDs, redeploy |
| Local dev: frontend can't reach `/api` | `wrangler pages dev` not running, or `dist/` missing | Run `npm run build` once, then `npm run pages:dev` in a separate terminal before `npm run dev` |

---

## 11. Design notes

- **No client-side storage of review data.** All state is fetched fresh from
  `/api/*` on load; the only browser storage in use is MSAL's own token cache
  in `sessionStorage`, which is Microsoft's documented pattern for MSAL.js.
- **Monthly summaries are always computed, never stored** - per spec, there
  is no separate SharePoint list for them. `dashboardCalculations.ts` is the
  single source of truth and is deliberately pure/testable.
- **Duplicate detection** uses Outlet + Reviewer + Review Date + Star Rating +
  Original Review (first 200 chars, normalised) as its key.
- **Colour theme** follows spec: white/light-grey base, dark green accents,
  red reserved strictly for Critical severity and overdue indicators.
