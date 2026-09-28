Here's the flow of the entire event creation process.

The logged in admin clicks on Host an Event Button: Goes to event creation page

Step 1: Add logo and Banner
- Upload Logo and Upload Banner
- Add event card banner
- Suggest dimensions for each image

Step 2: Add Basic event details
- Title
- Slug
- Website URL
- Format - Online/Offline/Hybrid
- Location - If online, set online and set the field uneditable. If offline, let the creator enter Location Name, Full Address and Google Maps link (optional)

Step 3: Add event description
- Rich text editor with basic functionalities (bold, italics, underline, alignment, bullets and numbering, sub and super script, etc)
- Proper hyperlink handling - so that when the description renders on the events page, it does not contain raw URLs, instead clickable text linking to a URL

Step 4: Tracks
- Add (+) button to add tracks 
- For each added track - Title, short description

Step 5: Set Event Timeline
- Registration end (mandatory)
- Submission start, end
- Judging start, end
- Toggle to set whether public voting will be applicable or not
- If public voting is there, voting start and end time
- Result announcement date (optional)
- use shadcn date picker and date range picker

Step 6: Set participation and team rules
- Individual or Team pariticipation
- If team participation - then team size? use counter for min and max fields
- who can participate - students/professionals/open to all?

Step 7: Prizes and Rewards
- Add (+) button to add multiple tiers of rewards
- For each reward added - Title, Whether reward is monetary/in-kind/certificate. If monetary or in-kind, what is the reward amount. option to select currency
- At end, toggle to set whether participation certificate is there or not
- After certificate toggle, check box that the admin understands that the prizes amount will and participation ceritificate settings will not change once the event goes live.

1. The left portion of the window is for the above mentioned event creation steps, and the right side is the exact render of how the event will look like on the final events page.
2. 'Go Back' and 'Save and Next' and 'Save as Draft' buttons are available at each step of the event creation
3. 'Go Back' not available on first step
4. Last step shows 'Save as Draft' and 'Save and Preview' -> save as preview saves the event as draft and redirects the user to the final preview screen for the event
5. Events can be edited from the admin dashboard overview ('Edit event' button): the same wizard opens with every attribute pre-filled, footer shows 'Save and Preview' only (no 'Save as Draft', no Cancel). Draft events edit freely; live events freeze titles, rules, tracks, and prizes (only description, location, format, website, media, and future dates change), enforced in the UI and the API.

Images will be uploaded to seaweedfs and links will be saved in the postgres database
Make sure the screen with Steps on left and live preview on right is responsive and adjusts well to large as well as smaller screens. Do not show preview on mobile screens as they are much smaller that regular laptop/desktop screens. On the final preview screen, provide toggles for medium (laptop screens), small (mobile screens), large (desktop and ultrawide screens), so that user can see how the event site looks like on each device. Render the preview according to the screen size selected, defaulting to the user's current screen size (which ever of the three categories it fits in).
