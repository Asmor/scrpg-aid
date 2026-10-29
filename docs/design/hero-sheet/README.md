# Character page design handoff

Design for the character page in both modes: Sheet (the character view and the printed PDF) and Play. Start with `spec.md`; it is the source of truth. Theme tokens and icon rules come from `../hero-wizard/spec.md`.

| File | What it shows |
| --- | --- |
| `spec.md` | The full spec: page and modes, header, Sheet sections, forms and modes, villain sheet, phone layouts, PDF, Play mode (status column, actions, ability availability, roll flow, forms and modes in Play), acceptance checklist |
| `sheet-desktop.dc.html` | Maya Reyes in Sheet mode at 1440 px. The Sheet/Play switch works: Play hides Roleplaying and shows a placeholder for the Play controls. A `showIssues` setting shows the rule-issues banner |
| `sheet-phone.dc.html` | The same sheet at 390 px, with twists behind "Show twists" |
| `print-page-1.dc.html`, `print-page-2.dc.html` | The PDF on Letter: page 1 roleplaying and mechanics, page 2 abilities |
| `forms-and-modes.dc.html` | The forms and modes section for all four special archetypes, using the test heroes' data. The switch at the top picks the archetype and is only a mockup control |
| `villain-desktop.dc.html` | The test villain (Bully Overlord) at 1440 px |
| `play-desktop.dc.html` | Maya Reyes in Play mode at 1440 px, with a working roll flow in a dialog (the spec's choice). Its mockup strip can still show the rejected docked panel for comparison, and switches between solo and online (the scene becomes read-only) |
| `play-special-archetypes.dc.html` | The Play status column for the special archetypes: the mode switcher with how abilities report what's blocked, the Divided form toggle, and the Your minions panel with Use (fixed action, or any basic action for Autonomous) |
| `play-phone.dc.html` | Play mode at 390 px: top bar, tabs, and the roll as a full-screen sheet |

## Reading the mockup files

They come from a design canvas and won't run as pages on their own; the README in `../hero-wizard/` explains the format. In short: `{{name}}` is a value from the script's `renderVals()`, `<sc-for>` repeats, `<sc-if>` shows when true, and short token names in the `<style>` block map to the spec's `--ui-*` and `--game-*` names. Icons point at the app's `/icons/die/` and `/icons/action/` paths; in the app use `DieIcon`, `ActionIcon` and `AbilityText`.

Ability text in the scripts marks effect words as `{attack}Attack`; that is mockup shorthand for where `AbilityText` puts an icon.

Where the mockups and the spec differ, follow the spec.
