# SCRPG Aid: hero wizard handoff spec

Oct 28, 2026 · @Ian

## Overview

Rebuild the hero create and edit flow as one wizard with a step rail, a live sheet preview, drafts, and an edit summary. The existing rules engine, step components and rule checks stay; this is a shell, layout and visual change, plus a new draft lifecycle.

The [wizard mockup](https://claude.ai/artifact/LLYawpSy4ZSCjQdRSpgAYx) has a desktop screen (Start, Background, and Archetype with Divided), a phone screen, and an edit summary screen. The mockup is private, so this spec is written to stand on its own; treat the mockup as the visual reference and this doc as the source of truth where they differ.

**In scope:** theme tokens, icon rules, the wizard shell, step layout, Guided rolling display, special-archetype sub-steps, drafts, edit mode, and moving Advancement out of the wizard.

**Not in scope:** View hero, Play hero, the main menu redesign (beyond the In progress group), villain creation, 3D dice, and online play. Rules data and validation logic don't change unless this doc says so.

**Typefaces:** Barlow Condensed (600, 700) for headings and step numbers, Inter (400, 500, 600) for everything else. Bundle both locally (for example the `@fontsource` packages) so the app keeps working offline; don't load them from Google Fonts at runtime.

## Theme tokens

Replace the current warm theme (orange-red headings, tan card borders, brown card fills) with these two token sets. Every color in the app comes from a token; no hex values in components.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--ui-bg` | `#F6F7FB` | `#12141C` | Page background |
| `--ui-surface` | `#FFFFFF` | `#1B1E2A` | Cards, panels, inputs |
| `--ui-surface-2` | `#EEF0F6` | `#232736` | Segmented controls, wells, dashed hand-off boxes |
| `--ui-text` | `#1A1D2B` | `#E8EAF2` | Body text |
| `--ui-muted` | `#565C70` | `#A3A9BF` | Secondary text, captions |
| `--ui-border` | `#DDE0EA` | `#2C3042` | Hairlines, card borders |
| `--ui-accent` | `#4347C9` | `#9599FF` | Links, focus, primary buttons, selected state, done checks |
| `--ui-on-accent` | `#FFFFFF` | `#12141C` | Text on `--ui-accent` |
| `--ui-accent-soft` | `#E8E9FA` | `#262A4A` | Selected option and current rail item fill |
| `--ui-danger` | `#8E2BA0` | `#D07BE0` | Rule issues, destructive actions |
| `--ui-danger-soft` | `#F6E8F8` | `#2E2236` | Issue box fill |
| `--game-green` / `--game-green-ink` | `#72CC82` / `#1A1D2B` | `#1D6E31` / `#E8EAF2` | Green zone fill / text on it |
| `--game-yellow` / `--game-yellow-ink` | `#F5D044` / `#1A1D2B` | `#E3B600` / `#12141C` | Yellow zone fill / text on it |
| `--game-red` / `--game-red-ink` | `#F28A80` / `#1A1D2B` | `#A8261F` / `#E8EAF2` | Red zone fill / text on it |

Game fill against its ink: light red 7.0:1, green 8.5:1, yellow 11.2:1; dark red 5.9:1, green 5.3:1, yellow 9.6:1. Every UI text and background pair above is at least 5.4:1, so all pass WCAG AA.

Rules:

- `--game-*` colors appear only on things the game itself colors green, yellow or red: zone bands on ability lists, status dice by zone, health ranges, the scene tracker. Nothing else, ever.
- There is no success or warning color. Success is a check icon in `--ui-accent`; warnings are an icon plus text. Errors and rule issues use `--ui-danger`.
- Text on a game fill uses that fill's `-ink` token only, never `--ui-muted`.
- A game color is never the only cue: zone bands carry their label (GREEN, YELLOW, RED), because the green and red fills are close in lightness.
- Themes: keep the existing System / Light / Dark switch. Apply light by default, dark under `@media (prefers-color-scheme: dark)` when the setting is System, and force either with `data-theme` on the root.

## Icon rules

Dice and actions are always shown as their icons wherever an image can go. Reuse `DieIcon`, `DiceList`, `DiceText`, `ActionIcon` and `AbilityText` from `src/components/icons.tsx`; they already follow these rules.

**Dice**

- Every die is `DieIcon`: `alt` and `title` are the size (`d8`).
- Write the size out (`d8`) only where an image can't go: `<option>` text, `aria-label` values, Markdown and JSON exports.
- Sizes: 24 px in dice rows, assign slots and tables; 18 px in compact lists such as the sheet preview; 16 px inline in a sentence.
- A rolled die shows its number large with the die's icon under it.

**Actions**

- In ability text, each effect word gets its action icon just before it, as `AbilityText` does. These icons are decorative (`alt=""`), because the word follows.
- Wherever an ability is listed by name (the sheet preview, ability bands, summaries), its action icons come before the name, in the order the effects appear in its text. Here each icon has `alt` and `title` set to the action's name, because the name alone doesn't say what the ability does.
- An ability with no basic-action effect (Transform, most Inherent abilities) shows no icon.

The icons are black and white and read on both themes. Don't recolor, invert or tint them.

## Drafts and the hero lifecycle

A new hero is a draft until the user clicks Finish. Add a `status` of `draft` or `complete` to the hero record; every hero saved today counts as `complete`.

1. **New hero** opens the wizard on Start with a draft held in memory. Nothing is saved yet.
2. **The first real choice** (any pick, roll or typed value) saves the draft. From then on every change autosaves. The header shows "Draft · saved just now", updated as saves land.
3. **Leaving with no choice made** discards the in-memory draft silently. No "Unnamed hero" appears in the list.
4. **Finish hero** (in the header, and on the last step's next button) sets `status` to `complete` and opens the hero's page. With open rule issues, it first shows a dialog listing them, with "Go to issue" per item and "Finish anyway", because some tables play with house rules.
5. **Main menu:** drafts appear in an "In progress" group above Your heroes, hidden when empty. Each row shows the name (or "Unnamed hero"), "Step N of 8" for the furthest step reached, and when it was last edited, with Continue and Discard buttons. Discard asks for confirmation.
6. **Drafts can't be played** and don't appear in any game's hero picker. They can be exported, and importing a draft keeps it a draft.

A complete hero edited into a state with rule issues stays complete. Its page shows a banner naming the count, with a link to the edit summary.

## Wizard shell

The wizard is a header, a step rail, the current step and a sheet preview. Keep the existing routes (`#/hero/:id/edit/:step`) and add an optional part for archetype sub-steps: `#/hero/:id/edit/archetype/:part`.

**Header:** breadcrumb (Your heroes / New hero, or the hero's name when editing), the hero's name in large type, the draft chip, a Show/Hide preview button, and Finish hero (drafts only).

**Step rail:** Start, then the eight numbered steps. Each item shows one state:

| State | Mark | When |
| --- | --- | --- |
| Not started | Hollow dot, `--ui-muted` | No choice made in the step yet |
| Done | Check, `--ui-accent` | Every required choice made and no rule issues |
| Issues | Count pill, `--ui-danger` | One or more rule issues, whatever else is filled in |
| Current | `--ui-accent-soft` fill, bold label | The step on screen; combines with any state above |

When the archetype adds parts (section Special archetypes), they appear indented under Archetype with their own marks. Clicking one opens Archetype at that part and expands it. Below the rail, a small box states the method ("Guided · rolling in the app").

**Step footer:** previous and next buttons named for their steps ("Power source", "Personality"), with next as the primary button. Next never blocks on issues.

**Sheet preview:** the View hero sheet components in a compact size, updating as choices change. Unfilled parts show in muted italics with where they come from ("Step 4"). Game colors appear here on the ability bands. Build the preview from the same components View hero will use, not a separate copy. Remember Show/Hide per device in `localStorage`, wrapped in try/catch.

**Breakpoints:**

| Width | Rail | Preview |
| --- | --- | --- |
| 1280 px and wider | 240 px column on the left | 360 px column on the right, sticky, shown by default |
| 760 to 1279 px | 220 px column on the left | Slide-over drawer from the right, opened by Show preview; closed by default |
| Under 760 px | A button reading "Step 3 of 8 · Archetype" with its issue pill, opening the step list as a bottom sheet | Bottom sheet, opened by a Preview button in a sticky footer beside the next-step button |

The mockup's desktop screen stacks the preview under the step at medium widths; the drawer in this table replaces that. Touch targets are at least 44 px under 760 px.

## Step anatomy

Every step uses the same sections in the same order, leaving out any it doesn't need. The step's title carries its number and name ("3 · Archetype"), a one-line purpose, and its Core Rules page on the right.

1. **Dice in:** the dice this step received, as icons. In Guided mode this is the roll component (below).
2. **Choose:** the option list. The chosen option has a 2 px `--ui-accent` border and `--ui-accent-soft` fill. Once chosen, special archetypes collapse the list into a single "chosen" card with a Change button.
3. **Assign:** one row per die: the die icon, then a select of what it can go on. A count under the rows reads "2 of 3 dice assigned". Swapping a die onto something the hero already has ("upgrade my Agility") is an option in that row's select, not a separate control.
4. **Abilities:** each option is a card with a checkbox, its name, type and text (with action icons). Checking it expands its slot pickers (`[power]` and so on), the optional custom name, and the filled-in text. Long lists get a "Only ones I can take" filter (on by default) and collapsible category groups showing "chosen of allowed" counts.
5. **Dice out:** a dashed box reading "Power source rolls" (or whichever step is next) followed by the dice icons.
6. **Issues:** pinned at the end of the step. With issues: a `--ui-danger` bordered box titled "N things to look at", each item a link that scrolls to and focuses the field it's about. Without: a quiet "No rule issues in this step." The rail's count matches this list.

**Guided and Constructed.** Constructed lists every option. Guided lists only the options the roll allows, each tagged with how it was reached ("Rolled 7", "Sum, 7 + 3"), and a line above reads "Showing the 3 backgrounds your roll allows." Switching method later never changes or flags existing choices.

**The roll component** is shared with play and online rolling later, so build it once:

- Each die: the rolled number large, its icon underneath.
- A Re-roll button showing what's left ("Re-roll (1 left)", then "Re-roll used"). One re-roll per phase. If a re-roll no longer allows the current choice, the choice stays and becomes an issue.
- "Enter my own roll": one number field per die, validated against the die's size.
- Reserve space for a dice animation later. With `prefers-reduced-motion`, any animation is skipped.
- The "Roll in the app" or "My own dice" choice on Start decides which of these shows first.

## Steps one by one

The steps keep their current content and rule checks; this table says which anatomy sections each one uses. Dice sizes, option lists and limits come from the existing rules data.

| Step | Dice in | Choose | Assign | Abilities | Dice out |
| --- | --- | --- | --- | --- | --- |
| Start | — | Guided or Constructed; in Guided, roll in the app or my own dice | — | — | — |
| 1 Background | Two d10 rolled | Background | Qualities | — (principle picker after Assign) | Power source dice |
| 2 Power source | Background's dice | Power source | Powers | Its Green and Yellow abilities | Archetype dice |
| 3 Archetype | Power source's dice | Archetype | Powers and qualities | Its abilities and principle; parts for special archetypes | Personality dice |
| 4 Personality | Archetype's dice | Personality | Roleplaying quality (name and die) | Out ability | — |
| 5 Red abilities | — | — | — | Choose 2, grouped by category | — |
| 6 Retcon | — | One retcon | Whatever the retcon changes | An extra Red ability, if chosen | — |
| 7 Health | — | The power or quality used; roll or take 4 (decided before rolling) | — | — | — |
| 8 Details | — | Name, alias, physical attributes, costume | — | — | — |

In the Dice in and Dice out columns, "dice" means icons on screen.

- **Health** shows the max and the three ranges as game-colored chips, since health ranges are game items.
- **Personality** shows the status dice as three game-colored dice (green, yellow, red) with icons on them. For Divided, an optional heroic-form personality follows, chosen and not rolled.
- **Advancement leaves the wizard.** Move the current Advancement step, unchanged, to its own route `#/hero/:id/advancement`, linked from the hero's page. It gets its full design with View hero.

## Special archetypes

Four archetypes split the Archetype step into parts. Each part is a collapsible card in the step and a sub-item in the rail, with its own state and issue count. A part is done when its own rule checks pass.

| Archetype | Parts, in order | Notes |
| --- | --- | --- |
| Divided | Second archetype · Transition · Divided ability · Form split · Principle | Second archetype is a full archetype build (any except Divided and Modular) shown with the normal anatomy. Form split appears only with Split Form: each power and quality is set to Both, Civilian or Heroic, with a live tally "Both forms, powers: 2 of 2". The roleplaying quality is always Both. Principle is Responsibility. |
| Form Changer | Base build · Green form 1 · Green form 2 · Yellow form · Principle | Base build holds the dice, Change Forms with its slot, the chosen Green ability and Emergency Change. Each form: optional name, its powers, one form ability; the Yellow form also raises two dice. Principle is Esoteric. |
| Modular | Base archetype · Switch abilities · Green mode · Yellow mode 1 · Yellow mode 2 · Red mode · Powerless mode (optional) · Principle | Base archetype assigns powers and qualities but no abilities, then filler d6 powers up to four. Each mode shows its recipe ("keeps 1, lowers 1, raises 2") above its die rows and a tally against it. |
| Minion Maker | Base build · Minion forms · Principle | Minion forms: pick the quality that sets the count first; until then, show no count. Then a checklist of forms with a tally "4 of 6 chosen". Principle is Expertise. |

Card behavior:

- Header: state mark, part name, a one-line summary using icons ("Speedster · Speed \[d10\], Agility \[d8\] · 3 abilities"), and Show or Hide.
- On entering the step, parts with issues or not yet started are open and done parts are closed. After that, the user's open and closed choices stick for the visit.
- Choosing a different archetype keeps the old archetype's parts in memory for the rest of the visit, so switching back restores them. They're dropped when the user leaves the wizard.

Found while testing: before a Minion Maker quality is chosen, the current app counts minion forms from Fitness. Show no count until the quality is chosen.

## Edit mode

Editing a complete hero opens an edit summary at `#/hero/:id/edit`, not the first step. It uses the same shell: header, rail and preview.

**The summary** lists every step as a row, in rail order:

- Step number and name, its state mark, and its issue count.
- What was chosen, in one line with icons: "Divided Speedster · Speed \[d10\], Agility \[d8\]", "Lone Wolf · status \[d8\] \[d8\] \[d8\]".
- A Change button that opens that step (or part).

Above the list: a line saying "Changes save as you go", and Revert changes. Below it: a link to Advancement on the hero's page.

**Saving and revert.** Edits save as they're made, like a draft. On entering edit mode the app keeps a snapshot of the hero. "Revert changes" is enabled once anything differs from it; it asks for confirmation, then restores the snapshot. The snapshot is dropped when the user leaves edit mode. "Done editing" in the header returns to the hero's page.

**Earlier changes never erase later ones.** In both create and edit, changing a choice keeps everything after it. Anything that no longer fits becomes a rule issue on its own step: an ability whose power is gone, a die assigned to a quality the new background doesn't offer. The only data dropped is described under Special archetypes.

The summary screen is on the mockup canvas as "Edit summary".

## Acceptance checklist

The work is done when each of these holds in both themes, at 1440, 1024 and 390 px wide.

- [ ] No hex colors outside the token file; no `--game-*` token used for anything but green, yellow or red game items.
- [ ] No die written as text anywhere an image can go; every die and listed ability shows its icons with the right `alt`.
- [ ] New hero, then leaving without a choice, leaves no hero behind.
- [ ] A draft autosaves, shows in In progress with its step, continues where it left off, and can't be played.
- [ ] Finish with open issues shows the dialog; Finish anyway makes the hero complete.
- [ ] Guided Background with a roll of 7 and 3 lists exactly Struggling, Academic and Military, each tagged with how it was reached.
- [ ] One re-roll per phase; a re-roll that rules out the current choice flags it rather than clearing it.
- [ ] Each of the four test heroes (Divided, Form Changer, Minion Maker, Modular) shows its parts in the step and the rail, with counts matching the issue list.
- [ ] Rail and step issue counts always agree, and each issue link focuses its field.
- [ ] Editing a complete hero opens the summary; Revert changes restores the hero exactly as it was on entry.
- [ ] Changing Background on a finished hero keeps later steps and flags what no longer fits.
- [ ] Advancement is reachable from the hero's page and is gone from the wizard.
- [ ] The preview is docked at 1280 px and up, a drawer from 760 to 1279 px, and a bottom sheet below 760 px.
- [ ] Keyboard only: every control is reachable, focus is visible, and the bottom sheets and drawer trap and return focus.
