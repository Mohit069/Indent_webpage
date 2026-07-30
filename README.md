# Purchase Indent System

**Marudhar Quartz Surfaces Pvt. Ltd. · Mahindra World City SEZ, Jaipur**

Replaces the carbon-copy purchase indent book (last serial: 952). Anyone raises an
indent, it moves through Purchase and approval, and every step is printable on a
near-facsimile of the paper form.

The design and the reasoning behind it are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## There is no sign-in

Deliberate. This is an internal tool shared by two or three people who all do
every job, so there are **no accounts, no passwords, no sessions and no roles**.
Anyone who can reach the page can raise an indent, acknowledge it, approve it, and
edit the master data.

The only identity in the app is **who this computer is set to**, asked once on
first use and shown in the header thereafter. It decides whose name is stamped
on the next action, so the printed indent's signature boxes carry a name the way
the paper form does. It is a preference, not a credential — nothing verifies it,
and changing it grants nothing.

Set each machine once: the purchase desk is the purchase officer, the director's
laptop is the director. Then nobody has to remember to change a dropdown, which
is the most likely real failure here — not fraud, but an indent printed under the
wrong name.

### The one control: a shared password

**Approve and Reject ask for a password.** It is whatever you set
`ACTION_PASSWORD` to — there is no default, and the app refuses to authorise
anything until it has one. That is deliberate: a password written into the
source is published the moment this repository is.

Raising an indent is open to anyone. Deciding one is not — that is where money
starts moving, so it is the one place with a gate. The password is checked on the
server before anything is written; the browser dialog is only the prompt.

Change it by setting `ACTION_PASSWORD` in `.env` and restarting. No redeploy.

It identifies nobody — the name recorded against the decision still comes from
whoever the computer is set to. It separates "anyone who can open the page" from
"anyone allowed to authorise a purchase", and nothing more.

> A password shared by three people is a password that ends up on a sticky note.
> It stops a casual or accidental click, and someone who wanders onto the LAN. It
> does not stop a determined insider, and it is not an audit trail. If you ever
> need to prove *who* approved something, that needs accounts.

**Two consequences worth being deliberate about:**

- **Do not expose this to the internet.** Keep it on the office LAN or behind a
  VPN. There is nothing stopping a visitor from approving their own indent, or
  deleting your item master.
- **The printed form still needs a wet signature.** Each signature box prints the
  recorded name above a ruled line. The system says who *said* they approved it;
  the pen on the printout is what makes it binding.

If the company grows past a handful of people, restoring accounts means adding a
`people` password column and a session cookie — the audit trail already records
who acted at every step, so nothing else has to change.

---

## How it works

```
DRAFT ──submit──► AWAITING APPROVAL ──approve──► APPROVED
                                    \─reject───► REJECTED
```

Three actions, and that is all. Submit is open; Approve and Reject need the
password.

| Screen | What it is for |
|---|---|
| **New Indent** | Raise one. Department, requester, items, quantities. |
| **Indents** | Every indent, approved or not, with **Approve** and **Reject** on the row. Filter by status, department or free text. |
| **Settings** | People, departments, units, item master |

An indent's own page shows the same buttons, plus the full item list, the
history, and **Print**.

---

## Requirements

- **Node.js 20 or newer** (built and tested on 24)
- **PostgreSQL 14 or newer** — a local install, a Docker container, Supabase, or Neon

---

## Setup

```bash
npm install
cp .env.example .env      # then edit it
npm run db:push           # creates the tables
npm run db:seed           # units, departments, categories, placeholder people
npm run dev               # http://localhost:3000
```

Open it. There is nothing to sign in to.

**First thing to do:** go to **Settings → People** and replace the three
placeholder names with the real people. Those names print on the indent.

### Two settings that matter

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Any Postgres 14+. For Supabase, use the URI from Project Settings → Database. |
| `INDENT_PREFIX` | Default `MQ/IND`. Issued numbers look like `MQ/IND/26-27/0001` and restart at 0001 each financial year, April to March. |
| `ACTION_PASSWORD` | **No default.** Required to Approve or Reject; the app will not start authorising without it. |

There is no `SESSION_SECRET` — nothing is signed, because there are no sessions.

---

## First hour after install

1. **Settings → People** — replace the placeholders with the real names and
   designations. These print in the signature boxes.
2. **Settings → Departments** — seven common ones are seeded; adjust to suit.
3. **Settings → Units** — ten common units are seeded. Add anything missing.
4. **Item master — leave it nearly empty.** This is deliberate. Anyone can type
   a description on the indent, and the recurring ones get promoted from **Item
   Triage**. Forcing a complete catalog on day one is what sends people back to
   paper.

---

## Deploying to your server

Every page is server-rendered on demand, so the app needs a running Node
process — it cannot be dropped onto static hosting.

### Option A — Docker (simplest, brings its own Postgres)

```bash
cp .env.example .env
# set POSTGRES_PASSWORD in .env

docker compose up -d --build
docker compose exec app sh -c "npm run db:push && npm run db:seed"
```

The app is on port 3000. Postgres is **not** published to the host — only the
app container can reach it. Data lives in the `pgdata` volume, so
`docker compose down` is safe; `down -v` erases everything.

### Option B — plain Node on the server

```bash
npm ci
npm run build
```

`next.config.ts` sets `output: 'standalone'` (except on Vercel, which builds its
own serverless output), so the build produces a self-contained server. Copy
three things to the server:

```
.next/standalone/     →  the server itself
.next/static/         →  into .next/static/ alongside it
public/               →  next to server.js
```

Then, with `DATABASE_URL` set in the environment:

```bash
node server.js        # listens on PORT, default 3000
```

Run it under systemd or pm2 so it restarts on boot.

### Option C — Vercel

Vercel runs the app but does **not** run a database, and it cannot reach a
Postgres on your office network. You need a hosted one first — Neon, Supabase
and Vercel Postgres all work; any Postgres 14+ with a public host does.

```bash
# 1. Create the database, then point at it and create the schema:
DATABASE_URL='postgresql://…' npm run db:push
DATABASE_URL='postgresql://…' npm run db:seed
```

Then import the repository in Vercel and set these under
**Settings → Environment Variables** *before the first deploy*:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the hosted connection string — use the **pooled** one |
| `ACTION_PASSWORD` | your Approve/Reject password. No default; nothing is authorised without it |
| `INDENT_PREFIX` | `MQ/IND` |

Use the pooler endpoint, not the direct one: every concurrent request on Vercel
is its own process with its own connection, and the direct endpoint runs out of
connections quickly. `src/db/index.ts` detects a pooled URL (`pgbouncer=true`,
or a `-pooler.` host) and turns off prepared statements accordingly, which
transaction-mode poolers cannot serve.

### Anything on a public URL has no door on it

With no authentication, the network *is* the access control. On an internal URL
that is fine. On Vercel it is not: the deployment is reachable by anyone who has
or guesses the address, and that means reading every indent, and raising and
editing them. Only Approve and Reject are gated, by `ACTION_PASSWORD`.

So a public deployment is for trying the app out, not for running the business
on. Before real indents go in, either put a password in front of the whole site
or move it somewhere only the office can reach.

Once it is on an internal URL, staff open it in any browser. On Android and iOS,
**Add to Home Screen** makes it behave like an installed app.

---

## The development database on this machine

A portable **PostgreSQL 16.4** runs here on port **55432**, database `indent`.
Nothing was installed system-wide, no admin rights were used, and no Windows
service was registered — it lives entirely in `%LOCALAPPDATA%\pgportable`, and
`.env` already points at it.

It does **not** survive a reboot. Start it again with:

```powershell
& "$env:LOCALAPPDATA\pgportable\pgsql\bin\pg_ctl.exe" `
    -D "$env:LOCALAPPDATA\pgportable\data" `
    -l "$env:LOCALAPPDATA\pgportable\pg.log" `
    -o "-p 55432 -h 127.0.0.1" start
```

Stop it with the same command and `stop`. To remove it entirely, stop it and
delete the `pgportable` folder — there is nothing else to uninstall.

`npm run local-db` is a zero-install PGlite fallback. **It is not reliable** —
the socket server takes one connection at a time and does not recover when a
client disconnects abruptly, so a second command fails with `ECONNRESET`. Prefer
the portable Postgres above.

---

## Backups

Everything is in Postgres. Nothing else on disk holds data.

```bash
# Docker
docker compose exec db pg_dump -U indent indent | gzip > indent-$(date +%F).sql.gz

# Direct
pg_dump "$DATABASE_URL" | gzip > indent-$(date +%F).sql.gz
```

Put that on a nightly cron. Because indent numbers are issued from a counter
table inside the same database, a restore brings numbering back consistently with
the indents themselves.

---

## Verifying a change

```bash
npm run typecheck   # strict TypeScript, no errors expected
npm run build       # production build
npm run verify      # 53 checks against Postgres-in-WASM — no server needed
npm run check       # 39 checks over HTTP against a running server
```

`npm run verify` covers the schema constraints, financial-year numbering, tamper
detection, the shape of the workflow, and the password gate. The gate is tested
through `checkActionPassword` — the same function the server action calls before
it will move an indent, so it is the real guard rather than a copy of it. It also
scans every `'use client'` file to prove none of them imports the password
module, which is what keeps the literal out of the browser bundle.

`npm run check` needs the app up. It fetches pages exactly as a browser would and
covers the first-run device chooser, the whole workflow, the Approve and Reject
buttons appearing only where they are legal, the confirmation message after a
decision, tamper detection, and the print facsimile. It is repeatable: each run
clears the fixture indent it created last time.

It asserts against the **visible** document, with `<script>` contents stripped
first. Next.js inlines a serialised copy of the React tree for client-side
navigation, and that copy includes segments the layout chose not to render —
without stripping it, a check can pass on text nobody can see.

It also posts the new-indent form for real — the actual server action, over
HTTP, followed by reading the row back out of the database. It does that the way
a browser with JavaScript disabled does, carrying over the `$ACTION_*` hidden
inputs Next.js renders into the form, so no generated action id is hardcoded and
it survives those ids changing on every build. The submission is dated into a
far-future financial year, so it gets its own counter and cannot take a number
out of the real sequence; the indent and that counter are deleted afterwards.

That check exists because of a bug that reached the user. Both suites were green
while the form could not be submitted at all, because neither covered the seam
between them: `formData.get()` answers `null` for a field that is no longer on
the page, and Zod's `.optional()` accepts `undefined` but rejects `null`. A field
deleted from the form therefore became a *required* field, failing under its own
name — "deptRef is required", on a form with no such box.

**One gap, stated plainly:** Approve and Reject are still proved at the function
level rather than the transport level. They live in a dialog that only exists
once JavaScript has run, so there is no no-JS form to post the way there is for
the new-indent form. That covers both the shared password and the per-person
permission: each is checked in `transitionIndent` before anything is written,
and each is tested against the function that does the checking — but neither has
been exercised by an HTTP request that skips the interface.

Attempting it by lifting the Submit bar's action fields and re-pointing them at
`action=approve` did not work; Next.js ignored the re-pointed request and simply
re-rendered the page, so it proved nothing in either direction. It is recorded
here so nobody mistakes that silence for a passing test.

---

## Layout

```
src/
├── db/schema.ts        Nine tables. The whole data model, commented.
├── lib/
│   ├── workflow.ts     Every legal transition. The state machine, ungated.
│   ├── actor.ts        The "acting as" cookie. Attribution, not authentication.
│   ├── validation.ts   Zod schemas — one rule serves the form, the server, and the types.
│   ├── indent-no.ts    Financial-year numbering and the line-tamper hash.
│   └── queries.ts      Reads. Nothing is scoped, because there are no users.
├── actions/            Server actions: indents, admin.
├── components/
│   ├── ui.tsx          The design system. Every screen is built from this file.
│   ├── app-shell.tsx   Sidebar, top bar, bottom bar. Collapse state lives in a cookie.
│   └── …               Line editor, indent table, decide buttons, acting-as picker.
└── app/
    ├── globals.css     Design tokens. One light theme, stated once.
    └── (app)/          Routes — the shell wraps everything here.

scripts/
├── seed.ts             Masters and placeholder people. Safe to re-run.
├── demo-data.ts        Sample indents in each state. Idempotent; touches only its own rows.
├── verify.ts           53 checks against Postgres-in-WASM. No server needed.
├── dev-check.ts        39 checks over HTTP against a running server.
└── local-db.ts         PGlite fallback. Unreliable — see above.

drizzle/                Generated SQL migrations.
docs/ARCHITECTURE.md    The design, and why each decision went the way it did.
```

---

## Things worth knowing

**Indent numbers are issued on submit, never on draft creation.** Otherwise every
abandoned draft would burn a number and the sequence would develop the same
silent gaps as the paper book. The counter row is locked `FOR UPDATE` inside the
submit transaction, so two people submitting in the same second queue up rather
than collide.

**Balance quantity is the department's own figure.** It is typed, not read from a
stock system, and is labelled that way everywhere it appears — including on the
printout — so nobody downstream mistakes it for a verified reading.

**Tamper detection still works without accounts.** Every transition stores a
SHA-256 hash of the line items as they stood at that instant. If a quantity
changes afterwards, the indent detail page says so in a banner. That does not
depend on knowing who anyone is.

**People are deactivated, never deleted.** Their name is on the history of every
indent they touched, and that record has to keep resolving.

---

## The interface

One light theme, defined once as CSS custom properties in `src/app/globals.css`
and consumed everywhere through Tailwind tokens — `bg-surface`, `text-muted`,
`border-line`, `bg-primary`. Changing a colour means changing one line there,
not hunting through components.

| | |
|---|---|
| Canvas / card | `#F8F9FB` / `#FFFFFF` |
| Primary | `#2563EB` — actions only, never decoration |
| State | green approved · amber waiting · red rejected |
| Text | `#111827` primary, `#6B7280` secondary |
| Type | Inter, self-hosted; IBM Plex Mono for indent numbers and quantities |
| Controls | 44px tall, 8px radius, one blue focus ring |
| Cards | 16px radius, 1px border, almost no shadow |

**It is light in a dark-mode OS too.** `color-scheme: light` on `:root` keeps
native date pickers, selects and scrollbars light. Without it those controls
render dark on a dark-mode machine, and the screen stops matching the printout.

**Components live in `src/components/ui.tsx`.** Conventions follow shadcn/ui —
`cn()` over clsx + tailwind-merge, variants as lookup maps, `className` merged
last — without taking the dependency. They wrap plain HTML elements on purpose:
the forms are server actions, they work with JavaScript disabled, and a
portalled Radix control would break that. For the same reason the selects are
native, with only the arrow restyled — it is the control every phone and screen
reader already knows.

**Status and priority are badges,** each carrying a coloured dot as well as a
tint, so state does not rest on colour alone. Every text-on-tint pairing clears
WCAG AA; the tightest is amber-800 on amber-50 at 7.4:1.

**A line names either a catalog item or a typed description — never both, never
neither.** Enforced by a database CHECK constraint, not by the UI alone.

**Print parity is intentional.** `/indents/[id]/print` is a near-facsimile of the
paper form, with the signature boxes carrying recorded names above ruled lines
and unreached stages left visibly blank. Keep printing for the first few months —
parallel running is what makes the cutover survivable.
