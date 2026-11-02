# Library (home screen) spec

The home screen becomes the **library**: one table of everything the user has made, organized by **tags**. A GM tags villains and other items by scene while prepping ("scene-3") and pulls them up by that tag at the table. A player tags heroes by game, group, or whatever suits them. **Tags have no built-in meaning.** The app never treats any tag specially.

This replaces the current home page (`Home.tsx`, `HeroList.tsx`, `VillainList.tsx`) and its In progress group. The wizard spec's "Main menu" item 5 and its acceptance line about In progress are superseded: drafts are now library rows (see Drafts).

Theme tokens, fonts, icons and dice rules come from `../hero-wizard/spec.md`. Mockups are listed in `README.md`. Where a mockup and this spec differ, follow the spec.

**Not in scope:** pulling library items into a running game (the GM table, designed later; see "Hooks for later"), sharing items with other users, and new content types. Build the table so new types plug in.

## 1. Data

### Tags on every item

- Every library document (hero, villain, and each future type) gets `tags: string[]`, saved inside the document's envelope. Bump the envelope version and read old documents as `tags: []`.
- Tags belong to the item. They go wherever the item goes: backups, single-item and multi-item exports, imports, and later sharing. Import keeps the tags in the file.
- **Normalizing:** trim and collapse inner whitespace. An empty tag is rejected. 40 characters at most.
- **Case:** matching and uniqueness ignore case; display keeps the spelling typed. An item can't hold two tags that differ only in case. Adding "Scene-3" to an item that has "scene-3" does nothing.
- **Spelling across items:** when the user picks an existing tag from suggestions, use that tag's existing spelling. When they type a tag that matches an existing one case-insensitively and press Enter, also use the existing spelling.
- Changing tags is a change to the document: it updates `updatedAt` and autosaves. During a wizard edit session, a tag change made elsewhere is not undone by Revert changes. Tags are outside the edit snapshot.
- There is no tag registry. "All tags" is always the union of tags on current items, so a tag disappears when the last item using it loses it. There is no rename or merge feature.

### Saved searches

- A new object store, `savedSearches` (DB version 4), holding `{ id, name, query: { text: string, types: string[], tags: string[] }, createdAt }` in the usual versioned envelope.
- **Names:** 1–60 characters after trimming. They must be unique, ignoring case. A duplicate shows an inline error and doesn't save.
- Saved searches are included in "Back up everything" and restored by importing a backup. Single-item exports don't include them.

### Last backup

- Store `lastBackupAt` (ISO time) in localStorage, guarded like the session store. Set it when "Back up everything" finishes the download.
- "Changed since" is computed, not stored: the number of library items with `updatedAt > lastBackupAt`.

## 2. Library types

The table is built from a small registry so new types plug in without touching the table. For each type:

| Field | Hero | Villain |
| --- | --- | --- |
| `key`, label, plural | `hero`, Hero, Heroes | `villain`, Villain, Villains |
| Store | `heroes` | `villains` |
| Details text | Archetype · power source ("Speedster · Accident"); special archetypes as now ("Divided Speedster") | Archetype and category as now ("Bully Overlord · Major") |
| In games | Games the hero is in, from the games store (see "In games" below) | Same |
| Draft | `status: 'draft'`. Details become "Step N of 8 · <step name>" | Same, with the villain wizard's step count |
| Open (row name, ⋯ Open) | `#/hero/:id` | `#/villain/:id` |
| Primary action | Play `#/hero/:id/play` (the hero's solo game, see `../game-table/spec.md` section 12); drafts Continue to the furthest step | Play (the villain's solo game); drafts Continue |
| Edit | `#/hero/:id/edit` | villain wizard |
| Can create (New menu) | yes | yes |

**Games are not library rows.** They have their own **Games** page, reached from header tabs (Library | Games), described in `../game-table/spec.md` section 3. The library's type chips and New menu don't include games.

**Library documents are sheets only** (`../game-table/spec.md` section 1). Rows show nothing from play: no zone, no Health.

**In games:** for a hero or villain, the games (not solo games) holding a copy of it, by name, each a link that opens the game. Show up to two names, then "+2 more". Show "—" when none. It's found by the copy's `sourceId`. A player's cached joined games count, so a player sees "Thursday game" on Maya Reyes.

Minions: include them only if they are standalone documents a user opens on their own. Minions that belong to a hero stay on the hero. Code decides from the minion model and says which it chose.

## 3. Page layout (desktop and tablet, 760 px and up)

See `library-desktop.dc.html`.

**Header bar** (across the page): "SCRPG Aid", then the section tabs **Library** and **Games** (with a count), as links with `aria-current="page"` on the current one, then on the right:

- **Play together**, a button opening a popover:
  - Not in a game: Host a game as GM, Join a game, and, when there's a last game, "Last game: K7QX-2M, 3 days ago · Rejoin".
  - Hosting: "You're hosting K7QX-2M · 3 players connected", Return to table.
  - Joined as a player: "You're in K7QX-2M as Maya Reyes", Play Maya Reyes, Leave game.
  - While in a game, the button itself reads "In game · K7QX-2M" so the state is visible without opening it.
- **Data**, a button opening a menu:
  - a line "Saved in this browser only. Last backup 19 days ago; 3 items changed since." (or "Never backed up")
  - Back up everything
  - Import from a file…
  - Add an example hero

  When there are items and the last backup is never or more than 14 days old, and at least one item changed since, the button shows a small accent dot. Its accessible name becomes "Data: backup reminder".
- **The color scheme switch,** as now.

**Left rail** (200 px; stacks above the content under 760 px, but phones use the phone layout below):

- **All**, with the total item count.
- A "Saved searches" label, then each saved search with its live count (counted against current data, not the table snapshot). Each has a ⋯ button with Rename and Delete; delete asks for confirmation. In the empty state, a one-line hint: "Filter the library by type and tags, then save the search to find it here."
- The current view has `aria-current="page"` and the accent-soft background. When filters are changed after opening a saved search, no rail item is current and the title becomes "Search results".

**Content column:**

1. **Title row:** the view's name as the page `h1` ("All", the saved search's name, or "Search results"), then **New ▾** (primary button) with one item per type that can be created.
2. **Filter bar** (role `search`):
   - **Search by name:** a case-insensitive substring match, applied as you type (debounced about 150 ms).
   - **Type chips**, one per type that has at least one item, as toggle buttons (`aria-pressed`). Several selected types means any of them; none selected means all types.
   - **Active tag filters** as accent chips, each with an X ("Remove tag filter scene-3").
   - **+ Tag** opens a popover: "Shows items that have every tag you pick", then every tag alphabetically, each with a checkbox and its item count. A filter field appears at the top once there are more than 10 tags. Checking a box applies it immediately.
   - When any filter is on: **Clear**, then on the right **Save search**. Save search swaps for an inline name field, prefilled with the tags joined by " + " (or the types, or "My search"), plus Save and Cancel. Enter saves, Escape cancels. After saving, the new search is the current view and the button reads "Saved" (disabled) until the filters change.
   - **Tag matching:** an item must have **every** selected tag. Search, types and tags combine with AND. There is no OR and no exclusion.
3. **Selection bar:** replaces the filter bar while one or more rows are checked.
   - It shows "3 selected", then:
     - **Add tag:** a popover like the row's add-tag popover. It applies to every selected item and skips items that already have the tag.
     - **Remove tag:** a popover listing only tags on the selected items, each with "2 of 3".
     - **Export:** one file with the selected items, in the backup format.
     - **Delete…:** a confirmation naming the count and up to five names.
     - **Clear selection,** on the right.
   - Escape clears the selection. Changing the view (filters, saved search, All) clears it too. Tag edits don't.
4. **The table.**
5. **Footer line:** "10 items", or "Showing 3 of 10" when filtered. When some shown rows no longer match the filters: " · 1 item no longer matches. Refresh". On the right, a hint: "Click a tag in the table to filter by it." A polite live region announces the shown count after each refresh.

## 4. The table

Use a real `<table>` (the mockup uses ARIA roles on divs only because of the canvas format). It scrolls horizontally inside its box below about 1040 px rather than squeezing columns.

| Column | Width | Content |
| --- | --- | --- |
| Select | 44 px | Checkbox "Select Maya Reyes". The header checkbox is "Select all shown", indeterminate when some are selected |
| Name | flexible | The name links to Open. Drafts add a "DRAFT" badge (dashed muted border, small caps) and "Unnamed hero" in muted italics until named |
| Type | 80 px | The type label |
| Details | flexible, ellipsis | The type's details text. Rule issues add "3 rule issues" in `--ui-danger` on a second line, linking to the edit summary |
| In games | 150 px | Game names as links, one per line, ellipsis when long, up to two then "+N more". "—" when none |
| Tags | flexible | Tag chips, then a dashed **+** button (see Tags in a row) |
| Changed | 110 px | Relative time ("2 hours ago", "Yesterday", "Last week"), with the full date in `title` |
| Actions | 128 px | The primary action as a small button (Play, or Continue for drafts), then ⋯ "More actions for Maya Reyes": Open, Edit, Duplicate, Export, Delete… |

- **Sorting:** the Name, Type and Changed headers are sort buttons with `aria-sort`. Changed descending is the default. Clicking the current sort column flips the direction. Sorting reorders the rows already shown and doesn't re-filter. The sort isn't stored in saved searches.
- **Duplicate:** copies the item with a new id, "<name> (copy)", the same tags, and no play state or history. If the app has no duplicate yet, add it.
- **Delete…:** the same confirmation as now. The row leaves the table right away, since there's nothing left to show. Undo isn't required.

### Tags in a row

- Each tag is a chip with two buttons:
  - **The name** adds that tag to the tag filter ("Filter by scene-3"). Chips for tags already in the filter use the accent style.
  - **The X** is **always visible** and removes the tag from this item. Its accessible name is "Remove scene-3 from Gravelord". The X is 20 px wide on desktop and 28 px on phones.
- **The + button** ("Add a tag to Gravelord") opens a popover anchored to the cell:
  - a text field, focused, then up to six suggestions: existing tags containing the text and not already on the item, alphabetical
  - "Create tag "<text>"" when the text doesn't match any existing tag, ignoring case
  - Enter picks the first suggestion, or creates the tag if there's none. Escape closes and returns focus to +.
  - The popover closes after adding.
- Tags wrap within the cell. Rows grow taller rather than hiding tags.

### Stability: the table changes only when the view does

The rows shown are a **snapshot**, taken when the view is set up. Edits to items never add or remove rows by themselves. In particular:

- Removing a tag that the current filter needs keeps the row in place. It looks no different from other rows.
- Adding a tag that would make an outside item match doesn't bring it in.
- Renaming or editing an item updates its row in place, but the row stays even if the name no longer matches the search.

The snapshot is retaken only when:

- the search text, a type chip or a tag filter changes
- a saved search or All is picked
- the user presses **Refresh** in the footer
- the library page is opened again (navigating back to it, or a reload)
- an import finishes (the new items appear)
- a new item is created from New (the user leaves the page anyway)

Deleted items leave immediately. Rows otherwise update their content (name, tags, In games, Changed) live.

The footer counts shown rows that no longer match ("1 item no longer matches") and offers Refresh. Nothing in the row itself marks it.

### Empty states

- **Empty library** (`library-empty.dc.html`): the table area becomes a panel: "Your library is empty", a sentence about tags, then New hero (primary), New villain, Add an example hero, Import from a file…, and a line pointing to Play together for joining a game.
- **No matches:** a row-wide message: "Nothing matches". With tag filters: "Nothing has all of these tags: scene-3, prep. Remove a tag to widen the search." Otherwise: "No names match your search." Add a Clear filters button.

## 5. Tags on an item's own page

On the hero Sheet and the villain sheet, put a tag row under the header (Sheet mode only, not Play or print), using the same chips with X and the same + popover. Clicking a tag name there opens the library filtered by that tag.

## 6. URL

The view lives in the hash so Back, reload and links work:

- `#/` for All
- `#/?s=<savedSearchId>` for a saved search
- `#/?q=<text>&type=hero,villain&tag=scene-3&tag=prep` for unsaved filters

Changing filters replaces the history entry (no new entry per keystroke). Picking a saved search or All pushes one.

## 7. Phone (under 760 px)

See `library-phone.dc.html`.

- **Header:** "SCRPG Aid", then icon buttons for Play together (the same popover, as a bottom sheet) and a menu holding Data's items and the color scheme. Under the bar, a two-item tab row: Library and Games.
- **View name** as a large button ("Scene 3 ▾") opening a bottom sheet with All and the saved searches, each with its count. Beside it, **New**.
- **Search field and Filters button.** The button shows the count of active type and tag filters. It opens a bottom sheet with Clear, the Type chips, the tag checklist ("items must have every tag you pick"), Save search, and a primary "Show N" that closes the sheet.
- **Active tag filters** as removable chips under the search.
- **Rows:**
  - the name (with DRAFT badge) and "Type · details"
  - a line with "In Thursday game" (when in any) and the tags (each tag with its X)
  - on the right, the primary action and ⋯
  - Tapping a tag name is not a filter shortcut on phones; use Filters.
- **Selecting:** press and hold a row to enter selection mode. Checkboxes appear and a bottom bar shows "N selected" with Add tag, Remove tag, Export, Delete and Cancel. The ⋯ menu also has "Select" as the non-gesture way in.
- The stability rule and footer Refresh are the same as on desktop.

## 8. Accessibility

- Every popover is a dialog or menu with focus moved in on open and returned to its trigger on close. Escape closes it. Opening one closes any other.
- Tag checkboxes in the + Tag popover are real checkboxes, or `menuitemcheckbox` with `aria-checked`.
- Every icon-only button has an accessible name that includes the item ("More actions for Gravelord", "Remove prep from Rust Hound").
- Touch targets are at least 44 px on phones. On desktop, the 26 px tag chips are acceptable because each one sits next to larger controls, and every tag action is also reachable another way: Filters, and the bulk bar.
- Text contrast follows the tokens. The tag chips' 13 px text uses `--ui-text` on `--ui-surface-2`.

## 9. Hooks for later

- **GM table:** "add everything tagged scene-3" will call the same filter function with a query (`{ text, types, tags }`) or a saved search id. Keep filtering in a pure module (for example `library/query.ts`) with tests, separate from the React table.
- **Sharing:** tags already travel with items. Nothing else is needed now.
- **New types:** add a registry entry. The type chips, New menu and Details/In games columns pick it up.

## 10. Acceptance checklist

- [ ] The home route shows the library. The old hero list, villain list and In progress group are gone.
- [ ] Heroes and villains (and drafts of both) are rows. Drafts show the DRAFT badge, their step and Continue.
- [ ] Old documents load with no tags. Tags save with the item, appear in backups and exports, and come back on import.
- [ ] Tags are trimmed, capped at 40 characters, unique per item ignoring case, and displayed as typed. Picking an existing tag reuses its spelling.
- [ ] The search, type chips and tag filter combine with AND. Several tags require all of them.
- [ ] Clicking a tag name in a row adds it to the filter. The X on a tag (always visible) removes it from that item.
- [ ] The + popover suggests existing tags, offers Create, handles Enter and Escape, and returns focus.
- [ ] Bulk Add tag and Remove tag work on the selection. Remove lists only the selection's tags with "x of n" counts. Export and Delete work on the selection.
- [ ] The table doesn't re-filter on tag or item edits. It re-filters only on the events listed under Stability. The footer shows "N items no longer match" with Refresh.
- [ ] Save search names the current filters, rejects duplicate names, and appears in the rail with a live count. Rename and Delete work. A backup includes saved searches.
- [ ] Sorting by Name, Type and Changed works, with `aria-sort`.
- [ ] Rows show no play state. In games lists the games holding a copy, linked. Games aren't rows; the header tabs switch between Library and Games.
- [ ] Play together shows the right contents for no game, hosting and joined, and the button shows "In game · code" while in one.
- [ ] Data holds backup, import and the example hero. The reminder dot follows the 14-day rule. `lastBackupAt` updates on backup.
- [ ] The view is in the URL. Back and reload restore it.
- [ ] Phone: view sheet, Filters sheet with a "Show N" count, rows with tag X's, press-and-hold selection with the bottom bar.
- [ ] The empty library and no-matches states match the spec.
- [ ] Filtering is a pure, tested module.
