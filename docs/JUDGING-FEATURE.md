Judging feature implementation details:

Admin/Organizer Dashboard:
Judging section:
1. Option to add multiple judges for the event and remove added judges.
- Search and select from the existing list of users in the database
- A participant of the same event can't be added as a judge

2. Add judging rubriks
- Add multiple judging rubriks
- Add min and max score for each rubrik
- Select float/int scores for each rubrik (if float selected, let the user select step size (min step size is 0.01 max is 1))
- Add weights for each rubrik

3. Select judge assignment algorithm
- * **Round-Robin Assignment:** Equal distribution of projects across registered judges.
- * **Load-Balanced $k$-Cover Assignment:** Guarantees each project receives a minimum of $k$ reviews while balancing judge queue lengths.
- * **Conflict-of-Interest Filter:** Blocks judges from viewing or scoring projects from their own team or organization.

If a judge is removed after project assignment, their assigned submissions are assigned via the same selected algorithm to other judges.

4. Select score normalization algorithm
- * **Raw Weighted Mean:** Standard weighted sum of rubric criteria.
- * **Z-Score Normalization:** Standardizes individual judge scoring distributions:
  $$Z_{ij} = \frac{x_{ij} - \mu_j}{\sigma_j}$$
- * **Min-Max Rescaling:** Adjusts individual judge score bounds to a normalized $[0, 100]$ scale.
- * **Trimmed Mean:** Trims maximum and minimum score extremes for submissions with $\ge 5$ reviews.

4. Toggle - * **Double-Blind Mode:** Toggleable masking of participant identities on judge payload requests. Judges would not see the team and member details of their assigned submissions
5. Button to export judging data as CSV (which projects are assigned to who, raw scores, judge progress, normalized rankings, etc. basically all judging related data that the admin can request)


Judge Dashboard:
When a user signs in and clicks on their profile icon, they should see option "Judge Dashboard" if they are part of any event as a judge. if not, they simply do not see this option. This rule gets enforced at both UI , API and DB level.
Judge Dashboard -> click -> goes to judge dashboard

The judge dashboard screen is divided into three columns:
Column 1: 
- list of all assigned projects and status (scored/not scored). 
- Clicking on a project should open that submission in the Column 2

Column 2:
- Team details (if double-blind is off and team details are available to the judge)
- Submission details - all text fields, Images in a gallary (click to expand), PPTs and PDFs in a embedded iframe (click to open in new tab -> opens in new browser tab)
- If any videos submitted -> play video in embedded iframe.

Column 3:
- List all rules of scoring
- All rubriks listed and fields to enter their scores
- Add comments
- Action buttons - Save (saves the score of the assignment by the judge (error if any empty/invalid score for a rubrik)), Clear (clears the score for the current session as well as any previously saved scores (show warning)), Flag submission (Select reason for flagging, add comment, and then flag)

- The Column two should be occupying more width than column 1 and 3 for easy viewing of the submission.
- Column 1 and 3 should be scrollable as they can be very long. Column 2 should not be scrollable and has the height needed for the content.
- All scoring rules should be enforced in the form UI as well as API.
- **Query-Level Scoping:** Judges can fetch only submission records matching active assignment IDs in the database.
- **Score Isolation:** Scores remain invisible across judges until public results are published.
- Judges are not able to see the scores of other judges. Enforced at API level
