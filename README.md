# KLU AttendIQ

KLU AttendIQ is a student-controlled attendance intelligence platform for KLU students.
It reads attendance that is already visible in the student's authenticated KLU ERP session
through a Chrome extension and syncs the data to the student's own AttendIQ account.

## Architecture

KLU ERP (logged-in browser) → Chrome Extension → AttendIQ API → Supabase → Dashboard

The extension does **not** ask for or store the student's KLU ERP password.

## Features

- Supabase signup, login, logout and protected dashboard
- Server-backed attendance persistence
- Adaptive/header-driven KLU ERP attendance-table parser
- Course-wise conducted, attended, absent and TCBR values
- Lecture / Practical / Skill / Tutorial / Other component support
- TCBR-aware attendance percentage calculations
- Attendance calculator with current %, can-miss, must-attend and projections
- Analytics and attendance history
- Extension-to-dashboard authentication bridge
- Server-side validation and percentage re-calculation
- Supabase RLS protection
- Sync API rate limiting
- Configurable production CORS
- Timetable and attendance-component database support

## Project structure

```text
extension/                 Chrome Manifest V3 extension
website/                   Next.js + Supabase web application
supabase/schema.sql        Database schema
supabase/migrations/       Database migrations
```

## Local setup

### 1. Supabase

Run these SQL files in the Supabase SQL Editor, in order:

```text
supabase/schema.sql
supabase/migrations/002_timetable_and_components.sql
```

### 2. Website

```bash
cd website
npm install
```

Create `website/.env.local` from `.env.example` and set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SUPABASE_SECRET_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
EXTENSION_ORIGINS=chrome-extension://YOUR_EXTENSION_ID
```

Never commit `.env.local` or the Supabase secret key.

Start the website:

```bash
npm run dev
```

### 3. Chrome extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the repository's `extension/` folder.
5. Log in to AttendIQ in the dashboard.
6. Open the KLU ERP attendance page while already logged in.
7. Open the AttendIQ extension and sync the detected attendance.

## Production deployment

This project is a **Next.js + Supabase application** and should be deployed to a
Next.js-capable host such as Vercel. GitHub Pages is not suitable for the full
application because the project uses server API routes, authentication middleware
and Supabase integration.

The GitHub repository can still be named `what`; GitHub stores the source code while
Vercel runs the application.

For production, configure:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
NEXT_PUBLIC_SITE_URL=https://YOUR-VERCEL-DOMAIN
EXTENSION_ORIGINS=chrome-extension://YOUR_EXTENSION_ID
```

If the production domain changes, update the extension's dashboard/API endpoints
in `extension/popup.js` before rebuilding/reloading the extension.

## Attendance calculation

The application uses:

```text
Effective Conducted = max(0, Conducted - TCBR)
Effective Attended  = min(Attended, Effective Conducted)
Attendance %        = Effective Attended / Effective Conducted × 100
```

Future attendance projections use the same effective-count logic.

## Security

- Do not share KLU ERP passwords with the extension.
- Do not commit `.env.local` or `SUPABASE_SECRET_KEY`.
- The sync API requires a valid Supabase access token.
- The server validates numeric attendance values and re-derives percentages.
- Supabase Row Level Security limits data access to the authenticated user.

## Important testing note

The ERP parser is adaptive and header-driven, but a private authenticated KLU ERP page
cannot be live-tested from this repository. It scans rendered HTML tables and recognizes
common attendance headers such as Course Code, Course Name/Description, LTPS, Section,
Conducted, Attended, Absent, TCBR, Percentage and Component/Type.

If a particular KLU ERP layout uses different labels, provide the saved attendance
page HTML/outerHTML and the parser aliases can be adjusted without changing the rest
of the application.
