# Jscapes Staff Portal

Internal portal for Jscapes staff and administrators, intended for https://staff.jscapesgls.com.
It is a separate app from the public website (jscapesgls.com) and does not touch it.

**Stack:** Next.js 14 (App Router) + TypeScript, PostgreSQL (`pg`), Tailwind CSS driven by brand tokens.

## Status

Built:
- Scaffold, brand tokens (`src/app/globals.css`: #282D30, #38BB86, white) and logo (`public/logo.png`)
- **Sign-in:** email + password and Google, invite-only (no public sign-up); database-backed sessions;
  5 wrong passwords locks the account for 15 minutes
- **Settings > Users (admins):** add users, copy a one-time invite link to send yourself, reset sign-in with a new link,
  change role, deactivate/reactivate (deactivating signs them out immediately)
- Dashboard with team bulletin; Team calendar (week/month, four event types)
- **Health and Safety** (visible to everyone): admins upload PDFs and new versions; staff open them. One version is marked
  current, previous versions are kept. Admins can archive a document (hidden from staff, nothing deleted) and restore it.
  Files are served only to signed-in users
- PostgreSQL migrations and a demo-data seed

Not built yet: Van Compliance, Equipment Maintenance, Timesheets, staff acknowledgement/signing of Health and Safety documents, Policies, Availability, Shifts,
Job Images, section on/off switches, SMS and in-app notifications, ServiceM8 dashboard tiles, PAE Weed Spraying Logbook and calculators.

## Local development

```bash
npm install
cp .env.example .env        # then edit DATABASE_URL
npm run migrate
npm run seed                # fictional demo data; prints one-time invite links for the demo users
npm run dev                 # http://localhost:3000, open an invite link to set a password
```

## Rules for contributors (and for Claude Code in this repo)

- No secrets, API keys or passwords in source code or Git. Use `.env` locally (git-ignored) and Railway variables in production.
- Enforce permissions on the server: every server action calls `requireUser()` or `requireAdmin()` from `src/lib/auth.ts`.
- All portal pages live under `src/app/(portal)/`, whose layout requires sign-in.
- Schema changes go in a new numbered file in `migrations/` (never edit an applied one).
- Colours come from the tokens in `globals.css`. Event types always show a text label and a symbol, not colour alone.
- Demo data only. Never commit real employee or customer data.
- No public self-registration. Invites are copied by an admin and sent by hand (no invite emails).

## Railway

Environment variables:

| Variable | Needed | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | From the Railway PostgreSQL service (server-side only) |
| `APP_URL` | Yes | `https://staff.jscapesgls.com`. Builds invite links and the Google redirect address |
| `DATABASE_SSL` | If required | `true` only if your connection needs SSL |
| `FILES_DIR` | Yes, for uploads | Folder on a Railway Volume, e.g. `/data/uploads`. Without it, uploads are refused in production |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | For Google sign-in | Leave unset to hide the Google button |

`railway.json` runs `npm run migrate` before each deploy and starts the app with `npm start`.
Check in the Railway dashboard that the pre-deploy command is picked up.

Setup steps:
1. Push this repo to GitHub.
2. In Railway, create a project, add a PostgreSQL service, then add a service deploying from the GitHub repo.
3. Set `DATABASE_URL` (reference the Postgres service's variable) and `APP_URL`.
4. Deploy, then add the custom domain `staff.jscapesgls.com` (Railway shows the DNS record to add; leave the root jscapesgls.com records alone).
5. **Create the first admin** (there is no sign-up). From your machine, with `DATABASE_URL` set to the database's
   *public* connection URL (and `DATABASE_SSL=true` if needed), plus `APP_URL`:
   `npm run create-admin -- you@yourcompany.com "Your Name"`. Open the link it prints to set your password.
   Do not commit that URL.
6. Then add everyone else in **Settings > Users** and send each person their link.
7. **Persistent file storage:** in the Railway app service, add a **Volume** mounted at `/data`, then set
   `FILES_DIR=/data/uploads`. Railway's normal filesystem is wiped on every deploy, so uploads only survive on a volume.
   Run the app as a single instance (a volume attaches to one service). Back the volume up from Railway's volume settings.

### Google sign-in (optional)

In Google Cloud Console, create an OAuth client (type: Web application) and add the authorised redirect URI
`https://staff.jscapesgls.com/auth/google/callback` (and `http://localhost:3000/auth/google/callback` for local use).
Put the client ID and secret in the Railway variables above. Google sign-in only works for people who were invited
using that same email address.

## Next sections (planned)

Van Compliance, Equipment Maintenance, then Timesheets (admin-only, PDF export). After the remaining decisions
(ServiceM8, SMS provider): Health and Safety, Policies, Availability, Shifts, Job Images (viewable by everyone, staff upload
their own), notifications, section switches.
