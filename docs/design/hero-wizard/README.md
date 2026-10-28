# Hero wizard design handoff

Design for the new hero create and edit flow. Start with `spec.md`; it is the source of truth. The mockup files show what it looks like.

| File | What it shows |
| --- | --- |
| `spec.md` | The full spec: theme tokens, icon rules, drafts, wizard shell, step anatomy, every step, special archetypes, edit mode, acceptance checklist |
| `wizard-desktop.dc.html` | Desktop wizard (1440 px). Interactive states for Start, Background (Guided roll of 7 and 3) and Archetype with Divided, including the live form split, rail sub-steps, issue box and sheet preview |
| `wizard-phone.dc.html` | Phone width (390 px), Archetype step: step header that opens the step list as a bottom sheet, sticky footer with Preview, preview as a bottom sheet |
| `edit-summary.dc.html` | Edit mode summary for the example hero (Maya Reyes): one row per step with icons, Change buttons, Revert changes with confirmation |

## Reading the mockup files

They come from a design canvas and won't run as pages on their own.

- The markup is HTML. `{{name}}` is a value from the component's `renderVals()`; `<sc-for>` repeats; `<sc-if>` shows when true.
- The script at the bottom of each file holds the mock state and sample data. It's there to show behavior, not to copy.
- Styles are in the `<style>` block at the top. Token names there are short (`--accent`, `--g`); the spec's names (`--ui-accent`, `--game-green`) are the ones to use in the app.
- Icons point at the app's own `/icons/die/*.png` and `/icons/action/*.png`. In the app, use `DieIcon`, `ActionIcon` and `AbilityText` instead of raw `<img>` tags.
- Each file has a Light/Dark switch in its header so both themes can be checked in one place. In the app, theming uses the existing System / Light / Dark setting.

Where the mockup and the spec differ, follow the spec. Known differences:

- At medium widths the desktop mockup stacks the preview under the step; the spec uses a slide-over drawer.
- Dice sizes, principles and option text in the mockups are placeholders; real values come from the rules data.
