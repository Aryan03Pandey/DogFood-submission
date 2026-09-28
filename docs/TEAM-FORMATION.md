Event Page - Action Button -> click

Case 1: Event has team participation
Click -> Pop-up -> contains two cards - Create a Team, Join a Team

Create a Team -> click -> Manage Team page
- Enter Team Name (or edit team name if already entered)
- Create invitation code -> copy (let the user copy invitation code if already created)
- Cancel Team button -> click -> warning -> password
- Teammates (current size/max size) 
- message (team complete/team incomplete, add ? more members to complete)
- show list of team mates with captain being on top
1. Member 1 (name and email) (captain) (Me)          Leave
2. Member 2 (name and email)                         Make captain | Remove
3. Member 3 (name and email)                         Make captain | Remove

4. Submit Team button

if captain leaves, the ownership transfers to a random teammate
team code hashed cryptographically

Join a team -> click -> Manage Team Page
- Enter Invitation Code -> submit -> valid (joins team) or invalid (error and enter again)
- Cannot create invitation code
- Cannot cancel team
- Teammates (current number / max number)
- message (team complete/team incomplete)
- show list of team mates with captain being on top
1. Member 1 (name and email) (captain)
2. Member 2 (name and email) (Me)           Leave
3. Member 3 (name and email)


Case 2: Event has Individual participation
Click -> Registered -> Show Message (Registration Successful) -> Action Button state changes to (Registered, check status) -> click -> Manage Team Page -> No Team Name, 'Cancel Registration' button -> click -> warning -> password -> registration canceled -> redirected to event screen, list of members (which is the individual itself)

Implementation notes (decided during build, flow above unchanged)
- Ownership transfer goes to the longest-tenured MEMBER (deterministic and auditable) instead of a random teammate; last member out deletes the team.
- Invite codes are stored sha256-hashed and cannot be read back: the plaintext shows once after create/rotate (with copy buttons for code and `/invite?token=` link). Leaders see an "expired, generate new" notice only for themselves when the code lapses; members never see code UI.
- Fresh codes carry a 7-day TTL (`invite_expires_at`); legacy rows with null expiry never expire. Joins are rate-limited to 5/min per user+event.
- Roster freezes when the team locks on submit or global `registration_end` passes (`isLocked` set opportunistically, evaluated live); joins/leaves/kicks/transfers/renames 409 while frozen; exactly one LEADER is also a partial unique index.
- Cancel Registration (individual) and Cancel Team (leader) both need the password; unregistering while on a team 409s with IN_TEAM.
- Choice comes before registration: the Create/Join popup opens first and each card registers the viewer then navigates; closing it cancels without registering.
- Submit Team is leader-only and password-confirmed inline ("Finalize team and submit — this action is not reversible"), needs a complete roster, and locks `isLocked`; members never see the button, and member submits 403. Submitted teams render read-only ("Team locked and submitted"); only Cancel Team stays, and cancelling unregisters every member from the event.


Action Button States on event page:
Event in registration phase 
1. User not registered -> Register
2. User registered, event has individual participation -> Registered, Check Status -> manage team page -> Case 2 above
3. User registered, event has team participation
a. Team complete (min team size <= current size <= max team size) -> Team Complete, Check status (Green button) -> Manage Team page Case 1 above
b. Team incomplete (current size < min team size) -> Team Incomplete, Check Status (Red button) -> Manage Team page Case 2 above
Event in any other phase -> current logic

