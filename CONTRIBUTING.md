# Adding or updating a session

Every event the chapter runs gets its own folder under `sessions/`, grouped by term. The folder holds everything about that event: the details, the slides, and what happened.

## Create a new session

1. **Find or create the term folder.** Use `YYYY-term`, for example `2026-fall`, `2027-winter`, or `2027-summer`.

   ```bash
   mkdir -p sessions/2027-winter
   ```

2. **Pick the session folder name.** Date first, then a short name in lowercase with dashes:

   ```
   YYYY-MM-DD-short-name
   ```

   Examples: `2026-10-14-code-jam`, `2026-11-20-cloud-study-jam`.

   If the date is not set yet, use `TBD-short-name` and rename the folder once it is.

3. **Copy the template:**

   ```bash
   cp -r templates/session sessions/2026-fall/2026-10-14-code-jam
   ```

4. **Fill in `README.md`** in the new folder. Replace every `_TBD_` you can and leave the rest.

5. **Add a row** to the table in [`sessions/README.md`](sessions/README.md). Keep it sorted newest first.

6. **Check the layout, then open a pull request:**

   ```bash
   scripts/check-sessions.sh
   git checkout -b add-2026-10-14-code-jam
   git add sessions/
   git commit -m "Add 2026-10-14 code jam"
   git push -u origin add-2026-10-14-code-jam
   gh pr create --fill
   ```

   The same check runs automatically on every pull request, along with a check for broken links between files. The organizers review and merge.

## Update a session

Edit the files in its folder directly. The things that change most often:

- **Status** at the top of the session `README.md`, and the matching cell in `sessions/README.md`
- **Checklist** items as they get done
- **Links** once the event listing, Canva design, or recording exists

## Status values

Use one of these so the index table stays readable:

| Status | Meaning |
|---|---|
| Idea | Proposed, nothing booked |
| Planning | Date chosen, work in progress |
| Awaiting approval | Submitted to SSF, or waiting on a venue |
| Confirmed | Approved, room booked, listing live |
| Done | Event happened, recap pending |
| Recapped | `recap.md` filled in |
| Canceled | Not happening. Keep the folder and note why. |

## Slides

- Write slide text and speaker notes in `deck.md` first, so the wording can be reviewed before anyone builds slides.
- Name the finished slides after the session folder, for example `2026-10-14-code-jam.pptx`, and commit that file into the session folder.
- Only commit the final `.pptx`. Keep build scripts, logo files, and exports out of the repo.
- If you polish the slides in Canva, paste the Canva link into the session `README.md`.
- If you replace the slides, overwrite the same file instead of adding `-v2` or `-final`. Git keeps the old versions.

## After the event

Fill in `recap.md` within a week, while people still remember. Attendance numbers and what to change next time matter most. Then set the status to Recapped.

## Keep it shareable

Do not commit personal contact details, budgets, or private Drive links. See "What does not go in this repo" in the main [README](README.md).
