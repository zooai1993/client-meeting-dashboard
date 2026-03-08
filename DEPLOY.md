# Deploy Runbook

## 1. Create the repo

From `/Users/vincenzoanzalone/Desktop/Codex`:

```bash
git init
git checkout -b codex/meeting-dashboard
git add .
git commit -m "Initial meeting dashboard"
```

Push that repository to GitHub, then import it into Vercel.

## 2. Deploy in Vercel

Use the default Next.js framework detection.

Set this environment variable in the Vercel project:

```bash
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

After the first deploy, note the production URL Vercel gives you. It will look like one of these:

- `https://your-project.vercel.app`
- `https://your-custom-domain.com`

## 3. Configure Google Cloud

In Google Cloud Console:

1. Create or select a project.
2. Enable `Google Calendar API`.
3. Go to `APIs & Services` -> `OAuth consent screen`.
4. Configure the app as `External` unless you are restricting it to one Workspace.
5. Add yourself as a test user if the app is still in testing.
6. Go to `APIs & Services` -> `Credentials`.
7. Create `OAuth client ID`.
8. Choose `Web application`.

Use these `Authorized JavaScript origins`:

- `http://localhost:3000`
- `https://your-project.vercel.app`
- `https://your-custom-domain.com`

Use these `Authorized redirect URIs` only if Google requires one for your app policy:

- `http://localhost:3000`
- `https://your-project.vercel.app`
- `https://your-custom-domain.com`

This app uses Google Identity Services token flow in the browser, so the critical setting is the JavaScript origins.

Copy the generated client ID into:

- Vercel project env vars
- local `.env.local`

Example local file:

```bash
NEXT_PUBLIC_GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
```

## 4. Local verification

Run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Then verify:

1. The dashboard loads with the spreadsheet seed data.
2. `Connect Google Calendar` opens Google auth.
3. After consent, `Sync meeting dates` updates matching records.

## 5. Production verification

After Vercel deploys:

1. Open the production URL.
2. Connect Google Calendar again on the production domain.
3. Confirm the browser is allowed by the OAuth client origin settings.
4. Run a sync and confirm matched records show `Source: Calendar`.

## 6. Matching logic

Calendar events update a dashboard record when one of these matches:

- attendee email equals the contact email
- event title or description contains the client name
- event title or description contains the account name

## 7. Current limitation

The dashboard stores data in browser local storage. That means:

- each browser has its own copy
- Vercel deployment does not create shared storage
- if you want shared data across devices, the next step is adding a database
