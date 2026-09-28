1. User avatar -> click -> My Hackathon -> click
- Takes to the /hackathons route and shows all available hackathons instead of the hackathons that the user is registered in
- Should be taken to /my-hackathons page and shown only list of those hackathons which I am currently participating in , or have participated in the past

2. User avatar -> click -> My Projects -> click
- Takees to the gallery page, and shows all available projects
- Should be showing list of projects that I have made in previous hackathons. Clicking on a project card should take me to project page where I can see my submission (including assets and other details) -> eventually be able to reach to the event that this submission is for

3. Create Account settings page -> link to user avatar dropdown

4. Projects Gallery
- Each project card should be a clickable card -> click -> go to project page to explore the project (same as discussed above)
- the gallery should be paginated with 30 projects per page

5. Bug:
- Registered for hackathon by creating team (I am captain now), I am single member in team -> left team -> back to event page -> Action button showing Manage team instead of Register

6. Team management page
- Show warning to last member leaving the team
- Confirm a member (last or otherwise) before leaving a team - no password required for this

7. Bug:
- When changing team name, the Generate New Code button flashes (and looks like new team code is being generated). Confirm if this is the case (UI update is still the issue). New code should not be generated for name change

8. Bug: Team management page
- Click cancel team -> then click Submit team
- UI shows both text fields for enter password (one for cancel and one for submit)
- One action should override the UI of the other.
- Expected -> click on cancel (password field and confirm button appears) -> click on submit (cancel password and confirm disappears, submit team password and confirm fields appear)

9. Make the login and signup page UI consistent with the rest of the site

10. Organizer dashboard:
- Event settings -> able to add a participant of the event to the organizers team (should not be possible)
- For an organizer, only those projects should be shown in the event selection dropdown in the organizers dashboard that he is a part of the organizers team. An organizer should not be able to access and make changes to any event that he is not part of, on both UI and API level.
- Only admin can delete an event, not an organizer

11. Implement full event CSV export -> separate sheet for various purpose, single CSV document. Use the memory efficient CSV creation algorithm already implemented

12. Remove the Analytics tab from the organizers dashboard

13. Bug: Event creation: Warnings are shown early (shows title cannot be empty as soon as I move to the basic details step, handle gracefully)

14. Event creation - assign slug automatically - no need to enter (show in the UI there)

15. Selecting Past dates on calendar during event creation/editing should not be possible

16. Remove the constraint - atleast one prize to be added - an event can have no prizes

17. Organizers dashboard overview tab - event in draft Stage - Review & Publish button not working

18. Make Edit event button noticable and prominent, change its possible to the top (along with go live)
19. Add Edit Event button to Event Settings tab as well
20. Organizers Dashboard -> make sure all numbers/metrics shown on the dashboard are correctly fetched and displayed
21. Events Page -> make sure website link and links in the description should be clickable