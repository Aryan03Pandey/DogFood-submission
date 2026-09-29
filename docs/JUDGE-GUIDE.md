# Judge & Explorer Guide — click and play

Welcome! This portal runs hackathons end to end. You don't need anyone's
help: everything below works with the accounts listed here, and you can
also sign up as yourself. No checker, no tokens, no config files — just
the browser.

Base URL (local): `http://localhost:3000` — swap in the public link if
you were given one.

## 1. Accounts you can use

Every seeded account shares one password:

> **`DogfoodLocal1!`**

| Email | Global role | What they can do |
|---|---|---|
| `admin@local` | SUPERADMIN | Everything: create events, manage all events, delete events |
| `organizer@local` | PARTICIPANT (+ ORGANIZER of Dogfood 2026) | Run the Dogfood 2026 event: edit it, invite judges, assign, publish, export |
| `judge1@local` | PARTICIPANT (+ JUDGE of Dogfood 2026) | Score assigned submissions in the judge workspace |
| `participant@local` | PARTICIPANT | Register, join/create a team, submit a project, vote |

Log in at `/login`. Your menu (avatar, top right) adapts to your roles:
participants see My Hackathons / My Projects, judges see Judge
Dashboard, organizers see Organizer Dashboard.

## 2. Explore as yourself (sign up)

1. Open `/signup`, create an account with your own email.
2. You land as a plain participant: browse `/hackathons`, open an
   event, **Register** (creates your team — you're captain), or join a
   team with an invite code at `/invite`.
3. To taste other roles, ask the admin (`admin@local`) to add you:
   console → event → Settings → members → assign ORGANIZER or JUDGE.
   Your avatar menu updates immediately — no re-login needed.

## 3. Create an event (admin)

Only superadmins can create events, so log in as `admin@local`:

1. Navbar → **Host an Event** (or `/console/events/new`).
2. Walk the 7 steps: basics (title auto-fills the slug — shown, editable,
   locked after creation), description (rich text), media (upload a logo),
   timeline (past dates are blocked — pick future dates), tracks, rules,
   prizes (try zero prizes: allowed, with a lock-in checkbox).
3. Errors appear only when you try to continue — nothing scolds early.
4. Back in `/console`, pick your event in the top search → Overview →
   **Review & publish** → Settings tab → **Go live** (asks your
   password). The event opens for registration on its schedule.

## 4. Participate in an event (participant)

Log in as `participant@local` (or your own signup):

1. `/hackathons` → open **Dogfood 2026** → **Register**. Name your team.
2. Avatar → **My Hackathons** shows only events you joined (not the
   whole catalog); **My Projects** shows only your work.
3. Team page (`/hackathons/<slug>/team`): rename the team (notice the
   invite code does *not* change), copy the invite code and open it in
   an incognito window to see the join flow, try leaving (last-member
   warning appears; leaving as the last member unregisters you —
   re-register to come back).
4. Submit: `/hackathons/<slug>/submit` — save a trackless draft, then
   finalize with a track, repo URL, and an asset.
5. Gallery: `/projects` — your finalized project appears (paginated,
   whole cards clickable). Drafts never leak here.

## 5. Manage and edit an event (organizer)

Log in as `organizer@local` → avatar → **Organizer Dashboard**:

1. Top search → pick **Dogfood 2026**. Overview shows live metrics;
   stat cards jump to their tabs.
2. **Edit event** (green button, top): same wizard, now editing.
   Titles/rules/tracks/prizes freeze once live — try it, the inputs
   disable with an explanation.
3. **Participants tab**: add someone as organizer — try adding a
   participant and watch it refuse (staffing and hacking are mutually
   exclusive). Remove members (never yourself).
4. **Submissions tab**: search/filter, hide a submission (it vanishes
   from the gallery), export CSVs.
5. **Settings tab**: webhooks (register a test URL, send a test ping),
   danger zone — note there is *no* delete button: only admins can
   delete events (log in as `admin@local` to see it, password
   confirmed).

## 6. Judge (the core loop)

Someone must invite you as judge first (admin/organizer: console →
Judging tab → invite by email), then **Generate assignments**:

1. Avatar → **Judge Dashboard** (`/judge`) — your queue, progress
   bars, nothing belonging to other judges.
2. Open an assignment: submission artifacts on one side, rubric
   inputs on the other. Drafts auto-save; submit when ready.
3. Try the isolation yourself: change the URL to another judge's
   scores (`/api/judge/scores?judge=<someone-else's-id>`) — you'll get
   403. Hiding buttons is not access control here; the backend refuses.
4. Raise a **flag** (plagiarism/off-topic/…) on one assignment — it's
   visible only to you until results publish.
5. Back as organizer, open the Judging tab: per-judge progress,
   rankings under each normalization column (raw, z-score, min-max,
   trimmed mean — see `docs/NORMALIZATION-PROOF.md` for what each
   means), full CSV export.

## 7. Vote and comment (community)

During the voting window: event page → **Vote**. Ballot order is
shuffled per session (reload to see it change); blind mode hides live
counts. Try quadratic voting if enabled — extra votes cost the square.
Comment on any finalized submission; organizers can hide comments
(the thread stays readable).

## 8. Handy pages

- `/settings` — profile, password change (needs current password),
  appearance, sessions, API tokens (`dfk_…` for scripts).
- `/api/docs` — interactive API reference (every button in the UI
  maps to an endpoint here).
- `/verify` — paste a signed envelope to verify results offline.

## Troubleshooting

- **Login loops / "session expired"**: sessions last 7 days — just log
  in again. Seeded passwords never change.
- **Empty judge queue**: nobody generated assignments for you yet —
  ask the organizer (step 6 intro).
- **"You don't manage this event"** in the console: you're logged in
  as a non-organizer. Switch accounts or get added in Settings →
  members.
- **Can't find Host an Event**: only superadmins see it. Log in as
  `admin@local`.
