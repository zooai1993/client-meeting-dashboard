# Client Meeting Dashboard

Vercel-ready Next.js dashboard built from your spreadsheet structure:

- `Account`
- `Client Name`
- `Role`
- `Email`
- `Phone #`
- `Meeting Date`
- `Meeting Notes`
- `Next Steps`

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Deploy to Vercel

1. Push this folder to a Git repository.
2. Import the repository into Vercel.
3. Deploy with the default Next.js settings.

Detailed runbook: [DEPLOY.md](/Users/vincenzoanzalone/Desktop/Codex/DEPLOY.md)

## Google Calendar setup

Add this environment variable in Vercel:

```bash
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

In Google Cloud:

1. Enable the Google Calendar API.
2. Create an OAuth client for a Web application.
3. Add `http://localhost:3000` and your Vercel production URL to the authorized JavaScript origins.
4. Use the generated client ID in Vercel and in your local `.env.local` if needed.

## Notes

- The initial dashboard data is based on `/Users/vincenzoanzalone/Desktop/Enzo MM Ent Prospecting_Meeting Track.xlsx`.
- Meetings are stored in browser local storage.
- Search is included so accounts are easy to find quickly.
- Calendar sync reads upcoming events from your primary Google Calendar and updates matching records by email, client name, or account name.
- Because storage is client-side, each browser keeps its own meeting history unless you later add a database.
