# Ma Maison Review Management Dashboard — Google Edition

Production React/TypeScript dashboard hosted on Cloudflare Pages. Users sign in
with Google; review and action data is stored in Google Sheets; uploaded CSV,
JSON, and Excel source files are stored in Google Drive.

## Architecture

- Browser: React, Google Identity Services, charts and inline editing
- Backend: Cloudflare Pages Functions
- Structured data: one Google Spreadsheet with `Reviews` and `ActionTracker` tabs
- Files: one shared Google Drive folder with Outlet/Year/Month subfolders
- Backend identity: one-time user-authorized OAuth refresh token

The app automatically creates both spreadsheet tabs and their header rows.

## 1. Google Cloud setup

1. Open <https://console.cloud.google.com> and create or select a project.
2. Open **APIs & Services → Library** and enable:
   - Google Sheets API
   - Google Drive API
3. Open **APIs & Services → OAuth consent screen**. Configure an External app.
   Add your Google address as a test user while the app remains in Testing.
4. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   Choose **Web application**.
5. Add these Authorized JavaScript origins:
   - `http://localhost:5173`
   - your exact `https://PROJECT.pages.dev` origin
6. Copy the OAuth Client ID. It becomes both `VITE_GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_ID`.

No Workspace administrator is required for a personal Gmail account in Testing mode.

## 2. Backend OAuth authorization (keyless)

The backend uses a refresh token from the authorized dashboard owner. This
works when organization policy disables service-account key creation.

1. Add `https://developers.google.com/oauthplayground` as an Authorized
   redirect URI on the same OAuth Web Client.
2. Open <https://developers.google.com/oauthplayground> and its settings.
3. Enable **Use your own OAuth credentials**, then enter the OAuth Client ID
   and Client Secret.
4. Authorize these scopes:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/drive`
5. Exchange the authorization code and securely copy the Refresh Token.

Never upload the Client Secret or Refresh Token to GitHub.

## 3. Google Sheet and Shared Drive folder

1. Open **Google Drive → Shared drives** and create or select the Shared Drive
   that will hold this application data.
2. Ensure the Google account that authorized the refresh token has **Content
   manager** access to the Shared Drive.
3. Inside the Shared Drive, create one blank Google Spreadsheet, e.g.
   `Ma Maison Review Data`.
4. Its URL is `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`.
   Copy `SPREADSHEET_ID` into `GOOGLE_SPREADSHEET_ID`.
5. In the same Shared Drive, create a folder named
   `Ma Maison Review Source Files`.
6. Its URL is `https://drive.google.com/drive/folders/FOLDER_ID`.
   Copy `FOLDER_ID` into `GOOGLE_DRIVE_FOLDER_ID`.

## 4. Cloudflare variables

Set these for Production (and Preview if used):

```text
VITE_GOOGLE_CLIENT_ID=<OAuth web client ID>
VITE_GOOGLE_ADMIN_EMAILS=<your Google email>
VITE_GOOGLE_MANAGER_EMAILS=<optional comma-separated emails>
GOOGLE_CLIENT_ID=<same OAuth web client ID>
GOOGLE_OAUTH_CLIENT_SECRET=<OAuth Web Client secret>
GOOGLE_OAUTH_REFRESH_TOKEN=<OAuth Playground refresh token>
GOOGLE_SPREADSHEET_ID=<ID from Sheets URL>
GOOGLE_DRIVE_FOLDER_ID=<ID from Drive folder URL>
GOOGLE_ADMIN_EMAILS=<same admin email>
GOOGLE_MANAGER_EMAILS=<optional comma-separated emails>
SESSION_SECRET=<at least 32 random characters>
ALLOWED_ORIGIN=https://PROJECT.pages.dev
```

Mark these as encrypted secrets:

```text
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REFRESH_TOKEN
SESSION_SECRET
AZURE_OPENAI_API_KEY (only when used)
```

The frontend role variables control button visibility; backend role variables
are the authoritative access control and must contain the same emails.

## 5. Cloudflare Pages build

Connect the GitHub repository to a Cloudflare **Pages** project:

```text
Build command: npm run build
Build output directory: dist
Root directory: / (or ma-maison-reviews if package.json is in that folder)
```

Deploy the complete repository, including `functions/`; uploading `dist` alone
creates a static-only deployment and the APIs will not work.

## 6. Verification

1. Open the Pages URL and sign in with the admin email.
2. Upload a small CSV and verify preview counts.
3. Commit the import and confirm rows appear in the `Reviews` sheet tab.
4. Confirm the source file appears under Outlet/Year/Month in Drive.
5. Edit a review, save, refresh, and verify the sheet changed.
6. Test duplicate skip/replace, JSON/XLSX import, and CSV/XLSX export.

## Local verification

```bash
npm install
npm run typecheck
npm run lint
npm run build
```
Cloudflare deployment rebuild.
Deployment trigger after project-name correction.
# Microsoft Entra sign-in

The dashboard supports Google and Microsoft work-account sign-in. Create a Microsoft Entra app registration with these settings:

1. **Microsoft Entra admin center → App registrations → New registration**.
2. Name: `Ma Maison Review Dashboard`.
3. Supported account type: **Accounts in this organizational directory only**.
4. Under **Authentication → Add a platform → Single-page application**, add:
   `https://ma-maison-review-dashboard.pages.dev`
5. Under **API permissions**, add delegated Microsoft Graph permission `User.Read` and grant consent if your tenant requires it.
6. Copy the **Directory (tenant) ID** and **Application (client) ID** into the Cloudflare variables listed below.

No Microsoft client secret is required. Browser sign-in uses Authorization Code with PKCE through MSAL.

```text
MICROSOFT_TENANT_ID=<Directory tenant ID>
MICROSOFT_CLIENT_ID=<Application client ID>
VITE_MICROSOFT_TENANT_ID=<same Directory tenant ID>
VITE_MICROSOFT_CLIENT_ID=<same Application client ID>
MICROSOFT_ADMIN_EMAILS=<optional comma-separated admin emails>
MICROSOFT_MANAGER_EMAILS=<optional comma-separated manager emails>
VITE_MICROSOFT_ADMIN_EMAILS=<same admin emails>
VITE_MICROSOFT_MANAGER_EMAILS=<same manager emails>
```
