# Library design handoff

The home screen as a tagged library. Start with `spec.md`; it is the source of truth. Theme tokens and icon rules come from `../hero-wizard/spec.md`.

| File | What it shows |
| --- | --- |
| `spec.md` | Data (tags, saved searches, last backup), the type registry, layout, table, tags in rows, the stability rule, URL, phone layout, accessibility, acceptance checklist |
| `library-desktop.dc.html` | The library at desktop width with test-style data. Working: search, type chips, tag filter (all tags must match), clicking a tag to filter, the X on tags, adding tags, row selection with bulk Add tag / Remove tag, Save search into the rail, the stable table with Refresh |
| `library-empty.dc.html` | The empty library |
| `games-desktop.dc.html` | The Games page (reached from the header's Library | Games tabs): cards for games you run and joined games. Specified in `../game-table/spec.md` section 3 |
| `library-phone.dc.html` | The library at 390 px, with the Filters bottom sheet working |

The mockups come from a design canvas and won't run as pages on their own; `../hero-wizard/README.md` explains the format. `{{name}}` is a value from the script's `renderVals()`, `<sc-for>` repeats, `<sc-if>` shows when true, and short token names in `<style>` map to the spec's `--ui-*` and `--game-*` names. The desktop table uses ARIA table roles on divs only because of the canvas format; build it as a real `<table>`.

Item names in the mockups (Paradigm, Gravelord, and so on) are placeholders.
