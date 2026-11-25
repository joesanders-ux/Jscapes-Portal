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
- **Policies and Handbooks** (visible to everyone): same model as Health and Safety (admin-only upload, new versions, archive/restore;
  previous versions kept). Each document is a Policy or a Handbook. Staff read it inside the portal in the browser's built-in PDF viewer
  (page `/policies/<id>`), with "Open full screen" and "Download PDF" links as a fallback because some phones only show the first page
  in an embedded viewer. Files are served only to signed-in users; staff get nothing for archived documents
- **Job Images** (visible to everyone): anyone signed in can upload JPEG/PNG/WebP photos (up to 10 at a time, 10 MB each) with a job
  date, optional job reference, description and operator notes. Images are grouped by week (Monday to Sunday) with Previous / This week /
  Next, a jump-to-date control and an all-weeks search. Two layouts: Folders (one folder per job reference) and List (table). Each image
  has a page with edit and delete (only the person who added it, or an admin); downloads are per image or as a ZIP of a week or a job
  folder. Thumbnails are made at upload with the `sharp` package so browsing stays light. Files are served only to signed-in users.
  **Not built: any ServiceM8 import.** Its sync decisions are still to be confirmed, so nothing talks to ServiceM8 and no API key is used yet
- **Van Compliance** (visible to everyone): staff submit a van check (oil, tyres, lights, dashboard warnings, cleanliness, overall
  condition Poor/Moderate/Compliant, notes; any "No" needs an explanation). Admins get a Records tab (filter by van, month, needs-attention)
  and a Vehicles tab (add, deactivate or reactivate vans). The monthly reminder is in-app: a banner on the Dashboard and on the
  Van Compliance page lists any active van with no check this calendar month (UK time). Text-message reminders are not built yet
- **Equipment Maintenance** (visible to everyone): staff submit a monthly check for an item of equipment. The Submit a check tab always
  shows three dropdowns (Hand tools, Lawn mowers, Petrol equipment); opening one shows its tick-box checklist and a Notes box, and the
  person chooses the equipment. Anything not ticked (other than "Sharpening (if required)") is recorded as needing attention and
  needs an explanation in Notes. Up to 5 photos (JPEG, PNG or WebP, 10 MB each) can be added next to Notes; they show as thumbnails in History and need the same file storage as manuals. Three tabs: Submit a check, History
  (filter by item, checklist, month, needs-attention) and Equipment list (name, brand, model/serial, spare parts, manual PDF, notes). Anyone signed in can update an item's spare parts straight from the list (it changes nothing else, and shows who updated it and when); everything else is admin-only. No category is chosen when adding equipment: the checklist comes from the dropdown used on the check, and each check records which one.
  Admins add, edit, deactivate and reactivate equipment and upload or replace manuals; staff can read the list and open manuals.
  The monthly reminder is a Dashboard banner plus a list on the check tab. Manuals need `FILES_DIR` (see Railway setup)
- **Notification bell** (top of the menu, everyone): shows the number of unread notifications and links to the Notifications panel on the Dashboard. When anyone submits availability, every other active admin is notified, and the notification opens the Team availability calendar on that month; the calendar shows when each person last submitted. The count updates when a page loads.
- **Availability** (visible to everyone): Available / Not provided / Not available per day, up to a year ahead. Four tabs: My availability
  (week and month calendar), Submit availability (pick a month, mark days, submit; submitting LOCKS the days, and days left as Not provided are
  locked as Not provided), Change requests (staff ask for a change to locked days and give a reason; admins approve or decline, and approving
  updates the days) and, for admins, Team availability (week/month grid of everyone, with a count of who is available each day and who has not
  entered next month). Reminders are in-app: a Dashboard banner until next month is fully entered (marked overdue after the 15th). Change requests
  send an in-app notification to every administrator when made, and to the person when decided (with the admin's note); a withdrawn or decided
  request clears the administrators' notification. The admin Dashboard also shows a banner while requests are waiting. Text-message notifications are not built yet. ServiceM8 interaction is not built (still to be confirmed)
- **Shifts** (visible to everyone): admins plan a week at a time in the Planner (start and end time per person and day, with each person's
  availability shown beside it). Saving keeps shifts HIDDEN; "Save and publish this week" shows them to staff and sends each person an in-app
  notification. Changing a published shift hides it again until it is published. Staff see only their own published shifts, in week or month
  view, with times labelled approximate. Admins also get an All shifts tab (hidden shifts clearly marked). The Dashboard shows notifications
  (with Mark as read) and, for admins, how many shifts are still hidden. One shift per person per day; shifts cannot run past midnight.
  Text-message notifications are not built yet
- **Timesheets** (administrators only; staff get "not found", on the page and the PDF link): hours per person per day, entered as numbers
  (0 to 24, quarter hours fine). Week, month and custom date-range views with Previous / Next / This week controls. The grid shows row and
  day totals; ranges over 42 days show totals only. "Export this period to PDF" downloads a payroll PDF (totals by person, then daily hours)
  for any period up to 366 days. Uses the `pdf-lib` package
- PostgreSQL migrations and a demo-data seed

Not built yet: staff acknowledgement/signing of Health and Safety documents and policies,
ServiceM8 import for Job Images, section on/off switches, SMS notifications, ServiceM8 dashboard tiles, PAE Weed Spraying Logbook and calculators.

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

The ServiceM8 import for Job Images and SMS notifications wait on decisions (ServiceM8, SMS provider). The Settings section
switches have no blocker.
