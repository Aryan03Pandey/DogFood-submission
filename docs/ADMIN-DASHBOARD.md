Dashboard route: /console?eventId=…&tab=…

Top Dock:
left - Current active tab
middle - search bar to search and select from a list of all events. Show details like event name, stage, draft or public, etc in the dropdown card for each event. Selecting an event populates the dashboard below; /console/events/[id] redirects here.

Left dock:
fixed (non-collapsible) and sticky beside the content column. Both the dock
and the tab content are at least the screen height minus the navbar and top
dock. Sections mirror the admin-console mock (Workspace / Manage, system
health, signed-in user).

0. Total live events - shows current number of total live events

1. Overview - Shows overview of the event
- Status - Draft/Online
- Go to event page
- Edit event (opens the pre-filled editor; live events freeze titles, rules, tracks, and prizes)
- Event timeline (highlight which stage is currently active)
- Total Participants
- Review Progress - How many projects for this event have been reviewed by the judges
- Community Votes - How many community votes have been cast for this event
- Submission Activity - plots the submission activity for the last 14 days
- Recent submissions - latest projects across all tracks

2. Participants
- Participants Table - Shows list of participants, their email, team-name/individual-participation, sortable on every field
- Search bar - search in participants table with for participant name, team-name, participant email,
- Shortlist candidates button - goes to the shortlist candidates route (empty for now)
- Export to CSV button

3. Submissions
- Submissions table - shows submissions per team/(or individual if participation is individual), submission status (draft/final), and all other attributes of a submission; paginated (10 per page) with search plus status and track filters
- Export to CSV button

4. Judging - Leave empty for now
5. Gallery 
- list all projects which are otherwise available in the gallery
- option to hide a project from gallery

6. Event Settings
- Delete the event (needs your password)
- Go live button if event is draft (needs your password plus registration end, submission end, and judging end); go-live moves the event to REGISTRATION and onto the live list. The event preview page shows full details and carries the same button.
- Edit members - add users as organizers, judges, or (superadmins only) admins; event editing lives in a separate window
- Export as CSV - Button to export everything as a CSV (logic to be written later). Button does nothing now.


